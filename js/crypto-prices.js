/**
 * Live USD prices + 24h change — CoinGecko (primary) + Binance (fallback).
 * CoinGecko: free, no API key, real-time aggregated market prices across
 * exchanges — the reference source these values are kept in sync with.
 * Binance: fallback only, used when CoinGecko is unreachable. Doesn't cover
 * FLR/HYPE (not listed there), so those two keep their last cached/default
 * price if both sources fail.
 * Cache TTL: 2 minutes. Auto-refresh timer started by dashboard.
 */
(function () {
  window.DWP = window.DWP || {};

  // CoinGecko IDs — single source of truth for live USD prices + 24h change.
  DWP.COINGECKO_IDS = {
    btc: "bitcoin",
    eth: "ethereum",
    usdt: "tether",
    usdc: "usd-coin",
    xrp: "ripple",
    xlm: "stellar",
    trx: "tron",
    sol: "solana",
    flr: "flare-networks",
    hbar: "hedera-hashgraph",
    link: "chainlink",
    ltc: "litecoin",
    hype: "hyperliquid",
    sui: "sui"
  };

  // Binance symbol → internal asset key (fallback only)
  var BINANCE_SYMBOLS = {
    BTCUSDT: "btc",
    ETHUSDT: "eth",
    XRPUSDT: "xrp",
    XLMUSDT: "xlm",
    TRXUSDT: "trx",
    SOLUSDT: "sol",
    USDCUSDT: "usdc",
    HBARUSDT: "hbar",
    LINKUSDT: "link",
    LTCUSDT: "ltc",
    SUIUSDT: "sui"
  };

  DWP._livePriceCache = { prices: {}, changes: {}, fetchedAt: 0 };
  DWP.PRICE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
  DWP._priceFetchInFlight = null;

  /** USD per 1 coin — live cache first, then config override, then ASSET_META fallback. */
  DWP.getAssetUsdPrice = function (assetKey) {
    var key = String(assetKey || "").toLowerCase();
    var meta = DWP.ASSET_META && DWP.ASSET_META[key];
    var configPrices = window.SITE_CONFIG && window.SITE_CONFIG.cryptoUsdPrices;
    var fromConfig = configPrices && configPrices[key] != null ? Number(configPrices[key]) : 0;
    var fromCache = DWP._livePriceCache.prices[key];
    if (fromCache > 0) return fromCache;
    if (fromConfig > 0) return fromConfig;
    if (meta && Number(meta.defaultPrice) > 0) return Number(meta.defaultPrice);
    return 1;
  };

  /** 24-hour price change percentage (null if unavailable). */
  DWP.getAssetPriceChange = function (assetKey) {
    var key = String(assetKey || "").toLowerCase();
    var val = DWP._livePriceCache.changes[key];
    return val != null && isFinite(val) ? val : null;
  };

  function setPrice(key, usd) {
    if (!(usd > 0)) return;
    DWP._livePriceCache.prices[key] = usd;
    if (DWP.ASSET_META && DWP.ASSET_META[key]) {
      DWP.ASSET_META[key].defaultPrice = usd;
    }
  }

  function setChange(key, pct) {
    if (isFinite(pct)) {
      DWP._livePriceCache.changes[key] = pct;
    }
  }

  // ── PRIMARY: CoinGecko — real-time market prices for every supported asset.
  function fetchCoinGeckoPrices() {
    var ids = Object.keys(DWP.COINGECKO_IDS)
      .map(function (k) { return DWP.COINGECKO_IDS[k]; })
      .filter(function (v, i, a) { return a.indexOf(v) === i; });
    return fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=" + ids.join(",") +
        "&vs_currencies=usd&include_24hr_change=true",
      { headers: { Accept: "application/json" } }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("CoinGecko price API " + res.status);
        return res.json();
      })
      .then(function (data) {
        Object.keys(DWP.COINGECKO_IDS).forEach(function (key) {
          var coinId = DWP.COINGECKO_IDS[key];
          var entry = coinId && data[coinId];
          if (entry) {
            var usd = Number(entry.usd);
            if (usd > 0) setPrice(key, usd);
            var chg = Number(entry.usd_24h_change);
            if (isFinite(chg)) setChange(key, chg);
          }
        });
      })
      .catch(function (err) {
        console.info("[DWP] CoinGecko unavailable, falling back to Binance:", err && (err.message || err));
        return fetchBinanceFallback();
      });
  }

  // ── FALLBACK: Binance — only fires when CoinGecko is unreachable.
  function fetchBinanceFallback() {
    var symbols = Object.keys(BINANCE_SYMBOLS);
    var url =
      "https://api.binance.com/api/v3/ticker/24hr?symbols=" +
      encodeURIComponent(JSON.stringify(symbols));
    return fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) {
        if (!res.ok) throw new Error("Binance fallback " + res.status);
        return res.json();
      })
      .then(function (data) {
        data.forEach(function (item) {
          var key = BINANCE_SYMBOLS[item.symbol];
          if (key) {
            setPrice(key, parseFloat(item.lastPrice));
            setChange(key, parseFloat(item.priceChangePercent));
          }
        });
      })
      .catch(function (err) {
        console.warn("[DWP] Binance fallback also failed:", err && (err.message || err));
      });
  }

  // ── AUTO-REFRESH: call once from the dashboard to keep prices live.
  DWP._priceAutoRefreshTimer = null;
  DWP.startPriceAutoRefresh = function (intervalMs) {
    var ms = Number(intervalMs) > 0 ? Number(intervalMs) : 120000;
    if (DWP._priceAutoRefreshTimer) clearInterval(DWP._priceAutoRefreshTimer);
    DWP._priceAutoRefreshTimer = setInterval(function () {
      DWP.refreshCryptoPrices(true);
    }, ms);
  };

  DWP.refreshCryptoPrices = function (force) {
    var now = Date.now();
    if (
      !force &&
      DWP._livePriceCache.fetchedAt &&
      now - DWP._livePriceCache.fetchedAt < DWP.PRICE_CACHE_TTL_MS &&
      Object.keys(DWP._livePriceCache.prices).length
    ) {
      return Promise.resolve(DWP._livePriceCache.prices);
    }

    if (DWP._priceFetchInFlight) return DWP._priceFetchInFlight;

    DWP._priceFetchInFlight = fetchCoinGeckoPrices()
      .then(function () {
        DWP._livePriceCache.fetchedAt = Date.now();
        if (typeof DWP.onCryptoPricesUpdated === "function") {
          DWP.onCryptoPricesUpdated(DWP._livePriceCache.prices);
        }
        return DWP._livePriceCache.prices;
      })
      .catch(function (err) {
        console.warn("[DWP] Live crypto prices unavailable:", err.message || err);
        return DWP._livePriceCache.prices;
      })
      .finally(function () {
        DWP._priceFetchInFlight = null;
      });

    return DWP._priceFetchInFlight;
  };
})();

/**
 * Your Assets table — reference: thedwp.net/dashboard/assets
 */
(function () {
  /** Circular brand coin badges — 32×32 sources, displayed in 40px circles. */
  const COIN_ICON_FILES = {
    btc: "assets/coins/btc.svg",
    eth: "assets/coins/eth.svg",
    usd: "assets/coins/usd.svg",
    usdt: "assets/coins/usdt.svg",
    usdc: "assets/coins/usdc.svg",
    xrp: "assets/coins/xrp.svg",
    xlm: "assets/coins/xlm.svg",
    trx: "assets/coins/trx.svg",
    sol: "assets/coins/sol.svg",
    flr: "assets/coins/flr.svg"
  };

  /** Official / industry-standard brand colors (fallback letter badges). */
  const ICON_COLORS = {
    btc:  "#F7931A",
    eth:  "#627EEA",
    usd:  "#2563eb",
    usdt: "#26A17B",
    usdc: "#2775CA",
    xrp:  "#23292F",
    xlm:  "#000000",
    trx:  "#EF0027",
    sol:  "#9945FF",
    flr:  "#E62027",
    hbar: "#2D84EB",
    link: "#2A5ADA",
    ltc:  "#A6A9AA",
    hype: "#00BFFF",
    sui:  "#6FBCF0"
  };

  function coinIconUrl(key) {
    const k = String(key || "").toLowerCase();
    const custom =
      window.SITE_CONFIG &&
      window.SITE_CONFIG.assetCoinIcons &&
      window.SITE_CONFIG.assetCoinIcons[k];
    if (custom) return custom;
    return COIN_ICON_FILES[k] || null;
  }

  const ROW_ORDER = [
    "btc",
    "eth",
    "usd",
    "xrp",
    "xlm",
    "usdt",
    "usdc",
    "trx",
    "sol",
    "flr",
    "hbar",
    "link",
    "ltc",
    "hype",
    "sui"
  ];

  let lastRows = [];
  let lastFormatMoney = null;

  function walletsConfig() {
    return (window.SITE_CONFIG && window.SITE_CONFIG.depositWallets) || {};
  }

  function formatTokenDisplay(units, symbol, isFiat) {
    const u = Number(units) || 0;
    const sym = String(symbol || "").toUpperCase();
    if (isFiat) {
      return (
        u.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }) +
        " " +
        sym
      );
    }
    const maxFrac = u >= 1 ? 2 : 8;
    return (
      u.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: maxFrac
      }) +
      " " +
      sym
    );
  }

  function buildAssetRows(data) {
    const rows = [];
    const holdingsMap = {};
    const list =
      window.DWP && typeof window.DWP.getCryptoHoldingsList === "function"
        ? window.DWP.getCryptoHoldingsList(data || {})
        : [];

    list.forEach(function (h) {
      if (h.key) holdingsMap[h.key] = h;
    });

    const p =
      window.DWP && typeof window.DWP.effectivePortfolio === "function"
        ? window.DWP.effectivePortfolio(data || {})
        : (data && data.portfolio) || {};
    const cash = Number(p.availableCash) || 0;

    const wallets = walletsConfig();
    const keysSeen = {};

    ROW_ORDER.forEach(function (key) {
      if (key === "usd") {
        rows.push({
          key: "usd",
          symbol: "USD",
          name: "United States Dollars",
          type: "Fiat",
          typeFilter: "fiat",
          units: cash,
          usdValue: cash,
          change: null,
          isFiat: true,
          depositSymbol: null
        });
        keysSeen.usd = true;
        return;
      }

      const meta =
        window.DWP && window.DWP.ASSET_META && window.DWP.ASSET_META[key];
      const walletKey = meta ? meta.symbol : key.toUpperCase();
      if (!wallets[walletKey] && !meta) return;

      const h = holdingsMap[key];
      const units = h ? h.tokenUnits || h.units : 0;
      let usdValue = h ? Number(h.value) || 0 : 0;
      if (!(usdValue > 0) && units > 0 && h) {
        const px =
          Number(h.price) > 0
            ? Number(h.price)
            : window.DWP && typeof window.DWP.getAssetUsdPrice === "function"
              ? window.DWP.getAssetUsdPrice(key)
              : 0;
        if (px > 0) usdValue = units * px;
      }
      const change =
        window.DWP && typeof window.DWP.getAssetPriceChange === "function"
          ? window.DWP.getAssetPriceChange(key)
          : null;

      rows.push({
        key: key,
        symbol: walletKey,
        name:
          (wallets[walletKey] && wallets[walletKey].label) ||
          (meta && meta.name) ||
          walletKey,
        type: "Crypto",
        typeFilter: "crypto",
        units: units,
        usdValue: usdValue,
        change: change,
        isFiat: false,
        depositSymbol: walletKey,
        network: h && h.networkLabel ? h.networkLabel : ""
      });
      keysSeen[key] = true;
    });

    Object.keys(wallets).forEach(function (sym) {
      const key = sym.toLowerCase();
      if (keysSeen[key] || key === "usd") return;
      const meta =
        window.DWP && window.DWP.ASSET_META && window.DWP.ASSET_META[key];
      const h = holdingsMap[key];
      const units = h ? h.tokenUnits || h.units : 0;
      let usdValue = h ? Number(h.value) || 0 : 0;
      if (!(usdValue > 0) && units > 0 && h) {
        const px =
          Number(h.price) > 0
            ? Number(h.price)
            : window.DWP && typeof window.DWP.getAssetUsdPrice === "function"
              ? window.DWP.getAssetUsdPrice(key)
              : 0;
        if (px > 0) usdValue = units * px;
      }
      const changeExtra =
        window.DWP && typeof window.DWP.getAssetPriceChange === "function"
          ? window.DWP.getAssetPriceChange(key)
          : null;
      rows.push({
        key: key,
        symbol: sym,
        name: wallets[sym].label || sym,
        type: "Crypto",
        typeFilter: "crypto",
        units: units,
        usdValue: usdValue,
        change: changeExtra,
        isFiat: false,
        depositSymbol: sym,
        network: h && h.networkLabel ? h.networkLabel : ""
      });
    });

    return rows;
  }

  /** Renders a compact ▲/▼ pill showing the 24-hour price change. */
  function renderChangeTag(change) {
    if (change == null || !isFinite(change)) return "";
    const pct = Number(change);
    const sign = pct > 0 ? "+" : "";
    const cls =
      pct > 0
        ? "price-change price-change--up"
        : pct < 0
          ? "price-change price-change--down"
          : "price-change price-change--flat";
    const arrow = pct > 0 ? "▲" : pct < 0 ? "▼" : "●";
    return (
      '<span class="' +
      cls +
      '">' +
      arrow +
      " " +
      sign +
      Math.abs(pct).toFixed(2) +
      "%</span>"
    );
  }

  function renderIcon(row) {
    const key = String(row.key || "").toLowerCase();
    const accent = ICON_COLORS[key] || "#273c75";
    const letter = row.isFiat ? "$" : String(row.symbol || "?").charAt(0);
    const src = coinIconUrl(key);
    const alt = (row.name || row.symbol || "Asset") + " icon";

    if (src) {
      return (
        '<span class="asset-icon asset-icon--coin" style="--asset-accent:' +
        accent +
        '">' +
        '<img src="' +
        src +
        '" alt="' +
        alt.replace(/"/g, "&quot;") +
        '" class="asset-coin-img" width="40" height="40" loading="lazy" decoding="async" ' +
        'onerror="this.style.display=\'none\';var s=this.nextElementSibling;if(s)s.hidden=false">' +
        '<span class="asset-icon-fallback" hidden aria-hidden="true">' +
        letter +
        "</span></span>"
      );
    }

    return (
      '<span class="asset-icon asset-icon--coin asset-icon--letter" style="background:' +
      accent +
        '">' +
      letter +
      "</span>"
    );
  }

  function renderRow(row, formatMoney) {
    const tokenLine = formatTokenDisplay(row.units, row.symbol, row.isFiat);
    const usdLine = formatMoney(row.usdValue);
    const depositBtn = row.isFiat
      ? '<button type="button" class="asset-action-btn" data-asset-action="deposit" data-asset="USD">Deposit</button>'
      : '<button type="button" class="asset-action-btn" data-asset-action="deposit" data-asset="' +
        row.depositSymbol +
        '">Deposit</button>';
    const withdrawBtn =
      '<button type="button" class="asset-action-btn asset-action-btn--withdraw" data-asset-action="withdraw" data-asset="' +
      (row.isFiat ? "USD" : row.depositSymbol) +
      '">Withdraw</button>';

    return (
      "<tr data-asset-key=\"" +
      row.key +
      "\" data-type=\"" +
      row.typeFilter +
      "\">" +
      '<td data-label="Asset">' +
      '<div class="asset-cell">' +
      renderIcon(row) +
      '<div class="asset-names">' +
      '<span class="asset-name">' +
      row.name +
      "</span>" +
      '<span class="asset-ticker">' +
      row.symbol +
      "</span>" +
      (!row.isFiat ? renderChangeTag(row.change) : "") +
      "</div></div></td>" +
      '<td data-label="Type">' +
      row.type +
      "</td>" +
      '<td data-label="Balance">' +
      '<div class="balance-cell">' +
      '<span class="balance-token">' +
      tokenLine +
      "</span>" +
      '<span class="balance-usd">' +
      usdLine +
      "</span>" +
      "</div></td>" +
      '<td data-label="Actions">' +
      '<div class="asset-actions">' +
      depositBtn +
      withdrawBtn +
      "</div></td></tr>"
    );
  }

  function applyFilters() {
    const tbody = document.getElementById("assets-table-body");
    const emptyEl = document.getElementById("assets-table-empty");
    const searchEl = document.getElementById("assets-search");
    const filterEl = document.getElementById("assets-type-filter");
    if (!tbody) return;

    const q = String((searchEl && searchEl.value) || "")
      .toLowerCase()
      .trim();
    const typeFilter = (filterEl && filterEl.value) || "all";
    const fmt = lastFormatMoney || function (n) {
      return Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
      });
    };

    const filtered = lastRows.filter(function (row) {
      if (typeFilter !== "all" && row.typeFilter !== typeFilter) return false;
      if (!q) return true;
      return (
        row.name.toLowerCase().indexOf(q) >= 0 ||
        row.symbol.toLowerCase().indexOf(q) >= 0 ||
        row.type.toLowerCase().indexOf(q) >= 0
      );
    });

    if (!filtered.length) {
      tbody.innerHTML = "";
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;
    tbody.innerHTML = filtered.map(function (r) {
      return renderRow(r, fmt);
    }).join("");
  }

  function bindTableActions() {
    const tbody = document.getElementById("assets-table-body");
    if (!tbody || tbody._dwpBound) return;
    tbody._dwpBound = true;

    tbody.addEventListener("click", function (e) {
      const btn = e.target.closest("[data-asset-action]");
      if (!btn) return;
      const action = btn.getAttribute("data-asset-action");
      const asset = btn.getAttribute("data-asset");

      if (action === "deposit") {
        if (typeof window.DWP.openDepositForAsset === "function") {
          window.DWP.openDepositForAsset(asset);
        } else if (typeof window.DWP_switchDashboardTab === "function") {
          window.DWP_switchDashboardTab("deposit");
        }
        return;
      }
      if (action === "withdraw") {
        if (typeof window.DWP.openWithdrawal === "function") {
          window.DWP.openWithdrawal(asset);
        } else if (typeof window.DWP_switchDashboardTab === "function") {
          window.DWP_switchDashboardTab("withdrawal");
        }
      }
    });
  }

  function bindFiltersOnce() {
    const searchEl = document.getElementById("assets-search");
    const filterEl = document.getElementById("assets-type-filter");
    if (searchEl && !searchEl._dwpBound) {
      searchEl._dwpBound = true;
      searchEl.addEventListener("input", applyFilters);
    }
    if (filterEl && !filterEl._dwpBound) {
      filterEl._dwpBound = true;
      filterEl.addEventListener("change", applyFilters);
    }
    bindTableActions();
  }

  window.DWP = window.DWP || {};

  window.DWP.renderAssetsPanel = function (data, accountState, formatMoney) {
    const activation = document.getElementById("assets-activation");
    const active = document.getElementById("assets-active");
    const showActivation = accountState === "empty";

    if (activation) activation.hidden = !showActivation;
    if (active) active.hidden = showActivation;
    if (showActivation) return;

    lastFormatMoney = formatMoney || function (n) {
      return Number(n).toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
      });
    };

    lastRows = buildAssetRows(data);
    bindFiltersOnce();
    applyFilters();
  };
})();

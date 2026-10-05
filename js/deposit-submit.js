/**
 * Dashboard deposit tab — crypto, networks, QR, payment proof upload.
 * BUILD: deposit-submit.js (production)
 */
(function () {
  window.DWP_DEPOSIT_BUILD = "deposit-submit-2025-05-21-prod";
  const CRYPTO_ORDER = [
    "BTC",
    "ETH",
    "USDT",
    "USDC",
    "XRP",
    "XLM",
    "TRX",
    "SOL",
    "FLR",
    "HBAR",
    "LINK",
    "LTC",
    "HYPE",
    "SUI"
  ];

  function wallets() {
    return (window.SITE_CONFIG && window.SITE_CONFIG.depositWallets) || {};
  }

  function processingFee() {
    const fee = window.SITE_CONFIG && window.SITE_CONFIG.depositProcessingFee;
    return Number(fee) || 0;
  }

  function formatDepositSaveError(err) {
    const code = err && err.code ? err.code : "";
    const msg = err && err.message ? String(err.message) : "";
    if (code === "permission-denied") {
      const build = window.DWP_DEPOSIT_BUILD || "unknown";
      const detail = msg ? " " + msg : "";
      return (
        "Deposit blocked (permission denied)." + detail +
        " Publish firebase/firestore.rules with RULES_VERSION: deposit-v6 in project llc-site-fa253, " +
        "then hard-refresh. Build: " +
        build +
        ". Check the browser console for [DWP] saveDepositSubmission (authUid, docPath, projectId)."
      );
    }
    if (code === "not-found") {
      return (
        "No application record was found for your account. Please contact support."
      );
    }
    if (
      code === "invalid-argument" ||
      msg.indexOf("undefined") >= 0 ||
      msg.indexOf("Unsupported field value") >= 0 ||
      msg.indexOf("serverTimestamp") >= 0
    ) {
      return (
        "Deposit could not be saved (invalid data). Please refresh and try again. " +
        (msg ? "Details: " + msg : "")
      );
    }
    if (code === "unavailable" || code === "deadline-exceeded") {
      return "Network error. Check your connection and try again.";
    }
    if (msg) return "Failed to submit deposit: " + msg;
    return "Failed to submit deposit request. Please try again.";
  }

  /** Supports legacy { address } or new { networks: [{ id, label, address }] }. */
  function getAssetConfig(symbol) {
    const key = String(symbol || "").toUpperCase();
    const w = wallets()[key];
    if (!w) return null;

    let networks = [];
    if (w.networks && w.networks.length) {
      networks = w.networks.map(function (n, i) {
        return {
          id: n.id || "network-" + i,
          label: n.label || n.id || "Network",
          address: String(n.address || "").trim(),
          warning: n.warning || ""
        };
      });
    } else if (w.address) {
      networks = [
        {
          id: "native",
          label: w.networkLabel || w.label || key,
          address: String(w.address).trim(),
          warning: ""
        }
      ];
    }

    return {
      symbol: key,
      label: w.label || key,
      networks: networks
    };
  }

  function getNetwork(asset, networkId) {
    if (!asset || !asset.networks.length) return null;
    const id = String(networkId || "");
    const found = asset.networks.find(function (n) {
      return n.id === id;
    });
    return found || asset.networks[0];
  }

  function getWallet(symbol, networkId) {
    const asset = getAssetConfig(symbol);
    if (!asset) return null;
    const network = getNetwork(asset, networkId);
    if (!network) return null;
    return {
      symbol: asset.symbol,
      label: asset.label,
      networkId: network.id,
      networkLabel: network.label,
      address: network.address,
      warning: network.warning
    };
  }

  function isConfiguredAddress(addr) {
    if (!addr) return false;
    if (/^0x0+$/i.test(addr)) return false;
    if (/X{4,}/i.test(addr)) return false;
    if (/x{4,}/i.test(addr)) return false;
    if (addr.indexOf("0000000") >= 0 && addr.length < 20) return false;
    return addr.length >= 8;
  }

  function populateCryptoSelect(select) {
    if (!select) return;
    select.innerHTML = "";
    const map = wallets();
    CRYPTO_ORDER.forEach(function (key) {
      if (!map[key]) return;
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = map[key].label || key;
      select.appendChild(opt);
    });
    if (!select.options.length) {
      Object.keys(map).forEach(function (key) {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = map[key].label || key;
        select.appendChild(opt);
      });
    }
  }

  function populateNetworkSelect(select, symbol) {
    if (!select) return;
    const asset = getAssetConfig(symbol);
    const field = document.getElementById("deposit-network-field");
    select.innerHTML = "";

    if (!asset || !asset.networks.length) {
      if (field) field.hidden = true;
      select.removeAttribute("required");
      return;
    }

    if (field) field.hidden = false;
    select.setAttribute("required", "required");

    asset.networks.forEach(function (net) {
      const opt = document.createElement("option");
      opt.value = net.id;
      opt.textContent = net.label;
      select.appendChild(opt);
    });
  }

  function assetKeyFromSymbol(symbol) {
    return String(symbol || "").toLowerCase();
  }

  function updateSummary() {
    const amountInput = document.getElementById("deposit-amount");
    const cryptoSelect = document.getElementById("deposit-crypto");
    const amount = Number(amountInput && amountInput.value) || 0;
    const fee = processingFee();
    const total = Math.max(0, amount - fee);
    const fmt = function (n) {
      return n.toLocaleString("en-US", {
        style: "currency",
        currency: "USD"
      });
    };
    const elAmt = document.getElementById("summary-crypto-amount");
    const elFee = document.getElementById("summary-processing-fee");
    const elTotal = document.getElementById("summary-total-credit");
    const elEquiv = document.getElementById("summary-token-equivalent");
    if (elAmt) elAmt.textContent = fmt(amount);
    if (elFee) elFee.textContent = fmt(fee);
    if (elTotal) elTotal.textContent = fmt(total);

    const symbol = cryptoSelect && cryptoSelect.value;
    if (elEquiv) {
      if (
        amount > 0 &&
        symbol &&
        window.DWP &&
        typeof window.DWP.getDepositTokenEquivalent === "function"
      ) {
        const equiv = window.DWP.getDepositTokenEquivalent(
          { depositAmount: amount, depositMethod: symbol.toLowerCase() },
          symbol.toLowerCase()
        );
        if (equiv) {
          const rate =
            equiv.price > 0
              ? " @ " +
                equiv.price.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                  maximumFractionDigits: equiv.price >= 1 ? 2 : 6
                }) +
                "/" +
                equiv.symbol
              : "";
          elEquiv.textContent = "≈ " + equiv.formatted + rate;
        } else {
          elEquiv.textContent = "—";
        }
      } else {
        elEquiv.textContent = "—";
      }
    }
  }

  let pendingQrAddress = null;

  function isDepositPanelVisible() {
    const panel = document.getElementById("panel-deposit");
    return panel && !panel.hidden;
  }

  function drawQrPlaceholder(canvas, message) {
    const ctx = canvas.getContext("2d");
    canvas.width = 200;
    canvas.height = 200;
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = "#999";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(message || "QR unavailable", 100, 100);
    canvas.hidden = false;
    const img = document.getElementById("deposit-qr-img");
    if (img) img.hidden = true;
  }

  function renderQr(address) {
    const canvas = document.getElementById("deposit-qr-canvas");
    if (!canvas) return;

    pendingQrAddress = address;

    if (!isDepositPanelVisible()) {
      return;
    }

    if (typeof QRCode === "undefined") {
      drawQrPlaceholder(canvas, "QR library loading…");
      return;
    }

    if (!isConfiguredAddress(address)) {
      drawQrPlaceholder(canvas, "QR unavailable");
      return;
    }

    QRCode.toCanvas(
      canvas,
      address,
      { width: 200, margin: 1, color: { dark: "#000000", light: "#ffffff" } },
      function (err) {
        if (err) {
          console.warn("QR render failed:", err);
          drawQrPlaceholder(canvas, "QR failed");
          return;
        }
        canvas.hidden = false;
        const img = document.getElementById("deposit-qr-img");
        if (img) img.hidden = true;
      }
    );
  }

  function flushPendingQr() {
    if (!isDepositPanelVisible()) return;
    const cryptoSelect = document.getElementById("deposit-crypto");
    const networkSelect = document.getElementById("deposit-network");
    if (cryptoSelect && cryptoSelect.value) {
      const wallet = getWallet(
        cryptoSelect.value,
        networkSelect && networkSelect.value
      );
      if (wallet) {
        renderQr(wallet.address);
        return;
      }
    }
    if (pendingQrAddress) renderQr(pendingQrAddress);
  }

  function updateWalletUI(symbol, networkId) {
    const networkSelect = document.getElementById("deposit-network");
    const resolvedNetworkId =
      networkId || (networkSelect && networkSelect.value) || "";

    const wallet = getWallet(symbol, resolvedNetworkId);
    const instruction = document.getElementById("deposit-instruction-text");
    const addressEl = document.getElementById("deposit-address-display");
    const addressLabel = document.getElementById("deposit-address-label");
    const warningText = document.getElementById("deposit-warning-text");
    const card = document.querySelector(".deposit-card");

    if (!wallet) {
      if (instruction) {
        instruction.textContent = "Deposit address not configured for this asset.";
      }
      if (addressEl) {
        addressEl.textContent = "—";
        addressEl.title = "";
      }
      if (card) card.classList.add("deposit-card-pending");
      renderQr("");
      return;
    }

    if (card) {
      card.classList.toggle(
        "deposit-card-pending",
        !isConfiguredAddress(wallet.address)
      );
    }

    if (instruction) {
      instruction.innerHTML =
        "Send <strong>" +
        wallet.symbol +
        "</strong> via <strong>" +
        wallet.networkLabel +
        "</strong> to fund your account:";
    }
    if (addressLabel) {
      addressLabel.textContent = wallet.symbol + " deposit address:";
    }
    if (addressEl) {
      addressEl.textContent = wallet.address;
      addressEl.title = wallet.address;
    }
    if (warningText) {
      const base =
        "Only send " +
        wallet.symbol +
        " on the " +
        wallet.networkLabel +
        " network to this address.";
      warningText.textContent = wallet.warning
        ? base + " " + wallet.warning
        : base + " Using the wrong network may result in permanent loss of funds.";
    }
    renderQr(wallet.address);
  }

  function onAssetOrNetworkChange() {
    const cryptoSelect = document.getElementById("deposit-crypto");
    const networkSelect = document.getElementById("deposit-network");
    if (!cryptoSelect) return;

    populateNetworkSelect(networkSelect, cryptoSelect.value);
    updateWalletUI(cryptoSelect.value, networkSelect && networkSelect.value);
  }

  function copyAddress() {
    const addressEl = document.getElementById("deposit-address-display");
    const text = (addressEl && addressEl.textContent) || "";
    if (!text || text === "—") return;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied).catch(fallbackCopy);
    } else {
      fallbackCopy(text);
    }
  }

  function showCopied() {
    const btn = document.getElementById("deposit-copy-btn");
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(function () {
      btn.textContent = prev;
    }, 2000);
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showCopied();
    } catch (e) {
      alert("Copy failed. Please select and copy the address manually.");
    }
    document.body.removeChild(ta);
  }

  function readProofFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve(null);
        return;
      }
      if (file.size > 4 * 1024 * 1024) {
        reject(new Error("Image must be under 4 MB."));
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        resolve({
          name: file.name,
          type: file.type,
          dataUrl: reader.result
        });
      };
      reader.onerror = function () {
        reject(new Error("Could not read the image file."));
      };
      reader.readAsDataURL(file);
    });
  }

  // ── Receipt status real-time listener ────────────────────────────────────
  var receiptListenerUnsub = null;
  var currentReceiptDepId  = null;

  /** Update the badge on the receipt page from live Firestore data. */
  function updateReceiptBadge(data, depId) {
    var badge = document.querySelector("#panel-deposit-receipt .receipt-modal-badge");
    if (!badge) return;

    var status = "";

    // Look up by the specific depId in depositHistory
    var hist = Array.isArray(data && data.depositHistory) ? data.depositHistory : [];
    for (var i = 0; i < hist.length; i++) {
      if (hist[i].id === depId) {
        status = String(hist[i].status || "");
        break;
      }
    }

    // Fallback: if account got activated and we couldn't match by id, it's approved
    if (!status && data && data.accountActivated) status = "Approved";

    var lower = status.toLowerCase();
    var isApproved = lower.indexOf("approv") >= 0 || lower === "confirmed";
    var isDenied   = lower.indexOf("reject") >= 0 || lower.indexOf("den") >= 0;

    if (isApproved) {
      badge.textContent  = "Approved";
      badge.className    = "receipt-modal-badge receipt-badge-approved";
      stopReceiptListener(); // no further updates needed
    } else if (isDenied) {
      badge.textContent  = "Declined";
      badge.className    = "receipt-modal-badge receipt-badge-denied";
      stopReceiptListener();
    }
    // pending: leave badge as-is
  }

  /** Start a live Firestore listener for the current user's document. */
  function startReceiptListener(uid, depId) {
    stopReceiptListener();
    currentReceiptDepId = depId;
    if (!window.DWP || !DWP.db) return;
    try {
      var docRef = DWP.db.collection("applications").doc(uid);
      receiptListenerUnsub = docRef.onSnapshot(
        function (snap) {
          if (snap.exists) updateReceiptBadge(snap.data(), currentReceiptDepId);
        },
        function (err) {
          console.warn("[DWP] Receipt status listener error:", err);
        }
      );
    } catch (e) {
      console.warn("[DWP] Could not start receipt listener:", e);
    }
  }

  /** Tear down the listener (call on navigation away from receipt page). */
  function stopReceiptListener() {
    if (receiptListenerUnsub) {
      receiptListenerUnsub();
      receiptListenerUnsub = null;
    }
    currentReceiptDepId = null;
  }
  // ─────────────────────────────────────────────────────────────────────────

  /** Coin SVG paths — mirrors dashboard-assets.js COIN_ICON_FILES */
  var COIN_SVG = {
    BTC:  "assets/coins/btc.svg",
    ETH:  "assets/coins/eth.svg",
    USDT: "assets/coins/usdt.svg",
    USDC: "assets/coins/usdc.svg",
    XRP:  "assets/coins/xrp.svg",
    XLM:  "assets/coins/xlm.svg",
    TRX:  "assets/coins/trx.svg",
    SOL:  "assets/coins/sol.svg",
    FLR:  "assets/coins/flr.svg"
  };

  /** Fallback brand colours if SVG fails to load */
  var COIN_COLOR = {
    BTC: "#F7931A", ETH: "#627EEA", USDT: "#26A17B", USDC: "#2775CA",
    XRP: "#23292F", XLM: "#000000", TRX: "#EF0027", SOL: "#9945FF", FLR: "#E62027"
  };

  /** Format a token amount — strips trailing zeros, max 8 decimals. */
  function formatTokenAmount(n) {
    if (!n || n === 0) return "0";
    return n.toFixed(8).replace(/\.?0+$/, "");
  }

  /** Populate the receipt page and navigate to it. */
  function showDepositReceipt(opts) {
    var symbol     = String(opts.symbol || "").toUpperCase();
    var amount     = Number(opts.amount) || 0;
    var tokenEquiv = Number(opts.tokenEquiv) || 0;
    var wallet     = opts.wallet || {};
    var depId      = opts.depId || ("DEP-" + Date.now().toString(36).toUpperCase());

    // ── Coin icon ────────────────────────────────────────────
    var imgEl      = document.getElementById("receipt-coin-img");
    var fallbackEl = document.getElementById("receipt-coin-fallback");
    var svgSrc     = COIN_SVG[symbol];

    if (svgSrc && imgEl) {
      imgEl.src = svgSrc;
      imgEl.alt = symbol;
      imgEl.removeAttribute("hidden");
      if (fallbackEl) fallbackEl.hidden = true;

      imgEl.onerror = function () {
        imgEl.hidden = true;
        if (fallbackEl) {
          fallbackEl.textContent = symbol.charAt(0);
          fallbackEl.style.background = COIN_COLOR[symbol] || "#2c3342";
          fallbackEl.removeAttribute("hidden");
        }
      };
    } else if (fallbackEl) {
      if (imgEl) imgEl.hidden = true;
      fallbackEl.textContent = symbol.charAt(0);
      fallbackEl.style.background = COIN_COLOR[symbol] || "#2c3342";
      fallbackEl.removeAttribute("hidden");
    }

    // ── Amount ───────────────────────────────────────────────
    var amountEl = document.getElementById("receipt-modal-amount");
    if (amountEl) {
      amountEl.textContent = tokenEquiv > 0
        ? formatTokenAmount(tokenEquiv) + " " + symbol
        : "$" + amount.toFixed(2) + " USD";
    }

    // ── USD value ────────────────────────────────────────────
    var usdEl = document.getElementById("receipt-modal-usd");
    if (usdEl) {
      usdEl.textContent = "$" + amount.toLocaleString("en-US", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      });
    }

    // ── Network ──────────────────────────────────────────────
    var netEl = document.getElementById("receipt-modal-network");
    if (netEl) netEl.textContent = wallet.networkLabel || symbol;

    // ── Deposit address (truncated) ──────────────────────────
    var addrEl = document.getElementById("receipt-modal-address");
    if (addrEl) {
      var addr = wallet.address || "—";
      addrEl.textContent = addr.length > 24
        ? addr.substring(0, 10) + "…" + addr.slice(-10)
        : addr;
      addrEl.title = addr;
    }

    // ── Date & time ──────────────────────────────────────────
    var dateEl = document.getElementById("receipt-modal-date");
    if (dateEl) {
      var now = new Date();
      dateEl.textContent =
        now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) +
        " at " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }

    // ── Reference ID ─────────────────────────────────────────
    var refEl = document.getElementById("receipt-modal-ref");
    if (refEl) refEl.textContent = depId;

    // ── Navigate to receipt page ──────────────────────────────
    if (typeof window.DWP_switchDashboardTab === "function") {
      window.DWP_switchDashboardTab("deposit-receipt");
    }

    // ── Start live status listener ────────────────────────────
    var uid = window.DWP && DWP.auth && DWP.auth.currentUser
      ? DWP.auth.currentUser.uid : null;
    if (uid) startReceiptListener(uid, depId);
  }

  function initDepositPanel() {
    const form = document.getElementById("deposit-form");
    const cryptoSelect = document.getElementById("deposit-crypto");
    const networkSelect = document.getElementById("deposit-network");
    const amountInput = document.getElementById("deposit-amount");
    const uploadBtn = document.getElementById("deposit-upload-btn");
    const fileInput = document.getElementById("deposit-proof-file");
    const copyBtn = document.getElementById("deposit-copy-btn");

    if (!form || !cryptoSelect) return;

    // "Make Another Deposit" — go back to the deposit tab
    var closeBtn = document.getElementById("receipt-modal-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        stopReceiptListener();
        if (typeof window.DWP_switchDashboardTab === "function") {
          window.DWP_switchDashboardTab("deposit");
        }
      });
    }

    // "Go to Overview" — go to overview tab
    var overviewBtn = document.getElementById("receipt-go-overview");
    if (overviewBtn) {
      overviewBtn.addEventListener("click", function () {
        stopReceiptListener();
        if (typeof window.DWP_switchDashboardTab === "function") {
          window.DWP_switchDashboardTab("overview");
        }
      });
    }

    populateCryptoSelect(cryptoSelect);

    cryptoSelect.addEventListener("change", onAssetOrNetworkChange);
    networkSelect?.addEventListener("change", function () {
      updateWalletUI(cryptoSelect.value, networkSelect.value);
    });
    amountInput?.addEventListener("input", updateSummary);
    copyBtn?.addEventListener("click", copyAddress);

    uploadBtn?.addEventListener("click", function () {
      fileInput?.click();
    });

    fileInput?.addEventListener("change", function () {
      const nameEl = document.getElementById("deposit-proof-name");
      const file = fileInput.files && fileInput.files[0];
      if (nameEl) {
        if (file) {
          nameEl.textContent = "Selected: " + file.name;
          nameEl.hidden = false;
        } else {
          nameEl.hidden = true;
        }
      }
    });

    onAssetOrNetworkChange();
    updateSummary();

    if (window.DWP && typeof window.DWP.refreshCryptoPrices === "function") {
      window.DWP.refreshCryptoPrices().then(updateSummary);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const errEl = document.getElementById("deposit-form-error");
      const okEl = document.getElementById("deposit-form-success");
      const submitBtn = form.querySelector(".btn-submit-deposit");
      if (errEl) errEl.hidden = true;
      if (okEl) okEl.hidden = true;

      const symbol = cryptoSelect.value;
      const networkId = networkSelect ? networkSelect.value : "";
      const wallet = getWallet(symbol, networkId);
      const amount = Number(amountInput?.value);

      if (!wallet || !isConfiguredAddress(wallet.address)) {
        if (errEl) {
          errEl.textContent =
            "Deposit address is not configured for " +
            symbol +
            (wallet && wallet.networkLabel
              ? " (" + wallet.networkLabel + ")"
              : "") +
            ". Please contact support.";
          errEl.hidden = false;
        }
        return;
      }

      if (!amount || amount < 5000) {
        if (errEl) {
          errEl.textContent = "Minimum deposit amount is $5,000.00 USD.";
          errEl.hidden = false;
        }
        return;
      }

      const file = fileInput?.files && fileInput.files[0];
      if (!file) {
        if (errEl) {
          errEl.textContent = "Please upload payment proof (screenshot or receipt).";
          errEl.hidden = false;
        }
        return;
      }

      if (!window.DWP || !DWP.auth || !DWP.auth.currentUser) {
        if (errEl) {
          errEl.textContent = "You must be signed in to submit a deposit.";
          errEl.hidden = false;
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "Submitting...";
      }

      try {
        if (typeof DWP.validateDepositProofFile === "function") {
          const proofErr = DWP.validateDepositProofFile(file);
          if (proofErr) {
            if (errEl) {
              errEl.textContent = proofErr;
              errEl.hidden = false;
            }
            return;
          }
        } else if (file.size > 5 * 1024 * 1024) {
          if (errEl) {
            errEl.textContent = "Payment proof must be under 5 MB.";
            errEl.hidden = false;
          }
          return;
        }

        const uid = DWP.auth.currentUser.uid;
        const fee = processingFee();
        const total = Math.max(0, amount - fee);
        const assetKey = assetKeyFromSymbol(symbol);

        if (typeof DWP.refreshCryptoPrices === "function") {
          await DWP.refreshCryptoPrices(true);
        }
        const usdPrice =
          typeof DWP.getAssetUsdPrice === "function"
            ? DWP.getAssetUsdPrice(assetKey)
            : 0;
        const tokenEquiv =
          typeof DWP.usdToTokenUnits === "function"
            ? DWP.usdToTokenUnits(amount, assetKey, usdPrice)
            : 0;

        let upload = null;
        if (typeof DWP.uploadDepositProof === "function") {
          try {
            upload = await DWP.uploadDepositProof(uid, file);
          } catch (uploadErr) {
            console.error(uploadErr);
            if (errEl) {
              errEl.textContent =
                uploadErr.message ||
                (typeof DWP.getStorageErrorMessage === "function"
                  ? DWP.getStorageErrorMessage(uploadErr.cause || uploadErr)
                  : "Could not upload payment proof. Enable Firebase Storage and deploy storage rules.");
              errEl.hidden = false;
            }
            return;
          }
        }

        const resolved =
          typeof DWP.resolveApplicationDoc === "function"
            ? await DWP.resolveApplicationDoc(uid)
            : null;
        const docRef =
          resolved && resolved.ref
            ? resolved.ref
            : DWP.db.collection("applications").doc(uid);
        if (!resolved || !resolved.exists) {
          if (errEl) {
            errEl.textContent =
              "No application record was found for your account (expected applications/" +
              uid +
              "). Complete sign-up first or contact support.";
            errEl.hidden = false;
          }
          return;
        }
        const existing = resolved.data || {};

        let built;
        if (typeof DWP.buildDepositSubmitPatch === "function") {
          built = DWP.buildDepositSubmitPatch({
            existing: existing,
            amount: amount,
            processingFee: fee,
            totalCredit: total,
            assetKey: assetKey,
            symbol: symbol,
            wallet: wallet,
            file: file,
            upload: upload,
            usdPrice: usdPrice,
            tokenEquivalent: tokenEquiv
          });
        } else {
          throw new Error("Deposit helper not loaded. Hard-refresh the dashboard.");
        }

        const cleanPatch = built.patch;

        console.info("[DWP] Deposit save", {
          build: window.DWP_DEPOSIT_BUILD,
          keys: Object.keys(cleanPatch)
        });

        if (typeof DWP.saveDepositSubmission === "function") {
          await DWP.saveDepositSubmission(uid, built);
        } else {
          await docRef.update(cleanPatch);
        }
        const history = built.history;

        // Reset form state
        form.reset();
        if (fileInput) fileInput.value = "";
        const nameEl = document.getElementById("deposit-proof-name");
        if (nameEl) nameEl.hidden = true;
        onAssetOrNetworkChange();
        updateSummary();

        // Pop up the receipt modal
        showDepositReceipt({
          symbol: symbol,
          amount: amount,
          tokenEquiv: tokenEquiv,
          wallet: wallet,
          depId: built.depId
        });

        if (typeof window.DWP.onDepositSubmitted === "function") {
          window.DWP.onDepositSubmitted(
            Object.assign({}, cleanPatch, {
              depositSubmitted: true,
              depositMethod: assetKey,
              depositNetwork: wallet.networkId,
              depositNetworkLabel: wallet.networkLabel,
              depositAmount: amount,
              depositTotalCredit: total,
              depositProcessingFee: fee,
              depositHistory: history
            })
          );
        }
      } catch (err) {
        console.error("Deposit submit failed:", err);
        if (err && err.code === "permission-denied") {
          console.error(
            "[DWP] Firestore rejected deposit update. Publish firebase/firestore.rules " +
              "(project llc-site-fa253), hard-refresh dashboard, sign in as the account owner.",
            err
          );
        }
        if (errEl) {
          errEl.textContent = formatDepositSaveError(err);
          errEl.hidden = false;
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Deposit Request";
        }
      }
    });
  }

  window.DWP = window.DWP || {};
  window.DWP.updateSummary = updateSummary;
  window.DWP.openDepositForAsset = function (symbol) {
    const sym = String(symbol || "").toUpperCase();
    if (sym === "USD") {
      if (typeof window.DWP_switchDashboardTab === "function") {
        window.DWP_switchDashboardTab("deposit");
      }
      return;
    }
    const cryptoSelect = document.getElementById("deposit-crypto");
    if (cryptoSelect) {
      cryptoSelect.value = sym;
      onAssetOrNetworkChange();
      updateSummary();
    }
    if (typeof window.DWP_switchDashboardTab === "function") {
      window.DWP_switchDashboardTab("deposit");
    }
  };
  window.DWP.openWithdrawal = function () {
    if (typeof window.DWP_switchDashboardTab === "function") {
      window.DWP_switchDashboardTab("withdrawal");
    }
  };
  window.DWP.initDepositPanel = initDepositPanel;
  window.DWP.refreshDepositPanel = function () {
    onAssetOrNetworkChange();
    updateSummary();
    if (typeof window.DWP.refreshCryptoPrices === "function") {
      window.DWP.refreshCryptoPrices().then(updateSummary);
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(flushPendingQr);
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDepositPanel);
  } else {
    initDepositPanel();
  }
})();

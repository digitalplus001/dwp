/**
 * Withdrawal tab — Request Crypto Withdrawal (reference layout + live summary).
 */
(function () {
  window.DWP = window.DWP || {};

  const CRYPTO_ORDER = [
    "BTC",
    "ETH",
    "USDT",
    "USDC",
    "XRP",
    "XLM",
    "TRX",
    "SOL",
    "FLR"
  ];

  let form;
  let amountInput;
  let reasonSelect;
  let methodSelect;
  let walletInput;
  let notesInput;
  let availableEl;
  let minEl;
  let summaryAmount;
  let summaryMethod;
  let summaryWallet;
  let bound = false;
  let lastAvailableUsd = 0;

  function siteConfig() {
    return window.SITE_CONFIG || {};
  }

  function minWithdrawalUsd() {
    const n = Number(siteConfig().withdrawalMinUsd);
    return !isNaN(n) && n > 0 ? n : 100;
  }

  function formatMoney(n) {
    const num = Number(n);
    if (isNaN(num)) return "$0.00";
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function formatMoneyWhole(n) {
    const num = Number(n) || 0;
    if (num === 0) return "$0";
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function wallets() {
    return siteConfig().depositWallets || {};
  }

  function populateReasons() {
    if (!reasonSelect) return;
    const reasons = siteConfig().withdrawalReasons || [];
    const current = reasonSelect.value;
    reasonSelect.innerHTML = '<option value="">Select reason</option>';
    reasons.forEach(function (r) {
      const opt = document.createElement("option");
      opt.value = r.value;
      opt.textContent = r.label;
      reasonSelect.appendChild(opt);
    });
    if (current) reasonSelect.value = current;
  }

  function populateCryptoMethods() {
    if (!methodSelect) return;
    const current = methodSelect.value;
    const w = wallets();
    methodSelect.innerHTML = '<option value="">Select crypto</option>';
    CRYPTO_ORDER.forEach(function (sym) {
      if (!w[sym]) return;
      const opt = document.createElement("option");
      opt.value = sym.toLowerCase();
      opt.textContent = (w[sym].label || sym) + " (" + sym + ")";
      methodSelect.appendChild(opt);
    });
    Object.keys(w).forEach(function (sym) {
      if (CRYPTO_ORDER.indexOf(sym) >= 0) return;
      const opt = document.createElement("option");
      opt.value = sym.toLowerCase();
      opt.textContent = w[sym].label || sym;
      methodSelect.appendChild(opt);
    });
    if (current) methodSelect.value = current;
  }

  function getWithdrawalAvailableUsd(data) {
    if (!data) return 0;
    if (typeof DWP.sumHoldingsUsd === "function") {
      const holdings = DWP.sumHoldingsUsd(data);
      if (holdings > 0) return holdings;
    }
    if (typeof DWP.getOverviewSummary === "function") {
      const s = DWP.getOverviewSummary(data);
      return Number(s.totalBalance) || 0;
    }
    if (typeof DWP.effectivePortfolio === "function") {
      const p = DWP.effectivePortfolio(data);
      return Number(p.totalBalance) || 0;
    }
    return Number((data.portfolio && data.portfolio.totalBalance) || 0);
  }

  function methodLabel(value) {
    if (!value) return "Not selected";
    const w = wallets();
    const sym = String(value).toUpperCase();
    if (w[sym]) return w[sym].label || sym;
    return sym;
  }

  function truncateWallet(addr) {
    const s = String(addr || "").trim();
    if (!s) return "Not provided";
    if (s.length <= 20) return s;
    return s.slice(0, 10) + "…" + s.slice(-8);
  }

  function updateSummary() {
    const amount = Number(amountInput && amountInput.value) || 0;
    const method = methodSelect ? methodSelect.value : "";
    const wallet = walletInput ? walletInput.value.trim() : "";

    if (summaryAmount) {
      summaryAmount.textContent = formatMoneyWhole(amount);
    }
    if (summaryMethod) {
      summaryMethod.textContent = method ? methodLabel(method) : "Not selected";
    }
    if (summaryWallet) {
      summaryWallet.textContent = truncateWallet(wallet);
      summaryWallet.title = wallet || "";
    }
  }

  function updateAvailableHint(data) {
    lastAvailableUsd = getWithdrawalAvailableUsd(data);
    if (availableEl) availableEl.textContent = formatMoney(lastAvailableUsd);
    if (minEl) minEl.textContent = formatMoney(minWithdrawalUsd());
    if (amountInput) {
      amountInput.setAttribute("max", String(Math.max(0, lastAvailableUsd)));
    }
  }

  DWP.refreshWithdrawalPanel = function (data) {
    updateAvailableHint(data || null);
    updateSummary();
  };

  function validateSubmission() {
    const amount = Number(amountInput && amountInput.value) || 0;
    const reason = reasonSelect ? reasonSelect.value : "";
    const method = methodSelect ? methodSelect.value : "";
    const wallet = walletInput ? walletInput.value.trim() : "";
    const min = minWithdrawalUsd();

    if (!amount || amount < min) {
      return "Minimum withdrawal amount is " + formatMoney(min) + ".";
    }
    if (lastAvailableUsd > 0 && amount > lastAvailableUsd + 0.005) {
      return (
        "Withdrawal amount exceeds your available balance of " +
        formatMoney(lastAvailableUsd) +
        "."
      );
    }
    if (!reason) return "Please select a reason for withdrawal.";
    if (!method) return "Please select a crypto withdrawal method.";
    if (!wallet) return "Please enter your crypto wallet address.";
    if (wallet.length < 8) {
      return "Please enter a valid wallet address.";
    }
    return null;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const errEl = document.getElementById("withdrawal-form-error");
    const okEl = document.getElementById("withdrawal-form-success");
    const submitBtn = form && form.querySelector(".btn-submit-withdraw");
    if (errEl) errEl.hidden = true;
    if (okEl) okEl.hidden = true;

    const errMsg = validateSubmission();
    if (errMsg) {
      if (errEl) {
        errEl.textContent = errMsg;
        errEl.hidden = false;
      }
      return;
    }

    if (!window.DWP || !DWP.auth || !DWP.auth.currentUser) {
      if (errEl) {
        errEl.textContent = "You must be signed in to submit a withdrawal.";
        errEl.hidden = false;
      }
      return;
    }

    const amount = Number(amountInput.value);
    const reasonVal = reasonSelect.value;
    const reasonLabel =
      reasonSelect.options[reasonSelect.selectedIndex].textContent || reasonVal;
    const method = methodSelect.value;
    const methodDisplay = methodLabel(method);
    const wallet = walletInput.value.trim();
    const notes = notesInput ? notesInput.value.trim() : "";

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
    }

    try {
      DWP.requireFirebase();
      const uid = DWP.auth.currentUser.uid;
      const wdId = "wd-" + Date.now();
      const request = {
        id: wdId,
        amount: amount,
        amountCurrency: "USD",
        reason: reasonVal,
        reasonLabel: reasonLabel,
        method: method,
        methodLabel: methodDisplay,
        walletAddress: wallet,
        additionalInfo: notes || "",
        status: "Pending",
        requestedAt: DWP.clientTimestamp
          ? DWP.clientTimestamp()
          : new Date()
      };

      const patch = {
        lastWithdrawalRequest: request,
        updatedAt: DWP.FieldValue.serverTimestamp()
      };

      const resolved =
        typeof DWP.resolveApplicationDoc === "function"
          ? await DWP.resolveApplicationDoc(uid)
          : null;
      const docRef =
        resolved && resolved.ref
          ? resolved.ref
          : DWP.db.collection("applications").doc(uid);
      if (!resolved || !resolved.exists) {
        throw new Error("No application record found for your account.");
      }
      const existing = resolved.data || {};
      const history = Array.isArray(existing.withdrawalHistory)
        ? existing.withdrawalHistory.slice()
        : [];
      history.push(request);
      patch.withdrawalHistory = history;

      // Do not write transactions — matches firebase/firestore.rules; UI rebuilds from history.

      const clean =
        typeof DWP.sanitizeFirestorePatch === "function"
          ? DWP.sanitizeFirestorePatch(patch)
          : patch;

      await docRef.update(clean);

      if (okEl) {
        okEl.textContent =
          "Withdrawal request submitted. Our team will review it within 24–48 hours.";
        okEl.hidden = false;
      }
      form.reset();
      if (amountInput) amountInput.value = "0";
      updateSummary();

      if (typeof window.DWP.onWithdrawalSubmitted === "function") {
        window.DWP.onWithdrawalSubmitted(
          Object.assign({}, clean, {
            lastWithdrawalRequest: request,
            withdrawalHistory: history
          })
        );
      }
    } catch (err) {
      console.error("Withdrawal submit failed:", err);
      if (errEl) {
        const code = err && err.code ? err.code : "";
        if (code === "permission-denied") {
          errEl.textContent =
            "Could not save your withdrawal (permission denied). Contact support.";
        } else if (err && err.message) {
          errEl.textContent = "Failed to submit withdrawal: " + err.message;
        } else {
          errEl.textContent = "Failed to submit withdrawal request. Please try again.";
        }
        errEl.hidden = false;
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Withdrawal Request";
      }
    }
  }

  function bindOnce() {
    if (bound || !form) return;
    bound = true;

    populateReasons();
    populateCryptoMethods();

    ["input", "change"].forEach(function (ev) {
      form.addEventListener(
        ev,
        function (e) {
          if (
            e.target &&
            (e.target.id === "withdrawal-amount" ||
              e.target.id === "withdrawal-method" ||
              e.target.id === "withdrawal-wallet")
          ) {
            updateSummary();
          }
        },
        true
      );
    });

    form.addEventListener("submit", onSubmit);
  }

  function init() {
    form = document.getElementById("withdrawal-form");
    if (!form) return;

    amountInput = document.getElementById("withdrawal-amount");
    reasonSelect = document.getElementById("withdrawal-reason");
    methodSelect = document.getElementById("withdrawal-method");
    walletInput = document.getElementById("withdrawal-wallet");
    notesInput = document.getElementById("withdrawal-notes");
    availableEl = document.getElementById("withdrawal-available");
    minEl = document.getElementById("withdrawal-minimum");
    summaryAmount = document.getElementById("withdraw-summary-amount");
    summaryMethod = document.getElementById("withdraw-summary-method");
    summaryWallet = document.getElementById("withdraw-summary-wallet");

    bindOnce();
    updateSummary();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/**
 * Client dashboard — matches thedwp.net logged-in UI (captured reference).
 */
(function () {
  const SUPPORT_CONTACT_URL = "contact.html";

  // Safe HTML escaping for any Firestore-sourced value rendered via innerHTML
  const esc = typeof DWP !== "undefined" && DWP.escapeHtml
    ? DWP.escapeHtml.bind(DWP)
    : function (s) {
        const el = document.createElement("div");
        el.textContent = s == null ? "" : String(s);
        return el.innerHTML;
      };

  const loadingEl = document.getElementById("dashboard-loading");
  const rootEl = document.getElementById("dashboard-root");
  const userNameEl = document.getElementById("dashboard-user-name");
  const portalNameEl = document.getElementById("portal-user-name");
  const portalAvatarEl = document.getElementById("portal-user-avatar");
  const dateEl = document.getElementById("dashboard-date");
  const signOutBtn = document.getElementById("sign-out-btn");
  const accnav = document.getElementById("accnav");
  const menuToggle = document.getElementById("dash-menu-toggle");
  const menuClose = document.getElementById("dash-menu-close");
  const navOverlay = document.getElementById("dash-nav-overlay");
  const navMenu = document.getElementById("dash-nav-menu");

  const MAIN_NAV_TABS = [
    "overview",
    "assets",
    "investments",
    "profits",
    "transactions",
    "deposit",
    "withdrawal",
    "messages"
  ];

  const panels = {
    overview: document.getElementById("panel-overview"),
    assets: document.getElementById("panel-assets"),
    investments: document.getElementById("panel-investments"),
    profits: document.getElementById("panel-profits"),
    transactions: document.getElementById("panel-transactions"),
    deposit: document.getElementById("panel-deposit"),
    withdrawal: document.getElementById("panel-withdrawal"),
    messages: document.getElementById("panel-messages"),
    "deposit-receipt": document.getElementById("panel-deposit-receipt"),
    "no-app": document.getElementById("panel-no-app")
  };

  const overviewActivation = document.getElementById("overview-activation");
  const overviewActive = document.getElementById("overview-active");
  const overviewPendingBanner = document.getElementById("overview-pending-banner");

  let activeTab = "overview";
  let accountState = "active";
  let applicationData = null;
  let currentUser = null;

  // Tabs that are transient — reached only via in-session actions (e.g. deposit
  // submission), never directly by URL.  They must not be pushed to browser
  // history so the back button skips over them cleanly.
  const TRANSIENT_TABS = ["deposit-receipt"];

  // Set to true while handling a popstate event so switchTab knows not to push
  // another history entry.
  let handlingPopstate = false;
  let signingOut = false;

  function firstName(data, user) {
    if (data && data.fullName) {
      return String(data.fullName).trim().split(/\s+/)[0];
    }
    if (user && user.email) return user.email.split("@")[0];
    return "User";
  }

  function fullName(data, user) {
    if (data && data.fullName) return data.fullName;
    if (user && user.email) return user.email;
    return "User";
  }

  function formatMoney(n) {
    const num = Number(n);
    if (isNaN(num)) return "$0.00";
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    });
  }

  function formatPct(n) {
    const num = Number(n) || 0;
    const sign = num >= 0 ? "+" : "";
    return sign + num.toFixed(2) + "%";
  }

  function resolveAccountState(data) {
    if (!data) return "no-app";
    if (
      typeof DWP.hasPendingDeposits === "function" &&
      DWP.hasPendingDeposits(data)
    ) {
      return "deposit-pending";
    }
    if (data.accountActivated) return "active";
    if (data.depositSubmitted) return "deposit-pending";
    return "empty";
  }

  function portfolio(data) {
    if (typeof DWP.effectivePortfolio === "function") {
      return DWP.effectivePortfolio(data);
    }
    return (data && data.portfolio) || {};
  }

  function getTransactions(data) {
    if (typeof DWP.getTransactionsList === "function") {
      return DWP.getTransactionsList(data);
    }
    return (data && data.transactions) || [];
  }

  function setDateLine() {
    if (!dateEl) return;
    dateEl.textContent = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    });
  }

  function setActiveNav(tabId) {
    const inMainNav = MAIN_NAV_TABS.indexOf(tabId) >= 0;
    document.querySelectorAll(".accnav a[data-tab]").forEach(function (a) {
      a.classList.toggle(
        "active",
        inMainNav && a.getAttribute("data-tab") === tabId
      );
    });
    document.querySelectorAll(".mobile-nav-tab[data-tab]").forEach(function (a) {
      a.classList.toggle(
        "active",
        inMainNav && a.getAttribute("data-tab") === tabId
      );
    });
  }

  function hidePanels() {
    Object.keys(panels).forEach(function (key) {
      if (panels[key]) panels[key].hidden = true;
    });
  }

  function switchTab(tabId) {
    const prevTab = activeTab; // capture before we overwrite it below
    if (accountState === "no-app") {
      activeTab = "overview";
      hidePanels();
      if (panels["no-app"]) panels["no-app"].hidden = false;
      return;
    }
    activeTab = tabId;
    setActiveNav(tabId);
    hidePanels();
    const panel = panels[tabId];
    if (panel) {
      panel.hidden = false;
      panel.classList.remove("dash-panel-enter");
      void panel.offsetWidth;
      panel.classList.add("dash-panel-enter");
    }
    if (tabId === "deposit" && typeof DWP.refreshDepositPanel === "function") {
      requestAnimationFrame(function () {
        DWP.refreshDepositPanel();
      });
    }
    if (tabId === "withdrawal" && typeof DWP.refreshWithdrawalPanel === "function") {
      DWP.refreshWithdrawalPanel(applicationData);
    }
    if (tabId === "messages" && DWP.portalChat && typeof DWP.portalChat.onOpen === "function") {
      DWP.portalChat.onOpen();
    }
    if (tabId === "assets" && typeof DWP.renderAssetsPanel === "function") {
      DWP.renderAssetsPanel(applicationData, accountState, formatMoney);
    }
    if (applicationData && accountState !== "no-app") {
      if (tabId === "overview") renderOverview(applicationData);
      if (tabId === "investments") renderInvestments(applicationData);
      if (tabId === "profits") renderProfits(applicationData);
      if (tabId === "transactions") {
        const typeFilter = document.getElementById("tx-filter-type");
        const dateFilter = document.getElementById("tx-filter-date");
        renderTransactions(
          applicationData,
          typeFilter ? typeFilter.value : "all",
          dateFilter ? dateFilter.value : ""
        );
      }
    }
    closeMobileMenu();
    if (window.history && window.history.pushState) {
      const url = new URL(window.location.href);
      if (tabId === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tabId);

      // Use replaceState (no new history entry) when:
      //   • handling a popstate (back/forward) — already navigated by the browser
      //   • switching to/from a transient tab — not bookmarkable
      //   • same tab re-selected — no meaningful navigation
      // Use pushState in all other cases so back/forward work across real tabs.
      const useReplace =
        handlingPopstate ||
        TRANSIENT_TABS.includes(tabId) ||
        TRANSIENT_TABS.includes(prevTab) ||
        tabId === prevTab;

      if (useReplace) {
        window.history.replaceState({ tab: tabId }, "", url);
      } else {
        window.history.pushState({ tab: tabId }, "", url);
      }
    }
  }

  function defaultActivities(data) {
    if (data && data.activities && data.activities.length) return data.activities;
    return [
      {
        text:
          "Welcome to Digital Wealth Partners, your one-stop solution for all your trading needs. We are thrilled to have you on board and look forward to helping you achieve your trading goals."
      }
    ];
  }

  function renderActivities(listEl, data) {
    if (!listEl) return;
    const items = defaultActivities(data);
    if (accountState === "deposit-pending") {
      listEl.innerHTML =
        '<div class="activity-item"><span>Your deposit has been submitted and is awaiting confirmation by our team.</span></div>';
      return;
    }
    listEl.innerHTML = items
      .map(function (item) {
        const text = esc(item.text || item.message || "");
        const line = item.date
          ? '<b class="activity-date">' + esc(item.date) + "</b> " + text
          : text;
        return '<div class="activity-item"><span>' + line + "</span></div>";
      })
      .join("");
  }

  function renderTokenEquivSubtext(el, equiv) {
    if (!el) return;
    if (equiv && equiv.formatted) {
      el.textContent = "≈ " + equiv.formatted;
      el.hidden = false;
    } else {
      el.textContent = "";
      el.hidden = true;
    }
  }

  function renderOverview(data) {
    const summary =
      typeof DWP.getOverviewSummary === "function"
        ? DWP.getOverviewSummary(data)
        : null;
    const p = summary || portfolio(data);
    const total = summary ? summary.totalBalance : p.totalBalance != null ? p.totalBalance : 0;
    const cash = summary ? summary.availableCash : p.availableCash != null ? p.availableCash : 0;
    const count = summary
      ? summary.investmentsCount
      : p.investmentsCount != null
        ? p.investmentsCount
        : (data.investments && data.investments.length) || 0;
    const cryptoUsd = summary ? summary.cryptoUsd : 0;

    const elTotal = document.getElementById("stat-total-balance");
    const elCash = document.getElementById("stat-available-cash");
    const elCount = document.getElementById("stat-investments-count");
    const elBreakdown = document.getElementById("stat-total-breakdown");
    const elPendingNote = document.getElementById("stat-pending-note");
    const elCryptoUsd = document.getElementById("stat-crypto-usd");

    if (elTotal) elTotal.textContent = formatMoney(total);
    if (elCash) elCash.textContent = formatMoney(cash);
    if (elCount) elCount.textContent = String(count);
    if (elCryptoUsd) {
      elCryptoUsd.textContent = formatMoney(cryptoUsd) + " in crypto";
    }

    if (elBreakdown) {
      if (summary && summary.breakdownLabel) {
        elBreakdown.textContent = summary.breakdownLabel;
        elBreakdown.hidden = false;
      } else {
        elBreakdown.textContent = "";
        elBreakdown.hidden = true;
      }
    }
    if (elPendingNote) {
      if (summary && summary.pendingNote) {
        elPendingNote.textContent = summary.pendingNote;
        elPendingNote.hidden = false;
      } else {
        elPendingNote.textContent = "";
        elPendingNote.hidden = true;
      }
    }

    renderActivities(document.getElementById("overview-activity-list"), data);
  }

  function formatTxAmountCell(tx) {
    const isWithdrawal =
      String(tx.type || "").toLowerCase().indexOf("withdraw") >= 0;
    const usd = formatMoney(tx.amount);
    const amountLine = isWithdrawal ? "−" + usd.replace(/^\$/, "$") : usd;
    if (typeof DWP.getTokenEquivalentFromTx !== "function") {
      return amountLine;
    }
    const equiv = DWP.getTokenEquivalentFromTx(tx, applicationData);
    if (!equiv) return amountLine;
    return (
      amountLine +
      '<br><span class="token-equiv">≈ ' +
      (isWithdrawal ? "−" : "") +
      equiv.formatted +
      "</span>"
    );
  }

  // Disclosed fixed-yield defaults, in effect once an Investment Date and
  // Investment Amount are both set via the Set Return admin action. Admins
  // can override either rate per user from the admin console's portfolio
  // editor (portfolio.monthlyReturnRatePct / portfolio.annualReturnRatePct);
  // annual falls back to 12x the effective monthly rate when not explicitly
  // set.
  const MONTHLY_RETURN_RATE_DEFAULT_PCT = 0.95;

  function renderInvestments(data) {
    const p = portfolio(data);
    const elTv = document.getElementById("inv-total-value");
    const elYtd = document.getElementById("inv-ytd");
    const elRet = document.getElementById("inv-total-return");
    const elRetPct = document.getElementById("inv-return-pct");
    const elMonthlyRet = document.getElementById("inv-monthly-return");
    const elMonthlyRetPct = document.getElementById("inv-monthly-return-pct");
    const elDiv = document.getElementById("inv-dividend");

    if (elTv) elTv.textContent = formatMoney(p.totalBalance || 0);
    if (elYtd) elYtd.textContent = formatPct(p.ytdChange || 0) + " YTD";

    // Profit history from admin
    const profitHistory = Array.isArray(data && data.profitHistory) ? data.profitHistory : [];
    const totalProfitUsd = profitHistory.reduce(function (s, e) { return s + (Number(e.profitUsd) || 0); }, 0);
    const latestProfitPct = profitHistory.length > 0 ? (Number(profitHistory[profitHistory.length - 1].profitPct) || 0) : 0;
    const hasProfit = profitHistory.length > 0;

    // Investment date/amount captured via the Set Return admin action.
    // Annual/Monthly Return require BOTH to be set — no fallback to total
    // portfolio value or deposit history.
    const investmentDate = p.investmentDate || null;
    const investmentAmount = p.investmentAmount != null ? Number(p.investmentAmount) : null;
    const hasInvestment = !!(investmentDate && investmentAmount != null);

    const monthlyRatePct = p.monthlyReturnRatePct != null
      ? Number(p.monthlyReturnRatePct)
      : MONTHLY_RETURN_RATE_DEFAULT_PCT;
    const annualRatePct = p.annualReturnRatePct != null
      ? Number(p.annualReturnRatePct)
      : monthlyRatePct * 12;

    // Fixed overrides (admin console) take precedence over the rate calc,
    // per-figure ($ and % are independently overridable).
    const annualFixedUsd = p.annualReturnFixedUsd != null ? Number(p.annualReturnFixedUsd) : null;
    const annualFixedPct = p.annualReturnFixedPct != null ? Number(p.annualReturnFixedPct) : null;
    const monthlyFixedUsd = p.monthlyReturnFixedUsd != null ? Number(p.monthlyReturnFixedUsd) : null;
    const monthlyFixedPct = p.monthlyReturnFixedPct != null ? Number(p.monthlyReturnFixedPct) : null;

    // Annual and Monthly Return are both based on the Investment Amount
    // (Set Return), and both wait out their own period from the Investment
    // Date before generating: a full year for Annual, a full month for
    // Monthly.
    const investmentDateObj = investmentDate ? new Date(investmentDate) : null;
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const msPerMonth = msPerYear / 12;
    const msSinceInvestment =
      investmentDateObj && !isNaN(investmentDateObj.getTime()) ? Date.now() - investmentDateObj.getTime() : null;
    const yearElapsedSinceInvestment = msSinceInvestment != null && msSinceInvestment >= msPerYear;
    const monthElapsedSinceInvestment = msSinceInvestment != null && msSinceInvestment >= msPerMonth;
    const hasAnnualEligible = hasInvestment && yearElapsedSinceInvestment;
    const hasMonthlyEligible = hasInvestment && monthElapsedSinceInvestment;

    // The effective Annual Return percentage, same precedence as the card's
    // dollar figure: fixed % override > latest profit period > rate calc.
    const effectiveAnnualPct =
      annualFixedPct != null ? annualFixedPct
      : hasProfit ? latestProfitPct
      : hasAnnualEligible ? annualRatePct
      : 0;

    const annualRateUsd = hasAnnualEligible ? investmentAmount * (annualRatePct / 100) : 0;
    const annualReturnUsd = annualFixedUsd != null ? annualFixedUsd : hasProfit ? totalProfitUsd : annualRateUsd;
    if (elRet) elRet.textContent = formatMoney(annualReturnUsd);
    if (elRetPct) {
      elRetPct.textContent =
        annualFixedPct != null ? (annualFixedPct >= 0 ? "+" : "") + annualFixedPct.toFixed(2) + "%"
        : hasProfit ? (latestProfitPct >= 0 ? "+" : "") + latestProfitPct.toFixed(2) + "% last period"
        : hasAnnualEligible || annualFixedUsd != null ? "+" + annualRatePct.toFixed(2) + "% annually"
        : hasInvestment ? "Available after 1 year"
        : "Set an investment date and amount";
    }

    const monthlyRateUsd = hasMonthlyEligible ? investmentAmount * (monthlyRatePct / 100) : 0;
    const monthlyReturnUsd = monthlyFixedUsd != null ? monthlyFixedUsd : monthlyRateUsd;
    if (elMonthlyRet) elMonthlyRet.textContent = formatMoney(monthlyReturnUsd);
    if (elMonthlyRetPct) {
      elMonthlyRetPct.textContent =
        monthlyFixedPct != null ? (monthlyFixedPct >= 0 ? "+" : "") + monthlyFixedPct.toFixed(2) + "%"
        : hasMonthlyEligible || monthlyFixedUsd != null ? "+" + monthlyRatePct.toFixed(2) + "% monthly"
        : hasInvestment ? "Available after 1 month"
        : "Set an investment date and amount";
    }
    if (elDiv) elDiv.textContent = effectiveAnnualPct.toFixed(2) + "%";

    // Profit history table
    const profitSection = document.getElementById("profit-history-section");
    const profitBody = document.getElementById("profit-history-body");
    if (profitSection) profitSection.hidden = !hasProfit;
    if (profitBody && hasProfit) {
      const invTypeLabel = p.investmentType === "yield" ? "Investment Yield" : "None";
      profitBody.innerHTML = profitHistory.slice().reverse().map(function (row) {
        return (
          "<tr>" +
          "<td>" + esc(invTypeLabel) + "</td>" +
          "<td>" + esc(row.startDate || "—") + "</td>" +
          "<td>" + esc(row.endDate || "—") + "</td>" +
          '<td class="profit-pct-cell">+' + esc(String(Number(row.profitPct || 0).toFixed(2))) + "%</td>" +
          "<td>" + formatMoney(row.totalBefore || 0) + "</td>" +
          '<td class="profit-earned-cell">+' + formatMoney(row.profitUsd || 0) + "</td>" +
          "<td>" + formatMoney(row.totalAfter || 0) + "</td>" +
          "</tr>"
        );
      }).join("");
    }

    const histBody = document.getElementById("purchase-history-body");

    const history = ((data && data.purchaseHistory) || []).slice();

    // Surface the Set Return investment date/amount as a row. "Investment
    // Type" gates whether Category shows the yield label or is left blank.
    const investmentType = p.investmentType === "yield" ? "yield" : "none";
    if (hasInvestment) {
      history.unshift({
        date: investmentDate,
        category: investmentType === "yield" ? "Investment Yield" : null,
        amount: investmentAmount,
        status: "Active"
      });
    }

    if (histBody) {
      if (!history.length) {
        histBody.innerHTML =
          '<tr><td colspan="4" class="empty-cell">No purchase history yet.</td></tr>';
      } else {
        histBody.innerHTML = history
          .map(function (row) {
            return (
              "<tr><td>" +
              esc(row.date || "—") +
              "</td><td>" +
              esc(row.category || "—") +
              "</td><td>" +
              (row.amount != null ? formatMoney(row.amount) : "—") +
              '</td><td><span class="status-pill">' +
              esc(row.status || "—") +
              "</span></td></tr>"
            );
          })
          .join("");
      }
    }
  }

  function renderProfits(data) {
    const p = portfolio(data);
    const history = Array.isArray(data && data.profitHistory) ? data.profitHistory : [];
    const sorted = history.slice().reverse(); // newest first

    // "Total Profit Earned" sums every profit entry — automated monthly
    // returns and admin-applied "Apply Profit" periods alike — applied
    // on/after the Investment Date.
    const investmentDateObj = p.investmentDate ? new Date(p.investmentDate) : null;
    const earnedSinceInvestment = history.filter(function (e) {
      if (!investmentDateObj || isNaN(investmentDateObj.getTime())) return true;
      const applied = e.appliedAt ? new Date(e.appliedAt) : null;
      return !applied || isNaN(applied.getTime()) || applied.getTime() >= investmentDateObj.getTime();
    });
    const totalUsd = earnedSinceInvestment.reduce(function (s, e) { return s + (Number(e.profitUsd) || 0); }, 0);
    const latest = sorted[0] || null;

    const elTotal = document.getElementById("profit-tab-total");
    const elCount = document.getElementById("profit-tab-count");
    const elLatestPeriod = document.getElementById("profit-tab-latest-period");
    const elLatestUsd = document.getElementById("profit-tab-latest-usd");
    const elLatestDate = document.getElementById("profit-tab-latest-date");
    const body = document.getElementById("profit-tab-body");

    if (elTotal) elTotal.textContent = formatMoney(totalUsd);
    if (elCount) elCount.textContent = history.length + (history.length === 1 ? " profit entry" : " profit entries");

    if (elLatestPeriod) elLatestPeriod.textContent = p.investmentType === "yield" ? "Investment Yield" : "None";

    if (latest) {
      if (elLatestUsd) elLatestUsd.textContent = "+" + formatMoney(latest.profitUsd || 0);
      if (elLatestDate) {
        elLatestDate.textContent = "+" + Number(latest.profitPct || 0).toFixed(2) + "%";
      }
    } else {
      if (elLatestUsd) elLatestUsd.textContent = "$0.00";
      if (elLatestDate) elLatestDate.textContent = "—";
    }

    if (!body) return;

    if (!history.length) {
      body.innerHTML = '<tr><td colspan="7" class="empty-cell">No profit records yet. Your profit history will appear here once applied by our team.</td></tr>';
      return;
    }

    const investmentTypeLabel = p.investmentType === "yield" ? "Investment Yield" : "None";
    body.innerHTML = sorted.map(function (row) {
      return (
        "<tr>" +
        "<td><strong>" + esc(investmentTypeLabel) + "</strong></td>" +
        "<td>" + esc(row.startDate || "—") + "</td>" +
        "<td>" + esc(row.endDate || "—") + "</td>" +
        '<td class="profit-pct-cell">+' + esc(Number(row.profitPct || 0).toFixed(2)) + "%</td>" +
        "<td>" + formatMoney(row.totalBefore || 0) + "</td>" +
        '<td class="profit-earned-cell">+' + formatMoney(row.profitUsd || 0) + "</td>" +
        "<td>" + formatMoney(row.totalAfter || 0) + "</td>" +
        "</tr>"
      );
    }).join("");
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s.indexOf("approv") >= 0) return "Approved";
    if (s.indexOf("pend") >= 0) return "Pending";
    if (s.indexOf("den") >= 0 || s.indexOf("reject") >= 0) return "Rejected";
    return status || "—";
  }

  function renderTransactions(data, filterType, filterDate) {
    const tbody = document.getElementById("transactions-table-body");
    if (!tbody) return;
    let txs = getTransactions(data);
    if (filterType && filterType !== "all") {
      txs = txs.filter(function (tx) {
        const t = String(tx.type || "").toLowerCase();
        const f = filterType.toLowerCase();
        if (f === "withdraw" || f === "withdraws") {
          return t.indexOf("withdraw") >= 0;
        }
        if (f === "deposit" || f === "deposits") {
          return t.indexOf("deposit") >= 0;
        }
        return t === f;
      });
    }
    if (filterDate) {
      txs = txs.filter(function (tx) {
        return String(tx.date || "").indexOf(filterDate) === 0;
      });
    }
    if (!txs.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="empty-cell">No transactions found</td></tr>';
      return;
    }
    tbody.innerHTML = txs
      .map(function (tx) {
        const cls = statusClass(tx.status);
        return (
          "<tr><td>" +
          esc(tx.date || "—") +
          '</td><td class="type">' +
          esc(tx.type || "—") +
          "</td><td>" +
          esc(tx.description || "—") +
          '</td><td class="amount">' +
          formatTxAmountCell(tx) +
          '</td><td><span class="status ' +
          esc(cls) +
          '">' +
          esc(cls) +
          "</span></td></tr>"
        );
      })
      .join("");
  }

  function updateOverviewMode() {
    const showActivation = accountState === "empty";
    const showPendingBanner = accountState === "deposit-pending";
    if (overviewActivation) overviewActivation.hidden = !showActivation;
    if (overviewActive) overviewActive.hidden = showActivation;
    if (overviewPendingBanner) {
      overviewPendingBanner.hidden = !showPendingBanner;
      const pendingText = document.getElementById("overview-pending-text");
      if (showPendingBanner && pendingText) {
        pendingText.textContent =
          "Your deposit is being reviewed. Portfolio figures below reflect submitted deposits; confirmed amounts may update after admin approval.";
      }
    }
    if (overviewActivation) {
      const titleEl = document.getElementById("activation-title");
      if (titleEl) titleEl.textContent = "Account Activation Required";
    }
  }

  function refreshDashboardFigures() {
    if (!applicationData || accountState === "no-app") return;
    renderOverview(applicationData);
    renderInvestments(applicationData);
    const typeFilter = document.getElementById("tx-filter-type");
    const dateFilter = document.getElementById("tx-filter-date");
    renderTransactions(
      applicationData,
      typeFilter ? typeFilter.value : "all",
      dateFilter ? dateFilter.value : ""
    );
    if (typeof DWP.renderAssetsPanel === "function") {
      DWP.renderAssetsPanel(applicationData, accountState, formatMoney);
    }
    if (typeof DWP.updateSummary === "function") {
      DWP.updateSummary();
    }
    if (typeof DWP.refreshWithdrawalPanel === "function") {
      DWP.refreshWithdrawalPanel(applicationData);
    }
  }

  DWP.onCryptoPricesUpdated = function () {
    refreshDashboardFigures();
  };

  function showDashboard(user, data) {
    currentUser = user;
    applicationData = data;
    accountState = resolveAccountState(data);

    if (userNameEl) userNameEl.textContent = firstName(data, user);
    const portalFull = fullName(data, user);
    if (portalNameEl) {
      portalNameEl.textContent = portalFull;
      portalNameEl.title =
        "Signed in as " + ((user && user.email) || portalFull);
    }
    if (portalAvatarEl) {
      portalAvatarEl.textContent = (portalFull || "U").trim().charAt(0).toUpperCase();
    }
    setDateLine();
    updateOverviewMode();

    if (accountState === "no-app") {
      switchTab("overview");
      if (panels["no-app"]) panels["no-app"].hidden = false;
    } else {
      refreshDashboardFigures();
      switchTab(activeTab);
      if (typeof DWP.refreshCryptoPrices === "function") {
        DWP.refreshCryptoPrices(); // onCryptoPricesUpdated handles the re-render
        if (typeof DWP.startPriceAutoRefresh === "function") {
          DWP.startPriceAutoRefresh(120000); // refresh every 2 minutes
        }
      }
    }

    if (loadingEl) {
      loadingEl.hidden = true;
      loadingEl.style.display = "none";
    }
    if (rootEl) {
      rootEl.hidden = false;
      rootEl.style.display = "";
    }

  }

  function openSupport() {
    window.location.href = SUPPORT_CONTACT_URL;
  }

  function onDepositSubmitted(patch) {
    const incoming = patch || { depositSubmitted: true };
    applicationData = Object.assign({}, applicationData || {}, incoming);
    if (incoming.depositHistory) {
      applicationData.depositHistory = incoming.depositHistory;
    }
    if (incoming.transactions) {
      applicationData.transactions = incoming.transactions;
    } else {
      applicationData.transactions = getTransactions(applicationData);
    }
    accountState = resolveAccountState(applicationData);
    updateOverviewMode();
    refreshDashboardFigures();
    switchTab("deposit-receipt");
  }

  window.DWP = window.DWP || {};
  function onWithdrawalSubmitted(patch) {
    const incoming = patch || {};
    applicationData = Object.assign({}, applicationData || {}, incoming);
    if (incoming.transactions) {
      applicationData.transactions = incoming.transactions;
    }
    if (incoming.withdrawalHistory) {
      applicationData.withdrawalHistory = incoming.withdrawalHistory;
    }
    if (incoming.lastWithdrawalRequest) {
      applicationData.lastWithdrawalRequest = incoming.lastWithdrawalRequest;
    }
    refreshDashboardFigures();
    if (typeof DWP.refreshWithdrawalPanel === "function") {
      DWP.refreshWithdrawalPanel(applicationData);
    }
  }

  window.DWP.onDepositSubmitted = onDepositSubmitted;
  window.DWP.onWithdrawalSubmitted = onWithdrawalSubmitted;
  window.DWP.openSupport = openSupport;

  function openMobileMenu() {
    if (!navMenu || !navOverlay || !menuToggle) return;
    navMenu.classList.add("open");
    navMenu.setAttribute("aria-hidden", "false");
    navOverlay.hidden = false;
    menuToggle.classList.add("open");
    menuToggle.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
    document.body.classList.add("dash-menu-open");
  }

  function closeMobileMenu() {
    if (!navMenu || !navOverlay || !menuToggle) return;
    const narrow = window.innerWidth <= 1024;
    navMenu.classList.remove("open");
    navMenu.setAttribute("aria-hidden", narrow ? "true" : "false");
    navOverlay.hidden = true;
    menuToggle.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
    document.body.classList.remove("dash-menu-open");
  }

  function handleSignOut() {
    if (signingOut) return;
    signingOut = true;
    if (signOutBtn) {
      signOutBtn.disabled = true;
      signOutBtn.textContent = "Signing out...";
    }
    DWP.signOut()
      .then(function () {
        window.location.replace("login.html");
      })
      .catch(function () {
        signingOut = false;
        if (signOutBtn) {
          signOutBtn.disabled = false;
          signOutBtn.textContent = "Sign Out";
        }
      });
  }

  document.querySelectorAll("[data-goto-tab]").forEach(function (el) {
    el.addEventListener("click", function (e) {
      e.preventDefault(); // prevent href="#" fragment nav from firing a spurious popstate
      switchTab(el.getAttribute("data-goto-tab"));
    });
  });

  document.querySelectorAll(".accnav a[data-tab], .mobile-nav-tab[data-tab]").forEach(
    function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        switchTab(link.getAttribute("data-tab"));
      });
    }
  );

  document
    .getElementById("contact-investment-btn")
    ?.addEventListener("click", openSupport);

  window.DWP_switchDashboardTab = switchTab;

  menuToggle?.addEventListener("click", function () {
    if (navMenu && navMenu.classList.contains("open")) closeMobileMenu();
    else openMobileMenu();
  });
  menuClose?.addEventListener("click", closeMobileMenu);
  navOverlay?.addEventListener("click", closeMobileMenu);

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMobileMenu();
  });

  window.addEventListener("resize", function () {
    if (window.innerWidth > 1024) closeMobileMenu();
  });
  signOutBtn?.addEventListener("click", handleSignOut);
  const txFilterType = document.getElementById("tx-filter-type");
  const txFilterDate = document.getElementById("tx-filter-date");
  function refreshTxFilter() {
    renderTransactions(
      applicationData,
      txFilterType ? txFilterType.value : "all",
      txFilterDate ? txFilterDate.value : ""
    );
  }
  txFilterType?.addEventListener("change", refreshTxFilter);
  txFilterDate?.addEventListener("change", refreshTxFilter);

  // ── Browser back/forward support ─────────────────────────────────────────
  // When the user presses back/forward, restore the correct dashboard tab
  // without pushing yet another history entry.
  window.addEventListener("popstate", function (e) {
    // Only handle states we explicitly created via pushState/replaceState,
    // which always carry a { tab } property.  Fragment navigations (e.g.
    // href="#") also fire popstate but with state: null — ignore those so
    // they don't accidentally flip the visible panel.
    if (!e.state || typeof e.state.tab === "undefined") return;
    const tab = e.state.tab || "overview";
    if (panels[tab] && !TRANSIENT_TABS.includes(tab)) {
      handlingPopstate = true;
      switchTab(tab);
      handlingPopstate = false;
    }
  });
  // ─────────────────────────────────────────────────────────────────────────

  function initialTabFromUrl() {
    const tab = new URL(window.location.href).searchParams.get("tab");
    if (tab && panels[tab] && !TRANSIENT_TABS.includes(tab)) return tab;
    return "overview";
  }

  // ── Admin impersonation ──────────────────────────────────────────────────────

  function getImpersonateDocId() {
    return new URL(window.location.href).searchParams.get("impersonate") || "";
  }

  function showImpersonationBanner(name) {
    const banner = document.getElementById("impersonation-banner");
    const nameEl = document.getElementById("impersonation-user-name");
    const exitBtn = document.getElementById("impersonation-exit-btn");
    if (nameEl) nameEl.textContent = name;
    if (banner) banner.hidden = false;
    if (exitBtn) {
      exitBtn.addEventListener("click", function () {
        window.location.href = "admin.html";
      });
    }
  }

  async function loadDashboard(user) {
    const impersonateDocId = getImpersonateDocId();

    // Admin impersonation: load target user's data directly
    if (DWP.isAdmin(user) && impersonateDocId) {
      const ref = DWP.db.collection("applications").doc(impersonateDocId);
      const snap = await ref.get();

      if (!snap.exists) {
        alert("The target user account was not found. Returning to admin panel.");
        window.location.href = "admin.html";
        return;
      }

      // Redirect all application doc reads/writes to the target user's document
      DWP.resolveApplicationDoc = async function () {
        const fresh = await ref.get();
        return { ref: ref, id: impersonateDocId, exists: fresh.exists, data: fresh.data() };
      };

      const data = snap.data();
      const displayName = new URL(window.location.href).searchParams.get("iname") ||
        data.fullName || data.email || impersonateDocId;
      showImpersonationBanner(displayName);

      if (typeof DWP.loadWalletConfig === "function") {
        DWP.loadWalletConfig().catch(function () {});
      }
      activeTab = initialTabFromUrl();
      showDashboard(user, data);
      return;
    }

    // Normal (non-impersonation) flow
    const access = await DWP.getAccountAccess(user);
    if (!access.allowed) {
      window.location.replace("account-pending.html");
      return;
    }
    if (typeof DWP.loadWalletConfig === "function") {
      DWP.loadWalletConfig().catch(function () {});
    }
    activeTab = initialTabFromUrl();
    showDashboard(user, access.data);
  }

  DWP.onAuth(async function (user) {
    if (!user) {
      window.location.replace("login.html");
      return;
    }
    // Redirect plain admin visits to admin panel; allow through when impersonating
    if (DWP.isAdmin(user) && !getImpersonateDocId()) {
      window.location.replace("admin.html");
      return;
    }
    try {
      DWP.requireFirebase();
      await loadDashboard(user);
    } catch (err) {
      console.error(err);
      if (loadingEl) {
        loadingEl.textContent =
          "We're having trouble loading your dashboard. Please try again.";
      }
    }
  });
})();

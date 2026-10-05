(function () {
  const loadingEl = document.getElementById("admin-loading");
  const tableWrap = document.getElementById("admin-table-wrap");
  const tbody = document.getElementById("admin-tbody");
  const emptyEl = document.getElementById("admin-empty");
  const deniedEl = document.getElementById("admin-denied");
  const userEmailEl = document.getElementById("admin-user-email");
  const signOutBtn = document.getElementById("admin-sign-out");
  const refreshBtn = document.getElementById("admin-refresh");
  const detailModal = document.getElementById("admin-detail-modal");
  const detailModalBody = document.getElementById("admin-modal-body");
  const detailModalTitle = document.getElementById("admin-modal-title");
  const detailModalFooter = document.querySelector(".admin-modal-footer");
  const adminAccessHint = document.getElementById("admin-access-hint");

  let lastSnap = null;
  let modalDocId = null;

  function showAdminAccessHint(user) {
    if (!adminAccessHint || !user) return;
    const email = (user.email || "").toLowerCase();
    const list = (window.SITE_CONFIG && window.SITE_CONFIG.adminEmails) || [];
    const listed = list.some(function (e) {
      return String(e).toLowerCase() === email;
    });
    let html =
      "Signed in as <strong>" +
      escapeHtml(user.email || "—") +
      "</strong>. UID: <code class=\"admin-mono\">" +
      escapeHtml(user.uid || "") +
      "</code>. ";
    if (listed) {
      html +=
        "This email is configured as an administrator, so all admin actions are available.";
    } else {
      html +=
        "This email is <strong>not</strong> listed in <code>adminEmails</code> (js/config.js) or <code>ADMIN_EMAILS</code> (server/.env) — admin actions will be denied.";
    }
    adminAccessHint.innerHTML = html;
    adminAccessHint.hidden = false;
  }

  function escapeHtml(s) {
    const el = document.createElement("div");
    el.textContent = s == null ? "" : String(s);
    return el.innerHTML;
  }

  /* ── Styled alert / confirm (replaces window.alert / window.confirm) ── */
  const noticeModal = document.getElementById("admin-confirm-modal");
  const noticeIcon = document.getElementById("admin-confirm-icon");
  const noticeTitle = document.getElementById("admin-confirm-title");
  const noticeMsg = document.getElementById("admin-confirm-msg");
  const noticeOk = document.getElementById("admin-confirm-ok");
  const noticeCancel = document.getElementById("admin-confirm-cancel");
  let noticeResolve = null;
  let noticeMode = "alert";
  let noticeReturnFocus = null;

  function closeNotice(accepted) {
    if (!noticeModal || !noticeResolve) return;
    const resolve = noticeResolve;
    noticeResolve = null;
    noticeModal.hidden = true;
    noticeModal.setAttribute("aria-hidden", "true");
    const focusTarget = noticeReturnFocus;
    noticeReturnFocus = null;
    if (focusTarget && document.contains(focusTarget) && focusTarget.focus) {
      focusTarget.focus();
    }
    resolve(accepted);
  }

  function openNotice(message, opts) {
    opts = opts || {};
    if (!noticeModal) {
      // Defensive fallback if markup is missing.
      if (opts.confirmMode) return Promise.resolve(window.confirm(String(message)));
      window.alert(String(message));
      return Promise.resolve();
    }
    if (noticeResolve) closeNotice(false);
    noticeMode = opts.confirmMode ? "confirm" : "alert";
    noticeReturnFocus = document.activeElement;
    noticeTitle.textContent = opts.title || (noticeMode === "confirm" ? "Please confirm" : "Notice");
    noticeMsg.textContent = message == null ? "" : String(message);
    noticeOk.textContent = opts.okText || (noticeMode === "confirm" ? "Confirm" : "OK");
    noticeCancel.hidden = noticeMode !== "confirm";
    noticeCancel.textContent = opts.cancelText || "Cancel";
    const danger = !!opts.danger;
    noticeOk.classList.toggle("admin-confirm__ok--danger", danger);
    noticeIcon.className =
      "admin-confirm__icon admin-confirm__icon--" +
      (danger ? "danger" : noticeMode === "confirm" ? "warn" : "info");
    noticeIcon.innerHTML =
      '<i class="bi ' +
      (danger
        ? "bi-exclamation-octagon-fill"
        : noticeMode === "confirm"
          ? "bi-exclamation-triangle-fill"
          : "bi-info-circle-fill") +
      '"></i>';
    noticeModal.hidden = false;
    noticeModal.setAttribute("aria-hidden", "false");
    (danger && noticeMode === "confirm" ? noticeCancel : noticeOk).focus();
    return new Promise(function (resolve) {
      noticeResolve = resolve;
    });
  }

  function showAlert(message, opts) {
    return openNotice(message, Object.assign({}, opts, { confirmMode: false }));
  }

  function showConfirm(message, opts) {
    return openNotice(message, Object.assign({}, opts, { confirmMode: true }));
  }

  noticeOk?.addEventListener("click", function () {
    closeNotice(true);
  });
  noticeCancel?.addEventListener("click", function () {
    closeNotice(false);
  });
  noticeModal?.querySelector("[data-confirm-dismiss]")?.addEventListener("click", function () {
    // Backdrop: alerts dismiss as OK, confirms cancel.
    closeNotice(noticeMode !== "confirm");
  });
  document.addEventListener("keydown", function (e) {
    if (!noticeModal || noticeModal.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeNotice(noticeMode !== "confirm");
    } else if (e.key === "Enter") {
      e.preventDefault();
      closeNotice(true);
    }
  });

  function formatMoney(n) {
    const num = Number(n);
    if (isNaN(num)) return "—";
    return num.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2
    });
  }

  function formatAdminDepositUsd(d) {
    if (d.depositAmount == null) return "—";
    const usd = formatMoney(d.depositAmount);
    if (window.DWP && typeof window.DWP.getDepositTokenEquivalent === "function") {
      const equiv = window.DWP.getDepositTokenEquivalent(d);
      if (equiv) return usd + " (≈ " + equiv.formatted + ")";
    }
    return usd;
  }

  function txUsdDisplay(tx, d) {
    let usd = Number(tx.amount) || 0;
    if (
      window.DWP &&
      typeof window.DWP.depositUsdFromTx === "function" &&
      !(usd > 0)
    ) {
      usd = window.DWP.depositUsdFromTx(tx, d);
    }
    let line = formatMoney(usd);
    if (
      window.DWP &&
      typeof window.DWP.getTokenEquivalentFromTx === "function"
    ) {
      const equiv = window.DWP.getTokenEquivalentFromTx(tx, d);
      if (equiv && equiv.formatted) {
        line += " (≈ " + equiv.formatted + ")";
      }
    }
    return line;
  }

  function closeDetailModal() {
    modalDocId = null;
    if (!detailModal) return;
    detailModal.hidden = true;
    detailModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (detailModalBody) detailModalBody.innerHTML = "";
    if (detailModalFooter) {
      detailModalFooter.innerHTML =
        '<button type="button" class="btn-outline" data-admin-modal-close>Close</button>';
    }
  }

  function openDetailModal() {
    if (!detailModal) return;
    detailModal.hidden = false;
    detailModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function buildPortfolioSection(d) {
    const summary =
      window.DWP && typeof window.DWP.getOverviewSummary === "function"
        ? window.DWP.getOverviewSummary(d)
        : null;
    if (!summary || !(summary.totalBalance > 0)) {
      return "";
    }
    let html =
      '<section class="admin-detail-section">' +
      "<h3>Client portfolio (computed)</h3>" +
      "<dl class=\"admin-detail-dl\">" +
      "<dt>Total value</dt><dd>" +
      escapeHtml(formatMoney(summary.totalBalance)) +
      "</dd>" +
      "<dt>Crypto assets</dt><dd>" +
      escapeHtml(String(summary.investmentsCount)) +
      " — " +
      escapeHtml(formatMoney(summary.cryptoUsd)) +
      "</dd>" +
      "<dt>USD cash</dt><dd>" +
      escapeHtml(formatMoney(summary.availableCash)) +
      "</dd>";
    if (summary.pendingUsd > 0) {
      html +=
        "<dt>Pending deposits</dt><dd>" +
        escapeHtml(formatMoney(summary.pendingUsd)) +
        "</dd>";
    }
    if (summary.breakdownLabel) {
      html +=
        "<dt>Holdings</dt><dd>" + escapeHtml(summary.breakdownLabel) + "</dd>";
    }
    html += "</dl></section>";
    return html;
  }

  async function buildProofSection(d) {
    const hist = Array.isArray(d.depositHistory) ? d.depositHistory : [];
    if (!d.depositSubmitted && !hist.length) {
      return '<p class="admin-muted">No deposit submitted yet.</p>';
    }

    let html =
      '<section class="admin-detail-section">' +
      "<h3>Latest deposit proof</h3>" +
      "<dl class=\"admin-detail-dl\">" +
      "<dt>Submitted</dt><dd>" +
      escapeHtml(formatDate(d.depositSubmittedAt)) +
      "</dd>" +
      "<dt>Asset</dt><dd>" +
      escapeHtml((d.depositMethod || "—").toUpperCase()) +
      "</dd>" +
      "<dt>Network</dt><dd>" +
      escapeHtml(d.depositNetworkLabel || d.depositNetwork || "—") +
      "</dd>" +
      "<dt>Amount</dt><dd>" +
      escapeHtml(formatAdminDepositUsd(d)) +
      "</dd>" +
      "<dt>Total to credit</dt><dd>" +
      escapeHtml(
        d.depositTotalCredit != null
          ? Number(d.depositTotalCredit).toLocaleString("en-US", {
              style: "currency",
              currency: "USD"
            })
          : "—"
      ) +
      "</dd>" +
      "<dt>Wallet used</dt><dd class=\"admin-mono\">" +
      escapeHtml(d.depositWallet || "—") +
      "</dd>" +
      "<dt>Proof filename</dt><dd>" +
      escapeHtml(d.depositProofFileName || "—") +
      "</dd>" +
      "</dl>";

    let proofUrl = d.depositProofUrl || null;
    if (!proofUrl && d.depositProofStoragePath && DWP.getDepositProofUrl) {
      try {
        proofUrl = await DWP.getDepositProofUrl(d.depositProofStoragePath);
      } catch (e) {
        console.warn("Could not load proof URL:", e);
      }
    }

    if (proofUrl) {
      html +=
        '<div class="admin-proof-preview">' +
        '<p><a href="' +
        escapeHtml(proofUrl) +
        '" target="_blank" rel="noopener" class="admin-proof-link">Open payment proof in new tab</a></p>' +
        '<img src="' +
        escapeHtml(proofUrl) +
        '" alt="Payment proof for ' +
        escapeHtml(d.fullName || "client") +
        '">' +
        "</div>";
    } else if (d.depositProofFileName) {
      html +=
        '<p class="admin-muted">The client uploaded <strong>' +
        escapeHtml(d.depositProofFileName) +
        "</strong>, but the image file is not stored (older submission or Storage not enabled).</p>";
    } else {
      html += '<p class="admin-muted">No payment proof file attached.</p>';
    }

    html += "</section>";
    return html;
  }

  function buildDepositsSection(d, docId) {
    const summary =
      window.DWP && typeof window.DWP.getDepositAdminSummary === "function"
        ? window.DWP.getDepositAdminSummary(d)
        : null;
    const txs = summary ? summary.txs : [];
    if (!txs.length && !d.depositSubmitted) {
      return "";
    }

    let html =
      '<section class="admin-detail-section">' +
      "<h3>Deposit transactions</h3>" +
      '<p class="admin-muted"><strong>Approve signup</strong> lets the client log in. Use the <strong>Approve / Decline</strong> buttons below to action individual deposit requests.</p>';

    if (summary) {
      html +=
        '<p><span class="' +
        depositStatusClass(summary.tone) +
        '">' +
        escapeHtml(summary.label) +
        "</span>";
      if (summary.portfolioTotal > 0) {
        html +=
          ' — Portfolio total: <strong>' +
          escapeHtml(formatMoney(summary.portfolioTotal)) +
          "</strong>";
      }
      html += "</p>";
    }

    if (!txs.length) {
      html += '<p class="admin-muted">No deposit rows in the ledger yet.</p></section>';
      return html;
    }

    html +=
      '<table class="admin-deposits-table admin-withdrawals-table"><thead><tr>' +
      "<th>Date</th><th>Asset</th><th>Amount (USD)</th><th>Status</th><th>Actions</th></tr></thead><tbody>";
    txs.forEach(function (tx) {
      const st = String(tx.status || "Pending");
      const cls = statusClass(st);
      const isPending =
        window.DWP && typeof window.DWP.isPendingDepositTx === "function"
          ? window.DWP.isPendingDepositTx(tx)
          : st.toLowerCase().indexOf("pend") >= 0;

      html +=
        "<tr><td>" +
        escapeHtml(tx.date || "—") +
        "</td><td>" +
        escapeHtml(tx.method || "—") +
        "</td><td>" +
        escapeHtml(txUsdDisplay(tx, d)) +
        '</td><td><span class="' +
        cls +
        '">' +
        escapeHtml(st) +
        '</span></td><td class="admin-wd-actions">';

      if (isPending && tx.id && docId) {
        html +=
          '<button type="button" class="btn-approve btn-dep-approve" ' +
          'data-dep-approve="' + escapeHtml(docId) + '" ' +
          'data-deposit-id="' + escapeHtml(tx.id) + '">Approve</button> ' +
          '<button type="button" class="btn-reject btn-dep-decline" ' +
          'data-dep-decline="' + escapeHtml(docId) + '" ' +
          'data-deposit-id="' + escapeHtml(tx.id) + '">Decline</button>';
      } else {
        html += '<span class="admin-muted">—</span>';
      }

      html += "</td></tr>";
    });
    html += "</tbody></table></section>";
    return html;
  }

  function renderModalFooter(d, docId) {
    if (!detailModalFooter) return;
    const summary =
      window.DWP && typeof window.DWP.getDepositAdminSummary === "function"
        ? window.DWP.getDepositAdminSummary(d)
        : { canConfirm: false };
    const status = (d.status || "pending").toLowerCase();
    const activateLabel = d.accountActivated
      ? "Confirm All Pending"
      : "Confirm & Activate All";

    let html =
      '<button type="button" class="btn-outline" data-admin-modal-close>Close</button>';
    if (status === "pending") {
      html +=
        ' <button type="button" class="btn-approve" data-modal-approve="' +
        docId +
        '">Approve signup</button>' +
        ' <button type="button" class="btn-reject" data-modal-reject="' +
        docId +
        '">Reject</button>';
    }
    if (summary.canConfirm) {
      html +=
        ' <button type="button" class="btn-activate" data-modal-activate="' +
        docId +
        '">' +
        activateLabel +
        "</button>";
    }
    detailModalFooter.innerHTML = html;

    detailModalFooter.querySelectorAll("[data-admin-modal-close]").forEach(function (btn) {
      btn.addEventListener("click", closeDetailModal);
    });
    const approveBtn = detailModalFooter.querySelector("[data-modal-approve]");
    if (approveBtn) {
      approveBtn.addEventListener("click", function () {
        setApplicationStatus(docId, "approved")
          .then(function () {
            return showApplicationDetail(docId);
          })
          .catch(async function (err) {
            console.error(err);
            await showAlert("Could not approve signup.");
          });
      });
    }
    const rejectBtn = detailModalFooter.querySelector("[data-modal-reject]");
    if (rejectBtn) {
      rejectBtn.addEventListener("click", function () {
        setApplicationStatus(docId, "rejected")
          .then(closeDetailModal)
          .catch(async function (err) {
            console.error(err);
            await showAlert("Could not reject application.");
          });
      });
    }
    const activateBtn = detailModalFooter.querySelector("[data-modal-activate]");
    if (activateBtn) {
      activateBtn.addEventListener("click", function () {
        activateAccount(docId).catch(function () {});
      });
    }
  }

  async function showApplicationDetail(docId) {
    const row =
      lastSnap &&
      lastSnap.docs.find(function (d) {
        return d.id === docId;
      });
    if (!row || !detailModalBody) return;
    const d = row.data();
    modalDocId = docId;

    if (detailModalTitle) {
      detailModalTitle.textContent = d.fullName || "Application details";
    }

    detailModalBody.innerHTML = '<p class="admin-muted">Loading…</p>';
    openDetailModal();

    const proofSection = await buildProofSection(d);

    detailModalBody.innerHTML =
      '<section class="admin-detail-section">' +
      "<h3>Applicant</h3>" +
      "<dl class=\"admin-detail-dl\">" +
      "<dt>Name</dt><dd>" +
      escapeHtml(d.fullName || "—") +
      "</dd>" +
      "<dt>Email</dt><dd>" +
      escapeHtml(d.email || "—") +
      "</dd>" +
      "<dt>Phone</dt><dd>" +
      escapeHtml(d.phone || "—") +
      "</dd>" +
      "<dt>LLC</dt><dd>" +
      escapeHtml(d.llcName || "—") +
      "</dd>" +
      "<dt>Formation state</dt><dd>" +
      escapeHtml(d.formationState || "—") +
      "</dd>" +
      "<dt>Primary asset</dt><dd>" +
      escapeHtml(d.primaryAsset || "—") +
      "</dd>" +
      "<dt>Asset value</dt><dd>" +
      escapeHtml(d.assetValue || "—") +
      "</dd>" +
      "<dt>Signup status</dt><dd>" +
      escapeHtml(d.status || "pending") +
      ' <span class="admin-muted">(allows client login)</span></dd>' +
      "<dt>Account activated</dt><dd>" +
      escapeHtml(d.accountActivated ? "Yes" : "No") +
      "</dd>" +
      "<dt>Applied</dt><dd>" +
      escapeHtml(formatDate(d.createdAt)) +
      "</dd>" +
      "</dl></section>" +
      buildPortfolioSection(d) +
      buildDepositsSection(d, docId) +
      buildWithdrawalsSection(d, docId) +
      proofSection;

    renderModalFooter(d, docId);
    bindDepositActions(detailModalBody);
    bindWithdrawalActions(detailModalBody);
  }

  document.querySelectorAll("[data-admin-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeDetailModal);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && detailModal && !detailModal.hidden) {
      closeDetailModal();
    }
  });

  function formatDate(ts) {
    if (!ts || !ts.toDate) return "—";
    return ts
      .toDate()
      .toLocaleString("en-US", {
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true
      });
  }

  function softBreak(text) {
    return escapeHtml(text || "").replace(/([.@\-/])/g, "$1<wbr>");
  }

  function statusClass(status) {
    const s = (status || "pending").toLowerCase();
    if (s.indexOf("approv") >= 0 || s === "confirmed") {
      return "status-badge status-approved";
    }
    if (s.indexOf("den") >= 0 || s.indexOf("reject") >= 0) {
      return "status-badge status-rejected";
    }
    if (s.indexOf("pend") >= 0) return "status-badge status-pending";
    return "status-badge status-" + s;
  }

  function depositStatusClass(tone) {
    if (tone === "approved") return "status-badge status-approved";
    if (tone === "pending") return "status-badge status-pending";
    return "status-badge status-none";
  }

  function withdrawalStatusClass(tone) {
    if (tone === "approved") return "status-badge status-approved";
    if (tone === "pending") return "status-badge status-pending";
    if (tone === "rejected") return "status-badge status-rejected";
    return "status-badge status-none";
  }

  function formatWithdrawalDate(value) {
    if (value && value.toDate) return value.toDate().toLocaleString();
    if (value instanceof Date) return value.toLocaleString();
    if (typeof value === "string" && value) return value;
    return "—";
  }

  function buildWithdrawalsSection(d, docId) {
    const summary =
      window.DWP && typeof window.DWP.getWithdrawalAdminSummary === "function"
        ? window.DWP.getWithdrawalAdminSummary(d)
        : { list: [], hasAny: false, pendingCount: 0, label: "—", tone: "none" };

    if (!summary.hasAny) {
      return (
        '<section class="admin-detail-section">' +
        "<h3>Withdrawal requests</h3>" +
        '<p class="admin-muted">No withdrawal requests submitted yet.</p></section>'
      );
    }

    let html =
      '<section class="admin-detail-section">' +
      "<h3>Withdrawal requests</h3>" +
      '<p class="admin-muted">Review each request below. <strong>Approve</strong> to process payout; <strong>Deny</strong> to decline the request.</p>' +
      '<p><span class="' +
      withdrawalStatusClass(summary.tone) +
      '">' +
      escapeHtml(summary.label) +
      "</span></p>" +
      '<table class="admin-deposits-table admin-withdrawals-table"><thead><tr>' +
      "<th>Date</th><th>Amount</th><th>Method</th><th>Wallet</th><th>Reason</th><th>Status</th><th>Actions</th>" +
      "</tr></thead><tbody>";

    summary.list.forEach(function (wd) {
      const st = String(wd.status || "Pending");
      const cls = statusClass(st);
      const pending =
        window.DWP &&
        typeof window.DWP.isPendingWithdrawal === "function" &&
        window.DWP.isPendingWithdrawal(wd);
      const wallet = String(wd.walletAddress || "").trim();

      html +=
        "<tr><td>" +
        escapeHtml(formatWithdrawalDate(wd.requestedAt)) +
        "</td><td>" +
        escapeHtml(formatMoney(wd.amount)) +
        "</td><td>" +
        escapeHtml(wd.methodLabel || wd.method || "—") +
        '</td><td class="admin-mono">' +
        escapeHtml(wallet || "—") +
        "</td><td>" +
        escapeHtml(wd.reasonLabel || wd.reason || "—") +
        '</td><td><span class="' +
        cls +
        '">' +
        escapeHtml(st) +
        "</span></td><td class=\"admin-wd-actions\">";

      if (pending) {
        html +=
          '<button type="button" class="btn-approve btn-wd-approve" data-wd-approve="' +
          escapeHtml(docId) +
          '" data-withdrawal-id="' +
          escapeHtml(wd.id || "") +
          '">Approve</button> ' +
          '<button type="button" class="btn-reject btn-wd-deny" data-wd-deny="' +
          escapeHtml(docId) +
          '" data-withdrawal-id="' +
          escapeHtml(wd.id || "") +
          '">Deny</button>';
      } else {
        html += '<span class="admin-muted">—</span>';
      }

      if (wd.additionalInfo) {
        html +=
          '</td></tr><tr class="admin-wd-notes-row"><td colspan="7"><span class="admin-muted">Notes: ' +
          escapeHtml(wd.additionalInfo) +
          "</span></td></tr>";
      } else {
        html += "</td></tr>";
      }
    });

    html += "</tbody></table></section>";
    return html;
  }

  function bindDepositActions(scope) {
    const root = scope || document;
    root.querySelectorAll("[data-dep-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        confirmSingleDeposit(
          btn.getAttribute("data-dep-approve"),
          btn.getAttribute("data-deposit-id"),
          "approve"
        ).catch(function (err) { console.error(err); });
      });
    });
    root.querySelectorAll("[data-dep-decline]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        confirmSingleDeposit(
          btn.getAttribute("data-dep-decline"),
          btn.getAttribute("data-deposit-id"),
          "decline"
        ).catch(function (err) { console.error(err); });
      });
    });
  }

  async function confirmSingleDeposit(docId, depositId, action) {
    const row = lastSnap && lastSnap.docs.find(function (d) { return d.id === docId; });
    if (!row) return;
    const d = row.data();
    const isApprove = action === "approve";
    const hist = Array.isArray(d.depositHistory) ? d.depositHistory : [];
    const dep = hist.find(function (r) { return r && r.id === depositId; });
    const name = d.fullName || "this client";
    const amountStr = dep ? formatMoney(Number(dep.amount || dep.totalCredit || 0)) : "this deposit";
    const sym = dep ? (dep.methodSymbol || dep.method || "crypto").toUpperCase() : "";

    if (!(await showConfirm(
      (isApprove ? "Approve" : "Decline") +
      " the " + sym + " deposit of " + amountStr + " for " + name + "?"
    ))) return;

    if (!depositId) {
      await showAlert("Deposit ID is missing. Please refresh and try again.");
      return;
    }

    let patch =
      typeof DWP.buildSingleDepositReviewPatch === "function"
        ? DWP.buildSingleDepositReviewPatch(
            d,
            depositId,
            action,
            DWP.auth.currentUser && DWP.auth.currentUser.email
          )
        : null;

    if (!patch) {
      await showAlert("Single deposit review is not available.");
      return;
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert(
        isApprove
          ? "Deposit approved. The client's portfolio has been updated."
          : "Deposit declined."
      );
      await loadApplications();
      if (modalDocId === docId) {
        await showApplicationDetail(docId);
      }
    } catch (err) {
      console.error("Single deposit review failed:", err);
      const code = err && err.code ? err.code : "";
      let msg = "Could not update deposit.\n\n";
      if (code === "permission-denied") {
        msg += "Firestore blocked the update. Ensure you are signed in as admin and rules are published.";
      } else if (err && err.message) {
        msg += err.message;
      }
      await showAlert(msg);
      throw err;
    }
  }

  function bindWithdrawalActions(scope) {
    const root = scope || document;
    root.querySelectorAll("[data-wd-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        reviewWithdrawal(
          btn.getAttribute("data-wd-approve"),
          btn.getAttribute("data-withdrawal-id"),
          "Approved"
        ).catch(function (err) {
          console.error(err);
        });
      });
    });
    root.querySelectorAll("[data-wd-deny]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        reviewWithdrawal(
          btn.getAttribute("data-wd-deny"),
          btn.getAttribute("data-withdrawal-id"),
          "Denied"
        ).catch(function (err) {
          console.error(err);
        });
      });
    });
  }

  async function reviewWithdrawal(docId, withdrawalId, newStatus) {
    const row =
      lastSnap &&
      lastSnap.docs.find(function (d) {
        return d.id === docId;
      });
    if (!row) return;
    const d = row.data();
    const wdList =
      window.DWP && typeof window.DWP.getWithdrawalList === "function"
        ? window.DWP.getWithdrawalList(d)
        : [];
    const wd = wdList.find(function (w) {
      return w.id === withdrawalId;
    });
    const name = d.fullName || "this client";
    const amountStr = wd ? formatMoney(wd.amount) : "this request";
    const actionWord = newStatus === "Approved" ? "approve" : "deny";

    if (
      !(await showConfirm(
        "Are you sure you want to " +
          actionWord +
          " the withdrawal of " +
          amountStr +
          " for " +
          name +
          "?"
      ))
    ) {
      return;
    }

    if (!withdrawalId) {
      await showAlert("Withdrawal id is missing. Ask the client to submit again.");
      return;
    }

    let patch =
      typeof DWP.buildWithdrawalReviewPatch === "function"
        ? DWP.buildWithdrawalReviewPatch(
            d,
            withdrawalId,
            newStatus,
            DWP.auth.currentUser && DWP.auth.currentUser.email
          )
        : null;

    if (!patch) {
      await showAlert("Withdrawal review is not available.");
      return;
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert(
        newStatus === "Approved"
          ? "Withdrawal approved. The client will see this on their dashboard activity."
          : "Withdrawal denied."
      );
      await loadApplications();
      if (modalDocId === docId) {
        await showApplicationDetail(docId);
      }
    } catch (err) {
      console.error("Withdrawal review failed:", err);
      const code = err && err.code ? err.code : "";
      let msg = "Could not update withdrawal.\n\n";
      if (code === "permission-denied") {
        msg +=
          "Firestore blocked the update. Publish firebase/firestore.rules and sign in as an admin.";
      } else if (err && err.message) {
        msg += err.message;
      }
      await showAlert(msg);
      throw err;
    }
  }

  async function setApplicationStatus(docId, newStatus) {
    const label = newStatus === "approved" ? "approve signup for" : "reject";
    const row = lastSnap && lastSnap.docs.find(function (d) {
      return d.id === docId;
    });
    const name = row ? row.data().fullName || "this applicant" : "this applicant";
    if (
      !(await showConfirm(
        "Are you sure you want to " + label + " " + name + "?"
      ))
    ) {
      return;
    }

    const patch = {
      status: newStatus,
      reviewedAt: DWP.FieldValue.serverTimestamp(),
      reviewedBy: DWP.auth.currentUser?.email || null,
      updatedAt: DWP.FieldValue.serverTimestamp()
    };
    if (newStatus === "approved") {
      patch.accountActivated = false;
    }
    await DWP.db.collection("applications").doc(docId).update(patch);
    await loadApplications();
  }

  async function activateAccount(docId) {
    const row = lastSnap && lastSnap.docs.find(function (d) {
      return d.id === docId;
    });
    const d = row ? row.data() : {};
    const name = row ? row.data().fullName || "this client" : "this client";
    const depositSummary =
      window.DWP && typeof window.DWP.getDepositAdminSummary === "function"
        ? window.DWP.getDepositAdminSummary(d)
        : { pendingCount: 0 };
    const pendingCount = depositSummary.pendingCount || 0;
    const alreadyActive = !!d.accountActivated;
    const msg = alreadyActive
      ? "Confirm " +
        (pendingCount === 1 ? "1 pending deposit" : pendingCount + " pending deposits") +
        " for " +
        name +
        "? This will approve the deposit(s) and update their portfolio."
      : "Activate the portfolio dashboard for " +
        name +
        "? This confirms pending deposit(s) and enables full dashboard access.";
    if (!(await showConfirm(msg, { danger: !alreadyActive && pendingCount > 0 }))) {
      return;
    }

    let patch =
      typeof DWP.buildActivationPatch === "function"
        ? DWP.buildActivationPatch(d)
        : { accountActivated: true };

    if (typeof DWP.sanitizeFirestorePatch === "function") {
      patch = DWP.sanitizeFirestorePatch(patch);
    }

    const pendingBefore =
      typeof DWP.getDepositAdminSummary === "function"
        ? DWP.getDepositAdminSummary(d).pendingCount
        : 0;
    const txsAfter = patch.transactions || [];
    const approvedAfter = txsAfter.filter(function (tx) {
      const s = String((tx.status || "").toLowerCase());
      return (
        String(tx.type || "").toLowerCase().indexOf("deposit") >= 0 &&
        (s.indexOf("approv") >= 0 || s === "confirmed")
      );
    }).length;

    if (pendingBefore > 0 && approvedAfter === 0) {
      await showAlert(
        "No pending deposits were found on this record. The client may need to submit a deposit again, or data may only exist in an old format — contact support."
      );
      return;
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert(
        "Deposit(s) confirmed. The client's portfolio and transaction list have been updated."
      );
      await loadApplications();
      if (modalDocId === docId) {
        await showApplicationDetail(docId);
      }
    } catch (err) {
      console.error("Confirm deposit failed:", err);
      const code = err && err.code ? err.code : "";
      const user = DWP.auth && DWP.auth.currentUser;
      let msg = "Could not confirm deposit.\n\n";
      if (code === "permission-denied") {
        msg +=
          "Firestore blocked the update (permission-denied).\n\n" +
          "1. Open Firebase Console → Firestore → Rules.\n" +
          "2. Paste the contents of firebase/firestore.rules from this project.\n" +
          "3. Click Publish.\n" +
          "4. Sign in here as: admin@digitalwealthpartners.co or jakeclaver@digitalwealthpartners.co\n\n" +
          "OR create document admins/" +
          (user ? user.uid : "YOUR_UID") +
          " with field active = true (boolean), then publish rules again.\n\n" +
          "Your UID: " +
          (user ? user.uid : "unknown") +
          "\nYour email: " +
          (user ? user.email : "unknown");
      } else if (err && err.message) {
        msg += err.message;
      } else {
        msg += "See browser console (F12) for details.";
      }
      await showAlert(msg);
      throw err;
    }
  }

  // ── CHAT MODAL ──────────────────────────────────────────────────────────────
  const chatModal = document.getElementById("admin-chat-modal");
  const chatTitle = document.getElementById("admin-chat-title");
  const chatSub = document.getElementById("admin-chat-sub");
  const chatMessages = document.getElementById("admin-chat-messages");
  const chatLoading = document.getElementById("admin-chat-loading");
  const chatEmpty = document.getElementById("admin-chat-empty");
  const chatError = document.getElementById("admin-chat-error");
  const chatInput = document.getElementById("admin-chat-input");
  const chatSendBtn = document.getElementById("admin-chat-send");

  let chatUid = null;
  let chatTimer = null;
  let chatSending = false;

  function formatChatTime(value) {
    const d = value ? new Date(value) : null;
    if (!d || isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function showChatError(msg) {
    if (!chatError) return;
    chatError.textContent = msg || "";
    chatError.hidden = !msg;
  }

  function renderChatMessages(list) {
    if (!chatMessages) return;
    if (!list || !list.length) {
      chatMessages.innerHTML = "";
      if (chatEmpty) chatEmpty.hidden = false;
      return;
    }
    if (chatEmpty) chatEmpty.hidden = true;
    const nearBottom =
      chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < 80;
    chatMessages.innerHTML = list
      .map(function (m) {
        const mine = String(m.from || "") === "admin";
        return (
          '<div class="admin-chat-msg' + (mine ? " admin-chat-msg--admin" : "") + '">' +
          '<div class="admin-chat-msg__bubble">' + escapeHtml(m.text || "") + "</div>" +
          '<span class="admin-chat-msg__meta">' +
          (mine ? "Admin" : "Client") +
          (m.createdAt ? " · " + escapeHtml(formatChatTime(m.createdAt)) : "") +
          "</span></div>"
        );
      })
      .join("");
    if (nearBottom) chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function refreshChat(silent) {
    if (!chatUid) return;
    try {
      const json = await DWP.apiGet(
        "/api/admin/chats/" + encodeURIComponent(chatUid) + "/messages"
      );
      renderChatMessages((json && json.messages) || []);
      if (chatLoading) chatLoading.hidden = true;
      showChatError("");
    } catch (err) {
      console.error("[DWP] chat load error:", err);
      if (!silent) {
        if (chatLoading) chatLoading.hidden = true;
        showChatError("Could not load the conversation. Check your connection and try again.");
      }
    }
  }

  function stopChatPolling() {
    if (chatTimer) {
      clearInterval(chatTimer);
      chatTimer = null;
    }
  }

  function closeChatModal() {
    stopChatPolling();
    chatUid = null;
    if (!chatModal) return;
    chatModal.hidden = true;
    chatModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (chatMessages) chatMessages.innerHTML = "";
    if (chatLoading) chatLoading.hidden = false;
    if (chatEmpty) chatEmpty.hidden = true;
    showChatError("");
    if (chatInput) chatInput.value = "";
  }

  function openChatModal(uid, name, email) {
    if (!chatModal || !uid) return;
    chatUid = uid;
    if (chatTitle) chatTitle.textContent = name || "Client chat";
    if (chatSub) chatSub.textContent = email || "";
    if (chatMessages) chatMessages.innerHTML = "";
    if (chatEmpty) chatEmpty.hidden = true;
    if (chatLoading) chatLoading.hidden = false;
    showChatError("");
    if (chatInput) chatInput.value = "";
    chatModal.hidden = false;
    chatModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    refreshChat(false);
    stopChatPolling();
    // Live messages arrive over the WebSocket — poll only as a fallback.
    if (!DWP.realtime || !DWP.realtime.connected) {
      chatTimer = setInterval(function () {
        refreshChat(true);
      }, 5000);
    }
  }

  async function sendChatMessage() {
    if (!chatUid || chatSending) return;
    const text = chatInput ? chatInput.value.trim() : "";
    if (!text) return;
    chatSending = true;
    if (chatSendBtn) chatSendBtn.disabled = true;
    showChatError("");
    try {
      await DWP.apiSend("POST", "/api/admin/chats/" + encodeURIComponent(chatUid) + "/messages", {
        text: text
      });
      if (chatInput) chatInput.value = "";
      await refreshChat(true);
      if (chatMessages) chatMessages.scrollTop = chatMessages.scrollHeight;
    } catch (err) {
      console.error("[DWP] chat send error:", err);
      showChatError("Could not send the message. Please try again.");
    } finally {
      chatSending = false;
      if (chatSendBtn) chatSendBtn.disabled = false;
    }
  }

  function bindChatActions(scope) {
    if (!scope) return;
    scope.querySelectorAll("[data-chat-reply]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openChatModal(
          btn.getAttribute("data-chat-reply"),
          btn.getAttribute("data-name") || "client",
          btn.getAttribute("data-email") || ""
        );
      });
    });
  }

  document.querySelectorAll("[data-chat-modal-close]").forEach(function (el) {
    el.addEventListener("click", closeChatModal);
  });
  if (chatSendBtn) chatSendBtn.addEventListener("click", sendChatMessage);
  if (chatInput) {
    chatInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // ── REALTIME CHAT (WebSocket) ──────────────────────────────────────────────
  if (DWP.realtime) {
    DWP.realtime.on("chat:new", function (data) {
      const msg = data && data.message;
      if (!msg) return;
      // Live-append when the matching conversation is open.
      if (chatUid && data.userId === chatUid && !chatModal?.hidden) {
        refreshChat(true);
        return;
      }
      // A client wrote while their row is visible — refresh the unread dot.
      refreshChatPreviewBadge(data.userId);
    });
    DWP.realtime.on("_open", function () {
      // Socket reconnected: stop polling and re-sync the open thread.
      stopChatPolling();
      if (chatUid && chatModal && !chatModal.hidden) refreshChat(true);
    });
  }

  // Notification bell links: chat:<uid> opens the conversation directly.
  window.addEventListener("dwp:open-chat", function (e) {
    const uid = e && e.detail && e.detail.uid;
    if (!uid) return;
    (async function () {
      let name = "Client chat";
      let email = "";
      try {
        const json = await DWP.apiGet("/api/admin/applications/" + encodeURIComponent(uid));
        const data = (json && json.data) || {};
        name = data.fullName || data.email || "Client chat";
        email = data.email || "";
      } catch (_) { /* open with defaults */ }
      openChatModal(uid, name, email);
    })();
  });

  function refreshChatPreviewBadge(userId) {
    if (!userId) return;
    document.querySelectorAll('[data-chat-reply="' + CSS.escape(userId) + '"]').forEach(function (btn) {
      DWP.apiGet("/api/admin/chats/" + encodeURIComponent(userId))
        .then(function (json) {
          const n = Number((json && json.unreadFromClient) || 0);
          let dot = btn.querySelector(".btn-chat__unread");
          if (n > 0) {
            if (!dot) {
              dot = document.createElement("span");
              dot.className = "btn-chat__unread";
              btn.appendChild(dot);
            }
            dot.textContent = n > 9 ? "9+" : String(n);
          } else if (dot) {
            dot.remove();
          }
        })
        .catch(function () {});
    });
  }

  // ── ROW ACTION DROPDOWNS ────────────────────────────────────────────────────
  function actionMenuItem(mods, attrs, icon, label) {
    return (
      '<button type="button" role="menuitem" class="admin-dd-item ' + (mods || "") + '" ' + attrs + ">" +
      '<i class="bi ' + icon + '"></i><span>' + escapeHtml(label) + "</span>" +
      "</button>"
    );
  }

  function actionDropdown(menuHtml) {
    return (
      '<span class="admin-actions-dd">' +
      '<button type="button" class="admin-dd-trigger" aria-haspopup="menu" aria-expanded="false" aria-label="Row actions"><i class="bi bi-three-dots-vertical"></i></button>' +
      '<span class="admin-dd-menu" role="menu" hidden>' + menuHtml + "</span>" +
      "</span>"
    );
  }

  function closeAllActionMenus() {
    document.querySelectorAll(".admin-dd-menu").forEach(function (menu) {
      if (menu.hidden) return;
      menu.hidden = true;
      menu.style.top = "";
      menu.style.left = "";
      const trigger = menu.previousElementSibling;
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    });
  }

  function positionActionMenu(menu, trigger) {
    menu.style.visibility = "hidden";
    menu.hidden = false;
    const rect = trigger.getBoundingClientRect();
    const size = menu.getBoundingClientRect();
    let top = rect.bottom + 6;
    if (top + size.height > window.innerHeight - 8) {
      top = rect.top - 6 - size.height;
      if (top < 8) top = 8;
    }
    let left = rect.right - size.width;
    if (left < 8) left = 8;
    if (left + size.width > window.innerWidth - 8) {
      left = window.innerWidth - size.width - 8;
    }
    menu.style.top = top + "px";
    menu.style.left = left + "px";
    menu.style.visibility = "";
    menu._trigger = trigger;
  }

  function initActionDropdowns(scope) {
    if (!scope) return;
    scope.addEventListener("click", function (e) {
      const trigger = e.target.closest(".admin-dd-trigger");
      if (trigger && scope.contains(trigger)) {
        const menu = trigger.nextElementSibling;
        if (!menu || !menu.classList.contains("admin-dd-menu")) return;
        const willOpen = menu.hidden;
        closeAllActionMenus();
        if (willOpen) {
          positionActionMenu(menu, trigger);
          trigger.setAttribute("aria-expanded", "true");
        }
        return;
      }
      if (e.target.closest(".admin-dd-menu")) {
        closeAllActionMenus();
      }
    });
  }

  initActionDropdowns(tbody);
  initActionDropdowns(document.getElementById("users-tbody"));

  document.addEventListener("click", function (e) {
    if (!e.target.closest(".admin-actions-dd")) closeAllActionMenus();
  });
  function syncActionMenus() {
    document.querySelectorAll(".admin-dd-menu").forEach(function (menu) {
      if (menu.hidden) return;
      const trigger = menu._trigger || menu.previousElementSibling;
      if (!trigger) {
        closeAllActionMenus();
        return;
      }
      const rect = trigger.getBoundingClientRect();
      if (
        rect.bottom < 0 ||
        rect.top > window.innerHeight ||
        rect.right < 0 ||
        rect.left > window.innerWidth
      ) {
        closeAllActionMenus();
        return;
      }
      positionActionMenu(menu, trigger);
    });
  }
  window.addEventListener("scroll", syncActionMenus, true);
  window.addEventListener("resize", syncActionMenus);

  function bindRowActions() {
    tbody?.querySelectorAll("[data-approve]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-approve");
        setApplicationStatus(id, "approved").catch(async function (err) {
          console.error(err);
          await showAlert("Could not approve application. Check Firestore rules.");
        });
      });
    });

    tbody?.querySelectorAll("[data-reject]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-reject");
        setApplicationStatus(id, "rejected").catch(async function (err) {
          console.error(err);
          await showAlert("Could not reject application. Check Firestore rules.");
        });
      });
    });

    tbody?.querySelectorAll("[data-activate]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-activate");
        activateAccount(id).catch(function () {});
      });
    });

    bindChatActions(tbody);

    tbody?.querySelectorAll(".btn-view").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const id = btn.getAttribute("data-id");
        showApplicationDetail(id).catch(async function (err) {
          console.error(err);
          await showAlert("Could not load application details.");
        });
      });
    });
  }

  // ── TABLE FILTERING, STAT CARDS, TOOLBAR ─────────────────────────────────────

  const searchApps = document.getElementById("apps-search");
  const appsCountEl = document.getElementById("apps-count");
  const appsNoResults = document.getElementById("apps-no-results");
  const searchUsers = document.getElementById("users-search");
  const usersCountEl = document.getElementById("users-count");
  const usersNoResults = document.getElementById("users-no-results");
  const adminUpdatedEl = document.getElementById("admin-updated");

  if (searchApps) {
    searchApps.addEventListener("input", function () {
      applyTableFilter(tbody, searchApps, appsCountEl, appsNoResults, "clients");
    });
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function markUpdated() {
    if (!adminUpdatedEl) return;
    adminUpdatedEl.hidden = false;
    adminUpdatedEl.textContent =
      "Updated " +
      new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  /** Client-side row filter: hides rows that do not match the query text. */
  function applyTableFilter(tableBody, input, countEl, noResultsEl, unit) {
    if (!tableBody) return;
    const q = ((input && input.value) || "").trim().toLowerCase();
    const rows = Array.prototype.slice.call(tableBody.rows);
    let shown = 0;

    rows.forEach(function (row) {
      const cell = row.cells[0];
      const isSpacer = row.cells.length === 1 && cell && cell.colSpan > 1;
      const match = isSpacer || !q || row.textContent.toLowerCase().indexOf(q) >= 0;
      row.hidden = !match;
      if (match && !isSpacer) shown++;
    });

    const dataRows = rows.filter(function (row) {
      return !(row.cells.length === 1 && row.cells[0] && row.cells[0].colSpan > 1);
    }).length;

    if (countEl) {
      countEl.hidden = dataRows === 0;
      countEl.textContent =
        !q || shown === dataRows
          ? dataRows + " " + unit
          : shown + " of " + dataRows + " " + unit;
    }
    if (noResultsEl) noResultsEl.hidden = !(q && dataRows > 0 && shown === 0);
  }

  function updateTabCounts(snap) {
    const badge = document.querySelector('[data-tab-count="applications"]');
    if (!badge || !snap) return;
    badge.textContent = String(snap.size || 0);
    badge.hidden = !snap.size;
  }

  function renderStats(snap) {
    if (!snap) return;

    let total = 0;
    let pending = 0;
    let active = 0;
    let aum = 0;
    let depositsToConfirm = 0;
    let withdrawalsPending = 0;

    snap.forEach(function (doc) {
      const d = doc.data();
      total++;

      const status = (d.status || "pending").toLowerCase();
      if (status === "pending") pending++;
      if (d.accountActivated) active++;

      const overview =
        window.DWP && typeof window.DWP.getOverviewSummary === "function"
          ? window.DWP.getOverviewSummary(d)
          : null;
      if (overview) aum += Number(overview.totalBalance) || 0;

      const dep =
        window.DWP && typeof window.DWP.getDepositAdminSummary === "function"
          ? window.DWP.getDepositAdminSummary(d)
          : null;
      if (dep && dep.canConfirm) depositsToConfirm++;

      const wd =
        window.DWP && typeof window.DWP.getWithdrawalAdminSummary === "function"
          ? window.DWP.getWithdrawalAdminSummary(d)
          : null;
      if (wd) withdrawalsPending += Number(wd.pendingCount) || 0;
    });

    setText("stat-clients", String(total));
    setText(
      "stat-clients-foot",
      active + " approved · " + Math.max(total - active, 0) + " not yet active"
    );
    setText("stat-pending", String(pending));
    setText(
      "stat-pending-foot",
      pending ? "Awaiting your review" : "Nothing awaiting review"
    );
    setText("stat-active", String(active));
    setText(
      "stat-active-foot",
      depositsToConfirm + " deposit" + (depositsToConfirm === 1 ? "" : "s") + " to confirm"
    );
    setText("stat-aum", formatMoney(aum));
    setText(
      "stat-aum-foot",
      withdrawalsPending + " withdrawal" + (withdrawalsPending === 1 ? "" : "s") + " pending"
    );
  }

  async function loadApplications() {
    if (!tbody) return;
    tbody.innerHTML = "";
    if (loadingEl) loadingEl.hidden = false;
    if (tableWrap) tableWrap.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const snap = await DWP.db
      .collection("applications")
      .orderBy("createdAt", "desc")
      .get();

    lastSnap = snap;

    if (loadingEl) loadingEl.hidden = true;

    if (snap.empty) {
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (tableWrap) tableWrap.hidden = false;
    snap.forEach(function (doc) {
      const d = doc.data();
      const status = (d.status || "pending").toLowerCase();
      const isPending = status === "pending";
      const depositSummary =
        window.DWP && typeof window.DWP.getDepositAdminSummary === "function"
          ? window.DWP.getDepositAdminSummary(d)
          : { label: "—", tone: "none", canConfirm: false };
      const withdrawalSummary =
        window.DWP && typeof window.DWP.getWithdrawalAdminSummary === "function"
          ? window.DWP.getWithdrawalAdminSummary(d)
          : { label: "—", tone: "none", pendingCount: 0 };
      const activateBtnLabel = d.accountActivated
        ? "Confirm All Pending"
        : "Confirm & Activate All";
      let menuHtml = actionMenuItem(
        "btn-view",
        'data-id="' + doc.id + '"',
        "bi-eye",
        "View"
      );
      if (isPending) {
        menuHtml += actionMenuItem(
          "admin-dd-item--ok",
          'data-approve="' + doc.id + '"',
          "bi-person-check",
          "Approve signup"
        );
        menuHtml += actionMenuItem(
          "admin-dd-item--danger",
          'data-reject="' + doc.id + '"',
          "bi-x-circle",
          "Reject"
        );
      }
      if (depositSummary.canConfirm) {
        menuHtml += actionMenuItem(
          "admin-dd-item--accent",
          'data-activate="' + doc.id + '"',
          "bi-check2-circle",
          activateBtnLabel
        );
      }
      if (status === "approved") {
        menuHtml += actionMenuItem(
          "admin-dd-item--blue",
          'data-chat-reply="' +
            escapeHtml(doc.id) +
            '" data-name="' +
            escapeHtml(d.fullName || "") +
            '" data-email="' +
            escapeHtml(d.email || "") +
            '"',
          "bi-chat-dots-fill",
          "Chat"
        );
      }
      const actions =
        actionDropdown(menuHtml) +
        (status === "approved" && !d.depositSubmitted
          ? ' <span class="admin-hint">Awaiting deposit</span>'
          : "");
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td data-label="Name"><span class="admin-cell-primary">' +
        escapeHtml(d.fullName || "—") +
        "</span></td>" +
        '<td data-label="Email">' +
        softBreak(d.email || "—") +
        "</td>" +
        '<td data-label="LLC">' +
        softBreak(d.llcName || "—") +
        "</td>" +
        '<td data-label="Phone">' +
        escapeHtml(d.phone || "—") +
        '</td><td data-label="Signup"><span class="' +
        escapeHtml(statusClass(d.status)) +
        '">' +
        escapeHtml(d.status || "pending") +
        '</span></td><td data-label="Deposits"><span class="' +
        escapeHtml(depositStatusClass(depositSummary.tone)) +
        '">' +
        escapeHtml(depositSummary.label) +
        '</span></td><td data-label="Withdrawals"><span class="' +
        escapeHtml(withdrawalStatusClass(withdrawalSummary.tone)) +
        '">' +
        escapeHtml(withdrawalSummary.label) +
        "</span></td>" +
        '<td data-label="Submitted">' +
        escapeHtml(formatDate(d.createdAt)) +
        '</td><td class="admin-actions" data-label="Actions">' +
        actions +
        "</td>";
      tbody.appendChild(tr);
    });

    bindRowActions();
    renderStats(snap);
    applyTableFilter(tbody, searchApps, appsCountEl, appsNoResults, "clients");
    updateTabCounts(snap);
    markUpdated();
  }

  // ── TAB SWITCHING ────────────────────────────────────────────────────────────

  function switchAdminTab(tabId) {
    document.querySelectorAll(".admin-tab").forEach(function (btn) {
      btn.classList.toggle(
        "admin-tab--active",
        btn.getAttribute("data-admin-tab") === tabId
      );
    });
    document.querySelectorAll(".admin-tab-panel").forEach(function (panel) {
      panel.hidden = panel.id !== "admin-tab-panel-" + tabId;
    });
    if (tabId === "users") {
      loadUsers().catch(function (err) {
        console.error("[DWP] loadUsers error:", err);
      });
    }
  }

  // Tab buttons are bound once at the bottom of this file, after the
  // wallets hook extends switchAdminTab — binding here as well would fire
  // every tab switch twice and render duplicate rows.

  // ── USER MANAGEMENT TABLE ────────────────────────────────────────────────────

  const usersLoadingEl = document.getElementById("users-loading");
  const usersEmptyEl = document.getElementById("users-empty");
  const usersTableWrap = document.getElementById("users-table-wrap");
  const usersTbody = document.getElementById("users-tbody");

  if (searchUsers) {
    searchUsers.addEventListener("input", function () {
      applyTableFilter(usersTbody, searchUsers, usersCountEl, usersNoResults, "users");
    });
  }

  let usersSnap = null;

  async function loadUsers() {
    if (!usersTbody) return;
    if (typeof DWP.refreshCryptoPrices === "function") {
      await DWP.refreshCryptoPrices();
    }
    usersTbody.innerHTML = "";
    if (usersLoadingEl) usersLoadingEl.hidden = false;
    if (usersTableWrap) usersTableWrap.hidden = true;
    if (usersEmptyEl) usersEmptyEl.hidden = true;

    const snap = await DWP.db
      .collection("applications")
      .orderBy("createdAt", "desc")
      .get();

    usersSnap = snap;
    if (usersLoadingEl) usersLoadingEl.hidden = true;

    if (snap.empty) {
      if (usersEmptyEl) usersEmptyEl.hidden = false;
      return;
    }

    if (usersTableWrap) usersTableWrap.hidden = false;

    snap.forEach(function (doc) {
      const d = doc.data();
      const summary =
        window.DWP && typeof window.DWP.getOverviewSummary === "function"
          ? window.DWP.getOverviewSummary(d)
          : null;
      const totalBalance = summary ? summary.totalBalance : 0;
      const breakdownLabel = summary
        ? summary.breakdownLabel || "—"
        : "—";

      const activatedClass = d.accountActivated
        ? "status-badge status-approved"
        : "status-badge status-pending";
      const activatedLabel = d.accountActivated ? "Activated" : "Not activated";
      const hasOverride = !!(d.adminPortfolioOverride && d.adminPortfolioOverride.cryptoHoldings);

      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td data-label="Name"><span class="admin-cell-primary">' + escapeHtml(d.fullName || "—") + "</span></td>" +
        '<td data-label="Email">' + softBreak(d.email || "—") + "</td>" +
        '<td data-label="Signup"><span class="' + escapeHtml(statusClass(d.status || "pending")) + '">' +
          escapeHtml(d.status || "pending") + "</span></td>" +
        '<td data-label="Activated"><span class="' + escapeHtml(activatedClass) + '">' +
          escapeHtml(activatedLabel) + "</span>" +
          (hasOverride ? ' <span class="admin-override-badge" title="Admin portfolio override active">⚙</span>' : "") +
        "</td>" +
        '<td data-label="Total Balance" class="admin-num">' + escapeHtml(formatMoney(totalBalance)) + "</td>" +
        '<td data-label="Holdings" class="admin-holdings-cell" title="' + escapeHtml(breakdownLabel) + '">' +
          escapeHtml(breakdownLabel) + "</td>" +
        '<td class="admin-actions" data-label="Actions">' +
          actionDropdown(
            actionMenuItem("", 'data-um-edit="' + escapeHtml(doc.id) + '"', "bi-pencil-square", "Edit Portfolio") +
            actionMenuItem("admin-dd-item--ok", 'data-um-profit="' + escapeHtml(doc.id) + '"', "bi-graph-up-arrow", "Add Profit") +
            actionMenuItem("admin-dd-item--ok", 'data-um-return="' + escapeHtml(doc.id) + '"', "bi-percent", "Set Return") +
            actionMenuItem(
              "admin-dd-item--blue",
              'data-chat-reply="' + escapeHtml(doc.id) +
                '" data-name="' + escapeHtml(d.fullName || "") +
                '" data-email="' + escapeHtml(d.email || "") + '"',
              "bi-chat-dots-fill",
              "Chat"
            ) +
            '<a class="admin-dd-item admin-dd-item--violet" role="menuitem" href="dashboard.html?impersonate=' +
              encodeURIComponent(doc.id) +
              "&iname=" +
              encodeURIComponent(d.fullName || d.email || "") +
              '" target="_blank" rel="noopener"><i class="bi bi-box-arrow-up-right"></i><span>View Account</span></a>' +
            '<span class="admin-dd-divider"></span>' +
            actionMenuItem(
              d.accountActivated ? "admin-dd-item--danger" : "admin-dd-item--accent",
              d.accountActivated
                ? 'data-um-deactivate="' + escapeHtml(doc.id) + '"'
                : 'data-um-activate="' + escapeHtml(doc.id) + '"',
              d.accountActivated ? "bi-person-x" : "bi-person-check",
              d.accountActivated ? "Deactivate" : "Activate"
            )
          ) +
        "</td>";

      usersTbody.appendChild(tr);
    });

    bindUserActions();
    applyTableFilter(usersTbody, searchUsers, usersCountEl, usersNoResults, "users");
  }

  function bindUserActions() {
    if (!usersTbody) return;
    bindChatActions(usersTbody);
    usersTbody.querySelectorAll("[data-um-edit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openPortfolioEditor(btn.getAttribute("data-um-edit")).catch(async function (err) {
          console.error(err);
          await showAlert("Could not open portfolio editor.");
        });
      });
    });
    usersTbody.querySelectorAll("[data-um-profit]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openProfitModal(btn.getAttribute("data-um-profit")).catch(async function (err) {
          console.error(err);
          await showAlert("Could not open profit modal.");
        });
      });
    });
    usersTbody.querySelectorAll("[data-um-return]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openReturnModal(btn.getAttribute("data-um-return")).catch(async function (err) {
          console.error(err);
          await showAlert("Could not open return modal.");
        });
      });
    });
    usersTbody.querySelectorAll("[data-um-activate]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setUserActivation(btn.getAttribute("data-um-activate"), true).catch(async function (err) {
          console.error(err);
          await showAlert("Could not activate user. Check Firestore rules.");
        });
      });
    });
    usersTbody.querySelectorAll("[data-um-deactivate]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setUserActivation(btn.getAttribute("data-um-deactivate"), false).catch(async function (err) {
          console.error(err);
          await showAlert("Could not deactivate user. Check Firestore rules.");
        });
      });
    });
  }

  async function setUserActivation(docId, activate) {
    const row = usersSnap && usersSnap.docs.find(function (d) { return d.id === docId; });
    const name = row ? row.data().fullName || "this user" : "this user";
    const verb = activate ? "activate" : "deactivate";
    if (!(await showConfirm("Are you sure you want to " + verb + " the account for " + name + "?"))) return;
    await DWP.db.collection("applications").doc(docId).update({
      accountActivated: activate,
      updatedAt: DWP.FieldValue.serverTimestamp()
    });
    await loadUsers();
  }

  // ── PORTFOLIO EDITOR MODAL ───────────────────────────────────────────────────

  const portfolioEditModal = document.getElementById("portfolio-edit-modal");
  const portfolioEditBody = document.getElementById("portfolio-edit-body");
  const portfolioEditNameEl = document.getElementById("portfolio-edit-name");

  let portfolioEditDocId = null;

  function closePortfolioModal() {
    portfolioEditDocId = null;
    if (!portfolioEditModal) return;
    portfolioEditModal.hidden = true;
    portfolioEditModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (portfolioEditBody) portfolioEditBody.innerHTML = "";
  }

  document.querySelectorAll("[data-portfolio-modal-close]").forEach(function (el) {
    el.addEventListener("click", closePortfolioModal);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && portfolioEditModal && !portfolioEditModal.hidden) {
      closePortfolioModal();
    }
  });

  async function openPortfolioEditor(docId) {
    const row = usersSnap && usersSnap.docs.find(function (d) { return d.id === docId; });
    if (!row || !portfolioEditModal) return;
    const d = row.data();
    portfolioEditDocId = docId;

    if (portfolioEditNameEl) {
      portfolioEditNameEl.textContent = d.fullName || d.email || "User";
    }

    // Determine what values to pre-fill — prefer existing admin override if set
    const override = d.adminPortfolioOverride || {};
    const overrideCrypto = override.cryptoHoldings || {};
    const overrideCash = Number(override.availableCash) || 0;
    const hasOverride = !!(override.cryptoHoldings && Object.keys(override.cryptoHoldings).length > 0);

    const storedPortfolio = d.portfolio || {};
    const prefillMonthlyRate =
      storedPortfolio.monthlyReturnRatePct != null ? Number(storedPortfolio.monthlyReturnRatePct) : "";
    const prefillAnnualRate =
      storedPortfolio.annualReturnRatePct != null ? Number(storedPortfolio.annualReturnRatePct) : "";

    // Get computed holdings to pre-fill when no override exists
    const computed = window.DWP && typeof window.DWP.getCryptoHoldingsList === "function"
      ? window.DWP.getCryptoHoldingsList(d)
      : [];
    const computedMap = {};
    computed.forEach(function (h) { computedMap[h.key] = h; });

    const computedPortfolio = window.DWP && typeof window.DWP.effectivePortfolio === "function"
      ? window.DWP.effectivePortfolio(d)
      : (d.portfolio || {});
    const computedCash = Number(computedPortfolio.availableCash) || 0;

    const coins = Object.keys(DWP.ASSET_META || {});

    let html = '<div class="portfolio-edit-notice">';
    if (hasOverride) {
      html +=
        '<p class="admin-notice admin-notice--info">⚙ <strong>Admin override is active.</strong> ' +
        'The values below are what the client currently sees. Edit and save to update, or enter all zeros to revert to computed values.</p>';
    } else {
      html +=
        '<p class="admin-notice admin-notice--info">Values are pre-filled from the client\'s computed portfolio. ' +
        'Set values and save to override. Leave all at 0 to keep computed values.</p>';
    }
    html += "</div>";

    html +=
      '<table class="portfolio-edit-table">' +
      "<thead><tr><th>Asset</th><th>USD Value ($)</th><th>Token Units</th><th>Live Price</th></tr></thead>" +
      "<tbody>";

    // Available Cash row
    const prefillCash = hasOverride ? overrideCash : computedCash;
    html +=
      '<tr class="portfolio-edit-cash-row">' +
      "<td><strong>USD Cash</strong><br><small class='admin-muted'>Available balance</small></td>" +
      '<td><input type="number" class="portfolio-field" id="pedit-cash" min="0" step="0.01" value="' +
      prefillCash.toFixed(2) +
      '" placeholder="0.00"></td>' +
      "<td>—</td>" +
      "<td>$1.00</td>" +
      "</tr>";

    // Crypto rows
    coins.forEach(function (key) {
      const meta = DWP.ASSET_META[key];
      const livePrice =
        window.DWP && typeof window.DWP.getAssetUsdPrice === "function"
          ? window.DWP.getAssetUsdPrice(key)
          : Number(meta && meta.defaultPrice) || 0;

      let prefillValue = 0;
      let prefillUnits = 0;

      if (hasOverride) {
        prefillValue = Number(overrideCrypto[key] && overrideCrypto[key].value) || 0;
        prefillUnits = Number(overrideCrypto[key] && overrideCrypto[key].units) || 0;
      } else if (computedMap[key]) {
        prefillValue = Number(computedMap[key].value) || 0;
        prefillUnits =
          Number(computedMap[key].tokenUnits) || Number(computedMap[key].units) || 0;
      }

      const unitsStr =
        prefillUnits > 0
          ? prefillUnits.toLocaleString("en-US", {
              maximumFractionDigits: 8,
              useGrouping: false
            })
          : "0";

      const priceStr =
        livePrice >= 1
          ? "$" +
            livePrice.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })
          : "$" + livePrice.toFixed(6);

      html +=
        "<tr>" +
        "<td><strong>" +
        escapeHtml(meta.symbol) +
        "</strong><br><small class='admin-muted'>" +
        escapeHtml(meta.name) +
        "</small></td>" +
        '<td><input type="number" class="portfolio-field pedit-value" id="pedit-' +
        key +
        '-value" data-coin="' +
        key +
        '" min="0" step="0.01" value="' +
        prefillValue.toFixed(2) +
        '" placeholder="0.00"></td>' +
        '<td><input type="number" class="portfolio-field pedit-units" id="pedit-' +
        key +
        '-units" data-coin="' +
        key +
        '" min="0" step="any" value="' +
        unitsStr +
        '" placeholder="0"></td>' +
        "<td class='admin-muted'>" +
        priceStr +
        "</td>" +
        "</tr>";
    });

    html +=
      "</tbody>" +
      "<tfoot>" +
      '<tr class="portfolio-edit-total-row">' +
      "<td><strong>Total Portfolio</strong></td>" +
      '<td id="portfolio-edit-total" colspan="3">—</td>' +
      "</tr>" +
      "</tfoot>" +
      "</table>";

    // Account status toggle
    html +=
      '<div class="portfolio-edit-activation">' +
      "<label class='portfolio-activation-label'>" +
      "<strong>Account Status:</strong>&nbsp;" +
      '<select id="pedit-activation" class="portfolio-field">' +
      '<option value="activated"' +
      (d.accountActivated ? " selected" : "") +
      ">Activated</option>" +
      '<option value="deactivated"' +
      (!d.accountActivated ? " selected" : "") +
      ">Deactivated</option>" +
      "</select>" +
      "</label>" +
      "</div>";

    // Return rates — applied to the client's current total portfolio value.
    // For a fixed one-off return figure instead, use the "Set Return" action.
    html +=
      '<div class="portfolio-edit-activation portfolio-edit-returns">' +
      "<label class='portfolio-activation-label'>" +
      "<strong>Monthly Return Rate (%):</strong>&nbsp;" +
      '<input type="number" class="portfolio-field" id="pedit-monthly-rate" min="0" step="0.01" value="' +
      prefillMonthlyRate +
      '" placeholder="0.95 (default)">' +
      "</label>" +
      "<label class='portfolio-activation-label'>" +
      "<strong>Annual Return Rate (%):</strong>&nbsp;" +
      '<input type="number" class="portfolio-field" id="pedit-annual-rate" min="0" step="0.01" value="' +
      prefillAnnualRate +
      '" placeholder="11.40 (default = monthly × 12)">' +
      "</label>" +
      "<p class='admin-muted portfolio-edit-returns-note'>Leave blank to use the default rate. Shown to the client as " +
      "this month's / this year's return, calculated from their current total portfolio value.</p>" +
      "</div>";

    if (portfolioEditBody) portfolioEditBody.innerHTML = html;

    // Cross-sync: changing USD value → recompute token units, and vice versa.
    // A _syncing flag prevents the two handlers triggering each other.
    portfolioEditModal.querySelectorAll(".pedit-value").forEach(function (valInp) {
      valInp.addEventListener("input", function () {
        if (valInp._syncing) return;
        const key = valInp.getAttribute("data-coin");
        const livePrice = getLivePrice(key);
        const usd = Number(valInp.value) || 0;
        const unitsInp = document.getElementById("pedit-" + key + "-units");
        if (unitsInp) {
          unitsInp._syncing = true;
          unitsInp.value = livePrice > 0
            ? stripTrailingZeros((usd / livePrice).toFixed(8))
            : "0";
          unitsInp._syncing = false;
        }
        recalcPortfolioTotal();
      });
    });

    portfolioEditModal.querySelectorAll(".pedit-units").forEach(function (unitsInp) {
      unitsInp.addEventListener("input", function () {
        if (unitsInp._syncing) return;
        const key = unitsInp.getAttribute("data-coin");
        const livePrice = getLivePrice(key);
        const units = Number(unitsInp.value) || 0;
        const valInp = document.getElementById("pedit-" + key + "-value");
        if (valInp) {
          valInp._syncing = true;
          valInp.value = (units * livePrice).toFixed(2);
          valInp._syncing = false;
        }
        recalcPortfolioTotal();
      });
    });

    // Cash row just updates the total
    const cashInp = document.getElementById("pedit-cash");
    if (cashInp) cashInp.addEventListener("input", recalcPortfolioTotal);

    recalcPortfolioTotal();

    // Wire save button (clone to strip stale listeners)
    const saveBtn = document.getElementById("portfolio-save-btn");
    if (saveBtn) {
      const fresh = saveBtn.cloneNode(true);
      saveBtn.parentNode.replaceChild(fresh, saveBtn);
      fresh.addEventListener("click", function () {
        savePortfolioEdit(docId).catch(async function (err) {
          console.error(err);
          await showAlert("Could not save portfolio.\n\n" + (err.message || err));
        });
      });
    }

    portfolioEditModal.hidden = false;
    portfolioEditModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
  }

  function getLivePrice(key) {
    return window.DWP && typeof window.DWP.getAssetUsdPrice === "function"
      ? window.DWP.getAssetUsdPrice(key)
      : Number(DWP.ASSET_META && DWP.ASSET_META[key] && DWP.ASSET_META[key].defaultPrice) || 1;
  }

  function stripTrailingZeros(str) {
    // "0.00500000" → "0.005", "1.00000000" → "1"
    return str.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  }

  function recalcPortfolioTotal() {
    const totalEl = document.getElementById("portfolio-edit-total");
    if (!totalEl) return;
    let total = Number(document.getElementById("pedit-cash")?.value) || 0;
    Object.keys(DWP.ASSET_META || {}).forEach(function (key) {
      const inp = document.getElementById("pedit-" + key + "-value");
      if (inp) total += Number(inp.value) || 0;
    });
    totalEl.textContent = total.toLocaleString("en-US", {
      style: "currency",
      currency: "USD"
    });
  }

  async function savePortfolioEdit(docId) {
    const coins = Object.keys(DWP.ASSET_META || {});
    const cash = Number(document.getElementById("pedit-cash")?.value) || 0;
    const activationEl = document.getElementById("pedit-activation");
    const activated = activationEl ? activationEl.value === "activated" : true;

    function numOrNull(id) {
      const el = document.getElementById(id);
      return el && el.value !== "" ? Number(el.value) : null;
    }

    const monthlyRateVal = numOrNull("pedit-monthly-rate");
    const annualRateVal = numOrNull("pedit-annual-rate");

    const cryptoHoldings = {};
    let hasAnyHolding = false;

    coins.forEach(function (key) {
      const valEl = document.getElementById("pedit-" + key + "-value");
      const unitsEl = document.getElementById("pedit-" + key + "-units");
      const value = Number(valEl?.value) || 0;
      let units = Number(unitsEl?.value) || 0;
      const livePrice =
        window.DWP && typeof window.DWP.getAssetUsdPrice === "function"
          ? window.DWP.getAssetUsdPrice(key)
          : Number(DWP.ASSET_META[key] && DWP.ASSET_META[key].defaultPrice) || 1;

      if (value > 0 || units > 0) {
        hasAnyHolding = true;
        if (!(units > 0) && value > 0 && livePrice > 0) {
          units = value / livePrice;
        }
        // Always store a USD value so the client display never depends on live price
        if (!(value > 0) && units > 0 && livePrice > 0) {
          value = units * livePrice;
        }
        cryptoHoldings[key] = {
          value: value,
          units: units,
          price: livePrice
        };
      }
    });

    let patch;

    if (!hasAnyHolding && cash === 0) {
      if (
        !(await showConfirm(
          "All values are 0.\n\nThis will clear the admin portfolio override and revert this user to computed values. Continue?",
          { danger: true }
        ))
      ) {
        return;
      }
      // Clear the override field
      patch = {
        adminPortfolioOverride: null,
        accountActivated: activated,
        "portfolio.monthlyReturnRatePct": monthlyRateVal,
        "portfolio.annualReturnRatePct": annualRateVal,
        updatedAt: DWP.FieldValue.serverTimestamp()
      };
    } else {
      patch = {
        adminPortfolioOverride: {
          cryptoHoldings: cryptoHoldings,
          availableCash: cash
        },
        accountActivated: activated,
        "portfolio.monthlyReturnRatePct": monthlyRateVal,
        "portfolio.annualReturnRatePct": annualRateVal,
        updatedAt: DWP.FieldValue.serverTimestamp()
      };
    }

    const saveBtn = document.getElementById("portfolio-save-btn");
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving…";
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert("Portfolio saved successfully.");
      closePortfolioModal();
      await loadUsers();
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      }
    }
  }

  // ── PROFIT MANAGEMENT ────────────────────────────────────────────────────────

  const profitModal = document.getElementById("profit-modal");
  const profitModalNameEl = document.getElementById("profit-modal-name");
  const profitApplyBtn = document.getElementById("profit-apply-btn");

  let profitDocId = null;
  let profitCurrentCryptoUsd = 0;

  function closeProfitModal() {
    profitDocId = null;
    profitCurrentCryptoUsd = 0;
    if (!profitModal) return;
    profitModal.hidden = true;
    profitModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    ["profit-period", "profit-start", "profit-end", "profit-pct"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
    ["profit-before-val", "profit-after-val", "profit-gain-val"].forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.textContent = "—";
    });
  }

  function updateProfitPreview() {
    const pct = Number(document.getElementById("profit-pct")?.value) || 0;
    const factor = 1 + pct / 100;
    const after = profitCurrentCryptoUsd * factor;
    const gain = after - profitCurrentCryptoUsd;
    const beforeEl = document.getElementById("profit-before-val");
    const afterEl = document.getElementById("profit-after-val");
    const gainEl = document.getElementById("profit-gain-val");
    if (beforeEl) beforeEl.textContent = formatMoney(profitCurrentCryptoUsd);
    if (afterEl) afterEl.textContent = pct > 0 ? formatMoney(after) : "—";
    if (gainEl) gainEl.textContent = pct > 0 ? "+" + formatMoney(gain) : "—";
  }

  async function openProfitModal(docId) {
    if (!profitModal || !usersSnap) return;

    const row = usersSnap.docs.find(function (d) { return d.id === docId; });
    if (!row) { await showAlert("User not found. Please refresh."); return; }

    const d = row.data();
    profitDocId = docId;

    if (profitModalNameEl) profitModalNameEl.textContent = d.fullName || d.email || docId;

    // Compute current crypto USD from the effective portfolio
    const summary =
      window.DWP && typeof window.DWP.getOverviewSummary === "function"
        ? window.DWP.getOverviewSummary(d)
        : null;
    profitCurrentCryptoUsd = summary ? (summary.cryptoUsd || 0) : 0;

    updateProfitPreview();

    profitModal.hidden = false;
    profitModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    document.getElementById("profit-pct")?.focus();
  }

  if (profitModal) {
    profitModal.querySelectorAll("[data-profit-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeProfitModal);
    });
    profitModal.addEventListener("click", function (e) {
      if (e.target === profitModal) closeProfitModal();
    });
    const pctInput = document.getElementById("profit-pct");
    if (pctInput) pctInput.addEventListener("input", updateProfitPreview);
  }

  if (profitApplyBtn) {
    profitApplyBtn.addEventListener("click", function () {
      applyProfit(profitDocId).catch(async function (err) {
        console.error(err);
        await showAlert("Could not apply profit: " + (err.message || err));
      });
    });
  }

  async function applyProfit(docId) {
    if (!docId) return;

    const period = (document.getElementById("profit-period")?.value || "").trim();
    const startDate = (document.getElementById("profit-start")?.value || "").trim();
    const endDate = (document.getElementById("profit-end")?.value || "").trim();
    const pct = Number(document.getElementById("profit-pct")?.value) || 0;

    if (!period) { await showAlert("Please enter a period label (e.g. Q2 2025)."); return; }
    if (!(pct > 0)) { await showAlert("Please enter a profit percentage greater than 0."); return; }

    const row = usersSnap && usersSnap.docs.find(function (d) { return d.id === docId; });
    if (!row) { await showAlert("User not found. Please refresh."); return; }
    const d = row.data();

    // Read current holdings (admin override or computed)
    let holdings = {};
    const adminOverride = d.adminPortfolioOverride;
    if (adminOverride && adminOverride.cryptoHoldings && Object.keys(adminOverride.cryptoHoldings).length > 0) {
      holdings = JSON.parse(JSON.stringify(adminOverride.cryptoHoldings));
    } else if (window.DWP && typeof window.DWP.getCryptoHoldingsList === "function") {
      const list = window.DWP.getCryptoHoldingsList(d);
      list.forEach(function (h) {
        holdings[h.key] = { value: h.value, units: h.units || h.tokenUnits || 0, price: h.price };
      });
    }

    const factor = 1 + pct / 100;
    let totalBefore = 0;
    let totalAfter = 0;

    // Scale each holding proportionally
    const updatedHoldings = {};
    Object.keys(holdings).forEach(function (key) {
      const h = holdings[key];
      const oldUnits = Number(h.units) || 0;
      const storedPrice = Number(h.price) || getLivePrice(key) || 0;
      // If value was never set but units were, derive value from stored price so profit scales correctly
      const oldVal = Number(h.value) > 0 ? Number(h.value)
        : (oldUnits > 0 && storedPrice > 0 ? oldUnits * storedPrice : 0);
      const newVal = oldVal * factor;
      const newUnits = oldUnits * factor;
      totalBefore += oldVal;
      totalAfter += newVal;
      updatedHoldings[key] = {
        value: newVal,
        units: newUnits,
        price: Number(h.price) || getLivePrice(key) || 0
      };
    });

    const profitUsd = totalAfter - totalBefore;
    const cash = adminOverride ? (Number(adminOverride.availableCash) || 0) : 0;

    const profitEntry = {
      period: period,
      startDate: startDate || null,
      endDate: endDate || null,
      profitPct: pct,
      profitUsd: profitUsd,
      totalBefore: totalBefore,
      totalAfter: totalAfter,
      appliedAt: new Date().toISOString()
    };

    const patch = {
      adminPortfolioOverride: {
        cryptoHoldings: updatedHoldings,
        availableCash: cash
      },
      profitHistory: DWP.FieldValue.arrayUnion(profitEntry),
      updatedAt: DWP.FieldValue.serverTimestamp()
    };

    if (profitApplyBtn) {
      profitApplyBtn.disabled = true;
      profitApplyBtn.textContent = "Applying…";
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert(
        "Profit applied successfully!\n\n" +
        "Period: " + period + "\n" +
        "Profit: " + pct + "% → +" + formatMoney(profitUsd)
      );
      closeProfitModal();
      await loadUsers();
    } finally {
      if (profitApplyBtn) {
        profitApplyBtn.disabled = false;
        profitApplyBtn.textContent = "Apply Profit";
      }
    }
  }

  // ── RETURN MANAGEMENT ────────────────────────────────────────────────────────
  // Set a fixed Monthly/Annual Return figure for a user, shown as-is on their
  // dashboard instead of the rate × portfolio-value calc (see js/dashboard.js).

  const returnModal = document.getElementById("return-modal");
  const returnModalNameEl = document.getElementById("return-modal-name");
  const returnSaveBtn = document.getElementById("return-save-btn");

  let returnDocId = null;

  function closeReturnModal() {
    returnDocId = null;
    if (!returnModal) return;
    returnModal.hidden = true;
    returnModal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }

  async function openReturnModal(docId) {
    if (!returnModal || !usersSnap) return;

    const row = usersSnap.docs.find(function (d) { return d.id === docId; });
    if (!row) { await showAlert("User not found. Please refresh."); return; }

    const d = row.data();
    returnDocId = docId;

    if (returnModalNameEl) returnModalNameEl.textContent = d.fullName || d.email || docId;

    const stored = d.portfolio || {};
    const numericFields = {
      "return-investment-amount": stored.investmentAmount,
      "return-monthly-usd": stored.monthlyReturnFixedUsd,
      "return-monthly-pct": stored.monthlyReturnFixedPct,
      "return-annual-usd": stored.annualReturnFixedUsd,
      "return-annual-pct": stored.annualReturnFixedPct
    };
    Object.keys(numericFields).forEach(function (id) {
      const el = document.getElementById(id);
      if (el) el.value = numericFields[id] != null ? Number(numericFields[id]) : "";
    });

    const dateEl = document.getElementById("return-investment-date");
    if (dateEl) dateEl.value = stored.investmentDate || "";

    const typeEl = document.getElementById("return-investment-type");
    if (typeEl) typeEl.value = stored.investmentType === "yield" ? "yield" : "none";

    returnModal.hidden = false;
    returnModal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";

    document.getElementById("return-monthly-usd")?.focus();
  }

  if (returnModal) {
    returnModal.querySelectorAll("[data-return-modal-close]").forEach(function (el) {
      el.addEventListener("click", closeReturnModal);
    });
    returnModal.addEventListener("click", function (e) {
      if (e.target === returnModal) closeReturnModal();
    });
  }

  if (returnSaveBtn) {
    returnSaveBtn.addEventListener("click", function () {
      saveReturn(returnDocId).catch(async function (err) {
        console.error(err);
        await showAlert("Could not save return: " + (err.message || err));
      });
    });
  }

  async function saveReturn(docId) {
    if (!docId) return;

    function numOrNull(id) {
      const el = document.getElementById(id);
      return el && el.value !== "" ? Number(el.value) : null;
    }

    const investmentDateEl = document.getElementById("return-investment-date");
    const investmentDateVal = investmentDateEl && investmentDateEl.value !== "" ? investmentDateEl.value : null;

    const investmentTypeEl = document.getElementById("return-investment-type");
    const investmentTypeVal = investmentTypeEl && investmentTypeEl.value === "yield" ? "yield" : "none";

    const patch = {
      "portfolio.investmentDate": investmentDateVal,
      "portfolio.investmentAmount": numOrNull("return-investment-amount"),
      "portfolio.investmentType": investmentTypeVal,
      "portfolio.monthlyReturnFixedUsd": numOrNull("return-monthly-usd"),
      "portfolio.monthlyReturnFixedPct": numOrNull("return-monthly-pct"),
      "portfolio.annualReturnFixedUsd": numOrNull("return-annual-usd"),
      "portfolio.annualReturnFixedPct": numOrNull("return-annual-pct"),
      updatedAt: DWP.FieldValue.serverTimestamp()
    };

    if (returnSaveBtn) {
      returnSaveBtn.disabled = true;
      returnSaveBtn.textContent = "Saving…";
    }

    try {
      await DWP.db.collection("applications").doc(docId).update(patch);
      await showAlert("Return figures saved successfully.");
      closeReturnModal();
      await loadUsers();
    } finally {
      if (returnSaveBtn) {
        returnSaveBtn.disabled = false;
        returnSaveBtn.textContent = "Save Return";
      }
    }
  }

  // ── WALLET ADDRESS MANAGEMENT ────────────────────────────────────────────────

  const walletsLoadingEl = document.getElementById("wallets-loading");
  const walletsWrap = document.getElementById("wallets-wrap");
  const walletsTbody = document.getElementById("wallets-tbody");
  const walletsSaveBtn = document.getElementById("wallets-save-btn");
  const walletsSaveNotice = document.getElementById("wallets-save-notice");

  async function loadWalletAddresses() {
    if (!walletsTbody) return;
    if (walletsLoadingEl) walletsLoadingEl.hidden = false;
    if (walletsWrap) walletsWrap.hidden = true;

    // Load from Firestore (merges into SITE_CONFIG.depositWallets)
    if (typeof DWP.loadWalletConfig === "function") {
      await DWP.loadWalletConfig();
    }

    if (walletsLoadingEl) walletsLoadingEl.hidden = true;

    const wallets = (window.SITE_CONFIG && window.SITE_CONFIG.depositWallets) || {};
    const symbols = Object.keys(wallets);

    if (!symbols.length) {
      walletsTbody.innerHTML =
        '<tr><td colspan="3" class="admin-muted">No wallet config found in config.js.</td></tr>';
      if (walletsWrap) walletsWrap.hidden = false;
      return;
    }

    walletsTbody.innerHTML = "";
    symbols.forEach(function (sym) {
      const asset = wallets[sym];
      const networks = Array.isArray(asset.networks) ? asset.networks : [];

      networks.forEach(function (net, idx) {
        const tr = document.createElement("tr");
        // Shade alternate assets for readability
        tr.innerHTML =
          '<td data-label="Asset">' +
          (idx === 0
            ? '<span class="wallet-asset-sym">' + escapeHtml(sym) + "</span>" +
              '<br><small class="admin-muted">' + escapeHtml(asset.label || "") + "</small>"
            : '<span class="admin-muted wallet-net-arrow">&#8627;</span>') +
          "</td>" +
          '<td data-label="Network Label">' +
          '<input class="wallet-field" type="text" ' +
          'data-asset="' + escapeHtml(sym) + '" data-net-idx="' + idx + '" data-field="label" ' +
          'value="' + escapeHtml(net.label || "") + '" placeholder="Network label">' +
          "</td>" +
          '<td data-label="Wallet Address">' +
          '<input class="wallet-field wallet-address-field" type="text" ' +
          'data-asset="' + escapeHtml(sym) + '" data-net-idx="' + idx + '" data-field="address" ' +
          'value="' + escapeHtml(net.address || "") + '" placeholder="Wallet address" spellcheck="false">' +
          "</td>";
        walletsTbody.appendChild(tr);
      });
    });

    if (walletsWrap) walletsWrap.hidden = false;
    if (walletsSaveNotice) walletsSaveNotice.hidden = true;
  }

  async function saveWalletAddresses() {
    const wallets = (window.SITE_CONFIG && window.SITE_CONFIG.depositWallets) || {};
    // Deep-clone so we can mutate safely
    const updated = JSON.parse(JSON.stringify(wallets));

    // Apply every edited input back into the structure
    walletsTbody.querySelectorAll(".wallet-field").forEach(function (inp) {
      const sym = inp.getAttribute("data-asset");
      const idx = Number(inp.getAttribute("data-net-idx"));
      const field = inp.getAttribute("data-field");
      if (!updated[sym] || !Array.isArray(updated[sym].networks)) return;
      const net = updated[sym].networks[idx];
      if (net) net[field] = inp.value.trim();
    });

    if (walletsSaveBtn) {
      walletsSaveBtn.disabled = true;
      walletsSaveBtn.textContent = "Saving…";
    }

    try {
      if (typeof DWP.saveWalletConfig === "function") {
        await DWP.saveWalletConfig(updated);
      } else {
        throw new Error("DWP.saveWalletConfig is not available.");
      }
      if (walletsSaveNotice) {
        walletsSaveNotice.hidden = false;
        setTimeout(function () {
          if (walletsSaveNotice) walletsSaveNotice.hidden = true;
        }, 4000);
      }
    } catch (err) {
      console.error("[DWP] Save wallet config failed:", err);
      const code = err && err.code ? err.code : "";
      let msg = "Could not save wallet addresses.\n\n";
      if (code === "permission-denied") {
        msg +=
          "Firestore blocked the write (permission-denied).\n" +
          "Publish the latest firebase/firestore.rules in Firebase Console → Firestore → Rules.";
      } else {
        msg += err.message || String(err);
      }
      await showAlert(msg);
    } finally {
      if (walletsSaveBtn) {
        walletsSaveBtn.disabled = false;
        walletsSaveBtn.textContent = "Save All Addresses";
      }
    }
  }

  if (walletsSaveBtn) {
    walletsSaveBtn.addEventListener("click", function () {
      saveWalletAddresses().catch(function (err) { console.error(err); });
    });
  }

  // Hook tab switch for wallets
  const _origSwitchAdminTab = switchAdminTab;
  switchAdminTab = function (tabId) {
    _origSwitchAdminTab(tabId);
    if (tabId === "wallets") {
      loadWalletAddresses().catch(function (err) { console.error(err); });
    }
  };

  // ── SIDEBAR DRAWER (mobile) ─────────────────────────────────────────────────
  const sidebarEl = document.getElementById("admin-sidebar");
  const scrimEl = document.getElementById("admin-scrim");
  const menuBtnEl = document.getElementById("admin-menu-btn");

  function setAdminDrawer(open) {
    document.body.classList.toggle("admin-drawer-open", !!open);
    if (scrimEl) scrimEl.hidden = !open;
    if (menuBtnEl) menuBtnEl.setAttribute("aria-expanded", String(!!open));
    if (!open && sidebarEl) sidebarEl.scrollTop = 0;
  }

  if (menuBtnEl) {
    menuBtnEl.addEventListener("click", function () {
      setAdminDrawer(!document.body.classList.contains("admin-drawer-open"));
    });
  }
  if (scrimEl) {
    scrimEl.addEventListener("click", function () {
      setAdminDrawer(false);
    });
  }

  // Re-bind all tab buttons with the updated switchAdminTab
  document.querySelectorAll("[data-admin-tab]").forEach(function (btn) {
    btn.onclick = function () {
      switchAdminTab(btn.getAttribute("data-admin-tab"));
      setAdminDrawer(false);
    };
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    closeAllActionMenus();
    if (document.body.classList.contains("admin-drawer-open")) setAdminDrawer(false);
    if (chatModal && !chatModal.hidden) closeChatModal();
  });

  signOutBtn?.addEventListener("click", function () {
    DWP.signOut().then(function () {
      window.location.href = "login.html";
    });
  });

  refreshBtn?.addEventListener("click", function () {
    loadApplications().catch(async function (err) {
      console.error(err);
      await showAlert("Could not refresh applications.");
    });
  });

  DWP.onAuth(async function (user) {
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    if (userEmailEl) userEmailEl.textContent = user.email || "";
    showAdminAccessHint(user);

    if (!DWP.isAdmin(user)) {
      if (loadingEl) loadingEl.hidden = true;
      if (deniedEl) deniedEl.hidden = false;
      return;
    }

    if (deniedEl) deniedEl.hidden = true;

    // Live chat + notifications over the WebSocket.
    if (DWP.realtime) DWP.realtime.start();

    try {
      DWP.requireFirebase();
      if (typeof DWP.refreshCryptoPrices === "function") {
        await DWP.refreshCryptoPrices();
      }
      await loadApplications();
    } catch (err) {
      console.error(err);
      if (loadingEl) loadingEl.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent =
          "Could not load applications. Check Firestore rules and that you are listed as admin.";
      }
    }
  });
})();

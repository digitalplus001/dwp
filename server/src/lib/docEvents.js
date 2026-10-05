const { sendEmail } = require("./mailer");
const templates = require("./emailTemplates");
const { notifyUser, notifyAdmins } = require("./notify");

function fmtAmount(value, currency) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const symbol = currency && /usd/i.test(currency) ? "$" : "$";
    return symbol + value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  const str = String(value == null ? "" : value).trim();
  if (!str) return "$0.00";
  return /^\d+(\.\d+)?$/.test(str) ? `$${Number(str).toLocaleString("en-US", { minimumFractionDigits: 2 })}` : str;
}

function byId(list) {
  const map = new Map();
  for (const item of Array.isArray(list) ? list : []) {
    if (item && item.id != null) map.set(String(item.id), item);
  }
  return map;
}

function statusOf(item) {
  return String((item && item.status) || "").toLowerCase();
}

function displayName(doc, fallback) {
  return String(doc.fullName || doc.fullLegalName || fallback || "").trim();
}

/**
 * Side effects for an ADMIN mutation (PATCH /api/admin/applications/:uid):
 *  - deposit rows changing to Approved/Declined  -> client email + notification
 *  - depositConfirmed / accountActivated flip    -> single combined email
 *  - withdrawal rows changing to Approved/Denied -> client email + notification
 * Fire-and-forget safe: never throws.
 */
async function runAdminSideEffects({ userId, oldDoc, newDoc }) {
  try {
    const email = String(newDoc.email || oldDoc.email || "");
    const name = displayName(newDoc) || displayName(oldDoc);

    const oldDeposits = byId(oldDoc.depositHistory);
    const newDeposits = byId(newDoc.depositHistory);
    const oldWithdrawals = byId(oldDoc.withdrawalHistory);
    const newWithdrawals = byId(newDoc.withdrawalHistory);

    const activated =
      oldDoc.accountActivated !== true && newDoc.accountActivated === true;
    const confirmed = oldDoc.depositConfirmed !== true && newDoc.depositConfirmed === true;

    // Rows whose status changed to a reviewed state (Approved/Declined/Denied).
    const changedDeposits = [];
    for (const [id, entry] of newDeposits) {
      const before = oldDeposits.get(id);
      const beforeStatus = before ? statusOf(before) : "";
      const afterStatus = statusOf(entry);
      if (!afterStatus || afterStatus === beforeStatus) continue;
      if (afterStatus === "approved" || afterStatus === "declined") changedDeposits.push(entry);
    }

    const changedWithdrawals = [];
    for (const [id, entry] of newWithdrawals) {
      const before = oldWithdrawals.get(id);
      const beforeStatus = before ? statusOf(before) : "";
      const afterStatus = statusOf(entry);
      if (!afterStatus || afterStatus === beforeStatus) continue;
      if (afterStatus === "approved" || afterStatus === "denied") changedWithdrawals.push(entry);
    }

    // --- Activation / confirmation: one combined email covering new rows ---
    if (activated || confirmed) {
      const total = changedDeposits.reduce((sum, d) => {
        const n = Number(String((d.totalCredit != null ? d.totalCredit : d.amount) || "").replace(/[^0-9.]/g, ""));
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
      const amount = total > 0 ? fmtAmount(total) : "";
      if (email) {
        await sendEmail(templates.accountActivatedEmail({ name, amount }));
      }
      await notifyUser(userId, {
        type: "deposit",
        title: "Deposit confirmed — account activated",
        body: amount ? `Your deposit of ${amount} was confirmed and your account is now active.` : "Your deposit was confirmed and your account is now active.",
        link: "#overview",
      });
    } else if (changedDeposits.length > 0) {
      for (const entry of changedDeposits) {
        const amount = fmtAmount(entry.totalCredit != null ? entry.totalCredit : entry.amount);
        const status = entry.status;
        const method = entry.methodLabel || entry.method || "";
        const reference = entry.id || "";
        if (email) {
          await sendEmail(templates.depositStatusEmail({ name, amount, status, method, reference }));
        }
        await notifyUser(userId, {
          type: "deposit",
          title: `Deposit ${String(status).toLowerCase()}`,
          body: `Your deposit of ${amount} was ${String(status).toLowerCase()}.`,
          link: "#transactions",
        });
      }
    }

    // --- Withdrawals reviewed ---
    for (const entry of changedWithdrawals) {
      const amount = fmtAmount(entry.amount, entry.amountCurrency);
      const status = entry.status;
      const method = entry.methodLabel || entry.method || "";
      if (email) {
        await sendEmail(templates.withdrawalReviewedEmail({ name, amount, status, method }));
      }
      await notifyUser(userId, {
        type: "withdrawal",
        title: `Withdrawal ${String(status).toLowerCase()}`,
        body: `Your withdrawal of ${amount} was ${String(status).toLowerCase()}.`,
        link: "#withdrawal",
      });
    }
  } catch (err) {
    console.error("[docEvents] admin side effects failed:", err.message);
  }
}

/**
 * Side effects for a CLIENT mutation (PATCH /api/me/application):
 *  - new Pending withdrawal -> admin email + admin + client-side notifications
 *  - new Pending deposit    -> admin notification (in-app)
 * Fire-and-forget safe: never throws.
 */
async function runClientSideEffects({ user, oldDoc, newDoc }) {
  try {
    const oldWithdrawals = byId(oldDoc.withdrawalHistory);
    const newWithdrawals = byId(newDoc.withdrawalHistory);
    const oldDeposits = byId(oldDoc.depositHistory);
    const newDeposits = byId(newDoc.depositHistory);

    const name = displayName(newDoc) || String(user.display_name || "") || user.email;
    const clientEmail = String(newDoc.email || user.email || "");

    for (const [id, entry] of newWithdrawals) {
      if (oldWithdrawals.has(id)) continue;
      if (statusOf(entry) !== "pending") continue;
      const amount = fmtAmount(entry.amount, entry.amountCurrency);
      const method = entry.methodLabel || entry.method || "";
      const wallet = entry.walletAddress || "";
      const reason = entry.reasonLabel || entry.reason || "";
      await notifyAdmins({
        type: "withdrawal",
        title: "New withdrawal request",
        body: `${name} requested ${amount} (${method || "no method"}).`,
        link: `chat:${String(user.id)}`,
      });
      await sendEmail(
        templates.withdrawalRequestedEmail({ name, email: clientEmail, amount, method, wallet, reason })
      );
    }

    for (const [id, entry] of newDeposits) {
      if (oldDeposits.has(id)) continue;
      if (statusOf(entry) !== "pending") continue;
      const amount = fmtAmount(entry.totalCredit != null ? entry.totalCredit : entry.amount);
      await notifyAdmins({
        type: "deposit",
        title: "New deposit request",
        body: `${name} submitted a deposit of ${amount}.`,
        link: `chat:${String(user.id)}`,
      });
    }
  } catch (err) {
    console.error("[docEvents] client side effects failed:", err.message);
  }
}

module.exports = { runAdminSideEffects, runClientSideEffects, fmtAmount };

const BRAND = {
  navy: "#1e266d",
  navyDark: "#151c53",
  gold: "#ad7f4e",
  text: "#445781",
  muted: "#7a86a1",
  bg: "#f4f6fb",
};

function wrap({ preheader, title, intro, rows, cta, footer, insert }) {
  const rowHtml = (rows || [])
    .map(
      (r) => `
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #e8ebf4;font-size:14px;color:${BRAND.muted};">${r[0]}</td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #e8ebf4;font-size:14px;color:${BRAND.navy};font-weight:600;">${r[1]}</td>
      </tr>`
    )
    .join("");

  const ctaHtml = cta
    ? `<div style="margin:26px 0 6px;text-align:center;">
         <a href="${cta.href}" style="display:inline-block;background:linear-gradient(135deg,${BRAND.navy},#2c3a8f);color:#ffffff;text-decoration:none;padding:13px 30px;border-radius:10px;font-weight:700;font-size:15px;">${cta.label}</a>
       </div>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:${BRAND.bg};font-family:Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;">${preheader || ""}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e8ebf4;">
        <tr>
          <td style="background:linear-gradient(135deg,${BRAND.navy},${BRAND.navyDark});padding:26px 30px;">
            <div style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:.4px;">DIGITAL WEALTH PARTNERS</div>
            <div style="color:${BRAND.gold};font-size:12px;font-weight:600;letter-spacing:2.4px;text-transform:uppercase;margin-top:4px;">Secure Client Portal</div>
          </td>
        </tr>
        <tr><td style="padding:28px 30px 34px;">
          <div style="color:${BRAND.navy};font-size:20px;font-weight:800;margin:0 0 12px;">${title}</div>
          <div style="color:${BRAND.text};font-size:15px;line-height:1.6;margin:0 0 18px;">${intro || ""}</div>
          ${insert || ""}
          ${rows && rows.length ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:6px 0 4px;">${rowHtml}</table>` : ""}
          ${ctaHtml}
          <div style="color:${BRAND.muted};font-size:13px;line-height:1.6;margin-top:22px;">${footer || "If you didn't request this, you can safely ignore this email."}</div>
        </td></tr>
      </table>
      <div style="color:#9aa3bb;font-size:12px;margin-top:16px;">&copy; Digital Wealth Partners &middot; All rights reserved</div>
    </td></tr>
  </table>
</body></html>`;

  return html;
}

function plain(lines) {
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// OTP verification code
// ---------------------------------------------------------------------------
function otpEmail(code, ttlMinutes) {
  const title = "Verify your email address";
  const intro = `Welcome to Digital Wealth Partners. Enter this verification code to activate your account.`;
  const html = wrap({
    preheader: `Your verification code is ${code}`,
    title,
    intro,
    insert: `<div style="margin:18px 0 4px;text-align:center;font-family:'Courier New',monospace;font-size:34px;letter-spacing:10px;font-weight:700;color:${BRAND.navy};background:#f4f6fb;border:1px dashed ${BRAND.gold};border-radius:12px;padding:16px 8px;">${code}</div>`,
    footer: `The code expires in ${ttlMinutes} minutes. Never share it — our team will never ask for it.`,
  });

  const text = plain([
    "DIGITAL WEALTH PARTNERS",
    "",
    title,
    intro,
    "",
    `Verification code: ${code}`,
    "",
    `The code expires in ${ttlMinutes} minutes.`,
  ]);
  return { subject: `Your verification code: ${code}`, html, text };
}

// ---------------------------------------------------------------------------
// Deposit status change (approved / declined)
// ---------------------------------------------------------------------------
function depositStatusEmail({ name, amount, status, method, reference }) {
  const approved = String(status).toLowerCase() === "approved";
  const title = approved ? "Deposit confirmed" : "Deposit update";
  const intro = approved
    ? `Hi ${name || "there"}, your deposit has been reviewed and confirmed by our team. Your account balance has been updated accordingly.`
    : `Hi ${name || "there"}, your recent deposit could not be approved. Please review the details below or contact support for assistance.`;
  const html = wrap({
    preheader: `${title}: ${amount}`,
    title,
    intro,
    rows: [
      ["Amount", amount],
      ["Status", status],
      ["Method", method || "—"],
      ["Reference", reference || "—"],
    ],
    cta: { href: `${origin()}/dashboard.html#transactions`, label: "View transactions" },
    footer: "Questions about this deposit? Reply to this email or contact our support team.",
  });
  const text = plain([
    "DIGITAL WEALTH PARTNERS",
    "",
    title,
    intro,
    "",
    `Amount: ${amount}`,
    `Status: ${status}`,
    `Method: ${method || "-"}`,
    `Reference: ${reference || "-"}`,
  ]);
  return { subject: `${title} — ${amount}`, html, text };
}

// ---------------------------------------------------------------------------
// Deposit confirmed + account activated (single combined email)
// ---------------------------------------------------------------------------
function accountActivatedEmail({ name, amount }) {
  const title = "Deposit confirmed — account activated";
  const intro = `Hi ${name || "there"}, your deposit has been confirmed and your account is now active. You can start investing right away.`;
  const html = wrap({
    preheader: `Your deposit of ${amount} was confirmed`,
    title,
    intro,
    rows: amount ? [["Deposit confirmed", amount]] : [],
    cta: { href: `${origin()}/dashboard.html`, label: "Open dashboard" },
    footer: "Welcome aboard — we're glad to have you with us.",
  });
  const text = plain([
    "DIGITAL WEALTH PARTNERS",
    "",
    title,
    intro,
    amount ? `Deposit confirmed: ${amount}` : "",
    "",
    `Open your dashboard: ${origin()}/dashboard.html`,
  ].filter(Boolean));
  return { subject: `${title} — ${amount || ""}`.trim(), html, text };
}

// ---------------------------------------------------------------------------
// Withdrawal request (to admin)
// ---------------------------------------------------------------------------
function withdrawalRequestedEmail({ name, email, amount, method, wallet, reason }) {
  const title = "New withdrawal request";
  const intro = `A client has submitted a withdrawal request that requires review.`;
  const html = wrap({
    preheader: `Withdrawal request: ${amount}`,
    title,
    intro,
    rows: [
      ["Client", `${name || "—"} (${email || "—"})`],
      ["Amount", amount],
      ["Method", method || "—"],
      ["Destination", wallet || "—"],
      ["Reason", reason || "—"],
    ],
    cta: { href: `${origin()}/admin.html`, label: "Review in admin portal" },
    footer: "Sign in to the admin portal to approve or deny this request.",
  });
  const text = plain([
    "DIGITAL WEALTH PARTNERS",
    "",
    title,
    intro,
    "",
    `Client: ${name || "-"} (${email || "-"})`,
    `Amount: ${amount}`,
    `Method: ${method || "-"}`,
    `Destination: ${wallet || "-"}`,
    `Reason: ${reason || "-"}`,
    "",
    `Review: ${origin()}/admin.html`,
  ]);
  return { subject: `Withdrawal request — ${amount} — ${email || name || ""}`.trim(), html, text };
}

// ---------------------------------------------------------------------------
// Withdrawal reviewed (to client)
// ---------------------------------------------------------------------------
function withdrawalReviewedEmail({ name, amount, status, method }) {
  const approved = String(status).toLowerCase() === "approved";
  const title = approved ? "Withdrawal approved" : "Withdrawal update";
  const intro = approved
    ? `Hi ${name || "there"}, your withdrawal request has been approved and is being processed.`
    : `Hi ${name || "there"}, your withdrawal request was not approved. See the details below and contact support if you have questions.`;
  const html = wrap({
    preheader: `${title}: ${amount}`,
    title,
    intro,
    rows: [
      ["Amount", amount],
      ["Status", status],
      ["Method", method || "—"],
    ],
    cta: { href: `${origin()}/dashboard.html#withdrawal`, label: "View withdrawals" },
    footer: "Questions? Reply to this email or contact our support team.",
  });
  const text = plain([
    "DIGITAL WEALTH PARTNERS",
    "",
    title,
    intro,
    "",
    `Amount: ${amount}`,
    `Status: ${status}`,
    `Method: ${method || "-"}`,
  ]);
  return { subject: `${title} — ${amount}`, html, text };
}

function origin() {
  const config = require("../config");
  return config.publicUrl;
}

module.exports = {
  otpEmail,
  depositStatusEmail,
  accountActivatedEmail,
  withdrawalRequestedEmail,
  withdrawalReviewedEmail,
};

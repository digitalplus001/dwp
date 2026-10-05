const config = require("../config");

const EMAIL_RE = /\S+@\S+\.\S+/;

/**
 * Sends an email through Resend's REST API.
 * - No RESEND_API_KEY configured  -> logs to the console (dev mode) and reports ok.
 * - Never throws; returns { ok, dev?, error? }.
 */
async function sendEmail({ to, subject, html, text }) {
  if (!to || !EMAIL_RE.test(String(to))) {
    return { ok: false, skipped: "invalid-recipient" };
  }
  if (!config.email.enabled) {
    console.log(`[email:dev] to=${to}\n  subject=${subject}\n  ${String(text || "").replace(/\n/g, "\n  ")}`);
    return { ok: true, dev: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.email.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        from: config.email.from,
        to: [String(to)],
        subject,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("[mailer] resend error", res.status, body.slice(0, 300));
      return { ok: false, error: `http-${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    console.error("[mailer] failed:", err.message);
    return { ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendEmail };

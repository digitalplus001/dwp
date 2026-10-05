const express = require("express");
const config = require("../config");
const { query } = require("../db/pool");

const router = express.Router();

// POST /api/contact — stores the message and forwards it to the contact inbox
router.post("/", async (req, res) => {
  const b = req.body || {};
  const required = [
    "firstName",
    "lastName",
    "email",
    "phone",
    "clientType",
    "hasLLCTrust",
    "currentAllocation",
    "hasXRP",
    "digitalAssets",
    "message",
  ];
  const missing = required.filter((key) => b[key] === undefined || b[key] === null || String(b[key]).trim() === "");
  if (missing.length > 0 || b.acceptedComms !== true) {
    return res.status(400).json({
      success: false,
      message: "Please complete all required fields and accept the communication consent.",
    });
  }

  const address = b.address || {};
  const payload = {
    firstName: b.firstName,
    lastName: b.lastName,
    email: b.email,
    phone: b.phone,
    address,
    clientType: b.clientType,
    hasLLCTrust: b.hasLLCTrust,
    LLCTrustName: b.LLCTrustName || "",
    currentAllocation: b.currentAllocation,
    hasXRP: b.hasXRP,
    digitalAssets: b.digitalAssets,
    message: b.message,
    acceptedComms: b.acceptedComms === true,
  };

  const { rows } = await query(
    `INSERT INTO contact_messages (first_name, last_name, email, phone, client_type, message, payload, forwarded)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id, created_at`,
    [
      payload.firstName,
      payload.lastName,
      payload.email,
      payload.phone,
      payload.clientType,
      payload.message,
      JSON.stringify(payload),
      false,
    ]
  );

  const forwarded = await forwardToInbox(payload);
  if (forwarded) {
    await query("UPDATE contact_messages SET forwarded = true WHERE id = $1", [rows[0].id]);
  }

  // In-app notification for admins (best-effort).
  try {
    const { notifyAdmins } = require("../lib/notify");
    await notifyAdmins({
      type: "contact",
      title: "New contact message",
      body: `${payload.firstName} ${payload.lastName}: ${String(payload.message).slice(0, 140)}`,
      link: "",
    });
  } catch (_) {
    /* notification is best-effort */
  }

  res.json({ success: true, message: "Thanks — your message has been received.", id: rows[0].id });
});

async function forwardToInbox(payload) {
  if (!config.contactEmail || !/\S+@\S+\.\S+/.test(config.contactEmail)) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(config.contactEmail)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        _subject: `Contact form: ${payload.firstName} ${payload.lastName}`,
        _template: "table",
        _captcha: "false",
        _replyto: payload.email,
        "First Name": payload.firstName,
        "Last Name": payload.lastName,
        Email: payload.email,
        Phone: payload.phone,
        "Address Line 1": payload.address.line1 || "—",
        "Address Line 2": payload.address.line2 || "—",
        City: payload.address.city || "—",
        State: payload.address.state || "—",
        "Zip/Postal": payload.address.zip || "—",
        Country: payload.address.country || "—",
        "Client Type": payload.clientType,
        "LLC, Trust, or Corporation": payload.hasLLCTrust,
        "LLC/Trust/Corp Name": payload.LLCTrustName || "—",
        "Digital Asset Allocation": payload.currentAllocation,
        "100,000+ XRP Tokens": payload.hasXRP,
        "Digital Assets (custody)": payload.digitalAssets,
        Message: payload.message,
      }),
    });
    if (!response.ok) return false;
    const result = await response.json().catch(() => ({}));
    return result.success === true || result.success === "true" || response.ok;
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = router;

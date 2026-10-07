const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const config = require("../config");
const { query, withTransaction } = require("../db/pool");
const { defaultApplication } = require("../lib/defaultApplication");
const { signToken, presentUser, requireAuth } = require("../middleware/auth");
const { sendEmail } = require("../lib/mailer");
const { otpEmail } = require("../lib/emailTemplates");
const { notifyAdmins } = require("../lib/notify");

const router = express.Router();

const EMAIL_RE = /\S+@\S+\.\S+/;

// Small in-memory throttle: 8 failures per email per 15 minutes.
const attempts = new Map();
function tooManyAttempts(email) {
  const now = Date.now();
  const entry = attempts.get(email) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + 15 * 60 * 1000;
  }
  return entry.count >= 8;
}
function recordFailure(email) {
  const now = Date.now();
  const entry = attempts.get(email) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  entry.count += 1;
  attempts.set(email, entry);
}
function clearFailures(email) {
  attempts.delete(email);
}

function fail(res, status, code, message) {
  return res.status(status).json({ error: { code, message } });
}

// ---------------------------------------------------------------------------
// Email verification OTP
// ---------------------------------------------------------------------------
function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function hashEquals(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Cooldown: one resend per email per OTP_RESEND_COOLDOWN seconds.
const resendAt = new Map();

/**
 * Generates a fresh 6-digit code for the user, stores its hash and emails it.
 * Returns { dev, code } — code is only present when email delivery is disabled.
 */
async function issueOtp(user) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const hash = sha256(code);
  const expires = new Date(Date.now() + config.otp.ttlMinutes * 60 * 1000);
  await query("DELETE FROM email_otps WHERE user_id = $1", [user.id]);
  await query("INSERT INTO email_otps (user_id, code_hash, expires_at) VALUES ($1, $2, $3)", [user.id, hash, expires]);
  const tpl = otpEmail(code, config.otp.ttlMinutes);
  const result = await sendEmail({ to: user.email, subject: tpl.subject, html: tpl.html, text: tpl.text });
  console.log(`[otp] ${user.email} -> ${code} (valid ${config.otp.ttlMinutes} min)`);
  return { dev: Boolean(result.dev), code: result.dev ? code : undefined };
}

// ---------------------------------------------------------------------------
// POST /api/auth/register — creates the auth user + application document
// ---------------------------------------------------------------------------
router.post("/register", async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, "auth/invalid-email", "Please enter a valid email address.");
  }
  if (password.length < 8) {
    return fail(res, 400, "auth/weak-password", "Password must be at least 8 characters.");
  }
  if (!String(body.fullName || "").trim()) {
    return fail(res, 400, "auth/missing-name", "Full legal name is required.");
  }

  const existing = await query("SELECT 1 FROM users WHERE email = $1", [email]);
  if (existing.rowCount > 0) {
    return fail(res, 409, "auth/email-already-in-use", "An account with this email already exists. Try signing in instead.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const displayName = String(body.fullName || "").trim();

  let created;
  try {
    created = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, display_name, role, email_verified)
         VALUES ($1, $2, $3, $4, false)
         RETURNING id, email, display_name, role, email_verified, created_at`,
        [email, passwordHash, displayName, config.adminEmails.includes(email) ? "admin" : "client"]
      );
      const user = userResult.rows[0];

      const doc = defaultApplication({ uid: String(user.id), email, ...body, fullName: displayName });
      await client.query(
        `INSERT INTO applications
           (user_id, uid, doc, status, account_activated, deposit_submitted, full_name, email, llc_name, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          user.id,
          String(user.id),
          JSON.stringify(doc),
          doc.status,
          doc.accountActivated,
          doc.depositSubmitted,
          doc.fullName,
          doc.email,
          doc.llcName,
          new Date(doc.createdAt),
          new Date(doc.updatedAt),
        ]
      );
      return user;
    });
  } catch (err) {
    if (err && err.code === "23505") {
      return fail(res, 409, "auth/email-already-in-use", "An account with this email already exists. Try signing in instead.");
    }
    throw err;
  }

  notifyAdminOfSignup({ ...body, email }).catch(() => {});
  notifyAdmins({
    type: "signup",
    title: "New signup",
    body: `${displayName} (${email}) created an account.`,
    link: "",
  }).catch(() => {});

  // Email verification code (best-effort; response degrades gracefully).
  let otp = null;
  try {
    otp = await issueOtp(created);
  } catch (err) {
    console.error("[otp] send failed:", err.message);
  }

  return res.status(201).json({
    success: true,
    user: presentUser(created),
    requiresVerification: true,
    ...(otp && otp.dev ? { devOtp: otp.code } : {}),
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
router.post("/login", async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  const password = String((req.body || {}).password || "");

  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, "auth/invalid-email", "Please enter a valid email address.");
  }
  if (tooManyAttempts(email)) {
    return fail(res, 429, "auth/too-many-requests", "Too many attempts. Please wait a few minutes before trying again.");
  }

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
  if (!user || !ok) {
    recordFailure(email);
    // Same message for unknown user and wrong password (no account enumeration).
    return fail(res, 401, "auth/invalid-credential", "Invalid email or password. Please check your credentials and try again.");
  }
  clearFailures(email);

  if (user.email_verified === false) {
    return res.status(403).json({
      error: {
        code: "auth/email-not-verified",
        message: "Your email address has not been verified yet. Enter the code we sent you to activate your account.",
      },
      email: user.email,
    });
  }

  const token = signToken(user);
  return res.json({ token, user: presentUser(user) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp — checks the 6-digit code, activates the account
// ---------------------------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
  const body = req.body || {};
  const email = String(body.email || "").trim().toLowerCase();
  const code = String(body.code || "").trim();

  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, "auth/invalid-email", "Please enter a valid email address.");
  }
  if (!/^\d{6}$/.test(code)) {
    return fail(res, 400, "auth/invalid-otp", "Enter the 6-digit verification code from your email.");
  }

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user) {
    return fail(res, 400, "auth/invalid-otp", "Incorrect code. Please check your email and try again.");
  }
  if (user.email_verified === true) {
    return res.json({ success: true, token: signToken(user), user: presentUser(user), alreadyVerified: true });
  }

  const otpResult = await query(
    `SELECT id, code_hash, expires_at, attempts FROM email_otps
      WHERE user_id = $1 AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [user.id]
  );
  const otp = otpResult.rows[0];
  if (!otp) {
    return fail(res, 400, "auth/otp-expired", "This code has expired or was already used. Request a new one.");
  }
  if (Date.parse(otp.expires_at) < Date.now()) {
    return fail(res, 400, "auth/otp-expired", "This code has expired. Request a new one.");
  }
  if (otp.attempts >= config.otp.maxAttempts) {
    return fail(res, 429, "auth/too-many-attempts", "Too many incorrect attempts. Request a new code.");
  }
  if (!hashEquals(otp.code_hash, sha256(code))) {
    await query("UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1", [otp.id]);
    const left = config.otp.maxAttempts - (otp.attempts + 1);
    return fail(
      res,
      400,
      "auth/invalid-otp",
      left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} remaining.` : "Too many incorrect attempts. Request a new code."
    );
  }

  await query("UPDATE users SET email_verified = true, updated_at = now() WHERE id = $1", [user.id]);
  await query("UPDATE email_otps SET consumed_at = now() WHERE id = $1", [otp.id]);
  clearFailures(email);

  const verified = { ...user, email_verified: true };
  return res.json({ success: true, token: signToken(verified), user: presentUser(verified) });
});

// ---------------------------------------------------------------------------
// POST /api/auth/resend-otp — issues a fresh code (rate-limited)
// ---------------------------------------------------------------------------
router.post("/resend-otp", async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, "auth/invalid-email", "Please enter a valid email address.");
  }

  const { rows } = await query("SELECT * FROM users WHERE email = $1", [email]);
  const user = rows[0];
  if (!user) {
    // Do not reveal whether the account exists.
    return res.json({ success: true, message: "If an unverified account exists for this email, a new code has been sent." });
  }
  if (user.email_verified === true) {
    return res.json({ success: true, message: "This email is already verified. You can sign in." });
  }

  const now = Date.now();
  const last = resendAt.get(email) || 0;
  const cooldownMs = config.otp.resendCooldownSeconds * 1000;
  if (now - last < cooldownMs) {
    const wait = Math.ceil((cooldownMs - (now - last)) / 1000);
    return fail(res, 429, "auth/resend-cooldown", `Please wait ${wait} second${wait === 1 ? "" : "s"} before requesting another code.`);
  }

  let otp = null;
  try {
    otp = await issueOtp(user);
    resendAt.set(email, now);
  } catch (err) {
    console.error("[otp] resend failed:", err.message);
    return fail(res, 502, "auth/resend-failed", "Could not send the code right now. Please try again.");
  }

  return res.json({
    success: true,
    message: "A new verification code has been sent.",
    ...(otp && otp.dev ? { devOtp: otp.code } : {}),
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/forgot-password — always reports success
// ---------------------------------------------------------------------------
router.post("/forgot-password", async (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return fail(res, 400, "auth/invalid-email", "Please enter a valid email address.");
  }

  const { rows } = await query("SELECT id FROM users WHERE email = $1", [email]);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(token).digest("hex");
    const expires = new Date(Date.now() + config.resetTtlMinutes * 60 * 1000);
    await query(
      "INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
      [rows[0].id, hash, expires]
    );
    const link = `${config.publicUrl}/reset-password.html?token=${token}`;
    console.log(`[password-reset] ${email} -> ${link}`);
  }

  return res.json({
    success: true,
    message: "If an account exists for this email, you will receive a password reset link. Check your inbox and spam folder.",
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/reset-password
// ---------------------------------------------------------------------------
router.post("/reset-password", async (req, res) => {
  const token = String((req.body || {}).token || "");
  const password = String((req.body || {}).password || "");
  if (password.length < 8) {
    return fail(res, 400, "auth/weak-password", "Password must be at least 8 characters.");
  }
  const hash = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await query(
    `SELECT pr.id FROM password_resets pr
     WHERE pr.token_hash = $1 AND pr.used_at IS NULL AND pr.expires_at > now()
     LIMIT 1`,
    [hash]
  );
  if (!rows[0]) {
    return fail(res, 400, "auth/invalid-reset", "This reset link is invalid or has expired. Please request a new one.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET password_hash = $1, updated_at = now() WHERE id = (SELECT user_id FROM password_resets WHERE id = $2)", [
      passwordHash,
      rows[0].id,
    ]);
    await client.query("UPDATE password_resets SET used_at = now() WHERE id = $1", [rows[0].id]);
  });
  clearFailuresAll();

  return res.json({ success: true, message: "Password updated. You can now sign in." });
});

function clearFailuresAll() {
  attempts.clear();
}

// ---------------------------------------------------------------------------
// GET /api/auth/session
// ---------------------------------------------------------------------------
router.get("/session", requireAuth, (req, res) => {
  res.json({ user: req.userView });
});

// ---------------------------------------------------------------------------
// Admin signup notification (same FormSubmit email the old client sent)
// ---------------------------------------------------------------------------
async function notifyAdminOfSignup(data) {
  if (!config.contactEmail || !EMAIL_RE.test(config.contactEmail)) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(config.contactEmail)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        _subject: `New LLC Signup: ${data.fullName || ""} — ${data.llcName || ""}`,
        _template: "table",
        _captcha: "false",
        "Email Address": data.email || "",
        "Phone Number": data.phone || "",
        "Full Legal Name": data.fullName || "",
        "Proposed LLC Name": data.llcName || "",
        Status: "pending (PostgreSQL)",
      }),
    });
  } catch (_) {
    /* notification is best-effort */
  } finally {
    clearTimeout(timer);
  }
}

module.exports = router;

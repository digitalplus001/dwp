const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function list(value, fallback) {
  const out = String(value || fallback || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return out;
}

const config = {
  port: Number(process.env.PORT || 3000),
  publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, ""),
  databaseUrl: process.env.DATABASE_URL || "",
  uploadDir: path.resolve(__dirname, "..", "..", process.env.UPLOAD_DIR || "uploads"),
  jwt: {
    secret: process.env.JWT_SECRET || "",
    ttl: process.env.JWT_TTL || "7d",
  },
  resetTtlMinutes: Number(process.env.RESET_TTL_MINUTES || 60),
  adminEmails: list(process.env.ADMIN_EMAILS, ""),
  contactEmail: process.env.CONTACT_EMAIL || "",
  // Cloudinary (optional) - when all three are set, deposit proofs are stored
  // on Cloudinary and the returned URLs are Cloudinary secure URLs.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
    apiKey: process.env.CLOUDINARY_API_KEY || "",
    apiSecret: process.env.CLOUDINARY_API_SECRET || "",
  },
  // Resend (optional) - transactional email (OTP verification, deposit and
  // withdrawal notices). Without an API key emails are logged to the console.
  email: {
    apiKey: process.env.RESEND_API_KEY || "",
    from: process.env.EMAIL_FROM || "Digital Wealth Partners <onboarding@resend.dev>",
  },
  otp: {
    ttlMinutes: Number(process.env.OTP_TTL_MINUTES || 10),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    resendCooldownSeconds: Number(process.env.OTP_RESEND_COOLDOWN || 60),
  },
};

config.cloudinary.enabled = Boolean(
  config.cloudinary.cloudName && config.cloudinary.apiKey && config.cloudinary.apiSecret
);
config.email.enabled = Boolean(config.email.apiKey);

if (!config.databaseUrl) {
  console.error("Missing DATABASE_URL. Copy server/.env.example to server/.env and set it.");
  process.exit(1);
}
if (!config.jwt.secret || config.jwt.secret.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters. Set it in server/.env");
  process.exit(1);
}

module.exports = config;

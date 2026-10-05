const jwt = require("jsonwebtoken");
const config = require("../config");
const { query } = require("../db/pool");

function extractToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token);
  if (req.headers.cookie) {
    const match = /(?:^|;\s*)dwp_token=([^;]+)/.exec(req.headers.cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

async function loadUser(userId) {
  const { rows } = await query("SELECT id, email, display_name, role, email_verified, created_at FROM users WHERE id = $1", [userId]);
  return rows[0] || null;
}

function presentUser(row) {
  if (!row) return null;
  return {
    uid: String(row.id),
    email: row.email,
    displayName: row.display_name || "",
    role: config.adminEmails.includes(String(row.email).toLowerCase()) ? "admin" : row.role,
    isAdmin: config.adminEmails.includes(String(row.email).toLowerCase()) || row.role === "admin",
    // Default true when the column was not selected (never lock legacy callers out).
    emailVerified: row.email_verified === undefined ? true : row.email_verified === true,
    createdAt: row.created_at,
  };
}

function signToken(user) {
  return jwt.sign({ sub: String(user.id), email: user.email }, config.jwt.secret, {
    expiresIn: config.jwt.ttl,
  });
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: { code: "auth/no-session", message: "Not signed in." } });
  }
  try {
    const payload = jwt.verify(token, config.jwt.secret);
    const user = await loadUser(payload.sub);
    if (!user) {
      return res.status(401).json({ error: { code: "auth/user-disabled", message: "Account no longer exists." } });
    }
    req.user = user;
    req.userView = presentUser(user);
    return next();
  } catch (err) {
    return res.status(401).json({ error: { code: "auth/invalid-session", message: "Your session has expired. Please sign in again." } });
  }
}

function isAdminUser(user) {
  if (!user) return false;
  const email = String(user.email || "").toLowerCase();
  return user.role === "admin" || config.adminEmails.includes(email);
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: { code: "auth/no-session", message: "Not signed in." } });
  }
  if (!isAdminUser(req.user)) {
    return res.status(403).json({ error: { code: "permission-denied", message: "Access denied. This page is for administrators only." } });
  }
  return next();
}

module.exports = { extractToken, requireAuth, requireAdmin, signToken, presentUser, isAdminUser, loadUser };

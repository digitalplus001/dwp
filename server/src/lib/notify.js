const config = require("../config");
const { query } = require("../db/pool");

let realtime = null;
function rt() {
  if (!realtime) {
    try {
      realtime = require("./realtime");
    } catch (_) {
      realtime = null;
    }
  }
  return realtime;
}

function mapNotification(row) {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    type: row.type,
    title: row.title,
    body: row.body || "",
    link: row.link || "",
    readAt: row.read_at || null,
    createdAt: row.created_at,
  };
}

async function unreadCount(userId) {
  const { rows } = await query(
    "SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND read_at IS NULL",
    [userId]
  );
  return rows[0].n;
}

/**
 * Creates an in-app notification row and pushes it over WebSocket.
 * Never throws — notifications must not break the main flow.
 */
async function notifyUser(userId, { type, title, body, link } = {}) {
  if (!userId || !title) return null;
  try {
    const { rows } = await query(
      `INSERT INTO notifications (user_id, type, title, body, link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, type, title, body, link, read_at, created_at`,
      [String(userId), type || "system", String(title), String(body || ""), String(link || "")]
    );
    const notification = mapNotification(rows[0]);
    const count = await unreadCount(userId);
    const engine = rt();
    if (engine) engine.emitToUser(String(userId), "notification:new", { notification, unreadCount: count });
    return notification;
  } catch (err) {
    console.error("[notify] failed:", err.message);
    return null;
  }
}

/** Notifies every admin (role-based + configured ADMIN_EMAILS). */
async function notifyAdmins(opts) {
  try {
    const { rows } = await query(
      "SELECT DISTINCT id FROM users WHERE role = 'admin' OR lower(email) = ANY($1::text[])",
      [config.adminEmails]
    );
    await Promise.all(rows.map((row) => notifyUser(row.id, opts)));
    return rows.length;
  } catch (err) {
    console.error("[notify] admins failed:", err.message);
    return 0;
  }
}

module.exports = { notifyUser, notifyAdmins, mapNotification, unreadCount };

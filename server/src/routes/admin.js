const express = require("express");
const { query } = require("../db/pool");
const { applyPatch, allowedKeysFor } = require("../lib/patch");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { loadApplication, saveDocument } = require("./me");
const { runAdminSideEffects } = require("../lib/docEvents");
const { notifyUser } = require("../lib/notify");
const realtime = require("../lib/realtime");

const router = express.Router();
router.use(requireAuth, requireAdmin);

async function loadByUid(uid) {
  const { rows } = await query(
    "SELECT user_id, uid, doc, created_at FROM applications WHERE uid = $1 OR user_id::text = $1 LIMIT 1",
    [uid]
  );
  if (!rows[0]) return null;
  return { id: rows[0].uid, userId: rows[0].user_id, data: rows[0].doc, createdAt: rows[0].created_at };
}

// GET /api/admin/applications — full list (drives both admin tabs)
router.get("/applications", async (req, res) => {
  const { rows } = await query(
    "SELECT uid, doc, created_at FROM applications ORDER BY created_at DESC"
  );
  const items = rows.map((row) => ({ id: row.uid, data: row.doc }));
  res.json({ applications: items, total: items.length });
});

// GET /api/admin/applications/:uid — single document (impersonation, detail views)
router.get("/applications/:uid", async (req, res) => {
  const application = await loadByUid(req.params.uid);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Application not found." } });
  }
  res.json({ id: application.id, data: application.data });
});

// PATCH /api/admin/applications/:uid — every admin mutation
router.patch("/applications/:uid", async (req, res) => {
  const application = await loadByUid(req.params.uid);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Application not found." } });
  }

  const patch = req.body && typeof req.body === "object" ? req.body : {};
  const { doc, rejected } = applyPatch(application.data, patch, allowedKeysFor("admin"));
  if (rejected.length > 0) {
    return res.status(403).json({
      error: { code: "permission-denied", message: `Not allowed to update: ${rejected.join(", ")}`, fields: rejected },
    });
  }

  await saveDocument(application.userId, doc);

  // Deposit / withdrawal reviews -> emails + in-app notifications (fire-and-forget).
  runAdminSideEffects({ userId: application.userId, oldDoc: application.data, newDoc: doc }).catch(() => {});

  res.json({ id: application.id, data: doc });
});

// GET /api/admin/chats/:uid — legacy chat document
router.get("/chats/:uid", async (req, res) => {
  const application = await loadByUid(req.params.uid);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Chat owner not found." } });
  }
  const { rows } = await query(
    "SELECT text, created_at FROM chat_messages WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
    [application.userId]
  );
  const unreadResult = await query(
    "SELECT count(*)::int AS n FROM chat_messages WHERE user_id = $1 AND from_ = 'client' AND read_at IS NULL",
    [application.userId]
  );
  if (!rows[0]) {
    return res.json({ exists: false, unreadFromClient: unreadResult.rows[0].n });
  }
  res.json({
    exists: true,
    lastMessage: String(rows[0].text || "").slice(0, 120),
    updatedAt: rows[0].created_at,
    unreadFromClient: unreadResult.rows[0].n,
  });
});

// GET /api/admin/chats/:uid/messages — full conversation history
router.get("/chats/:uid/messages", async (req, res) => {
  const application = await loadByUid(req.params.uid);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Chat owner not found." } });
  }
  const { rows } = await query(
    `SELECT id, text, from_ AS "from", sender_email AS "senderEmail", created_at AS "createdAt", read_at AS "readAt"
       FROM chat_messages
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 300`,
    [application.userId]
  );
  const unreadFromClient = rows.filter((row) => row.from === "client" && !row.readAt).length;
  // Admin opening the thread marks the client's messages as read.
  await query(
    "UPDATE chat_messages SET read_at = now() WHERE user_id = $1 AND from_ = 'client' AND read_at IS NULL",
    [application.userId]
  );
  res.json({ messages: rows, unreadFromClient });
});

// POST /api/admin/chats/:uid/messages — admin reply
router.post("/chats/:uid/messages", async (req, res) => {
  const application = await loadByUid(req.params.uid);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Chat owner not found." } });
  }
  const text = String((req.body || {}).text || "").trim();
  if (!text) {
    return res.status(400).json({ error: { code: "invalid-argument", message: "Message text is required." } });
  }
  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, text, from_, sender_email)
     VALUES ($1, $2, 'admin', $3)
     RETURNING id, created_at`,
    [application.userId, text, req.user.email || null]
  );
  const message = {
    id: String(rows[0].id),
    text,
    from: "admin",
    senderEmail: req.user.email || null,
    createdAt: rows[0].created_at,
    readAt: null,
  };

  // In-app notification + live push to the client's open portal(s).
  notifyUser(application.userId, {
    type: "chat",
    title: "New message from support",
    body: text.slice(0, 160),
    link: "#messages",
  }).catch(() => {});
  realtime.emitToUser(String(application.userId), "chat:new", { message, userId: String(application.userId) });

  res.status(201).json({ id: rows[0].id, createdAt: rows[0].created_at, lastMessage: text.slice(0, 120) });
});

// POST /api/admin/notifications — broadcast a notification to clients
router.post("/notifications", async (req, res) => {
  const body = req.body || {};
  const title = String(body.title || "").trim();
  const text = String(body.body || body.text || "").trim();
  const link = String(body.link || "").trim().slice(0, 300);
  if (!title) {
    return res.status(400).json({ error: { code: "invalid-argument", message: "Title is required." } });
  }
  if (title.length > 120) {
    return res.status(400).json({ error: { code: "invalid-argument", message: "Title must be 120 characters or fewer." } });
  }

  let recipients = [];
  const requested = Array.isArray(body.userIds) ? body.userIds : null;
  if (requested && requested.length > 0) {
    const ids = requested.filter((id) => /^[0-9a-f-]{36}$/i.test(String(id))).map(String);
    if (ids.length === 0) {
      return res.status(400).json({ error: { code: "invalid-argument", message: "No valid recipients." } });
    }
    const { rows } = await query("SELECT id FROM users WHERE id::text = ANY($1)", [ids]);
    recipients = rows.map((row) => row.id);
  } else {
    const { rows } = await query("SELECT id FROM users WHERE role = 'client' ORDER BY created_at DESC LIMIT 2000");
    recipients = rows.map((row) => row.id);
  }

  for (const id of recipients) {
    await notifyUser(id, { type: "system", title, body: text, link });
  }

  res.json({ success: true, sent: recipients.length });
});

// GET /api/admin/stats — small helper for the dashboard header
router.get("/stats", async (req, res) => {
  const { rows } = await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE account_activated)::int AS activated
     FROM applications`
  );
  res.json(rows[0]);
});

module.exports = router;
module.exports.loadByUid = loadByUid;

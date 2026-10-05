const express = require("express");
const { query } = require("../db/pool");
const { requireAuth } = require("../middleware/auth");
const { mapNotification, unreadCount } = require("../lib/notify");

const router = express.Router();
router.use(requireAuth);

// GET /api/notifications — latest 50 + unread count for the signed-in user
router.get("/", async (req, res) => {
  const { rows } = await query(
    `SELECT id, user_id, type, title, body, link, read_at, created_at
       FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50`,
    [req.user.id]
  );
  res.json({ items: rows.map(mapNotification), unreadCount: await unreadCount(req.user.id) });
});

// POST /api/notifications/read — mark specific ids (or all when ids omitted) read
router.post("/read", async (req, res) => {
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.length <= 64) : null;
  if (ids && ids.length > 0) {
    await query(
      `UPDATE notifications SET read_at = now()
        WHERE user_id = $1 AND read_at IS NULL AND id::text = ANY($2)`,
      [req.user.id, ids]
    );
  } else {
    await query("UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL", [req.user.id]);
  }
  res.json({ unreadCount: await unreadCount(req.user.id) });
});

// DELETE /api/notifications/:id — remove one of the user's notifications
router.delete("/:id", async (req, res) => {
  await query("DELETE FROM notifications WHERE user_id = $1 AND id::text = $2", [req.user.id, req.params.id]);
  res.json({ success: true, unreadCount: await unreadCount(req.user.id) });
});

module.exports = router;

const express = require("express");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { query } = require("../db/pool");

const router = express.Router();

// GET /api/site/deposit-wallets — public, powers the deposit panel
router.get("/deposit-wallets", async (req, res) => {
  const { rows } = await query("SELECT value FROM site_config WHERE key = 'depositWallets'");
  res.json({ depositWallets: rows[0] ? rows[0].value : {} });
});

// PUT /api/site/deposit-wallets — admin "Save All Addresses"
router.put("/deposit-wallets", requireAuth, requireAdmin, async (req, res) => {
  const value = req.body && typeof req.body === "object" ? req.body : {};
  await query(
    `INSERT INTO site_config (key, value, updated_at, updated_by)
     VALUES ('depositWallets', $1::jsonb, now(), $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    [JSON.stringify(value), req.user.email || null]
  );
  res.json({ success: true, depositWallets: value });
});

module.exports = router;

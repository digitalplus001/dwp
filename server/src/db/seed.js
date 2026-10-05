const fs = require("fs");
const path = require("path");
const vm = require("vm");
const bcrypt = require("bcryptjs");
const config = require("../config");
const { query } = require("./pool");

// Extract window.SITE_CONFIG from the frontend config so the seeded wallets
// always match what the site ships with.
function readSiteConfig() {
  const file = path.resolve(__dirname, "..", "..", "..", "js", "config.js");
  try {
    const src = fs.readFileSync(file, "utf8");
    const match = src.match(/window\.SITE_CONFIG\s*=\s*([\s\S]*?)\n\s*(?:window\.|\/\/|$)/);
    if (!match) return null;
    const sandbox = {};
    vm.runInNewContext(`result = ${match[1].trim().replace(/,\s*$/, "")}`, sandbox, { timeout: 1000 });
    return sandbox.result || null;
  } catch (err) {
    console.warn("Could not read js/config.js SITE_CONFIG:", err.message);
    return null;
  }
}

async function seed() {
  const site = readSiteConfig() || {};
  const adminEmails = (site.adminEmails || config.adminEmails || []).map((e) => String(e).toLowerCase());

  // 1. Deposit wallets (siteConfig/depositWallets equivalent)
  const wallets = site.depositWallets || {};
  if (Object.keys(wallets).length > 0) {
    await query(
      `INSERT INTO site_config (key, value, updated_at, updated_by)
       VALUES ('depositWallets', $1::jsonb, now(), 'seed')
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(wallets)]
    );
    console.log(`seeded depositWallets (${Object.keys(wallets).length} assets)`);
  }

  // 2. Admin accounts for every configured admin email (dev password, changeable)
  const devPassword = process.env.SEED_ADMIN_PASSWORD || "Admin123!";
  const hash = await bcrypt.hash(devPassword, 10);
  for (const email of adminEmails) {
    const existing = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rowCount > 0) {
      await query("UPDATE users SET role = 'admin', email_verified = true WHERE id = $1", [existing.rows[0].id]);
      continue;
    }
    const user = await query(
      "INSERT INTO users (email, password_hash, display_name, role, email_verified) VALUES ($1, $2, $3, 'admin', true) RETURNING id",
      [email, hash, "Administrator"]
    );
    const { defaultApplication } = require("../lib/defaultApplication");
    const doc = defaultApplication({ uid: String(user.rows[0].id), email, fullName: "Administrator" });
    doc.status = "approved";
    await query(
      `INSERT INTO applications (user_id, uid, doc, status, account_activated, deposit_submitted, full_name, email, llc_name, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, 'approved', false, false, 'Administrator', $4, '', $5, $5)`,
      [user.rows[0].id, String(user.rows[0].id), JSON.stringify(doc), email, new Date()]
    );
    console.log(`seeded admin: ${email}`);
  }

  console.log("seed complete");
  console.log(`  admin sign-in password (dev): ${devPassword}`);
}

if (require.main === module) {
  seed()
    .then(() => query("SELECT 1").then(() => require("./pool").pool.end()))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seed, readSiteConfig };

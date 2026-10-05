const { Pool } = require("pg");
const config = require("../config");

// Neon requires TLS. pg parses ?sslmode=... from the URL, but an explicit ssl
// object avoids strict certificate failures on some platforms while still
// enabling encryption. sslmode=disable (or no ssl) keeps local dev untouched.
function sslFromUrl(connectionString) {
  if (/sslmode=disable/i.test(connectionString)) return false;
  if (/sslmode=(require|verify-ca|verify-full)/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  if (/\.neon\.tech\b/i.test(connectionString)) {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: sslFromUrl(config.databaseUrl),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on("error", (err) => {
  console.error("Unexpected PG pool error:", err.message);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch (_) {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };

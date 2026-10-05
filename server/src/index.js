const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const config = require("./config");

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "3mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "dwp-api", time: new Date().toISOString() });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/me", require("./routes/me"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/site", require("./routes/site"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/notifications", require("./routes/notifications"));

// Uploaded deposit proofs
fs.mkdirSync(config.uploadDir, { recursive: true });
app.use("/uploads", express.static(config.uploadDir, { fallthrough: true, maxAge: "1d" }));

// The static site itself (HTML/CSS/JS/assets at the repo root)
const siteRoot = path.resolve(__dirname, "..", "..");
// Backend sources live under the same root — never serve them.
app.use("/server", (req, res) => {
  res.status(404).json({ error: { code: "not-found", message: "Not found." } });
});
app.use(express.static(siteRoot, { index: "index.html", extensions: ["html"] }));

app.use("/api", (req, res) => {
  res.status(404).json({ error: { code: "not-found", message: `No API route for ${req.method} ${req.originalUrl}` } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "request/too-large", message: "Payload too large." } });
  }
  console.error("[error]", err.message);
  const status = err.status || 500;
  res.status(status).json({
    error: { code: err.code || "internal/error", message: status === 500 ? "Something went wrong. Please try again." : err.message },
  });
});

if (require.main === module) {
  const server = app.listen(config.port, () => {
    console.log(`DWP server running at ${config.publicUrl} (port ${config.port})`);
  });
  // WebSocket endpoint (/ws) for chat + notification push.
  try {
    require("./lib/realtime").attach(server);
  } catch (err) {
    console.error("[realtime] disabled:", err.message);
  }
}

module.exports = app;

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");
const config = require("../config");
const { query } = require("../db/pool");
const { applyPatch, allowedKeysFor } = require("../lib/patch");
const { requireAuth, isAdminUser } = require("../middleware/auth");
const { runClientSideEffects } = require("../lib/docEvents");
const { notifyAdmins } = require("../lib/notify");
const realtime = require("../lib/realtime");

const router = express.Router();
router.use(requireAuth);

const ALLOWED_PROOF_MIME = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

async function loadApplication(userId) {
  const { rows } = await query("SELECT uid, doc, created_at FROM applications WHERE user_id = $1", [userId]);
  if (!rows[0]) return null;
  return { id: rows[0].uid, data: rows[0].doc };
}

function computeAccess(user, application) {
  if (isAdminUser(user)) {
    return { allowed: true, reason: "admin", status: "admin", data: application ? application.data : null };
  }
  if (!application) {
    return { allowed: false, reason: "no_application", status: null, data: null };
  }
  const doc = application.data;
  const status = String(doc.status || "pending").toLowerCase();
  if (status === "approved") {
    return { allowed: true, reason: "approved", status, data: doc };
  }
  if (doc.accountActivated || doc.depositSubmitted) {
    return { allowed: true, reason: "activated", status, data: doc };
  }
  return { allowed: false, reason: status, status, data: doc };
}

async function saveDocument(userId, doc) {
  const now = new Date();
  await query(
    `UPDATE applications
        SET doc = $2::jsonb,
            status = $3,
            account_activated = $4,
            deposit_submitted = $5,
            full_name = $6,
            email = $7,
            llc_name = $8,
            updated_at = $9
      WHERE user_id = $1`,
    [
      userId,
      JSON.stringify(doc),
      String(doc.status || "pending").toLowerCase(),
      doc.accountActivated === true,
      doc.depositSubmitted === true,
      doc.fullName || null,
      doc.email || null,
      doc.llcName || null,
      doc.updatedAt && !Number.isNaN(Date.parse(doc.updatedAt)) ? new Date(doc.updatedAt) : now,
    ]
  );
}

// GET /api/me
router.get("/", async (req, res) => {
  const application = await loadApplication(req.user.id);
  const access = computeAccess(req.user, application);
  res.json({ user: req.userView, application: application ? application.data : null, access });
});

// GET /api/me/access — drives the frontend access gate
router.get("/access", async (req, res) => {
  const application = await loadApplication(req.user.id);
  res.json(computeAccess(req.user, application));
});

// GET /api/me/application — single document (doc-reference shim reads)
router.get("/application", async (req, res) => {
  const application = await loadApplication(req.user.id);
  res.json(application ? { id: application.id, data: application.data } : { id: null, data: null });
});

// PATCH /api/me/application — client deposit / withdrawal submissions
router.patch("/application", async (req, res) => {
  const application = await loadApplication(req.user.id);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Application not found." } });
  }

  const patch = req.body && typeof req.body === "object" ? req.body : {};
  const { doc, rejected } = applyPatch(application.data, patch, allowedKeysFor("client"));
  if (rejected.length > 0) {
    return res.status(403).json({
      error: {
        code: "permission-denied",
        message: `Not allowed to update: ${rejected.join(", ")}`,
        fields: rejected,
      },
    });
  }

  await saveDocument(req.user.id, doc);

  // New deposit / withdrawal submissions -> admin emails + notifications.
  runClientSideEffects({ user: req.user, oldDoc: application.data, newDoc: doc }).catch(() => {});

  res.json({ application: doc });
});

// ---------------------------------------------------------------------------
// Chat — the client side of the admin conversation
// ---------------------------------------------------------------------------

// GET /api/me/chats/messages — full history; also marks admin messages read
router.get("/chats/messages", async (req, res) => {
  const { rows } = await query(
    `SELECT id, text, from_ AS "from", sender_email AS "senderEmail", created_at AS "createdAt", read_at AS "readAt"
       FROM chat_messages
      WHERE user_id = $1
      ORDER BY created_at ASC
      LIMIT 300`,
    [req.user.id]
  );
  const unreadFromAdmin = rows.filter((row) => row.from === "admin" && !row.readAt).length;
  await query(
    "UPDATE chat_messages SET read_at = now() WHERE user_id = $1 AND from_ = 'admin' AND read_at IS NULL",
    [req.user.id]
  );
  res.json({ messages: rows, unreadFromAdmin });
});

// POST /api/me/chats/messages — client reply
router.post("/chats/messages", async (req, res) => {
  const text = String((req.body || {}).text || "").trim();
  if (!text) {
    return res.status(400).json({ error: { code: "invalid-argument", message: "Message text is required." } });
  }
  if (text.length > 2000) {
    return res.status(400).json({ error: { code: "invalid-argument", message: "Message must be 2000 characters or fewer." } });
  }
  const { rows } = await query(
    `INSERT INTO chat_messages (user_id, text, from_, sender_email)
     VALUES ($1, $2, 'client', $3)
     RETURNING id, created_at`,
    [req.user.id, text, req.user.email || null]
  );
  const message = {
    id: String(rows[0].id),
    text,
    from: "client",
    senderEmail: req.user.email || null,
    createdAt: rows[0].created_at,
    readAt: null,
  };

  notifyAdmins({
    type: "chat",
    title: "New client message",
    body: `${req.userView.displayName || req.user.email}: ${text.slice(0, 140)}`,
    link: `chat:${String(req.user.id)}`,
  }).catch(() => {});
  realtime.emitToAdmins("chat:new", { message, userId: String(req.user.id) });

  res.status(201).json({ message });
});

// POST /api/me/deposits/proof — multipart upload.
// With Cloudinary configured, the file is buffered and streamed to Cloudinary;
// otherwise it is stored on local disk under /uploads (both paths supported).
const useCloudinary = config.cloudinary.enabled;
if (useCloudinary) {
  cloudinary.config({
    cloud_name: config.cloudinary.cloudName,
    api_key: config.cloudinary.apiKey,
    api_secret: config.cloudinary.apiSecret,
    secure: true,
  });
}

function uploadToCloudinary(file, userId) {
  return new Promise(function (resolve, reject) {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "dwp/deposits/" + String(userId),
        resource_type: "auto",
        overwrite: false,
      },
      function (err, result) {
        if (err) reject(err);
        else resolve(result);
      }
    );
    stream.end(file.buffer);
  });
}

const proofFilter = function (req, file, cb) {
  const mime = (file.mimetype || "").toLowerCase();
  if (ALLOWED_PROOF_MIME.includes(mime)) return cb(null, true);
  const err = new Error("Unsupported file type. Upload a JPG, PNG, GIF, WEBP, HEIC or PDF.");
  err.code = "storage/unsupported-file-type";
  return cb(err);
};

const proofUpload = multer({
  storage: useCloudinary
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination(req, file, cb) {
          const dir = path.join(config.uploadDir, "deposits", String(req.user.id));
          fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename(req, file, cb) {
          const safe = path.basename(file.originalname || "proof").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
          cb(null, `${Date.now()}_${safe}`);
        },
      }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: proofFilter,
});

router.post("/deposits/proof", (req, res) => {
  proofUpload.single("file")(req, res, async (err) => {
    if (err) {
      const status = err.code === "LIMIT_FILE_SIZE" ? 400 : 400;
      return res.status(status).json({
        error: { code: err.code === "LIMIT_FILE_SIZE" ? "storage/retry-limit-exceeded" : "storage/invalid-file", message: err.message },
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: { code: "storage/no-file", message: "No file uploaded." } });
    }

    let relPath;
    let url;
    if (useCloudinary) {
      let result;
      try {
        result = await uploadToCloudinary(req.file, req.user.id);
      } catch (cloudErr) {
        console.error("Cloudinary upload failed:", cloudErr && cloudErr.message);
        return res.status(502).json({
          error: { code: "storage/upload-failed", message: "Could not upload payment proof. Please try again." },
        });
      }
      relPath = result.public_id;
      url = result.secure_url;
    } else {
      relPath = path.posix.join("deposits", String(req.user.id), req.file.filename);
      url = `${config.publicUrl}/uploads/${relPath}`;
    }

    await query(
      `INSERT INTO deposit_uploads (user_id, path, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, relPath, req.file.originalname, req.file.mimetype, req.file.size]
    );

    res.json({
      path: relPath,
      url,
      fileName: req.file.originalname,
      type: req.file.mimetype,
      size: req.file.size,
    });
  });
});

// GET /api/me/deposits/:id/status — receipt badge polling (replaces onSnapshot)
router.get("/deposits/:id/status", async (req, res) => {
  const application = await loadApplication(req.user.id);
  if (!application) {
    return res.status(404).json({ error: { code: "not-found", message: "Application not found." } });
  }
  const history = Array.isArray(application.data.depositHistory) ? application.data.depositHistory : [];
  const entry = history.find((item) => item && item.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: { code: "not-found", message: "Deposit not found." } });
  }
  res.json({
    id: entry.id,
    status: entry.status,
    accountActivated: application.data.accountActivated === true,
    updatedAt: application.data.updatedAt || null,
  });
});

// GET /api/me/proof/:path — private proof download for the signed-in owner
router.get("/proof/*", async (req, res) => {
  const rel = req.params[0];
  const safe = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.join(config.uploadDir, safe);
  if (!abs.startsWith(config.uploadDir)) {
    return res.status(400).json({ error: { code: "storage/invalid-path", message: "Invalid path." } });
  }
  if (!fs.existsSync(abs)) {
    // Cloudinary-stored proofs are addressed by public id (dwp/...) - redirect
    if (useCloudinary && /^dwp\/[\w/-]+$/.test(safe)) {
      return res.redirect(302, cloudinary.url(safe, { secure: true }));
    }
    return res.status(404).json({ error: { code: "storage/object-not-found", message: "File not found." } });
  }
  res.sendFile(abs);
});

module.exports = router;
module.exports.loadApplication = loadApplication;
module.exports.computeAccess = computeAccess;
module.exports.saveDocument = saveDocument;

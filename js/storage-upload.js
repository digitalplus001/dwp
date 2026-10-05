/**
 * Deposit proof uploads — multipart POST to the API (replaces Firebase Storage).
 */
(function () {
  window.DWP = window.DWP || {};

  const ALLOWED_PROOF_TYPES = {
    "image/jpeg": true,
    "image/png": true,
    "image/gif": true,
    "image/webp": true,
    "image/heic": true,
    "image/heif": true,
    "application/pdf": true
  };

  const EXT_TO_TYPE = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    pdf: "application/pdf"
  };

  function extensionFromName(name) {
    const m = String(name || "").match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : "";
  }

  DWP.normalizeProofContentType = function (file) {
    const raw = (file && file.type ? String(file.type) : "").toLowerCase().trim();
    if (raw && ALLOWED_PROOF_TYPES[raw]) return raw;
    const ext = extensionFromName(file && file.name);
    if (ext && EXT_TO_TYPE[ext]) return EXT_TO_TYPE[ext];
    return "image/jpeg";
  };

  DWP.validateDepositProofFile = function (file) {
    if (!file) return "Please choose a payment proof file.";
    if (file.size <= 0) return "That file is empty. Choose another image or PDF.";
    if (file.size > 5 * 1024 * 1024) {
      return "Payment proof must be under 5 MB.";
    }
    const type = DWP.normalizeProofContentType(file);
    if (!ALLOWED_PROOF_TYPES[type]) {
      return "Use a JPG, PNG, GIF, WebP, HEIC, or PDF under 5 MB.";
    }
    return null;
  };

  DWP.getStorageErrorMessage = function (err) {
    const code = err && err.code ? String(err.code) : "";
    const msg = err && err.message ? String(err.message) : "";
    switch (code) {
      case "storage/unsupported-file-type":
      case "storage/invalid-file":
      case "storage/invalid-argument":
        return "Invalid file for upload. Use JPG, PNG, GIF, WEBP, HEIC or PDF under 5 MB.";
      case "storage/no-file":
        return "No file was uploaded. Choose your payment proof and try again.";
      case "storage/retry-limit-exceeded":
        return "Upload is over 5 MB. Choose a smaller file.";
      case "auth/network-request-failed":
        return "Upload timed out. Check your connection and try again.";
      default:
        if (code) return "Upload failed (" + code + "). " + (msg || "Try again or contact support.");
        return "Could not upload payment proof. Please try again or contact support.";
    }
  };

  DWP.uploadDepositProof = async function (uid, file) {
    DWP.requireFirebase();
    if (!uid || !file) {
      throw new Error("Missing user or file for upload.");
    }

    const validation = DWP.validateDepositProofFile(file);
    if (validation) {
      throw new Error(validation);
    }

    const contentType = DWP.normalizeProofContentType(file);
    const formData = new FormData();
    formData.append("file", file, file.name);

    try {
      const json = await DWP.apiUpload("/api/me/deposits/proof", formData);
      const serverUrl = json.url ? String(json.url) : "";
      return {
        storagePath: json.path,
        // Cloudinary responses carry an absolute secure URL; disk uploads fall
        // back to the local /uploads path.
        downloadUrl: serverUrl || "/uploads/" + String(json.path || "").replace(/^\/+/, ""),
        fileName: json.fileName || file.name,
        contentType: json.type || contentType,
        size: json.size || file.size
      };
    } catch (err) {
      const wrapped = new Error(DWP.getStorageErrorMessage(err));
      wrapped.code = err && err.code;
      wrapped.cause = err;
      throw wrapped;
    }
  };

  DWP.getDepositProofUrl = async function (storagePath) {
    if (!storagePath) return null;
    if (/^https?:\/\//i.test(storagePath) || storagePath.indexOf("//") === 0) {
      return storagePath;
    }
    if (storagePath.indexOf("dwp/") === 0) {
      return "/api/me/proof/" + storagePath;
    }
    return "/uploads/" + String(storagePath).replace(/^\/+/, "");
  };
})();

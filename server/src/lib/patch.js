const ISO = () => new Date().toISOString();

// Keys a signed-in client may change on its OWN application document.
// Mirrors the legacy Firestore security rules (clients never write
// transactions, portfolio, status, activation flags, ...).
const CLIENT_KEYS = new Set([
  "depositSubmitted",
  "depositSubmittedAt",
  "depositAmountCurrency",
  "depositMethod",
  "depositNetwork",
  "depositNetworkLabel",
  "depositAmount",
  "depositProcessingFee",
  "depositTotalCredit",
  "depositWallet",
  "depositUsdPriceAtSubmit",
  "depositTokenEquivalent",
  "depositProofFileName",
  "depositProofType",
  "depositProofUploaded",
  "depositProofStoragePath",
  "depositProofUrl",
  "depositProofSize",
  "depositHistory",
  "withdrawalHistory",
  "lastWithdrawalRequest",
  "updatedAt",
]);

// Every key the admin UI is allowed to write (full document access).
const ADMIN_KEYS = new Set([
  ...CLIENT_KEYS,
  "uid",
  "email",
  "phone",
  "fullName",
  "dob",
  "streetAddress",
  "country",
  "state",
  "city",
  "ssn",
  "llcName",
  "formationState",
  "formationDate",
  "ownershipType",
  "primaryAsset",
  "assetValue",
  "useCase",
  "printedName",
  "signatureDate",
  "authorization",
  "status",
  "accountActivated",
  "depositConfirmed",
  "activatedAt",
  "reviewedAt",
  "reviewedBy",
  "transactions",
  "portfolio",
  "cryptoHoldings",
  "adminPortfolioOverride",
  "profitHistory",
  "allocation",
  "investments",
  "purchaseHistory",
  "activities",
]);

function isServerTimestamp(value) {
  return value !== null && typeof value === "object" && value.__serverTimestamp === true;
}

function isArrayUnion(value) {
  return value !== null && typeof value === "object" && Array.isArray(value.__arrayUnion);
}

function isInvalid(value) {
  return value === undefined || (typeof value === "number" && Number.isNaN(value));
}

function resolveValue(value) {
  if (isServerTimestamp(value)) return ISO();
  if (isArrayUnion(value)) return { __append: value.__arrayUnion };
  return value;
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split(".");
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (typeof node[key] !== "object" || node[key] === null || Array.isArray(node[key])) {
      node[key] = {};
    }
    node = node[key];
  }
  const leaf = parts[parts.length - 1];
  if (value && typeof value === "object" && !Array.isArray(value) && value.__append) {
    const current = Array.isArray(node[leaf]) ? node[leaf] : [];
    const next = current.slice();
    for (const item of value.__append) {
      if (!next.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) {
        next.push(item);
      }
    }
    node[leaf] = next;
    return;
  }
  node[leaf] = value;
}

function getPath(target, dottedPath) {
  const parts = dottedPath.split(".");
  let node = target;
  for (const key of parts) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Applies a legacy-style patch object to a document.
 * Supports dotted paths, `{__serverTimestamp:true}` and `{__arrayUnion:[...]}`.
 * Returns { doc, rejected } where rejected lists disallowed top-level keys.
 */
function applyPatch(doc, patch, allowedKeys) {
  const next = JSON.parse(JSON.stringify(doc));
  const rejected = [];
  for (const [rawKey, rawValue] of Object.entries(patch || {})) {
    const topKey = rawKey.split(".")[0];
    if (!allowedKeys.has(topKey)) {
      rejected.push(rawKey);
      continue;
    }
    const value = resolveValue(rawValue);
    if (isInvalid(value)) continue;
    setPath(next, rawKey, value);
  }
  return { doc: next, rejected };
}

function allowedKeysFor(role) {
  return role === "admin" ? ADMIN_KEYS : CLIENT_KEYS;
}

function get(doc, dottedPath) {
  return getPath(doc, dottedPath);
}

module.exports = { applyPatch, allowedKeysFor, CLIENT_KEYS, ADMIN_KEYS, get };

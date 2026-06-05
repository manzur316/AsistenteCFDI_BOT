const path = require("path");

const ALLOWED_EXTENSIONS = Object.freeze(["xml", "pdf", "json", "csv", "md"]);
const DEFAULT_MAX_FILE_NAME_LENGTH = 140;
const RFC_RE = /\b[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}\b/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const UID_RE = /\b(?:CFDI[-_]?UID|PAC[-_]?UID|CLIENT[-_]?UID|UID)[-_A-Z0-9]{3,}\b/i;
const SECRET_RE = /(token|secret|api[-_ ]?key|password|authorization|F-Api-Key|F-Secret-Key|F-PLUGIN|FACTURACOM_[A-Z_]*(?:KEY|PLUGIN))/i;
const SAFE_SEGMENT_RE = /^[A-Za-z0-9._-]+$/;

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || "";
}

function stripDiacritics(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasUnsafeSensitiveValue(value) {
  const candidate = text(value);
  return RFC_RE.test(candidate)
    || UUID_RE.test(candidate)
    || UID_RE.test(candidate)
    || SECRET_RE.test(candidate)
    || /[A-Za-z]:[\\/]/.test(candidate)
    || candidate.includes("\\")
    || candidate.includes("/")
    || candidate.includes("..")
    || /<\?xml|<cfdi:Comprobante|%PDF/i.test(candidate);
}

function compactDashes(value) {
  return value.replace(/[-_]{2,}/g, "-").replace(/^-+|-+$/g, "");
}

function makeSafeClientSlug(input, options = {}) {
  const fallback = text(options.fallback) || "CLIENT-UNKNOWN";
  const prefix = text(options.prefix) || "CLIENT";
  const maxLength = Number.isFinite(Number(options.maxLength)) ? Number(options.maxLength) : 48;
  let base = stripDiacritics(input || fallback).toUpperCase();
  base = base.replace(RFC_RE, "");
  base = base.replace(UUID_RE, "");
  base = base.replace(UID_RE, "");
  base = base.replace(/\b(S\.?A\.?|SAPI|S\.? DE R\.?L\.?|DE|DEL|LA|EL|LOS|LAS|CV|C\.?V\.?|SC|AC|A\.?C\.?)\b/g, " ");
  base = base.replace(/[^A-Z0-9]+/g, "-");
  base = compactDashes(base);
  if (!base || hasUnsafeSensitiveValue(base)) base = fallback;
  if (!base.startsWith(`${prefix}-`)) base = `${prefix}-${base}`;
  return compactDashes(base).slice(0, maxLength).replace(/-+$/g, "") || fallback;
}

function safeInternalId(value, fallback = "DRAFT-UNKNOWN") {
  let id = stripDiacritics(value || fallback).toUpperCase();
  if (!id || hasUnsafeSensitiveValue(id)) id = fallback;
  id = id.replace(/[^A-Z0-9._-]+/g, "-");
  id = compactDashes(id).slice(0, 48).replace(/-+$/g, "");
  return id || fallback;
}

function normalizeDate(value) {
  const candidate = text(value);
  const match = candidate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const date = candidate ? new Date(candidate) : new Date();
  if (!Number.isFinite(date.getTime())) return "1970-01-01";
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function normalizeStatus(value) {
  const status = stripDiacritics(value || "SANDBOX_UNKNOWN").toUpperCase().replace(/[^A-Z0-9_]+/g, "_");
  return status.slice(0, 32) || "SANDBOX_UNKNOWN";
}

function normalizeExtension(value) {
  const ext = text(value).replace(/^\./, "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error(`Extension no permitida para storage sandbox: ${ext || "N/A"}`);
  }
  return ext;
}

function makeHumanReadableCfdiFileName(input = {}) {
  const date = normalizeDate(input.date || input.timestamp || input.created_at);
  const clientSlug = makeSafeClientSlug(input.client_slug || input.client_id || input.client_name);
  const internalId = safeInternalId(input.draft_id || input.internal_invoice_id || input.invoice_id);
  const status = normalizeStatus(input.status || input.invoice_status);
  const extension = normalizeExtension(input.extension || input.ext);
  const fileName = `${date}_${clientSlug}_${internalId}_${status}.${extension}`;
  const trimmed = fileName.length > DEFAULT_MAX_FILE_NAME_LENGTH
    ? `${fileName.slice(0, DEFAULT_MAX_FILE_NAME_LENGTH - extension.length - 1).replace(/[._-]+$/g, "")}.${extension}`
    : fileName;
  const validation = validateHumanReadableCfdiFileName(trimmed);
  if (!validation.ok) throw new Error(`Nombre CFDI sandbox inseguro: ${validation.errors.join(", ")}`);
  return trimmed;
}

function validateHumanReadableCfdiFileName(fileName) {
  const errors = [];
  const value = text(fileName);
  const ext = path.extname(value).replace(/^\./, "").toLowerCase();
  if (!value) errors.push("file_name_required");
  if (value.length > DEFAULT_MAX_FILE_NAME_LENGTH) errors.push("file_name_too_long");
  if (value.includes("/") || value.includes("\\") || value.includes(":")) errors.push("path_separator_or_drive_forbidden");
  if (value.includes("..")) errors.push("path_traversal_forbidden");
  if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) errors.push("extension_not_allowed");
  if (RFC_RE.test(value)) errors.push("rfc_forbidden");
  if (UUID_RE.test(value)) errors.push("uuid_forbidden");
  if (UID_RE.test(value)) errors.push("uid_forbidden");
  if (SECRET_RE.test(value)) errors.push("secret_forbidden");
  if (!/^[A-Za-z0-9._-]+$/.test(value)) errors.push("unsafe_characters");
  return { ok: errors.length === 0, errors };
}

function sanitizeStorageRelativePath(relativePath) {
  const raw = text(relativePath).replace(/\\/g, "/");
  if (!raw) return "";
  if (path.isAbsolute(raw) || /^[A-Za-z]:\//.test(raw)) throw new Error("Ruta absoluta no permitida en storage sandbox.");
  const segments = raw.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Path traversal no permitido en storage sandbox.");
  }
  return segments
    .map((segment) => {
      let safe = stripDiacritics(segment).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
      if (!safe || hasUnsafeSensitiveValue(safe) || !SAFE_SEGMENT_RE.test(safe)) safe = "REDACTED";
      return safe.slice(0, 96);
    })
    .join("/");
}

module.exports = {
  ALLOWED_EXTENSIONS,
  makeHumanReadableCfdiFileName,
  makeSafeClientSlug,
  sanitizeStorageRelativePath,
  validateHumanReadableCfdiFileName,
};

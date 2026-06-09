const path = require("path");

const SECRET_KEY_RE = /(api[_-]?key|secret|password|authorization|token|bot[_-]?token|f[-_]?secret|f[-_]?plugin|credential|csd|file[_-]?path)/i;
const TELEGRAM_TOKEN_RE = /\b(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
const GENERIC_TOKEN_RE = /\bcfdi:[A-Za-z0-9_-]{12,40}\b/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const RFC_RE = /\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const FACTURA_COM_TOKEN_RE = /\b(?:F-[A-Z0-9_-]{12,}|FACTURACOM[_-][A-Z0-9_-]{10,})\b/gi;
const FACTURA_COM_KEY_LABEL_RE = /\bfactura\.?com\s+api\s+key\b/gi;
const XML_CONTENT_RE = /<\?xml[\s\S]*?(?:<\/cfdi:Comprobante>|<\/Comprobante>|$)/gi;
const PDF_HEADER_RE = /%PDF-[\s\S]*/g;

function hashText(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function redactIdentifier(value, label = "id") {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return `[REDACTED_${label.toUpperCase()}:${text.length}:${hashText(text)}]`;
}

function maskEmail(value) {
  const text = String(value || "");
  return text.replace(EMAIL_RE, (email) => {
    const [local, domain] = email.split("@");
    return `${local.slice(0, 1) || "*"}***@${domain ? domain.replace(/^[^.]+/, "***") : "***"}`;
  });
}

function sanitizeString(value, key = "") {
  let text = String(value ?? "");
  if (!text) return text;
  if (/chat_?id|telegram_?user_?id/i.test(key) && /^[0-9-]{5,}$/.test(text.trim())) return redactIdentifier(text, "chat_id");
  if (/rfc/i.test(key)) return text.replace(RFC_RE, "[REDACTED_RFC]");
  if (/provider_client_uid|client_uid|cfdi_uid|pac_invoice_id|provider_email|provider-email|provideruid|provider_uid/i.test(key) && text.length > 4) {
    return redactIdentifier(text, key);
  }
  if (/email|recipient/i.test(key)) text = maskEmail(text);
  text = text
    .replace(TELEGRAM_TOKEN_RE, "[REDACTED_TELEGRAM_BOT_TOKEN]")
    .replace(GENERIC_TOKEN_RE, "cfdi:[REDACTED_ACTION_TOKEN]")
    .replace(FACTURA_COM_TOKEN_RE, "[REDACTED_FACTURACOM_TOKEN]")
    .replace(FACTURA_COM_KEY_LABEL_RE, "[REDACTED_FACTURACOM_TOKEN]")
    .replace(EMAIL_RE, (email) => maskEmail(email))
    .replace(RFC_RE, "[REDACTED_RFC]")
    .replace(UUID_RE, "[REDACTED_UUID]")
    .replace(XML_CONTENT_RE, "[REDACTED_XML_CONTENT]")
    .replace(PDF_HEADER_RE, "[REDACTED_PDF_CONTENT]");
  const repoRoot = path.resolve(__dirname, "../..").replace(/\\/g, "/");
  const windowsPath = text
    .replace(/[A-Za-z]:\\[^"'<>\\r\\n]+/g, (absolutePath) => {
      const normalized = absolutePath.replace(/\\/g, "/");
      if (normalized.startsWith(repoRoot) && normalized.includes("/runtime/")) return normalized.slice(repoRoot.length + 1);
      if (normalized.startsWith(repoRoot)) return normalized.slice(repoRoot.length + 1);
      return "[REDACTED_ABSOLUTE_PATH]";
    });
  return windowsPath.replace(/[A-Za-z]:\/(?!\/)[^"'<>\\r\\n]+/g, (absolutePath) => {
    const normalized = absolutePath.replace(/\\/g, "/");
    if (normalized.startsWith(repoRoot) && normalized.includes("/runtime/")) return normalized.slice(repoRoot.length + 1);
    if (normalized.startsWith(repoRoot)) return normalized.slice(repoRoot.length + 1);
    return "[REDACTED_ABSOLUTE_PATH]";
  });
}

function sanitizeValue(value, key = "") {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    if (SECRET_KEY_RE.test(key)) return value ? "[REDACTED_SECRET]" : value;
    return sanitizeString(value, key);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    if (/chat_?id|telegram_?user_?id/i.test(key)) return redactIdentifier(value, "chat_id");
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, key));
  if (typeof value === "object") {
    const output = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(childKey)) {
        output[childKey] = childValue ? "[REDACTED_SECRET]" : childValue;
      } else {
        output[childKey] = sanitizeValue(childValue, childKey);
      }
    }
    return output;
  }
  return value;
}

function sanitizeReport(report) {
  return sanitizeValue(report);
}

module.exports = {
  redactIdentifier,
  sanitizeReport,
  sanitizeString,
  sanitizeValue,
};

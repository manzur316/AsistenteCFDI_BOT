const DOCUMENT_DELIVERY_SCHEMA_VERSION = "canonical_document_delivery_request.v1";
const DOCUMENT_DELIVERY_RESULT_SCHEMA_VERSION = "canonical_document_delivery_result.v1";

const DOCUMENT_DELIVERY_CHANNELS = Object.freeze({
  PROVIDER_EMAIL: "PROVIDER_EMAIL",
  TELEGRAM_DOCUMENT_CHANNEL: "TELEGRAM_DOCUMENT_CHANNEL",
  SMTP_FUTURE_OPTIONAL: "SMTP_FUTURE_OPTIONAL",
});

const DOCUMENT_DELIVERY_STATUSES = Object.freeze({
  READY: "READY",
  SENT: "SENT",
  DRY_RUN: "DRY_RUN",
  NEEDS_CONFIG: "NEEDS_CONFIG",
  NEEDS_DOCUMENTS: "NEEDS_DOCUMENTS",
  NEEDS_RECIPIENT: "NEEDS_RECIPIENT",
  BLOCKED_INVALID_DOCUMENTS: "BLOCKED_INVALID_DOCUMENTS",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  ERROR: "ERROR",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (Object.values(DOCUMENT_DELIVERY_CHANNELS).includes(normalized)) return normalized;
  return DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL;
}

function redactEmail(value) {
  const email = text(value);
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  const first = local.slice(0, 1) || "*";
  return `${first}***@${domain.toLowerCase()}`;
}

function safePath(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^[A-Za-z]:[\\/]/.test(raw) || raw.startsWith("/") || raw.includes("..")) return "[BLOCKED_PATH]";
  return raw.replace(/\\/g, "/");
}

function documentsValid(documents = {}, policy = {}) {
  const requireValid = policy.require_valid_documents !== false;
  if (!requireValid) return Boolean(documents.xml_path || documents.pdf_path);
  return documents.xml_content_valid === true && documents.pdf_content_valid === true && Boolean(documents.xml_path && documents.pdf_path);
}

function buildCanonicalDocumentDeliveryRequest(input = {}) {
  const policy = {
    dry_run: input.delivery_policy?.dry_run !== false,
    require_valid_documents: input.delivery_policy?.require_valid_documents !== false,
    allow_sandbox: input.delivery_policy?.allow_sandbox !== false,
    allow_production: input.delivery_policy?.allow_production === true,
  };
  const documents = input.documents || {};
  return {
    schema_version: DOCUMENT_DELIVERY_SCHEMA_VERSION,
    provider: text(input.provider) || "factura_com",
    environment: text(input.environment) || "SANDBOX",
    draft_id: text(input.draft_id),
    client_id: text(input.client_id),
    invoice_ref: input.invoice_ref || {},
    channel: normalizeChannel(input.channel),
    recipient: {
      email: text(input.recipient?.email),
      email_redacted: redactEmail(input.recipient?.email),
      source: text(input.recipient?.source),
      confirmed: input.recipient?.confirmed === true,
    },
    documents: {
      xml_path: safePath(documents.xml_path),
      pdf_path: safePath(documents.pdf_path),
      xml_content_valid: documents.xml_content_valid === true,
      pdf_content_valid: documents.pdf_content_valid === true,
      xml_sha256: text(documents.xml_sha256),
      pdf_sha256: text(documents.pdf_sha256),
      xml_size_bytes: Number.isFinite(Number(documents.xml_size_bytes)) ? Number(documents.xml_size_bytes) : null,
      pdf_size_bytes: Number.isFinite(Number(documents.pdf_size_bytes)) ? Number(documents.pdf_size_bytes) : null,
    },
    delivery_policy: policy,
    metadata: input.metadata || {},
  };
}

function validateCanonicalDocumentDeliveryRequest(request = {}) {
  const errors = [];
  const warnings = [];
  if (request.schema_version !== DOCUMENT_DELIVERY_SCHEMA_VERSION) errors.push("DOCUMENT_DELIVERY_SCHEMA_INVALID");
  if (!Object.values(DOCUMENT_DELIVERY_CHANNELS).includes(request.channel)) errors.push("DOCUMENT_DELIVERY_CHANNEL_INVALID");
  if (String(request.environment || "").toUpperCase() === "PRODUCTION" && request.delivery_policy?.allow_production !== true) {
    errors.push("DOCUMENT_DELIVERY_PRODUCTION_BLOCKED");
  }
  if (request.delivery_policy?.require_valid_documents !== false && !documentsValid(request.documents, request.delivery_policy)) {
    errors.push("DOCUMENTS_NOT_VALID");
  }
  if (request.channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL && !text(request.recipient?.email)) errors.push("RECIPIENT_EMAIL_REQUIRED");
  if (request.channel === DOCUMENT_DELIVERY_CHANNELS.SMTP_FUTURE_OPTIONAL) errors.push("SMTP_NOT_IMPLEMENTED");
  if (request.recipient?.email && request.recipient.confirmed !== true) warnings.push("RECIPIENT_EMAIL_NOT_CONFIRMED");
  return { ok: errors.length === 0, errors, warnings };
}

function buildCanonicalDocumentDeliveryResult(input = {}) {
  return {
    schema_version: DOCUMENT_DELIVERY_RESULT_SCHEMA_VERSION,
    ok: input.ok === true,
    provider: text(input.provider) || "factura_com",
    environment: text(input.environment) || "SANDBOX",
    channel: normalizeChannel(input.channel),
    status: text(input.status) || DOCUMENT_DELIVERY_STATUSES.ERROR,
    draft_id: text(input.draft_id),
    client_id: text(input.client_id),
    recipient_present: input.recipient_present === true,
    recipient_email_redacted: redactEmail(input.recipient_email),
    documents_valid: input.documents_valid === true,
    sent_at: text(input.sent_at),
    provider_message: text(input.provider_message),
    evidence: input.evidence || {},
    retryable: input.retryable === true,
    normalized_errors: Array.isArray(input.normalized_errors) ? input.normalized_errors : [],
    normalized_warnings: Array.isArray(input.normalized_warnings) ? input.normalized_warnings : [],
  };
}

module.exports = {
  DOCUMENT_DELIVERY_CHANNELS,
  DOCUMENT_DELIVERY_SCHEMA_VERSION,
  DOCUMENT_DELIVERY_RESULT_SCHEMA_VERSION,
  DOCUMENT_DELIVERY_STATUSES,
  buildCanonicalDocumentDeliveryRequest,
  buildCanonicalDocumentDeliveryResult,
  documentsValid,
  normalizeChannel,
  redactEmail,
  validateCanonicalDocumentDeliveryRequest,
};

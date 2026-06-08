const crypto = require("crypto");
const path = require("path");

const {
  DOCUMENT_DELIVERY_CHANNELS,
  redactEmail,
} = require("./canonical-document-delivery-contract");
const { runPsqlJson, runPsqlRaw } = require("../local-db-psql-runner");

const LEDGER_STATUSES = Object.freeze({
  DRY_RUN: "DRY_RUN",
  READY: "READY",
  SENT: "SENT",
  BLOCKED_DUPLICATE: "BLOCKED_DUPLICATE",
  NEEDS_CONFIG: "NEEDS_CONFIG",
  NEEDS_DOCUMENTS: "NEEDS_DOCUMENTS",
  NEEDS_RECIPIENT: "NEEDS_RECIPIENT",
  BLOCKED_INVALID_DOCUMENTS: "BLOCKED_INVALID_DOCUMENTS",
  BLOCKED_PROVIDER_PDF_INVALID: "BLOCKED_PROVIDER_PDF_INVALID",
  PROVIDER_ERROR: "PROVIDER_ERROR",
  TELEGRAM_ERROR: "TELEGRAM_ERROR",
  ERROR: "ERROR",
});

const repoRoot = path.resolve(__dirname, "../../..");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function shortHash(value) {
  const raw = text(value);
  return raw ? sha256Text(raw).slice(0, 16) : "none";
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlBool(value) {
  return value === true ? "true" : "false";
}

function sqlInt(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(Math.trunc(number)) : "NULL";
}

function sqlJson(value) {
  return `${sqlQuote(JSON.stringify(sanitizeEvidence(value === undefined ? null : value)))}::jsonb`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRuntimePath(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^runtime[\\/]/i.test(raw)) return raw.replace(/\\/g, "/");
  const resolved = path.resolve(raw);
  if (isInside(repoRoot, resolved)) {
    const relative = path.relative(repoRoot, resolved).replace(/\\/g, "/");
    return relative.startsWith("runtime/") ? relative : null;
  }
  return null;
}

function sanitizeEvidence(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const safePath = safeRuntimePath(value);
    if (safePath) return safePath;
    if (/^[A-Za-z]:[\\/]|^\//.test(value)) return "[BLOCKED_PATH]";
    return value
      .replace(/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
      .replace(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[redacted-rfc]")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "[redacted-uuid]")
      .replace(/<\?xml[\s\S]*$/i, "[xml-hidden]")
      .replace(/%PDF[\s\S]*$/i, "[pdf-hidden]")
      .replace(/\r?\n/g, " ")
      .slice(0, 500);
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (/token|secret|password|api[-_ ]?key|f-api-key|f-secret-key|plugin|authorization/i.test(key)) {
        out[key] = "[REDACTED]";
      } else if (/email$/i.test(key) && typeof child === "string") {
        out[key] = redactEmail(child);
      } else if (/chat_id|user_id/i.test(key) && typeof child === "string") {
        out[key] = `hash:${shortHash(child)}`;
      } else {
        out[key] = sanitizeEvidence(child);
      }
    }
    return out;
  }
  return null;
}

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(LEDGER_STATUSES).includes(normalized) ? normalized : LEDGER_STATUSES.ERROR;
}

function normalizeChannel(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (Object.values(DOCUMENT_DELIVERY_CHANNELS).includes(normalized)) return normalized;
  return DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL;
}

function destinationFingerprint(input = {}) {
  if (input.recipient_fingerprint) return String(input.recipient_fingerprint);
  if (input.channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL || input.channel === "PROVIDER_EMAIL") {
    return `email:${shortHash(input.recipient_email || input.recipient_redacted || "")}`;
  }
  return `telegram:${shortHash(input.telegram_chat_id || input.telegram_chat_id_redacted || input.recipient_redacted || "")}`;
}

function buildDeliveryIdempotencyKey(input = {}) {
  const environment = text(input.environment) || "SANDBOX";
  const draftId = text(input.draft_id) || "DRAFT_UNKNOWN";
  const channel = normalizeChannel(input.channel);
  const destination = destinationFingerprint({ ...input, channel });
  const xmlHash = text(input.xml_sha256) || "xml_missing";
  const pdfHash = text(input.pdf_sha256) || "pdf_missing";
  return [
    "document_delivery",
    environment,
    draftId,
    channel,
    destination,
    xmlHash,
    pdfHash,
  ].join(":");
}

function buildDeliveryId(input = {}) {
  const timestamp = String(input.timestamp || new Date().toISOString()).replace(/[-:.TZ]/g, "");
  const draftPart = String(input.draft_id || "draft").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 48);
  const channelPart = normalizeChannel(input.channel).toLowerCase();
  const seed = shortHash(`${input.idempotency_key || ""}:${input.delivery_action || ""}:${timestamp}`);
  return `DELIV-${timestamp}-${draftPart}-${channelPart}-${seed}`;
}

function deliverySqlFields(input = {}) {
  const status = normalizeStatus(input.delivery_status || input.status);
  const deliveryId = text(input.delivery_id) || buildDeliveryId({
    ...input,
    delivery_status: status,
    idempotency_key: input.idempotency_key,
  });
  return {
    delivery_id: deliveryId,
    draft_id: text(input.draft_id),
    client_id: text(input.client_id),
    provider: text(input.provider) || "factura_com",
    environment: text(input.environment) || "SANDBOX",
    channel: normalizeChannel(input.channel),
    delivery_status: status,
    delivery_action: text(input.delivery_action) || status,
    recipient_present: input.recipient_present === true,
    recipient_redacted: text(input.recipient_redacted || redactEmail(input.recipient_email)),
    email_confirmed: input.email_confirmed === undefined ? null : input.email_confirmed === true,
    provider_email_sync_status: text(input.provider_email_sync_status),
    telegram_chat_id_present: input.telegram_chat_id_present === undefined ? null : input.telegram_chat_id_present === true,
    documents_valid: input.documents_valid === true,
    xml_content_valid: input.xml_content_valid === true,
    pdf_content_valid: input.pdf_content_valid === true,
    pdf_source: text(input.pdf_source),
    xml_sha256: text(input.xml_sha256),
    pdf_sha256: text(input.pdf_sha256),
    xml_size_bytes: input.xml_size_bytes,
    pdf_size_bytes: input.pdf_size_bytes,
    human_xml_path: safeRuntimePath(input.human_xml_path),
    human_pdf_path: safeRuntimePath(input.human_pdf_path),
    provider_message: text(input.provider_message),
    evidence_sanitized: sanitizeEvidence(input.evidence_sanitized || input.evidence || {}),
    normalized_errors: Array.isArray(input.normalized_errors) ? input.normalized_errors : [],
    normalized_warnings: Array.isArray(input.normalized_warnings) ? input.normalized_warnings : [],
    idempotency_key: text(input.idempotency_key) || buildDeliveryIdempotencyKey(input),
    sent_at: input.sent_at || (status === LEDGER_STATUSES.SENT ? new Date().toISOString() : null),
  };
}

function buildRecordDeliveryAttemptSql(input = {}) {
  const row = deliverySqlFields(input);
  if (!row.draft_id) throw new Error("DELIVERY_LEDGER_DRAFT_ID_REQUIRED");
  const preserveSentWhenIncomingIsNotSent = "document_delivery_ledger.delivery_status = 'SENT' AND EXCLUDED.delivery_status <> 'SENT'";
  return [
    "INSERT INTO document_delivery_ledger (",
    "delivery_id, draft_id, client_id, provider, environment, channel, delivery_status, delivery_action,",
    "recipient_present, recipient_redacted, email_confirmed, provider_email_sync_status, telegram_chat_id_present,",
    "documents_valid, xml_content_valid, pdf_content_valid, pdf_source, xml_sha256, pdf_sha256, xml_size_bytes, pdf_size_bytes,",
    "human_xml_path, human_pdf_path, provider_message, evidence_sanitized, normalized_errors, normalized_warnings,",
    "idempotency_key, sent_at, created_at, updated_at",
    ") VALUES (",
    [
      sqlQuote(row.delivery_id),
      sqlQuote(row.draft_id),
      sqlQuote(row.client_id),
      sqlQuote(row.provider),
      sqlQuote(row.environment),
      sqlQuote(row.channel),
      sqlQuote(row.delivery_status),
      sqlQuote(row.delivery_action),
      sqlBool(row.recipient_present),
      sqlQuote(row.recipient_redacted),
      row.email_confirmed === null ? "NULL" : sqlBool(row.email_confirmed),
      sqlQuote(row.provider_email_sync_status),
      row.telegram_chat_id_present === null ? "NULL" : sqlBool(row.telegram_chat_id_present),
      sqlBool(row.documents_valid),
      sqlBool(row.xml_content_valid),
      sqlBool(row.pdf_content_valid),
      sqlQuote(row.pdf_source),
      sqlQuote(row.xml_sha256),
      sqlQuote(row.pdf_sha256),
      sqlInt(row.xml_size_bytes),
      sqlInt(row.pdf_size_bytes),
      sqlQuote(row.human_xml_path),
      sqlQuote(row.human_pdf_path),
      sqlQuote(row.provider_message),
      sqlJson(row.evidence_sanitized),
      sqlJson(row.normalized_errors),
      sqlJson(row.normalized_warnings),
      sqlQuote(row.idempotency_key),
      sqlQuote(row.sent_at),
      "now()",
      "now()",
    ].join(", "),
    ") ON CONFLICT (idempotency_key) DO UPDATE SET",
    "delivery_status = CASE WHEN " + preserveSentWhenIncomingIsNotSent + " THEN document_delivery_ledger.delivery_status ELSE EXCLUDED.delivery_status END,",
    "delivery_action = CASE WHEN " + preserveSentWhenIncomingIsNotSent + " THEN document_delivery_ledger.delivery_action ELSE EXCLUDED.delivery_action END,",
    "recipient_present = EXCLUDED.recipient_present,",
    "recipient_redacted = COALESCE(EXCLUDED.recipient_redacted, document_delivery_ledger.recipient_redacted),",
    "email_confirmed = COALESCE(EXCLUDED.email_confirmed, document_delivery_ledger.email_confirmed),",
    "provider_email_sync_status = COALESCE(EXCLUDED.provider_email_sync_status, document_delivery_ledger.provider_email_sync_status),",
    "telegram_chat_id_present = COALESCE(EXCLUDED.telegram_chat_id_present, document_delivery_ledger.telegram_chat_id_present),",
    "documents_valid = EXCLUDED.documents_valid,",
    "xml_content_valid = EXCLUDED.xml_content_valid,",
    "pdf_content_valid = EXCLUDED.pdf_content_valid,",
    "pdf_source = COALESCE(EXCLUDED.pdf_source, document_delivery_ledger.pdf_source),",
    "xml_sha256 = COALESCE(EXCLUDED.xml_sha256, document_delivery_ledger.xml_sha256),",
    "pdf_sha256 = COALESCE(EXCLUDED.pdf_sha256, document_delivery_ledger.pdf_sha256),",
    "xml_size_bytes = COALESCE(EXCLUDED.xml_size_bytes, document_delivery_ledger.xml_size_bytes),",
    "pdf_size_bytes = COALESCE(EXCLUDED.pdf_size_bytes, document_delivery_ledger.pdf_size_bytes),",
    "human_xml_path = COALESCE(EXCLUDED.human_xml_path, document_delivery_ledger.human_xml_path),",
    "human_pdf_path = COALESCE(EXCLUDED.human_pdf_path, document_delivery_ledger.human_pdf_path),",
    "provider_message = COALESCE(EXCLUDED.provider_message, document_delivery_ledger.provider_message),",
    "evidence_sanitized = COALESCE(document_delivery_ledger.evidence_sanitized, '{}'::jsonb) || COALESCE(EXCLUDED.evidence_sanitized, '{}'::jsonb),",
    "normalized_errors = CASE WHEN " + preserveSentWhenIncomingIsNotSent + " THEN document_delivery_ledger.normalized_errors ELSE EXCLUDED.normalized_errors END,",
    "normalized_warnings = CASE WHEN " + preserveSentWhenIncomingIsNotSent + " THEN document_delivery_ledger.normalized_warnings ELSE EXCLUDED.normalized_warnings END,",
    "sent_at = CASE WHEN document_delivery_ledger.sent_at IS NOT NULL THEN document_delivery_ledger.sent_at WHEN EXCLUDED.delivery_status = 'SENT' THEN COALESCE(EXCLUDED.sent_at, now()) ELSE EXCLUDED.sent_at END,",
    "updated_at = now()",
    "RETURNING to_jsonb(document_delivery_ledger)::text;",
  ].join(" ");
}

function buildFindExistingDeliverySql(input = {}) {
  const idempotencyKey = text(input.idempotency_key) || buildDeliveryIdempotencyKey(input);
  return [
    "SELECT to_jsonb(d)::text",
    "FROM document_delivery_ledger d",
    "WHERE d.idempotency_key = " + sqlQuote(idempotencyKey),
    input.onlySent === false ? "" : "AND d.delivery_status = 'SENT'",
    "ORDER BY d.created_at DESC",
    "LIMIT 1;",
  ].filter(Boolean).join(" ");
}

function recordDeliveryAttempt(input = {}, options = {}) {
  const sql = buildRecordDeliveryAttemptSql(input);
  if (options.dryRunSqlOnly) return { sql, row: deliverySqlFields(input) };
  return runPsqlJson(sql, options);
}

function findExistingDelivery(input = {}, options = {}) {
  const sql = buildFindExistingDeliverySql(input);
  if (options.dryRunSqlOnly) return { sql };
  return runPsqlJson(sql, options);
}

function markDeliverySent(deliveryId, evidence = {}, options = {}) {
  const sql = [
    "UPDATE document_delivery_ledger SET",
    "delivery_status = 'SENT', sent_at = COALESCE(sent_at, now()), updated_at = now(),",
    "evidence_sanitized = COALESCE(evidence_sanitized, '{}'::jsonb) || " + sqlJson(evidence),
    "WHERE delivery_id = " + sqlQuote(deliveryId),
    "RETURNING to_jsonb(document_delivery_ledger)::text;",
  ].join(" ");
  if (options.dryRunSqlOnly) return { sql };
  return runPsqlJson(sql, options);
}

function markDeliveryFailed(deliveryId, status, errors = [], evidence = {}, options = {}) {
  const safeStatus = normalizeStatus(status);
  const sql = [
    "UPDATE document_delivery_ledger SET",
    "delivery_status = " + sqlQuote(safeStatus) + ", updated_at = now(),",
    "normalized_errors = " + sqlJson(errors),
    ", evidence_sanitized = COALESCE(evidence_sanitized, '{}'::jsonb) || " + sqlJson(evidence),
    "WHERE delivery_id = " + sqlQuote(deliveryId),
    "RETURNING to_jsonb(document_delivery_ledger)::text;",
  ].join(" ");
  if (options.dryRunSqlOnly) return { sql };
  return runPsqlJson(sql, options);
}

function ledgerSummaryForDraft(draftId, options = {}) {
  const safeDraftId = text(draftId);
  if (!safeDraftId) return [];
  const sql = [
    "SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.created_at DESC), '[]'::jsonb)::text",
    "FROM (",
    "SELECT delivery_id, draft_id, channel, delivery_status, delivery_action, recipient_present, recipient_redacted,",
    "documents_valid, xml_content_valid, pdf_content_valid, pdf_source, xml_sha256, pdf_sha256,",
    "sent_at, created_at, updated_at",
    "FROM document_delivery_ledger WHERE draft_id = " + sqlQuote(safeDraftId),
    "ORDER BY created_at DESC LIMIT 20",
    ") d;",
  ].join(" ");
  if (options.dryRunSqlOnly) return { sql };
  try {
    return runPsqlJson(sql, options) || [];
  } catch (_error) {
    return [];
  }
}

function applyMigration(options = {}) {
  const fs = require("fs");
  const migrationPath = path.join(repoRoot, "sql", "016_document_delivery_ledger.sql");
  const sql = fs.readFileSync(migrationPath, "utf8");
  if (options.dryRunSqlOnly) return { sql };
  return runPsqlRaw(sql, options);
}

module.exports = {
  LEDGER_STATUSES,
  applyMigration,
  buildDeliveryId,
  buildDeliveryIdempotencyKey,
  buildFindExistingDeliverySql,
  buildRecordDeliveryAttemptSql,
  deliverySqlFields,
  findExistingDelivery,
  ledgerSummaryForDraft,
  markDeliveryFailed,
  markDeliverySent,
  recordDeliveryAttempt,
  safeRuntimePath,
  sanitizeEvidence,
};

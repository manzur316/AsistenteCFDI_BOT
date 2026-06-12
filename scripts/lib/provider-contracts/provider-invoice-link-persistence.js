const {
  buildProviderInvoiceLinkCandidate,
  normalizeProviderInvoiceIdentity,
} = require("./provider-invoice-identity.contract");

const DEFAULT_TENANT_ID = "TENANT_PERSONAL_DEFAULT";
const DEFAULT_PROVIDER = "factura_com";
const DEFAULT_ENVIRONMENT = "SANDBOX";

const PROVIDER_INVOICE_LINK_COLUMNS = Object.freeze([
  "provider_invoice_link_id",
  "tenant_id",
  "draft_id",
  "client_id",
  "provider",
  "environment",
  "provider_invoice_id",
  "provider_invoice_uid",
  "uuid",
  "serie",
  "folio",
  "provider_status",
  "invoice_status",
  "cancellation_status",
  "payment_status_provider",
  "payment_status_local",
  "xml_downloaded",
  "pdf_downloaded",
  "last_sync_at",
  "provider_response_sanitized",
  "created_at",
]);

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlQuote(JSON.stringify(value || {}))}::jsonb`;
}

function sqlBool(value) {
  return value === true ? "true" : "false";
}

function safeIdSegment(value, fallback = "missing") {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || fallback;
}

function providerInvoiceLinkId(input = {}) {
  return [
    "PIL",
    safeIdSegment(input.tenant_id || DEFAULT_TENANT_ID),
    safeIdSegment(input.provider || DEFAULT_PROVIDER),
    safeIdSegment(input.environment || DEFAULT_ENVIRONMENT),
    safeIdSegment(input.draft_id || input.provider_invoice_uid || input.provider_invoice_id || input.uuid || "invoice"),
  ].join("-").slice(0, 120);
}

function safeRelativeRef(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^[A-Za-z]:[\\/]/.test(raw)) return null;
  if (/^\\\\/.test(raw)) return null;
  if (/(secret|token|password|api[_-]?key|authorization|bearer)/i.test(raw)) return null;
  return raw.replace(/\\/g, "/").slice(0, 240);
}

function sanitizePersistenceSnapshot(identity, candidate) {
  return {
    schema_version: identity.schema_version,
    source: "ProviderInvoiceIdentity",
    identity_source: identity.identity_source,
    identity_confidence: identity.identity_confidence,
    ui_display_id: identity.ui_display_id,
    has_folio: Boolean(candidate.folio),
    has_uuid: Boolean(candidate.uuid),
    has_provider_invoice_uid: Boolean(candidate.provider_invoice_uid),
    has_provider_invoice_id: Boolean(candidate.provider_invoice_id),
    has_xml: candidate.has_xml === true,
    has_pdf: candidate.has_pdf === true,
    artifact_status: text(identity.artifact_status),
    raw_snapshot_ref: safeRelativeRef(candidate.raw_snapshot_ref),
    warnings: Array.isArray(candidate.warnings) ? candidate.warnings : [],
  };
}

function normalizePersistenceInput(input = {}) {
  const identity = normalizeProviderInvoiceIdentity(input);
  const candidate = buildProviderInvoiceLinkCandidate(identity);
  const tenantId = text(input.tenant_id || input.tenantId) || DEFAULT_TENANT_ID;
  const provider = text(candidate.provider_name || input.provider || input.provider_name) || DEFAULT_PROVIDER;
  const environment = text(candidate.provider_environment || input.environment || input.provider_environment) || DEFAULT_ENVIRONMENT;
  const draftId = text(candidate.draft_id || input.draft_id || input.local_draft_id);
  const clientId = text(input.client_id || input.clientId || identity.client_id);
  const paymentStatusLocal = text(input.payment_status_local || input.paymentStatusLocal || identity.payment_status);
  const paymentStatusProvider = text(input.payment_status_provider || input.paymentStatusProvider);
  const cancellationStatus = text(input.cancellation_status || input.cancellationStatus);
  const link = {
    provider_invoice_link_id: text(input.provider_invoice_link_id) || providerInvoiceLinkId({
      tenant_id: tenantId,
      provider,
      environment,
      draft_id: draftId,
      provider_invoice_uid: candidate.provider_invoice_uid,
      provider_invoice_id: candidate.provider_invoice_id,
      uuid: candidate.uuid,
    }),
    tenant_id: tenantId,
    draft_id: draftId,
    client_id: clientId,
    provider,
    environment,
    provider_invoice_id: text(candidate.provider_invoice_id),
    provider_invoice_uid: text(candidate.provider_invoice_uid),
    uuid: text(candidate.uuid),
    serie: text(candidate.serie),
    folio: text(candidate.folio),
    provider_status: text(candidate.provider_status),
    invoice_status: text(candidate.local_status || input.invoice_status || input.local_status),
    cancellation_status: cancellationStatus,
    payment_status_provider: paymentStatusProvider,
    payment_status_local: paymentStatusLocal,
    xml_downloaded: candidate.has_xml === true,
    pdf_downloaded: candidate.has_pdf === true,
    provider_response_sanitized: sanitizePersistenceSnapshot(identity, candidate),
  };
  const warnings = Array.from(new Set([
    ...(Array.isArray(candidate.warnings) ? candidate.warnings : []),
  ]));
  if (!draftId && !warnings.includes("DRAFT_ID_MISSING")) warnings.push("DRAFT_ID_MISSING");
  if (!link.folio && link.invoice_status && /TIMBRAD|STAMP|DOWNLOAD/i.test(link.invoice_status) && !warnings.includes("PROVIDER_FOLIO_MISSING")) {
    warnings.push("PROVIDER_FOLIO_MISSING");
  }
  return { identity, candidate, link, warnings };
}

function hasProviderIdentity(link = {}) {
  return Boolean(text(link.folio) || text(link.uuid) || text(link.provider_invoice_uid) || text(link.provider_invoice_id));
}

function shouldPersistProviderInvoiceLink(normalized) {
  if (!normalized.link.draft_id) return false;
  if (!hasProviderIdentity(normalized.link)) return false;
  return normalized.identity.identity_confidence !== "NONE";
}

function buildWhere(link) {
  return [
    `tenant_id = ${sqlQuote(link.tenant_id)}`,
    `draft_id = ${sqlQuote(link.draft_id)}`,
    `provider = ${sqlQuote(link.provider)}`,
    `environment = ${sqlQuote(link.environment)}`,
  ].join(" AND ");
}

function buildUpdateThenInsertSql(link) {
  const where = buildWhere(link);
  const metadataJson = sqlJson(link.provider_response_sanitized);
  const updateSql = [
    "UPDATE provider_invoice_links SET",
    `client_id = COALESCE(${sqlQuote(link.client_id)}, client_id),`,
    `provider_invoice_id = COALESCE(${sqlQuote(link.provider_invoice_id)}, provider_invoice_id),`,
    `provider_invoice_uid = COALESCE(${sqlQuote(link.provider_invoice_uid)}, provider_invoice_uid),`,
    `uuid = COALESCE(${sqlQuote(link.uuid)}, uuid),`,
    `serie = COALESCE(${sqlQuote(link.serie)}, serie),`,
    `folio = COALESCE(${sqlQuote(link.folio)}, folio),`,
    `provider_status = COALESCE(${sqlQuote(link.provider_status)}, provider_status),`,
    `invoice_status = COALESCE(${sqlQuote(link.invoice_status)}, invoice_status),`,
    `cancellation_status = COALESCE(${sqlQuote(link.cancellation_status)}, cancellation_status),`,
    `payment_status_provider = COALESCE(${sqlQuote(link.payment_status_provider)}, payment_status_provider),`,
    `payment_status_local = COALESCE(${sqlQuote(link.payment_status_local)}, payment_status_local),`,
    `xml_downloaded = provider_invoice_links.xml_downloaded OR ${sqlBool(link.xml_downloaded)},`,
    `pdf_downloaded = provider_invoice_links.pdf_downloaded OR ${sqlBool(link.pdf_downloaded)},`,
    "last_sync_at = now(),",
    `provider_response_sanitized = COALESCE(provider_response_sanitized, '{}'::jsonb) || ${metadataJson}`,
    `WHERE ${where};`,
  ].join(" ");

  const columns = [
    "provider_invoice_link_id",
    "tenant_id",
    "draft_id",
    "client_id",
    "provider",
    "environment",
    "provider_invoice_id",
    "provider_invoice_uid",
    "uuid",
    "serie",
    "folio",
    "provider_status",
    "invoice_status",
    "cancellation_status",
    "payment_status_provider",
    "payment_status_local",
    "xml_downloaded",
    "pdf_downloaded",
    "last_sync_at",
    "provider_response_sanitized",
  ];
  const values = [
    sqlQuote(link.provider_invoice_link_id),
    sqlQuote(link.tenant_id),
    sqlQuote(link.draft_id),
    sqlQuote(link.client_id),
    sqlQuote(link.provider),
    sqlQuote(link.environment),
    sqlQuote(link.provider_invoice_id),
    sqlQuote(link.provider_invoice_uid),
    sqlQuote(link.uuid),
    sqlQuote(link.serie),
    sqlQuote(link.folio),
    sqlQuote(link.provider_status),
    sqlQuote(link.invoice_status),
    sqlQuote(link.cancellation_status),
    sqlQuote(link.payment_status_provider),
    sqlQuote(link.payment_status_local),
    sqlBool(link.xml_downloaded),
    sqlBool(link.pdf_downloaded),
    "now()",
    metadataJson,
  ];
  const insertSql = [
    `INSERT INTO provider_invoice_links (${columns.join(", ")})`,
    `SELECT ${values.join(", ")}`,
    `WHERE NOT EXISTS (SELECT 1 FROM provider_invoice_links WHERE ${where});`,
  ].join(" ");
  return `${updateSql} ${insertSql}`;
}

function buildOnConflictSql(link, conflictTarget) {
  const target = text(conflictTarget) || "tenant_id, draft_id, provider, environment";
  const columns = [
    "provider_invoice_link_id",
    "tenant_id",
    "draft_id",
    "client_id",
    "provider",
    "environment",
    "provider_invoice_id",
    "provider_invoice_uid",
    "uuid",
    "serie",
    "folio",
    "provider_status",
    "invoice_status",
    "cancellation_status",
    "payment_status_provider",
    "payment_status_local",
    "xml_downloaded",
    "pdf_downloaded",
    "last_sync_at",
    "provider_response_sanitized",
  ];
  const values = [
    sqlQuote(link.provider_invoice_link_id),
    sqlQuote(link.tenant_id),
    sqlQuote(link.draft_id),
    sqlQuote(link.client_id),
    sqlQuote(link.provider),
    sqlQuote(link.environment),
    sqlQuote(link.provider_invoice_id),
    sqlQuote(link.provider_invoice_uid),
    sqlQuote(link.uuid),
    sqlQuote(link.serie),
    sqlQuote(link.folio),
    sqlQuote(link.provider_status),
    sqlQuote(link.invoice_status),
    sqlQuote(link.cancellation_status),
    sqlQuote(link.payment_status_provider),
    sqlQuote(link.payment_status_local),
    sqlBool(link.xml_downloaded),
    sqlBool(link.pdf_downloaded),
    "now()",
    sqlJson(link.provider_response_sanitized),
  ];
  return [
    `INSERT INTO provider_invoice_links (${columns.join(", ")}) VALUES (${values.join(", ")})`,
    `ON CONFLICT (${target}) DO UPDATE SET`,
    "client_id = COALESCE(EXCLUDED.client_id, provider_invoice_links.client_id),",
    "provider_invoice_id = COALESCE(EXCLUDED.provider_invoice_id, provider_invoice_links.provider_invoice_id),",
    "provider_invoice_uid = COALESCE(EXCLUDED.provider_invoice_uid, provider_invoice_links.provider_invoice_uid),",
    "uuid = COALESCE(EXCLUDED.uuid, provider_invoice_links.uuid),",
    "serie = COALESCE(EXCLUDED.serie, provider_invoice_links.serie),",
    "folio = COALESCE(EXCLUDED.folio, provider_invoice_links.folio),",
    "provider_status = COALESCE(EXCLUDED.provider_status, provider_invoice_links.provider_status),",
    "invoice_status = COALESCE(EXCLUDED.invoice_status, provider_invoice_links.invoice_status),",
    "cancellation_status = COALESCE(EXCLUDED.cancellation_status, provider_invoice_links.cancellation_status),",
    "payment_status_provider = COALESCE(EXCLUDED.payment_status_provider, provider_invoice_links.payment_status_provider),",
    "payment_status_local = COALESCE(EXCLUDED.payment_status_local, provider_invoice_links.payment_status_local),",
    "xml_downloaded = provider_invoice_links.xml_downloaded OR EXCLUDED.xml_downloaded,",
    "pdf_downloaded = provider_invoice_links.pdf_downloaded OR EXCLUDED.pdf_downloaded,",
    "last_sync_at = now(),",
    "provider_response_sanitized = COALESCE(provider_invoice_links.provider_response_sanitized, '{}'::jsonb) || EXCLUDED.provider_response_sanitized;",
  ].join(" ");
}

function resolveStrategy(options = {}) {
  if (options.hasUniqueDraftProviderEnvironment === true || text(options.uniqueConflictTarget)) {
    return {
      idempotency_strategy: "on_conflict",
      conflict_target: text(options.uniqueConflictTarget) || "tenant_id, draft_id, provider, environment",
    };
  }
  return {
    idempotency_strategy: "update_then_insert_no_unique_constraint",
    conflict_target: null,
  };
}

function buildProviderInvoiceLinkUpsertSql(identityInput = {}, options = {}) {
  return buildProviderInvoiceLinkPersistencePlan(identityInput, options).sql;
}

function buildProviderInvoiceLinkPersistencePlan(identityInput = {}, options = {}) {
  const normalized = normalizePersistenceInput(identityInput);
  const strategy = resolveStrategy(options);
  const shouldPersist = shouldPersistProviderInvoiceLink(normalized);
  const warnings = [...normalized.warnings];
  if (!shouldPersist && !warnings.includes("PROVIDER_INVOICE_LINK_SKIPPED_EMPTY_IDENTITY")) {
    warnings.push("PROVIDER_INVOICE_LINK_SKIPPED_EMPTY_IDENTITY");
  }
  const sql = shouldPersist
    ? strategy.idempotency_strategy === "on_conflict"
      ? buildOnConflictSql(normalized.link, strategy.conflict_target)
      : buildUpdateThenInsertSql(normalized.link)
    : "";
  return {
    ok: shouldPersist,
    should_persist: shouldPersist,
    idempotency_strategy: strategy.idempotency_strategy,
    conflict_target: strategy.conflict_target,
    identity: normalized.identity,
    candidate: normalized.candidate,
    link: normalized.link,
    sql,
    warnings,
    columns: PROVIDER_INVOICE_LINK_COLUMNS.slice(),
  };
}

module.exports = {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PROVIDER,
  DEFAULT_TENANT_ID,
  PROVIDER_INVOICE_LINK_COLUMNS,
  buildProviderInvoiceLinkPersistencePlan,
  buildProviderInvoiceLinkUpsertSql,
  normalizePersistenceInput,
  providerInvoiceLinkId,
  sqlQuote,
};

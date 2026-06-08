const { runPsqlJson } = require("./local-db-psql-runner");
const { normalizeRfc, redactRfc, redactUid } = require("./factura-com-provider-client-mapper");

const DEFAULT_TENANT_ID = "TENANT_PERSONAL_DEFAULT";
const DEFAULT_PROVIDER = "factura_com";
const DEFAULT_ENVIRONMENT = "SANDBOX";

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

function linkId(input = {}) {
  return [
    "PCL",
    text(input.tenant_id) || DEFAULT_TENANT_ID,
    text(input.provider) || DEFAULT_PROVIDER,
    text(input.environment) || DEFAULT_ENVIRONMENT,
    text(input.client_id) || "CLIENT",
  ].join("-").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 120);
}

function normalizeLinkInput(input = {}) {
  return {
    provider_client_link_id: text(input.provider_client_link_id) || linkId(input),
    tenant_id: text(input.tenant_id) || DEFAULT_TENANT_ID,
    client_id: text(input.client_id),
    provider: text(input.provider) || DEFAULT_PROVIDER,
    environment: text(input.environment) || DEFAULT_ENVIRONMENT,
    provider_client_id: text(input.provider_client_id),
    provider_client_uid: text(input.provider_client_uid),
    provider_rfc: normalizeRfc(input.provider_rfc || input.rfc),
    provider_legal_name: text(input.provider_legal_name || input.legal_name),
    sync_status: text(input.sync_status) || "LINKED",
    provider_response_sanitized: input.provider_response_sanitized || {},
  };
}

function buildProviderClientLinkUpsertSql(input = {}) {
  const link = normalizeLinkInput(input);
  return [
    "INSERT INTO provider_client_links (",
    "provider_client_link_id, tenant_id, client_id, provider, environment,",
    "provider_client_id, provider_client_uid, provider_rfc, provider_legal_name,",
    "sync_status, last_sync_at, provider_response_sanitized",
    ") VALUES (",
    [
      sqlQuote(link.provider_client_link_id),
      sqlQuote(link.tenant_id),
      sqlQuote(link.client_id),
      sqlQuote(link.provider),
      sqlQuote(link.environment),
      sqlQuote(link.provider_client_id),
      sqlQuote(link.provider_client_uid),
      sqlQuote(link.provider_rfc),
      sqlQuote(link.provider_legal_name),
      sqlQuote(link.sync_status),
      "now()",
      sqlJson(link.provider_response_sanitized),
    ].join(", "),
    ") ON CONFLICT (tenant_id, client_id, provider, environment) DO UPDATE SET",
    "provider_client_link_id = EXCLUDED.provider_client_link_id,",
    "provider_client_id = EXCLUDED.provider_client_id,",
    "provider_client_uid = EXCLUDED.provider_client_uid,",
    "provider_rfc = EXCLUDED.provider_rfc,",
    "provider_legal_name = EXCLUDED.provider_legal_name,",
    "sync_status = EXCLUDED.sync_status,",
    "last_sync_at = now(),",
    "provider_response_sanitized = EXCLUDED.provider_response_sanitized",
    "RETURNING jsonb_build_object(",
    "'provider_client_link_id', provider_client_link_id,",
    "'tenant_id', tenant_id,",
    "'client_id', client_id,",
    "'provider', provider,",
    "'environment', environment,",
    "'provider_client_uid_present', provider_client_uid IS NOT NULL,",
    "'provider_rfc_present', provider_rfc IS NOT NULL,",
    "'sync_status', sync_status,",
    "'last_sync_at', last_sync_at",
    ")::text;",
  ].join(" ");
}

function buildProviderClientLinkSelectSql(input = {}) {
  const link = normalizeLinkInput(input);
  return [
    "SELECT COALESCE((",
    "SELECT jsonb_build_object(",
    "'provider_client_link_id', provider_client_link_id,",
    "'tenant_id', tenant_id,",
    "'client_id', client_id,",
    "'provider', provider,",
    "'environment', environment,",
    "'provider_client_uid', provider_client_uid,",
    "'provider_client_uid_present', provider_client_uid IS NOT NULL,",
    "'sync_status', sync_status,",
    "'provider_response_sanitized', provider_response_sanitized,",
    "'last_sync_at', last_sync_at",
    ") FROM provider_client_links",
    `WHERE tenant_id = ${sqlQuote(link.tenant_id)}`,
    `AND client_id = ${sqlQuote(link.client_id)}`,
    `AND provider = ${sqlQuote(link.provider)}`,
    `AND environment = ${sqlQuote(link.environment)}`,
    "ORDER BY last_sync_at DESC NULLS LAST, created_at DESC",
    "LIMIT 1), '{}'::jsonb)::text;",
  ].join(" ");
}

function runPsql(sql, options = {}) {
  return runPsqlJson(sql, options);
}

function saveProviderClientLink(input = {}, options = {}) {
  return runPsql(buildProviderClientLinkUpsertSql(input), options);
}

function loadProviderClientLink(input = {}, options = {}) {
  return runPsql(buildProviderClientLinkSelectSql(input), options);
}

function safeLinkOutput(input = {}) {
  return {
    provider_client_link_id: text(input.provider_client_link_id),
    tenant_id: text(input.tenant_id) || DEFAULT_TENANT_ID,
    client_id: text(input.client_id),
    provider: text(input.provider) || DEFAULT_PROVIDER,
    environment: text(input.environment) || DEFAULT_ENVIRONMENT,
    provider_client_uid_present: Boolean(text(input.provider_client_uid)),
    provider_client_uid_redacted: redactUid(input.provider_client_uid),
    provider_rfc_redacted: redactRfc(input.provider_rfc || input.rfc),
    sync_status: text(input.sync_status),
  };
}

module.exports = {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PROVIDER,
  DEFAULT_TENANT_ID,
  buildProviderClientLinkSelectSql,
  buildProviderClientLinkUpsertSql,
  loadProviderClientLink,
  normalizeLinkInput,
  safeLinkOutput,
  saveProviderClientLink,
  sqlQuote,
};

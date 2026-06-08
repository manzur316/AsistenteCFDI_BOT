const { runPsqlJson } = require("../local-db-psql-runner");
const {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PROVIDER,
  DEFAULT_TENANT_ID,
  sqlQuote,
} = require("../provider-client-link-store");
const {
  buildProviderClientReadiness,
  summarizeProviderClientReadiness,
} = require("./provider-client-readiness-contract");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizeReadinessOptions(options = {}) {
  return {
    tenant_id: text(options.tenantId || options.tenant_id) || DEFAULT_TENANT_ID,
    client_id: text(options.clientId || options.client_id),
    provider: text(options.provider) || DEFAULT_PROVIDER,
    environment: text(options.environment) || DEFAULT_ENVIRONMENT,
  };
}

function buildProviderClientReadinessSelectSql(input = {}) {
  const normalized = normalizeReadinessOptions(input);
  return [
    "WITH selected_client AS (",
    "SELECT jsonb_build_object(",
    "'client_id', c.client_id,",
    "'display_name', c.display_name,",
    "'razon_social', c.razon_social,",
    "'rfc', c.rfc,",
    "'tipo_persona', c.tipo_persona,",
    "'regimen_fiscal', c.regimen_fiscal,",
    "'codigo_postal_fiscal', c.codigo_postal_fiscal,",
    "'uso_cfdi_default', c.uso_cfdi_default,",
    "'validated_by_human', c.validated_by_human,",
    "'enabled', c.enabled,",
    "'email', to_jsonb(c)->>'email',",
    "'email_confirmed', COALESCE((to_jsonb(c)->>'email_confirmed')::boolean, false),",
    "'provider_email_sync_status', to_jsonb(c)->>'provider_email_sync_status',",
    "'provider_email_sync_summary', COALESCE(to_jsonb(c)->'provider_email_sync_summary', '{}'::jsonb),",
    "'fiscal_normalization_summary', COALESCE(to_jsonb(c)->'fiscal_normalization_summary', '{}'::jsonb)",
    ") AS client_json",
    "FROM cfdi_clients c",
    `WHERE c.client_id = ${sqlQuote(normalized.client_id)}`,
    "LIMIT 1",
    "), selected_links AS (",
    "SELECT COALESCE(jsonb_agg(jsonb_build_object(",
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
    ") ORDER BY last_sync_at DESC NULLS LAST, created_at DESC), '[]'::jsonb) AS links_json",
    "FROM provider_client_links",
    `WHERE tenant_id = ${sqlQuote(normalized.tenant_id)}`,
    `AND client_id = ${sqlQuote(normalized.client_id)}`,
    `AND provider = ${sqlQuote(normalized.provider)}`,
    `AND environment = ${sqlQuote(normalized.environment)}`,
    ")",
    "SELECT jsonb_build_object(",
    "'client', COALESCE((SELECT client_json FROM selected_client), '{}'::jsonb),",
    "'provider_client_links', (SELECT links_json FROM selected_links),",
    "'tenant_id',", sqlQuote(normalized.tenant_id), ",",
    "'client_id',", sqlQuote(normalized.client_id), ",",
    "'provider',", sqlQuote(normalized.provider), ",",
    "'environment',", sqlQuote(normalized.environment),
    ")::text;",
  ].join(" ");
}

function statusFromReadiness(readiness = {}) {
  if (readiness.ready_for_provider_stamp === true && readiness.ready_for_provider_email === true) return "OK";
  return "NEEDS_SOURCE";
}

function buildReadinessActionResult(readiness, action = "sandbox.provider.client.readiness") {
  const status = statusFromReadiness(readiness);
  return {
    status,
    output: {
      action,
      ...readiness,
    },
    warnings: Array.isArray(readiness.warnings) ? readiness.warnings : [],
    errors: Array.isArray(readiness.blockers) ? readiness.blockers : [],
  };
}

function loadProviderClientReadinessRows(options = {}, normalized = normalizeReadinessOptions(options)) {
  if (options.client || options.providerClientLink || options.providerClientLinks || options.provider_client_link || options.provider_client_links) {
    return {
      client: options.client || {},
      provider_client_links: options.providerClientLinks || options.provider_client_links || options.providerClientLink || options.provider_client_link || [],
      tenant_id: normalized.tenant_id,
      client_id: normalized.client_id,
      provider: normalized.provider,
      environment: normalized.environment,
    };
  }
  const sql = buildProviderClientReadinessSelectSql(normalized);
  return runPsqlJson(sql, options);
}

async function runProviderClientReadiness(options = {}) {
  const normalized = normalizeReadinessOptions(options);
  if (!normalized.client_id) {
    const readiness = buildProviderClientReadiness({
      ...normalized,
      client: null,
      provider_client_links: [],
    });
    return {
      status: "NEEDS_SOURCE",
      output: {
        action: "sandbox.provider.client.readiness",
        ...readiness,
        error_class: "CLIENT_ID_REQUIRED",
      },
      warnings: readiness.warnings,
      errors: ["CLIENT_ID_REQUIRED"],
    };
  }

  try {
    const rows = (options.clientStore?.loadReadiness || loadProviderClientReadinessRows)(options, normalized) || {};
    const readiness = buildProviderClientReadiness({
      tenant_id: normalized.tenant_id,
      client_id: normalized.client_id,
      provider: normalized.provider,
      environment: normalized.environment,
      client: rows.client && Object.keys(rows.client).length ? rows.client : null,
      provider_client_links: rows.provider_client_links || [],
    });
    return buildReadinessActionResult(readiness);
  } catch (error) {
    return {
      status: "NEEDS_RUNTIME",
      output: {
        action: "sandbox.provider.client.readiness",
        error_class: "PROVIDER_CLIENT_READINESS_DB_READ_FAILED",
        client_id: normalized.client_id,
        tenant_id: normalized.tenant_id,
        provider: normalized.provider,
        environment: normalized.environment,
        provider_client_readiness: summarizeProviderClientReadiness(buildProviderClientReadiness({
          ...normalized,
          client: null,
          provider_client_links: [],
        })),
      },
      warnings: ["No se pudo leer readiness provider client desde PostgreSQL local."],
      errors: ["PROVIDER_CLIENT_READINESS_DB_READ_FAILED"],
    };
  }
}

module.exports = {
  buildProviderClientReadinessSelectSql,
  buildReadinessActionResult,
  loadProviderClientReadinessRows,
  normalizeReadinessOptions,
  runProviderClientReadiness,
};

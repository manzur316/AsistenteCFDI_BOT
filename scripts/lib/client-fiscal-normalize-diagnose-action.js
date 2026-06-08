const { runPsqlJson } = require("./local-db-psql-runner");
const { normalizeClientFiscalFields } = require("./clients/client-fiscal-field-normalizer");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function redactRfc(value) {
  const raw = text(value);
  return raw ? `[REDACTED_RFC len=${raw.length}]` : null;
}

function safeReport(report = {}) {
  return Object.fromEntries(Object.entries(report).map(([field, result]) => [field, {
    input_present: result?.input_present === true || Boolean(result?.input),
    normalized_key: text(result?.key || result?.normalized_key),
    description: text(result?.description),
    status: text(result?.status),
    ok: result?.ok === true,
    warnings: Array.isArray(result?.warnings) ? result.warnings : [],
    errors: Array.isArray(result?.errors) ? result.errors : [],
  }]));
}

function buildClientQuery(clientId) {
  return [
    "SELECT jsonb_build_object(",
    "'client_id', client_id,",
    "'display_name', display_name,",
    "'razon_social', razon_social,",
    "'rfc', rfc,",
    "'regimen_fiscal', regimen_fiscal,",
    "'uso_cfdi_default', uso_cfdi_default,",
    "'codigo_postal_fiscal', codigo_postal_fiscal,",
    "'tipo_persona', tipo_persona,",
    "'validated_by_human', validated_by_human",
    ")::text",
    "FROM cfdi_clients",
    `WHERE client_id = ${sqlQuote(clientId)}`,
    "LIMIT 1;",
  ].join(" ");
}

function runClientFiscalNormalizeDiagnose(options = {}) {
  const clientId = text(options.clientId || options.client_id);
  if (!clientId) {
    return {
      status: "ERROR",
      output: { error_class: "CLIENT_ID_REQUIRED" },
      warnings: [],
      errors: ["CLIENT_ID_REQUIRED"],
    };
  }
  const client = options.client || runPsqlJson(buildClientQuery(clientId), {
    env: options.env,
    dbExecMode: options.dbExecMode,
    dbConfig: options.dbConfig,
    execMode: options.execMode,
    execFileSync: options.execFileSync,
  });
  if (!client) {
    return {
      status: "NEEDS_RUNTIME",
      output: { error_class: "CLIENT_NOT_FOUND", client_id: clientId },
      warnings: [],
      errors: ["CLIENT_NOT_FOUND"],
    };
  }
  const normalized = normalizeClientFiscalFields(client);
  const status = normalized.ok ? "OK" : "NEEDS_CONFIRMATION";
  return {
    status,
    output: {
      status,
      client_id: clientId,
      display_name_present: Boolean(text(client.display_name || client.razon_social)),
      rfc_redacted: redactRfc(client.rfc),
      normalization_report: safeReport(normalized.normalization_report),
      normalized_client_preview: {
        client_id: clientId,
        regimen_fiscal: normalized.normalized_client.regimen_fiscal,
        regimen_fiscal_description: normalized.normalized_client.regimen_fiscal_description || null,
        uso_cfdi_default: normalized.normalized_client.uso_cfdi_default || null,
        uso_cfdi_description: normalized.normalized_client.uso_cfdi_description || null,
        codigo_postal_fiscal: normalized.normalized_client.codigo_postal_fiscal || null,
        tipo_persona: normalized.normalized_client.tipo_persona || null,
      },
      blockers: normalized.blockers,
      warnings: normalized.warnings,
    },
    warnings: normalized.warnings,
    errors: normalized.blockers,
  };
}

module.exports = {
  buildClientQuery,
  runClientFiscalNormalizeDiagnose,
};

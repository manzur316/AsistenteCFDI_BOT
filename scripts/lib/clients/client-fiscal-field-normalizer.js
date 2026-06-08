const {
  normalizeCodigoPostal,
  normalizeRegimenFiscal,
  normalizeUsoCfdi,
} = require("../sat-catalogs/sat-field-normalizer");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function safeResult(result) {
  if (!result) return null;
  return {
    ok: result.ok === true,
    status: result.status,
    catalog: result.catalog,
    input_present: Boolean(text(result.input)),
    input: text(result.input),
    normalized_key: text(result.key),
    key: text(result.key),
    description: text(result.description),
    source: result.source,
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    errors: Array.isArray(result.errors) ? result.errors : [],
  };
}

function normalizeTipoPersona(value = null, options = {}) {
  const input = text(value || options.fallbackFromRfc);
  if (!input) {
    return { ok: true, status: "NOT_PROVIDED", input: null, key: null, warnings: [], errors: [] };
  }
  const normalized = input.toUpperCase();
  const comparable = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (["FISICA", "PF", "PERSONA FISICA", "PERSONA_FISICA"].includes(normalized) || /\bPERSONAS?\s+FISICAS?\b/.test(comparable)) {
    return { ok: true, status: "NORMALIZED", input, key: "FISICA", warnings: [], errors: [] };
  }
  if (["MORAL", "PM", "PERSONA MORAL", "PERSONA_MORAL"].includes(normalized) || /\bPERSONAS?\s+MORALES?\b/.test(comparable)) {
    return { ok: true, status: "NORMALIZED", input, key: "MORAL", warnings: [], errors: [] };
  }
  return { ok: false, status: "NEEDS_CONFIRMATION", input, key: null, warnings: [], errors: ["TIPO_PERSONA_NEEDS_CONFIRMATION"] };
}

function applyField(report, fieldName, normalizedClient, targetField, descriptionField) {
  const result = report[fieldName];
  if (result?.ok && result.key) {
    normalizedClient[targetField] = result.key;
    if (descriptionField && result.description) normalizedClient[descriptionField] = result.description;
  }
}

function normalizeClientFiscalFields(client = {}) {
  const original = clone(client) || {};
  const normalizedClient = { ...original };
  const regimenInput = text(original.regimen_fiscal || original.tax_regime || original.fiscal_regime);
  const usoInput = text(original.uso_cfdi_default || original.uso_cfdi || original.cfdi_use || original.usoCFDI);
  const zipInput = text(original.codigo_postal_fiscal || original.fiscal_zip || original.cp);
  const tipoInput = text(original.tipo_persona || original.person_type);
  const report = {
    regimen_fiscal: safeResult(normalizeRegimenFiscal(regimenInput)),
    uso_cfdi_default: usoInput ? safeResult(normalizeUsoCfdi(usoInput)) : null,
    codigo_postal_fiscal: zipInput ? safeResult(normalizeCodigoPostal(zipInput)) : null,
    tipo_persona: safeResult(normalizeTipoPersona(tipoInput)),
  };

  applyField(report, "regimen_fiscal", normalizedClient, "regimen_fiscal", "regimen_fiscal_description");
  if (report.regimen_fiscal?.ok) normalizedClient.tax_regime = report.regimen_fiscal.key;
  applyField(report, "uso_cfdi_default", normalizedClient, "uso_cfdi_default", "uso_cfdi_description");
  if (report.uso_cfdi_default?.ok) {
    normalizedClient.uso_cfdi = report.uso_cfdi_default.key;
    normalizedClient.cfdi_use = report.uso_cfdi_default.key;
  }
  if (report.codigo_postal_fiscal?.ok && report.codigo_postal_fiscal.key) {
    normalizedClient.codigo_postal_fiscal = report.codigo_postal_fiscal.key;
    normalizedClient.fiscal_zip = report.codigo_postal_fiscal.key;
  }
  if (report.tipo_persona?.ok && report.tipo_persona.key) {
    normalizedClient.tipo_persona = report.tipo_persona.key;
    normalizedClient.person_type = report.tipo_persona.key;
  }

  const blockers = [];
  const warnings = [];
  for (const [field, result] of Object.entries(report)) {
    if (!result) continue;
    if (result.ok !== true && result.status !== "NOT_PROVIDED") blockers.push(`${field}:${result.status}`);
    if (Array.isArray(result.warnings)) warnings.push(...result.warnings.map((warning) => `${field}:${warning}`));
  }

  normalizedClient.fiscal_normalization_summary = {
    schema_version: "client_fiscal_field_normalization.v1",
    normalized: Object.fromEntries(Object.entries(report).filter(([, result]) => result?.ok && result.status === "NORMALIZED")),
    blockers,
    warnings: Array.from(new Set(warnings)),
  };

  return {
    client: original,
    normalized_client: normalizedClient,
    normalization_report: report,
    ok: blockers.length === 0,
    blockers,
    warnings: Array.from(new Set(warnings)),
  };
}

module.exports = {
  normalizeClientFiscalFields,
};

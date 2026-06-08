const { buildCanonicalProviderClient } = require("./provider-contracts/provider-contract-index");
const {
  normalizeRegimenFiscal,
  normalizeUsoCfdi,
} = require("./sat-catalogs/sat-field-normalizer");

const GENERIC_RFCS = new Set(["XAXX010101000", "XEXX010101000"]);

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizeRfc(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/\s+/g, "").toUpperCase() : null;
}

function normalizeZip(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/\D+/g, "").slice(0, 5) : null;
}

function hasValidRfcShape(value) {
  const rfc = normalizeRfc(value);
  return Boolean(rfc && /^[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc));
}

function redactRfc(value) {
  const rfc = normalizeRfc(value);
  if (!rfc) return null;
  return `[REDACTED_RFC len=${rfc.length}]`;
}

function redactUid(value) {
  const uid = text(value);
  if (!uid) return null;
  return `[REDACTED_UID len=${uid.length}]`;
}

function safeProviderClientSummary(input = {}) {
  return {
    provider_client_uid_present: Boolean(text(input.provider_client_uid || input.uid || input.UID)),
    provider_client_uid_redacted: redactUid(input.provider_client_uid || input.uid || input.UID),
    rfc_redacted: redactRfc(input.rfc || input.RFC || input.tax_id),
    legal_name_present: Boolean(text(input.legal_name || input.razon_social || input.RazonSocial || input.razons)),
  };
}

function canonicalClientFromLocalClient(client = {}, options = {}) {
  const localClientId = text(client.local_client_id || client.client_id || client.id);
  const fiscalRegimeNormalization = normalizeRegimenFiscal(client.fiscal_regime || client.regimen_fiscal);
  const cfdiUseInput = text(client.cfdi_use || client.uso_cfdi_default || client.uso_cfdi || options.defaultCfdiUse || "G03");
  const cfdiUseNormalization = normalizeUsoCfdi(cfdiUseInput);
  return buildCanonicalProviderClient({
    local_client_id: localClientId,
    provider: "factura_com",
    environment: "SANDBOX",
    provider_client_uid: text(client.provider_client_uid),
    legal_name: text(client.legal_name || client.razon_social || client.display_name || client.name),
    tax_id: normalizeRfc(client.tax_id || client.rfc),
    fiscal_zip: normalizeZip(client.fiscal_zip || client.codigo_postal_fiscal || client.cp),
    fiscal_regime: fiscalRegimeNormalization.ok ? fiscalRegimeNormalization.key : text(client.fiscal_regime || client.regimen_fiscal),
    cfdi_use: cfdiUseNormalization.ok ? cfdiUseNormalization.key : cfdiUseInput,
    email: text(client.email || client.correo),
    sync_status: text(client.sync_status) || "NEEDS_SYNC",
    sat_validated: client.sat_validated === true || client.validated_by_human === true || client.ready_for_provider_sync === true,
    raw_provider_response_sanitized: client.raw_provider_response_sanitized || {},
    sat_field_normalization: {
      fiscal_regime: {
        ok: fiscalRegimeNormalization.ok,
        status: fiscalRegimeNormalization.status,
        input: fiscalRegimeNormalization.input,
        key: fiscalRegimeNormalization.key,
        description: fiscalRegimeNormalization.description,
        warnings: fiscalRegimeNormalization.warnings,
        errors: fiscalRegimeNormalization.errors,
      },
      cfdi_use: {
        ok: cfdiUseNormalization.ok,
        status: cfdiUseNormalization.status,
        input: cfdiUseNormalization.input,
        key: cfdiUseNormalization.key,
        description: cfdiUseNormalization.description,
        warnings: cfdiUseNormalization.warnings,
        errors: cfdiUseNormalization.errors,
      },
    },
  });
}

function validateFacturaComClientCreateInput(client = {}, options = {}) {
  const canonical = canonicalClientFromLocalClient(client, options);
  const errors = [];
  const warnings = [];

  if (!text(canonical.local_client_id)) errors.push("LOCAL_CLIENT_ID_REQUIRED");
  if (!hasValidRfcShape(canonical.tax_id)) errors.push("CLIENT_RFC_INVALID_OR_MISSING");
  if (GENERIC_RFCS.has(normalizeRfc(canonical.tax_id)) && options.allowGenericRfc !== true) {
    errors.push("GENERIC_RFC_NOT_ALLOWED_FOR_PROVIDER_SYNC");
  }
  if (!text(canonical.legal_name)) errors.push("CLIENT_LEGAL_NAME_REQUIRED");
  if (!text(canonical.fiscal_zip) || !/^\d{5}$/.test(canonical.fiscal_zip)) errors.push("CLIENT_FISCAL_ZIP_REQUIRED");
  if (!text(canonical.fiscal_regime)) errors.push("CLIENT_FISCAL_REGIME_REQUIRED");
  if (canonical.sat_field_normalization?.fiscal_regime?.ok === false) errors.push("CLIENT_FISCAL_REGIME_NEEDS_CONFIRMATION");
  if (!text(canonical.cfdi_use)) warnings.push("CLIENT_CFDI_USE_DEFAULTED");
  if (canonical.sat_field_normalization?.cfdi_use?.ok === false) errors.push("CLIENT_CFDI_USE_NEEDS_CONFIRMATION");
  if (canonical.sat_validated !== true) errors.push("CLIENT_NOT_VALIDATED_FOR_PROVIDER_SYNC");

  return {
    ok: errors.length === 0,
    status: errors.length ? "NEEDS_CLIENT_DATA" : "OK",
    errors,
    warnings,
    canonical_client: canonical,
    safe_client: safeProviderClientSummary({
      provider_client_uid: canonical.provider_client_uid,
      rfc: canonical.tax_id,
      legal_name: canonical.legal_name,
    }),
  };
}

function mapCanonicalProviderClientToFacturaComPayload(client = {}, options = {}) {
  const canonical = canonicalClientFromLocalClient(client, options);
  return {
    rfc: canonical.tax_id,
    razons: canonical.legal_name,
    codpos: canonical.fiscal_zip,
    regimen: canonical.fiscal_regime,
    usocfdi: canonical.cfdi_use || "G03",
    email: canonical.email || options.defaultEmail || "",
    pais: "MEX",
  };
}

module.exports = {
  GENERIC_RFCS,
  canonicalClientFromLocalClient,
  hasValidRfcShape,
  mapCanonicalProviderClientToFacturaComPayload,
  normalizeRfc,
  redactRfc,
  redactUid,
  safeProviderClientSummary,
  validateFacturaComClientCreateInput,
};

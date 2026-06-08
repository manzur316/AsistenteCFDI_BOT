const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function result(errors, warnings = []) {
  return { ok: errors.length === 0, errors, warnings, contract: "CanonicalProviderClient" };
}

function assertCanonicalProviderClient(client) {
  const errors = [];
  if (!isPlainObject(client)) return result(["CanonicalProviderClient debe ser objeto"]);
  if (!normalizeProviderName(client.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(client.environment)) errors.push("environment requerido");
  if (!hasText(client.local_client_id)) errors.push("local_client_id requerido");
  if (!hasText(client.sync_status)) errors.push("sync_status requerido");
  if (!isPlainObject(client.raw_provider_response_sanitized)) errors.push("raw_provider_response_sanitized debe ser objeto");
  if (!client.provider_client_id && !client.provider_client_uid) {
    errors.push("provider_client_id o provider_client_uid requerido");
  }
  if (client.sat_validated !== undefined && typeof client.sat_validated !== "boolean") {
    errors.push("sat_validated debe ser boolean");
  }
  return result(errors);
}

function buildCanonicalProviderClient(input = {}) {
  return {
    local_client_id: input.local_client_id || null,
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
    provider_client_id: input.provider_client_id || null,
    provider_client_uid: input.provider_client_uid || null,
    legal_name: input.legal_name || null,
    tax_id: input.tax_id || null,
    fiscal_zip: input.fiscal_zip || null,
    fiscal_regime: input.fiscal_regime || null,
    cfdi_use: input.cfdi_use || null,
    email: input.email || null,
    sync_status: input.sync_status || "NEEDS_SYNC",
    sat_validated: input.sat_validated === true,
    raw_provider_response_sanitized: input.raw_provider_response_sanitized || {},
    sat_field_normalization: input.sat_field_normalization || null,
  };
}

module.exports = {
  assertCanonicalProviderClient,
  buildCanonicalProviderClient,
};

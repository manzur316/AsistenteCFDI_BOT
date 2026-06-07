const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");

const CAPABILITY_KEYS = Object.freeze([
  "supports_clients",
  "supports_client_create",
  "supports_client_update",
  "supports_client_delete",
  "supports_client_validation",
  "supports_client_edit_link",
  "supports_products",
  "supports_invoice_create",
  "supports_invoice_draft",
  "supports_invoice_stamp",
  "supports_invoice_list",
  "supports_invoice_get",
  "supports_invoice_cancel",
  "supports_cancel_status",
  "supports_download_xml",
  "supports_download_pdf",
  "supports_download_zip",
  "supports_payment_status",
  "supports_payment_complement",
  "supports_multi_org",
  "supports_webhooks",
  "supports_self_invoice",
  "supports_stripe_app",
  "supports_partner_clients",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function result(errors, warnings = []) {
  return { ok: errors.length === 0, errors, warnings, contract: "CanonicalProviderCapabilities" };
}

function assertCanonicalProviderCapabilities(capabilities) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(capabilities)) return result(["CanonicalProviderCapabilities debe ser objeto"]);
  if (!normalizeProviderName(capabilities.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(capabilities.environment)) errors.push("environment requerido");
  for (const key of CAPABILITY_KEYS) {
    if (typeof capabilities[key] !== "boolean") errors.push(`${key} debe ser boolean`);
  }
  if (capabilities.supports_invoice_stamp !== true) warnings.push("provider sin timbrado directo");
  return result(errors, warnings);
}

function buildCapabilities(input = {}) {
  const base = {
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
  };
  for (const key of CAPABILITY_KEYS) base[key] = input[key] === true;
  return base;
}

module.exports = {
  CAPABILITY_KEYS,
  assertCanonicalProviderCapabilities,
  buildCapabilities,
};

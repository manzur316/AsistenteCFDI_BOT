const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");
const { assertCanonicalProviderCapabilities } = require("./provider-capabilities.contract");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function result(errors, warnings = []) {
  return { ok: errors.length === 0, errors, warnings, contract: "CanonicalProviderAccount" };
}

function assertCanonicalProviderAccount(account) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(account)) return result(["CanonicalProviderAccount debe ser objeto"]);
  if (!normalizeProviderName(account.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(account.environment)) errors.push("environment requerido");
  if (!hasText(account.tenant_id)) errors.push("tenant_id requerido");
  if (!hasText(account.provider_account_id)) errors.push("provider_account_id requerido");
  if (!hasText(account.auth_type)) errors.push("auth_type requerido");
  if (!hasText(account.status)) errors.push("status requerido");
  if (!isPlainObject(account.capabilities)) errors.push("capabilities requerido");
  if (isPlainObject(account.capabilities)) {
    const capabilities = assertCanonicalProviderCapabilities({
      provider: account.provider,
      environment: account.environment,
      ...account.capabilities,
    });
    errors.push(...capabilities.errors.map((error) => `capabilities.${error}`));
    warnings.push(...capabilities.warnings);
  }
  return result(errors, warnings);
}

function buildCanonicalProviderAccount(input = {}) {
  return {
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
    tenant_id: input.tenant_id || null,
    provider_account_id: input.provider_account_id || null,
    provider_organization_id: input.provider_organization_id || null,
    auth_type: input.auth_type || null,
    credentials_ref: input.credentials_ref || null,
    status: input.status || "DRAFT",
    capabilities: input.capabilities || {},
  };
}

module.exports = {
  assertCanonicalProviderAccount,
  buildCanonicalProviderAccount,
};

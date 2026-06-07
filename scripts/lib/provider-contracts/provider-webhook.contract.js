const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function result(errors) {
  return { ok: errors.length === 0, errors, warnings: [], contract: "CanonicalProviderWebhookEvent" };
}

function assertCanonicalProviderWebhookEvent(event) {
  const errors = [];
  if (!isPlainObject(event)) return result(["CanonicalProviderWebhookEvent debe ser objeto"]);
  if (!normalizeProviderName(event.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(event.environment)) errors.push("environment requerido");
  if (!hasText(event.event_id)) errors.push("event_id requerido");
  if (!hasText(event.event_type)) errors.push("event_type requerido");
  if (!isPlainObject(event.payload_sanitized)) errors.push("payload_sanitized debe ser objeto");
  if (event.processed !== undefined && typeof event.processed !== "boolean") errors.push("processed debe ser boolean");
  return result(errors);
}

function buildCanonicalProviderWebhookEvent(input = {}) {
  return {
    event_id: input.event_id || null,
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
    provider_account_id: input.provider_account_id || null,
    event_type: input.event_type || null,
    provider_invoice_id: input.provider_invoice_id || null,
    provider_client_id: input.provider_client_id || null,
    received_at: input.received_at || null,
    processed: input.processed === true,
    payload_sanitized: input.payload_sanitized || {},
  };
}

module.exports = {
  assertCanonicalProviderWebhookEvent,
  buildCanonicalProviderWebhookEvent,
};

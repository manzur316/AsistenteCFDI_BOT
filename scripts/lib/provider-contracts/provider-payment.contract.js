const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumberOrNull(value) {
  return value === null || value === undefined || (typeof value === "number" && Number.isFinite(value));
}

function result(errors) {
  return { ok: errors.length === 0, errors, warnings: [], contract: "CanonicalProviderPaymentState" };
}

function assertCanonicalProviderPaymentState(payment) {
  const errors = [];
  if (!isPlainObject(payment)) return result(["CanonicalProviderPaymentState debe ser objeto"]);
  if (!normalizeProviderName(payment.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(payment.environment)) errors.push("environment requerido");
  if (!hasText(payment.local_invoice_id)) errors.push("local_invoice_id requerido");
  if (!hasText(payment.payment_status_local)) errors.push("payment_status_local requerido");
  if (!isNumberOrNull(payment.paid_amount)) errors.push("paid_amount debe ser numero o null");
  if (!isNumberOrNull(payment.remaining_amount)) errors.push("remaining_amount debe ser numero o null");
  if (typeof payment.complement_required !== "boolean") errors.push("complement_required debe ser boolean");
  return result(errors);
}

function buildCanonicalProviderPaymentState(input = {}) {
  return {
    local_invoice_id: input.local_invoice_id || null,
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
    provider_invoice_id: input.provider_invoice_id || null,
    payment_status_local: input.payment_status_local || "UNPAID",
    payment_status_provider: input.payment_status_provider || null,
    due_date: input.due_date || null,
    paid_amount: input.paid_amount ?? null,
    remaining_amount: input.remaining_amount ?? null,
    paid_at: input.paid_at || null,
    complement_required: input.complement_required === true,
    complement_provider_invoice_id: input.complement_provider_invoice_id || null,
  };
}

module.exports = {
  assertCanonicalProviderPaymentState,
  buildCanonicalProviderPaymentState,
};

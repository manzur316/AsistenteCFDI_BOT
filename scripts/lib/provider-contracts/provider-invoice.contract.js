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

function result(errors, warnings = []) {
  return { ok: errors.length === 0, errors, warnings, contract: "CanonicalProviderInvoice" };
}

function assertCanonicalProviderInvoice(invoice) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(invoice)) return result(["CanonicalProviderInvoice debe ser objeto"]);
  if (!normalizeProviderName(invoice.provider)) errors.push("provider requerido");
  if (!normalizeProviderEnvironment(invoice.environment)) errors.push("environment requerido");
  if (!hasText(invoice.local_draft_id) && !hasText(invoice.local_invoice_id)) errors.push("local_draft_id o local_invoice_id requerido");
  if (!hasText(invoice.invoice_status)) errors.push("invoice_status requerido");
  if (!hasText(invoice.payment_status_local)) errors.push("payment_status_local requerido");
  if (!isNumberOrNull(invoice.subtotal)) errors.push("subtotal debe ser numero o null");
  if (!isNumberOrNull(invoice.total)) errors.push("total debe ser numero o null");
  if (typeof invoice.xml_available !== "boolean") errors.push("xml_available debe ser boolean");
  if (typeof invoice.pdf_available !== "boolean") errors.push("pdf_available debe ser boolean");
  if (typeof invoice.xml_downloaded !== "boolean") errors.push("xml_downloaded debe ser boolean");
  if (typeof invoice.pdf_downloaded !== "boolean") errors.push("pdf_downloaded debe ser boolean");
  if (!isPlainObject(invoice.raw_provider_response_sanitized)) errors.push("raw_provider_response_sanitized debe ser objeto");
  if (!invoice.provider_invoice_id && !invoice.provider_invoice_uid && !invoice.uuid) {
    warnings.push("invoice sin identidad provider aun");
  }
  return result(errors, warnings);
}

function buildCanonicalProviderInvoice(input = {}) {
  return {
    local_draft_id: input.local_draft_id || null,
    local_invoice_id: input.local_invoice_id || null,
    provider: normalizeProviderName(input.provider),
    environment: normalizeProviderEnvironment(input.environment),
    provider_invoice_id: input.provider_invoice_id || null,
    provider_invoice_uid: input.provider_invoice_uid || null,
    uuid: input.uuid || null,
    serie: input.serie || null,
    folio: input.folio || null,
    folio_number: input.folio_number || null,
    issued_at: input.issued_at || null,
    receiver_provider_client_id: input.receiver_provider_client_id || null,
    subtotal: input.subtotal ?? null,
    total: input.total ?? null,
    provider_status: input.provider_status || null,
    invoice_status: input.invoice_status || "DRAFT",
    cancellation_status: input.cancellation_status || null,
    payment_status_provider: input.payment_status_provider || null,
    payment_status_local: input.payment_status_local || "UNPAID",
    xml_available: input.xml_available === true,
    pdf_available: input.pdf_available === true,
    xml_downloaded: input.xml_downloaded === true,
    pdf_downloaded: input.pdf_downloaded === true,
    raw_provider_response_sanitized: input.raw_provider_response_sanitized || {},
  };
}

module.exports = {
  assertCanonicalProviderInvoice,
  buildCanonicalProviderInvoice,
};

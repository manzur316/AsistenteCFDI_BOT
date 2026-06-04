const INVOICE_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  PENDING_CONFIRMATION: "PENDING_CONFIRMATION",
  READY_FOR_PAC_SANDBOX: "READY_FOR_PAC_SANDBOX",
  SANDBOX_STAMPED: "SANDBOX_STAMPED",
  PRODUCTION_STAMPED: "PRODUCTION_STAMPED",
  DRAFT_CANCELLED: "DRAFT_CANCELLED",
  SANDBOX_CANCEL_REQUESTED: "SANDBOX_CANCEL_REQUESTED",
  SANDBOX_CANCELLED: "SANDBOX_CANCELLED",
  PRODUCTION_CANCEL_REQUESTED: "PRODUCTION_CANCEL_REQUESTED",
  PRODUCTION_CANCELLED: "PRODUCTION_CANCELLED",
  CANCEL_FAILED: "CANCEL_FAILED",
  CANCEL_REVIEW_REQUIRED: "CANCEL_REVIEW_REQUIRED",
});

const PAYMENT_STATUSES = Object.freeze({
  UNPAID: "UNPAID",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
  OVERDUE: "OVERDUE",
  NOT_COLLECTIBLE: "NOT_COLLECTIBLE",
});

const REVIEW_STATUSES = Object.freeze({
  NEEDS_REVIEW: "NEEDS_REVIEW",
  REVIEWED: "REVIEWED",
  APPROVED_BY_HUMAN: "APPROVED_BY_HUMAN",
  REJECTED_BY_HUMAN: "REJECTED_BY_HUMAN",
  BLOCKED: "BLOCKED",
});

const CANCELLATION_STATUSES = Object.freeze({
  DRAFT_CANCELLED: "DRAFT_CANCELLED",
  SANDBOX_CANCEL_REQUESTED: "SANDBOX_CANCEL_REQUESTED",
  SANDBOX_CANCELLED: "SANDBOX_CANCELLED",
  PRODUCTION_CANCEL_REQUESTED: "PRODUCTION_CANCEL_REQUESTED",
  PRODUCTION_CANCELLED: "PRODUCTION_CANCELLED",
  CANCEL_FAILED: "CANCEL_FAILED",
  CANCEL_REVIEW_REQUIRED: "CANCEL_REVIEW_REQUIRED",
});

const PAC_ENVIRONMENTS = Object.freeze({
  SANDBOX: "SANDBOX",
  PRODUCTION: "PRODUCTION",
});

const ARTIFACT_TYPES = Object.freeze({
  PAYLOAD_JSON: "PAYLOAD_JSON",
  PAC_RESPONSE_JSON: "PAC_RESPONSE_JSON",
  XML: "XML",
  PDF: "PDF",
  MANIFEST: "MANIFEST",
  REPORT: "REPORT",
});

function result(errors, warnings = [], meta = {}) {
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    ...meta,
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function enumValues(enumObject) {
  return Object.values(enumObject);
}

function hasValidEnum(value, enumObject) {
  return enumValues(enumObject).includes(value);
}

function pushRequiredText(errors, object, field, label = field) {
  if (!hasText(object?.[field])) errors.push(`${label} requerido`);
}

function validateLineItem(lineItem, index) {
  const errors = [];
  if (!isPlainObject(lineItem)) return [`line_items[${index}] debe ser objeto`];
  pushRequiredText(errors, lineItem, "line_id", `line_items[${index}].line_id`);
  pushRequiredText(errors, lineItem, "description", `line_items[${index}].description`);
  pushRequiredText(errors, lineItem, "unit_key", `line_items[${index}].unit_key`);
  pushRequiredText(errors, lineItem, "product_service_key", `line_items[${index}].product_service_key`);
  pushRequiredText(errors, lineItem, "tax_object", `line_items[${index}].tax_object`);
  if (!isNumber(lineItem.quantity) || lineItem.quantity <= 0) errors.push(`line_items[${index}].quantity debe ser mayor a 0`);
  if (!isNumber(lineItem.unit_price) || lineItem.unit_price < 0) errors.push(`line_items[${index}].unit_price invalido`);
  if (!isNumber(lineItem.subtotal) || lineItem.subtotal < 0) errors.push(`line_items[${index}].subtotal invalido`);
  if (!Array.isArray(lineItem.taxes)) errors.push(`line_items[${index}].taxes debe ser arreglo`);
  if (lineItem.requires_human_review !== true) errors.push(`line_items[${index}].requires_human_review debe ser true`);
  return errors;
}

function validateCanonicalDraft(draft) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(draft)) return result(["CanonicalDraft debe ser objeto"]);

  for (const field of [
    "draft_id",
    "emitter_id",
    "client_id",
    "source_channel",
    "source_message_id",
    "original_text",
    "status",
    "review_status",
    "created_at",
    "updated_at",
  ]) {
    pushRequiredText(errors, draft, field);
  }

  if (!hasValidEnum(draft.status, INVOICE_STATUSES)) errors.push("status desconocido");
  if (!hasValidEnum(draft.review_status, REVIEW_STATUSES)) errors.push("review_status desconocido");
  if (typeof draft.confirmed_by_human !== "boolean") errors.push("confirmed_by_human debe ser boolean");
  if (draft.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  if (!Array.isArray(draft.fiscal_warnings)) errors.push("fiscal_warnings debe ser arreglo");
  if (!Array.isArray(draft.blockers)) errors.push("blockers debe ser arreglo");
  if (!Array.isArray(draft.line_items) || draft.line_items.length === 0) errors.push("line_items requerido");
  for (const [index, lineItem] of (draft.line_items || []).entries()) {
    errors.push(...validateLineItem(lineItem, index));
  }
  if (!isPlainObject(draft.totals)) errors.push("totals debe ser objeto");
  if (isPlainObject(draft.totals) && !isNumber(draft.totals.total)) errors.push("totals.total requerido");
  if (draft.confirmed_by_human !== true) warnings.push("draft aun no confirmado por humano");

  return result(errors, warnings, { contract: "CanonicalDraft" });
}

function validateCanonicalInvoiceDocument(invoice, context = {}) {
  const errors = [];
  const warnings = [];
  if (!isPlainObject(invoice)) return result(["CanonicalInvoiceDocument debe ser objeto"]);

  for (const field of [
    "internal_invoice_id",
    "draft_id",
    "emitter_id",
    "client_id",
    "status",
    "payment_status",
    "review_status",
    "issued_at",
  ]) {
    pushRequiredText(errors, invoice, field);
  }

  if (!hasValidEnum(invoice.status, INVOICE_STATUSES)) errors.push("status desconocido");
  if (!hasValidEnum(invoice.payment_status, PAYMENT_STATUSES)) errors.push("payment_status desconocido");
  if (!hasValidEnum(invoice.review_status, REVIEW_STATUSES)) errors.push("review_status desconocido");
  if (invoice.pac_environment && !hasValidEnum(invoice.pac_environment, PAC_ENVIRONMENTS)) errors.push("pac_environment desconocido");
  if (!isNumber(invoice.subtotal) || invoice.subtotal < 0) errors.push("subtotal invalido");
  if (!isPlainObject(invoice.taxes)) errors.push("taxes debe ser objeto");
  if (!isNumber(invoice.total) || invoice.total < 0) errors.push("total invalido");
  if (!isPlainObject(invoice.storage_refs)) errors.push("storage_refs debe ser objeto");
  if (!isPlainObject(invoice.pac_refs)) errors.push("pac_refs debe ser objeto");
  if (!Array.isArray(invoice.audit_refs)) errors.push("audit_refs debe ser arreglo");

  const productionTouched = invoice.pac_environment === PAC_ENVIRONMENTS.PRODUCTION
    || invoice.status === INVOICE_STATUSES.PRODUCTION_STAMPED
    || invoice.status === INVOICE_STATUSES.PRODUCTION_CANCEL_REQUESTED
    || invoice.status === INVOICE_STATUSES.PRODUCTION_CANCELLED;
  if (productionTouched && context.productionAuthorized !== true) {
    errors.push("produccion no autorizada para CanonicalInvoiceDocument");
  }

  if (invoice.status.endsWith("CANCELLED")) warnings.push("documento cancelado se conserva para auditoria");
  return result(errors, warnings, { contract: "CanonicalInvoiceDocument" });
}

function validateCanonicalPacResult(pacResult) {
  const errors = [];
  if (!isPlainObject(pacResult)) return result(["CanonicalPacResult debe ser objeto"]);

  if (typeof pacResult.ok !== "boolean") errors.push("ok debe ser boolean");
  pushRequiredText(errors, pacResult, "provider");
  if (!hasValidEnum(pacResult.environment, PAC_ENVIRONMENTS)) errors.push("environment desconocido");
  pushRequiredText(errors, pacResult, "operation");
  pushRequiredText(errors, pacResult, "status");
  if (!Array.isArray(pacResult.normalized_errors)) errors.push("normalized_errors debe ser arreglo");
  if (!Array.isArray(pacResult.normalized_warnings)) errors.push("normalized_warnings debe ser arreglo");
  if (pacResult.ok === false && pacResult.normalized_errors.length === 0) errors.push("PAC result fallido requiere normalized_errors");
  if (pacResult.requires_human_review !== true) errors.push("requires_human_review debe ser true");

  return result(errors, [], { contract: "CanonicalPacResult" });
}

function validatePaymentStatus(status) {
  return result(hasValidEnum(status, PAYMENT_STATUSES) ? [] : ["payment_status desconocido"]);
}

function validateCancellationTransition(input) {
  const currentStatus = input?.currentStatus || input?.from;
  const nextStatus = input?.nextStatus || input?.to;
  const pacResult = input?.pacResult || null;
  const context = input?.context || {};
  const errors = [];
  const warnings = [];

  if (!hasValidEnum(currentStatus, INVOICE_STATUSES)) errors.push("currentStatus desconocido");
  if (!hasValidEnum(nextStatus, INVOICE_STATUSES)) errors.push("nextStatus desconocido");
  if (errors.length) return result(errors, warnings, { audit_required: true, must_delete: false });

  const productionCancellation = nextStatus === INVOICE_STATUSES.PRODUCTION_CANCEL_REQUESTED
    || nextStatus === INVOICE_STATUSES.PRODUCTION_CANCELLED
    || currentStatus === INVOICE_STATUSES.PRODUCTION_STAMPED
    || currentStatus === INVOICE_STATUSES.PRODUCTION_CANCEL_REQUESTED;
  if (productionCancellation && context.productionCancellationAuthorized !== true) {
    errors.push("cancelacion de produccion bloqueada por ahora");
  }

  if (nextStatus === INVOICE_STATUSES.DRAFT_CANCELLED && currentStatus !== INVOICE_STATUSES.DRAFT) {
    errors.push("DRAFT_CANCELLED solo aplica desde DRAFT no timbrado");
  }

  if (nextStatus === INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED && currentStatus !== INVOICE_STATUSES.SANDBOX_STAMPED) {
    errors.push("SANDBOX_CANCEL_REQUESTED requiere SANDBOX_STAMPED");
  }

  if (nextStatus === INVOICE_STATUSES.SANDBOX_CANCELLED) {
    if (currentStatus !== INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED) errors.push("SANDBOX_CANCELLED requiere solicitud previa");
    if (pacResult && pacResult.ok !== true) errors.push("SANDBOX_CANCELLED requiere PAC ok");
  }

  if (nextStatus === INVOICE_STATUSES.CANCEL_FAILED) {
    if (!pacResult || pacResult.ok !== false) errors.push("CANCEL_FAILED requiere error PAC normalizado");
  }

  if (nextStatus === INVOICE_STATUSES.CANCEL_REVIEW_REQUIRED && !input?.reason) {
    warnings.push("CANCEL_REVIEW_REQUIRED debe pedir motivo minimo al usuario");
  }

  return result(errors, warnings, {
    audit_required: true,
    must_delete: false,
    previous_status: currentStatus,
    new_status: nextStatus,
  });
}

module.exports = {
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  REVIEW_STATUSES,
  CANCELLATION_STATUSES,
  PAC_ENVIRONMENTS,
  ARTIFACT_TYPES,
  validateCanonicalDraft,
  validateCanonicalInvoiceDocument,
  validateCanonicalPacResult,
  validateCancellationTransition,
  validatePaymentStatus,
};

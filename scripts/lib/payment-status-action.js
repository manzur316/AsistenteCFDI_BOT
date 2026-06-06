const {
  PAYMENT_STATUSES,
  PAYMENT_EVENTS,
  evaluatePaymentStatusChange,
  normalizePaymentStatus,
} = require("./invoice-payment-status-model");

const PAYMENT_STATUS_ACTION_VERSION = "PAYMENT_STATUS_ACTION_V1";

const PAYMENT_STATUS_ACTIONS = Object.freeze({
  MARK_PAYMENT_PENDING: PAYMENT_STATUSES.PENDIENTE,
  MARK_PAYMENT_PAID: PAYMENT_STATUSES.PAGADO,
  MARK_PAYMENT_PARTIAL: PAYMENT_STATUSES.PARCIAL,
  MARK_PAYMENT_OVERDUE: PAYMENT_STATUSES.VENCIDO,
});

const PAYMENT_STATUS_LABELS = Object.freeze({
  [PAYMENT_STATUSES.PENDIENTE]: "pendiente",
  [PAYMENT_STATUSES.PAGADO]: "pagada",
  [PAYMENT_STATUSES.PARCIAL]: "parcial",
  [PAYMENT_STATUSES.VENCIDO]: "vencida",
  [PAYMENT_STATUSES.NO_APLICA]: "no aplica",
});

const SENSITIVE_VALUE_PATTERNS = [
  /\b[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /[A-Za-z]:[\\/][^\s]+/g,
  /\b(?:token|secret|api[-_ ]?key|credential|password|csd|\.env)\b/gi,
  /\b(?:xml|pdf|zip|xlsx|xls)\b/gi,
];

function safeText(value, fallback = "N/A") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return SENSITIVE_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), raw);
}

function paymentStatusFromAction(action) {
  const normalized = String(action || "").trim().toUpperCase();
  return PAYMENT_STATUS_ACTIONS[normalized] || null;
}

function isPaymentStatusAction(action) {
  return Boolean(paymentStatusFromAction(action));
}

function labelForPaymentStatus(status) {
  return PAYMENT_STATUS_LABELS[normalizePaymentStatus(status)] || String(status || "N/A").toLowerCase();
}

function eventTypeForTarget(targetStatus) {
  const target = normalizePaymentStatus(targetStatus);
  if (target === PAYMENT_STATUSES.PENDIENTE) return PAYMENT_EVENTS.PAYMENT_STATUS_SET_PENDING;
  if (target === PAYMENT_STATUSES.PAGADO) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_PAID;
  if (target === PAYMENT_STATUSES.PARCIAL) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_PARTIAL;
  if (target === PAYMENT_STATUSES.VENCIDO) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_OVERDUE;
  return PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED;
}

function reasonMessage(reason) {
  if (reason === "CANCELLED_INVOICE_PAYMENT_BLOCKED") return "La factura esta cancelada en sandbox.";
  if (reason === "INVOICE_NOT_ACTIVE_FOR_COLLECTION") return "La factura aun no esta timbrada en sandbox.";
  if (reason === "PRODUCTION_STATUS_FUTURE_BLOCKED") return "Los estados productivos futuros siguen bloqueados.";
  if (reason === "INVOICE_NOT_FOUND") return "No encontre la factura o borrador.";
  return String(reason || "Cambio no permitido.");
}

function safeInvoiceSnapshot(invoice, paymentStatus) {
  if (!invoice) return null;
  return {
    draft_id: safeText(invoice.draft_id || invoice.internal_invoice_id || "N/A"),
    client_id: safeText(invoice.client_id || invoice.client_ref || "N/A"),
    invoice_status: safeText(invoice.invoice_status || invoice.status || "N/A"),
    payment_status: normalizePaymentStatus(paymentStatus || invoice.payment_status || PAYMENT_STATUSES.NO_APLICA),
    total: Number.isFinite(Number(invoice.total)) ? Math.round(Number(invoice.total) * 100) / 100 : null,
  };
}

function buildTelegramMessage(invoice, evaluation, targetStatus) {
  const invoiceStatus = safeText(evaluation.invoice_status || invoice?.invoice_status || invoice?.status || "N/A");
  const currentStatus = safeText(evaluation.previous_payment_status || invoice?.payment_status || "NO_APLICA");
  const target = safeText(evaluation.new_payment_status || targetStatus);
  const draftId = safeText(invoice?.draft_id || invoice?.internal_invoice_id || "N/A");
  const clientId = safeText(invoice?.client_id || invoice?.client_ref || "N/A");

  if (!evaluation.ok) {
    return [
      "No se puede cambiar el estado de pago.",
      "",
      "Motivo:",
      reasonMessage(evaluation.reason),
      "",
      "Estado factura: " + invoiceStatus,
      "Estado pago: " + currentStatus,
    ].join("\n");
  }

  if (evaluation.idempotent) {
    return [
      "La factura ya estaba marcada como " + labelForPaymentStatus(target) + ".",
      "No se duplico el evento.",
      "",
      "Estado factura: " + invoiceStatus,
      "Estado pago: " + target,
      "",
      "Borrador sujeto a revision humana. No sustituye contador.",
    ].join("\n");
  }

  return [
    "Pago actualizado",
    "",
    "Cliente: " + clientId,
    "Factura: " + draftId,
    "Estado factura: " + invoiceStatus,
    "Estado pago: " + target,
    "",
    "Borrador sujeto a revision humana. No sustituye contador.",
  ].join("\n");
}

function buildPaymentStatusChangeResult(invoice, targetStatus, options = {}) {
  const target = normalizePaymentStatus(targetStatus);
  const evaluation = evaluatePaymentStatusChange(invoice, target, options);
  const eventType = evaluation.ok && !evaluation.idempotent
    ? eventTypeForTarget(target)
    : evaluation.ok
      ? null
      : PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED;
  const updatedInvoice = safeInvoiceSnapshot(invoice, evaluation.ok && !evaluation.idempotent ? target : invoice?.payment_status);

  return {
    version: PAYMENT_STATUS_ACTION_VERSION,
    ok: evaluation.ok,
    blocked: !evaluation.ok,
    idempotent: evaluation.idempotent === true,
    event_type: eventType,
    reason: evaluation.reason,
    invoice_status: evaluation.invoice_status || null,
    previous_payment_status: evaluation.previous_payment_status || null,
    new_payment_status: evaluation.new_payment_status || target,
    target_payment_status: target,
    invoice: updatedInvoice,
    draft_id: safeText(invoice?.draft_id || invoice?.internal_invoice_id || "N/A"),
    client_id: safeText(invoice?.client_id || invoice?.client_ref || "N/A"),
    telegram_message: buildTelegramMessage(invoice, evaluation, target),
    requires_human_review: true,
    should_record_event: Boolean(eventType),
  };
}

function setInvoicePaymentStatus(invoice, targetStatus, options = {}) {
  return buildPaymentStatusChangeResult(invoice, targetStatus, options);
}

function markInvoicePending(invoice, options = {}) {
  return setInvoicePaymentStatus(invoice, PAYMENT_STATUSES.PENDIENTE, options);
}

function markInvoicePaid(invoice, options = {}) {
  return setInvoicePaymentStatus(invoice, PAYMENT_STATUSES.PAGADO, options);
}

function markInvoicePartial(invoice, options = {}) {
  return setInvoicePaymentStatus(invoice, PAYMENT_STATUSES.PARCIAL, options);
}

function markInvoiceOverdue(invoice, options = {}) {
  return setInvoicePaymentStatus(invoice, PAYMENT_STATUSES.VENCIDO, options);
}

module.exports = {
  PAYMENT_STATUS_ACTION_VERSION,
  PAYMENT_STATUS_ACTIONS,
  paymentStatusFromAction,
  isPaymentStatusAction,
  setInvoicePaymentStatus,
  markInvoicePending,
  markInvoicePaid,
  markInvoicePartial,
  markInvoiceOverdue,
  buildPaymentStatusChangeResult,
};

const INVOICE_STATUSES = Object.freeze({
  BORRADOR: "BORRADOR",
  APROBADO: "APROBADO",
  SANDBOX_TIMBRANDO: "SANDBOX_TIMBRANDO",
  SANDBOX_TIMBRADO: "SANDBOX_TIMBRADO",
  SANDBOX_ERROR: "SANDBOX_ERROR",
  SANDBOX_CANCELANDO: "SANDBOX_CANCELANDO",
  SANDBOX_CANCELADO: "SANDBOX_CANCELADO",
  SANDBOX_CANCEL_ERROR: "SANDBOX_CANCEL_ERROR",
  PRODUCCION_TIMBRADO_FUTURO: "PRODUCCION_TIMBRADO_FUTURO",
  PRODUCCION_CANCELADO_FUTURO: "PRODUCCION_CANCELADO_FUTURO",
});

const PAYMENT_STATUSES = Object.freeze({
  NO_APLICA: "NO_APLICA",
  PENDIENTE: "PENDIENTE",
  PARCIAL: "PARCIAL",
  PAGADO: "PAGADO",
  VENCIDO: "VENCIDO",
});

const PAYMENT_EVENTS = Object.freeze({
  PAYMENT_STATUS_SET_PENDING: "PAYMENT_STATUS_SET_PENDING",
  PAYMENT_STATUS_MARKED_PAID: "PAYMENT_STATUS_MARKED_PAID",
  PAYMENT_STATUS_MARKED_PARTIAL: "PAYMENT_STATUS_MARKED_PARTIAL",
  PAYMENT_STATUS_MARKED_OVERDUE: "PAYMENT_STATUS_MARKED_OVERDUE",
  PAYMENT_STATUS_CHANGE_BLOCKED: "PAYMENT_STATUS_CHANGE_BLOCKED",
});

const LEGACY_INVOICE_STATUS_ALIASES = Object.freeze({
  PENDIENTE: INVOICE_STATUSES.BORRADOR,
  DRAFT: INVOICE_STATUSES.BORRADOR,
  READY_FOR_PAC_SANDBOX: INVOICE_STATUSES.APROBADO,
  SANDBOX_STAMPED: INVOICE_STATUSES.SANDBOX_TIMBRADO,
  SANDBOX_CANCELLED: INVOICE_STATUSES.SANDBOX_CANCELADO,
  CANCELLED: INVOICE_STATUSES.SANDBOX_CANCELADO,
  CANCELADO: INVOICE_STATUSES.SANDBOX_CANCELADO,
  ERROR: INVOICE_STATUSES.SANDBOX_ERROR,
});

const LEGACY_PAYMENT_STATUS_ALIASES = Object.freeze({
  UNPAID: PAYMENT_STATUSES.PENDIENTE,
  PARTIALLY_PAID: PAYMENT_STATUSES.PARCIAL,
  PAID: PAYMENT_STATUSES.PAGADO,
  OVERDUE: PAYMENT_STATUSES.VENCIDO,
  NOT_COLLECTIBLE: PAYMENT_STATUSES.NO_APLICA,
});

const ACTIVE_INVOICE_STATUSES = new Set([
  INVOICE_STATUSES.SANDBOX_TIMBRADO,
]);

const CANCELLED_INVOICE_STATUSES = new Set([
  INVOICE_STATUSES.SANDBOX_CANCELADO,
  INVOICE_STATUSES.PRODUCCION_CANCELADO_FUTURO,
]);

const DRAFT_LIKE_INVOICE_STATUSES = new Set([
  INVOICE_STATUSES.BORRADOR,
  INVOICE_STATUSES.APROBADO,
]);

const FUTURE_PRODUCTION_STATUSES = new Set([
  INVOICE_STATUSES.PRODUCCION_TIMBRADO_FUTURO,
  INVOICE_STATUSES.PRODUCCION_CANCELADO_FUTURO,
]);

function text(value) {
  return String(value ?? "").trim();
}

function normalizeEnumInput(value) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeInvoiceStatus(value) {
  const normalized = normalizeEnumInput(value);
  if (INVOICE_STATUSES[normalized]) return INVOICE_STATUSES[normalized];
  if (LEGACY_INVOICE_STATUS_ALIASES[normalized]) return LEGACY_INVOICE_STATUS_ALIASES[normalized];
  throw new Error(`invoice_status desconocido: ${value || "N/A"}`);
}

function normalizePaymentStatus(value) {
  const normalized = normalizeEnumInput(value || PAYMENT_STATUSES.NO_APLICA);
  if (PAYMENT_STATUSES[normalized]) return PAYMENT_STATUSES[normalized];
  if (LEGACY_PAYMENT_STATUS_ALIASES[normalized]) return LEGACY_PAYMENT_STATUS_ALIASES[normalized];
  throw new Error(`payment_status desconocido: ${value || "N/A"}`);
}

function invoiceStatusOf(invoice = {}) {
  return normalizeInvoiceStatus(invoice.invoice_status || invoice.status || INVOICE_STATUSES.BORRADOR);
}

function paymentStatusOf(invoice = {}) {
  return normalizePaymentStatus(invoice.payment_status || PAYMENT_STATUSES.NO_APLICA);
}

function isActiveInvoiceStatus(status) {
  return ACTIVE_INVOICE_STATUSES.has(normalizeInvoiceStatus(status));
}

function isCancelledInvoiceStatus(status) {
  return CANCELLED_INVOICE_STATUSES.has(normalizeInvoiceStatus(status));
}

function isFutureProductionStatus(status) {
  return FUTURE_PRODUCTION_STATUSES.has(normalizeInvoiceStatus(status));
}

function canUseCollectiblePaymentStatus(invoice) {
  if (!invoice) return false;
  const invoiceStatus = invoiceStatusOf(invoice);
  return ACTIVE_INVOICE_STATUSES.has(invoiceStatus) && !FUTURE_PRODUCTION_STATUSES.has(invoiceStatus);
}

function canMarkPaymentPending(invoice) {
  return canUseCollectiblePaymentStatus(invoice);
}

function canMarkPaid(invoice) {
  return canUseCollectiblePaymentStatus(invoice);
}

function canMarkPartial(invoice) {
  return canUseCollectiblePaymentStatus(invoice);
}

function canMarkOverdue(invoice) {
  return canUseCollectiblePaymentStatus(invoice);
}

function expectedPaymentStatusForInvoiceStatus(invoiceStatus) {
  const normalized = normalizeInvoiceStatus(invoiceStatus);
  if (DRAFT_LIKE_INVOICE_STATUSES.has(normalized) || CANCELLED_INVOICE_STATUSES.has(normalized)) {
    return PAYMENT_STATUSES.NO_APLICA;
  }
  if (normalized === INVOICE_STATUSES.SANDBOX_TIMBRADO) return PAYMENT_STATUSES.PENDIENTE;
  return PAYMENT_STATUSES.NO_APLICA;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function safeVisibleId(value, fallback = "UNKNOWN") {
  const raw = text(value) || fallback;
  const blocked = /[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}/i.test(raw)
    || /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(raw)
    || /[A-Za-z]:[\\/]|[\\/]{2}|\.env|token|secret|api[-_ ]?key/i.test(raw);
  if (blocked) return `${fallback}-REDACTED`;
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || fallback;
}

function paymentEventTypeFor(targetPaymentStatus) {
  const target = normalizePaymentStatus(targetPaymentStatus);
  if (target === PAYMENT_STATUSES.PENDIENTE) return PAYMENT_EVENTS.PAYMENT_STATUS_SET_PENDING;
  if (target === PAYMENT_STATUSES.PAGADO) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_PAID;
  if (target === PAYMENT_STATUSES.PARCIAL) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_PARTIAL;
  if (target === PAYMENT_STATUSES.VENCIDO) return PAYMENT_EVENTS.PAYMENT_STATUS_MARKED_OVERDUE;
  return PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED;
}

function evaluatePaymentStatusChange(invoice, targetPaymentStatus, options = {}) {
  if (!invoice) {
    return {
      ok: false,
      event_type: PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: "INVOICE_NOT_FOUND",
      idempotent: false,
    };
  }

  let invoiceStatus;
  let currentPaymentStatus;
  let target;
  try {
    invoiceStatus = invoiceStatusOf(invoice);
    currentPaymentStatus = paymentStatusOf(invoice);
    target = normalizePaymentStatus(targetPaymentStatus);
  } catch (error) {
    return {
      ok: false,
      event_type: PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: error.message,
      idempotent: false,
    };
  }

  if (target === PAYMENT_STATUSES.NO_APLICA) {
    const allowed = DRAFT_LIKE_INVOICE_STATUSES.has(invoiceStatus) || CANCELLED_INVOICE_STATUSES.has(invoiceStatus);
    return {
      ok: allowed,
      event_type: allowed ? null : PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: allowed ? "NO_APLICA_ALLOWED" : "NO_APLICA_ONLY_FOR_DRAFT_OR_CANCELLED",
      idempotent: currentPaymentStatus === target,
      invoice_status: invoiceStatus,
      previous_payment_status: currentPaymentStatus,
      new_payment_status: target,
    };
  }

  if (CANCELLED_INVOICE_STATUSES.has(invoiceStatus) && options.allowCancelledPaymentHistory !== true) {
    return {
      ok: false,
      event_type: PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: "CANCELLED_INVOICE_PAYMENT_BLOCKED",
      idempotent: false,
      invoice_status: invoiceStatus,
      previous_payment_status: currentPaymentStatus,
      new_payment_status: target,
    };
  }

  if (FUTURE_PRODUCTION_STATUSES.has(invoiceStatus)) {
    return {
      ok: false,
      event_type: PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: "PRODUCTION_STATUS_FUTURE_BLOCKED",
      idempotent: false,
      invoice_status: invoiceStatus,
      previous_payment_status: currentPaymentStatus,
      new_payment_status: target,
    };
  }

  if (!ACTIVE_INVOICE_STATUSES.has(invoiceStatus)) {
    return {
      ok: false,
      event_type: PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED,
      reason: "INVOICE_NOT_ACTIVE_FOR_COLLECTION",
      idempotent: false,
      invoice_status: invoiceStatus,
      previous_payment_status: currentPaymentStatus,
      new_payment_status: target,
    };
  }

  return {
    ok: true,
    event_type: currentPaymentStatus === target ? null : paymentEventTypeFor(target),
    reason: currentPaymentStatus === target ? "ALREADY_IN_STATUS" : "PAYMENT_STATUS_CHANGE_ALLOWED",
    idempotent: currentPaymentStatus === target,
    invoice_status: invoiceStatus,
    previous_payment_status: currentPaymentStatus,
    new_payment_status: target,
  };
}

function buildPaymentStatusEvent(invoice, targetPaymentStatus, options = {}) {
  const evaluation = evaluatePaymentStatusChange(invoice, targetPaymentStatus, options);
  const draftId = safeVisibleId(invoice?.draft_id || invoice?.internal_invoice_id || "DRAFT-UNKNOWN", "DRAFT");
  const target = evaluation.new_payment_status || normalizePaymentStatus(targetPaymentStatus);
  const eventType = evaluation.ok && !evaluation.idempotent
    ? paymentEventTypeFor(target)
    : PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED;
  return {
    event_type: evaluation.idempotent ? null : eventType,
    draft_id: draftId,
    ok: evaluation.ok,
    idempotent: evaluation.idempotent,
    reason: evaluation.reason,
    invoice_status: evaluation.invoice_status || null,
    previous_payment_status: evaluation.previous_payment_status || null,
    new_payment_status: target,
    amount: money(options.amount),
    note: text(options.note) || null,
  };
}

function buildClientInvoiceSummary(invoices = [], options = {}) {
  const byClient = {};
  const totals = {
    active_total: 0,
    pending_total: 0,
    paid_total: 0,
    partial_paid_total: 0,
    overdue_total: 0,
    cancelled_total: 0,
    active_count: 0,
    cancelled_count: 0,
    draft_count: 0,
  };

  for (const invoice of invoices) {
    const invoiceStatus = invoiceStatusOf(invoice);
    const paymentStatus = paymentStatusOf({
      payment_status: invoice.payment_status || expectedPaymentStatusForInvoiceStatus(invoiceStatus),
    });
    const clientRef = safeVisibleId(invoice.client_id || invoice.client_ref || "CLIENT-UNKNOWN", "CLIENT");
    const total = money(invoice.total || invoice.amount || invoice.subtotal || 0);
    const paidAmount = money(invoice.payment_amount_paid || invoice.amount_paid || 0);
    if (!byClient[clientRef]) {
      byClient[clientRef] = {
        client_ref: clientRef,
        invoice_count: 0,
        active_count: 0,
        cancelled_count: 0,
        draft_count: 0,
        active_total: 0,
        pending_total: 0,
        paid_total: 0,
        partial_paid_total: 0,
        overdue_total: 0,
        cancelled_total: 0,
        invoices: [],
      };
    }

    const target = byClient[clientRef];
    target.invoice_count += 1;
    target.invoices.push({
      draft_ref: safeVisibleId(invoice.draft_id || invoice.internal_invoice_id || "DRAFT-UNKNOWN", "DRAFT"),
      invoice_status: invoiceStatus,
      payment_status: paymentStatus,
      total,
    });

    if (CANCELLED_INVOICE_STATUSES.has(invoiceStatus)) {
      target.cancelled_count += 1;
      target.cancelled_total += total;
      totals.cancelled_count += 1;
      totals.cancelled_total += total;
      continue;
    }

    if (!ACTIVE_INVOICE_STATUSES.has(invoiceStatus)) {
      target.draft_count += 1;
      totals.draft_count += 1;
      continue;
    }

    target.active_count += 1;
    target.active_total += total;
    totals.active_count += 1;
    totals.active_total += total;

    if (paymentStatus === PAYMENT_STATUSES.PAGADO) {
      target.paid_total += total;
      totals.paid_total += total;
    } else if (paymentStatus === PAYMENT_STATUSES.PARCIAL) {
      const credited = paidAmount || 0;
      target.partial_paid_total += credited;
      target.pending_total += Math.max(0, total - credited);
      totals.partial_paid_total += credited;
      totals.pending_total += Math.max(0, total - credited);
    } else if (paymentStatus === PAYMENT_STATUSES.VENCIDO) {
      target.overdue_total += total;
      target.pending_total += total;
      totals.overdue_total += total;
      totals.pending_total += total;
    } else if (paymentStatus === PAYMENT_STATUSES.PENDIENTE) {
      target.pending_total += total;
      totals.pending_total += total;
    }
  }

  const summary = {
    schema_version: "invoice_payment_status_summary.v1",
    generated_at: options.generated_at || new Date().toISOString(),
    by_client: Object.fromEntries(Object.entries(byClient).sort(([a], [b]) => a.localeCompare(b))),
    totals,
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA. No sustituye contador.",
  };
  return summary;
}

module.exports = {
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_EVENTS,
  normalizeInvoiceStatus,
  normalizePaymentStatus,
  isActiveInvoiceStatus,
  isCancelledInvoiceStatus,
  isFutureProductionStatus,
  canMarkPaymentPending,
  canMarkPaid,
  canMarkPartial,
  canMarkOverdue,
  expectedPaymentStatusForInvoiceStatus,
  evaluatePaymentStatusChange,
  buildPaymentStatusEvent,
  buildClientInvoiceSummary,
};

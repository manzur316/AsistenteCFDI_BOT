"use strict";

const CLIENT_BILLING_SUMMARY_VIEW_VERSION = "CLIENT_BILLING_SUMMARY_VIEW_V1";

const ACTIVE_INVOICE_STATUS = "SANDBOX_TIMBRADO";
const CANCELLED_INVOICE_STATUSES = new Set(["SANDBOX_CANCELADO", "CANCELADO"]);
const DRAFT_ONLY_INVOICE_STATUSES = new Set(["BORRADOR", "APROBADO"]);
const ACTIVE_PAYMENT_STATUSES = new Set(["PENDIENTE", "PARCIAL", "PAGADO", "VENCIDO"]);
const AGING_BUCKETS = ["0_7", "8_15", "16_30", "31_60", "60_plus", "UNKNOWN_DATE"];

const SENSITIVE_VALUE_PATTERNS = [
  /\b[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /[A-Za-z]:[\\/][^\s]+/g,
  /\b(?:xml|pdf|zip|xlsx|xls|excel)\b/gi,
  /\b(?:token|secret|apikey|api_key|credential|password|csd|\.env)\b/gi,
];

function safeText(value, fallback = "N/A") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  return SENSITIVE_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, "[REDACTED]"), raw);
}

function htmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function maybeEscape(value, useHtml) {
  return useHtml ? htmlEscape(value) : String(value);
}

function toMoneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return "$" + toMoneyNumber(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeInvoiceStatus(value) {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return "BORRADOR";
  if (status === "PENDIENTE") return "BORRADOR";
  if (status === "SANDBOX_STAMPED" || status === "TIMBRADO") return "SANDBOX_TIMBRADO";
  if (status === "SANDBOX_CANCELLED" || status === "CANCELLED") return "SANDBOX_CANCELADO";
  if (status.includes("PRODUCTION") || status.includes("PRODUCCION") || status.includes("PRODUCTIVO")) {
    return "PRODUCTION_OUT_OF_SCOPE";
  }
  if (
    [
      "BORRADOR",
      "APROBADO",
      "SANDBOX_TIMBRADO",
      "SANDBOX_CANCELADO",
      "CANCELADO",
      "PRODUCTION_OUT_OF_SCOPE",
    ].includes(status)
  ) {
    return status;
  }
  return "BORRADOR";
}

function expectedPaymentStatus(invoiceStatus) {
  if (invoiceStatus === ACTIVE_INVOICE_STATUS) return "PENDIENTE";
  return "NO_APLICA";
}

function normalizePaymentStatus(value, invoiceStatus) {
  const status = String(value || "").trim().toUpperCase();
  if (!status) return expectedPaymentStatus(invoiceStatus);
  if (["NO_APLICA", "PENDIENTE", "PARCIAL", "PAGADO", "VENCIDO"].includes(status)) return status;
  if (status === "PAID") return "PAGADO";
  if (status === "PARTIAL") return "PARCIAL";
  if (status === "OVERDUE") return "VENCIDO";
  if (status === "PENDING") return "PENDIENTE";
  return expectedPaymentStatus(invoiceStatus);
}

function parseDateValue(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toIsoDate(value) {
  const parsed = parseDateValue(value);
  if (!parsed) return null;
  return parsed.toISOString().slice(0, 10);
}

function selectInvoiceDate(record = {}) {
  return (
    record.payment_due_at ||
    record.due_at ||
    record.invoice_date ||
    record.issued_at ||
    record.created_at ||
    record.updated_at ||
    record.timestamp ||
    ""
  );
}

function selectLastPaymentDate(record = {}) {
  return record.payment_paid_at || record.paid_at || record.last_payment_at || record.updated_at || "";
}

function classifyAgingBucket(invoiceDate, referenceDate = new Date()) {
  const invoiceDateParsed = parseDateValue(invoiceDate);
  const referenceDateParsed = parseDateValue(referenceDate) || new Date();
  if (!invoiceDateParsed) return "UNKNOWN_DATE";
  const dayMs = 24 * 60 * 60 * 1000;
  const invoiceUtc = Date.UTC(
    invoiceDateParsed.getUTCFullYear(),
    invoiceDateParsed.getUTCMonth(),
    invoiceDateParsed.getUTCDate()
  );
  const referenceUtc = Date.UTC(
    referenceDateParsed.getUTCFullYear(),
    referenceDateParsed.getUTCMonth(),
    referenceDateParsed.getUTCDate()
  );
  const ageDays = Math.max(0, Math.floor((referenceUtc - invoiceUtc) / dayMs));
  if (ageDays <= 7) return "0_7";
  if (ageDays <= 15) return "8_15";
  if (ageDays <= 30) return "16_30";
  if (ageDays <= 60) return "31_60";
  return "60_plus";
}

function emptyAgingBuckets() {
  return AGING_BUCKETS.reduce((buckets, bucket) => {
    buckets[bucket] = { count: 0, amount: 0 };
    return buckets;
  }, {});
}

function sanitizeBillingRecord(record = {}) {
  const invoiceStatus = normalizeInvoiceStatus(record.invoice_status || record.status);
  const paymentStatus = normalizePaymentStatus(record.payment_status, invoiceStatus);
  const total = toMoneyNumber(record.total || record.total_amount || record.amount);
  const amountPaid = toMoneyNumber(record.payment_amount_paid || record.amount_paid || record.paid_amount);
  const remaining = Math.max(0, toMoneyNumber(record.payment_amount_remaining || total - amountPaid));
  const invoiceDateRaw = selectInvoiceDate(record);
  const lastPaymentRaw = selectLastPaymentDate(record);
  return {
    client_id: safeText(record.client_id || record.clientId || "CLIENTE"),
    client_display: safeText(
      record.client_display ||
        record.display_name ||
        record.client_name ||
        record.client_snapshot?.display_name ||
        record.client_id ||
        "Cliente"
    ),
    draft_id: safeText(record.draft_id || record.internal_invoice_id || record.invoice_id || "DRAFT"),
    invoice_status: invoiceStatus,
    payment_status: paymentStatus,
    total,
    payment_amount_paid: amountPaid,
    payment_amount_remaining: remaining,
    invoice_date: toIsoDate(invoiceDateRaw),
    last_payment_at: paymentStatus === "PAGADO" || paymentStatus === "PARCIAL" ? toIsoDate(lastPaymentRaw) : null,
    active_for_billing: invoiceStatus === ACTIVE_INVOICE_STATUS,
    cancelled_for_billing: CANCELLED_INVOICE_STATUSES.has(invoiceStatus),
    draft_only: DRAFT_ONLY_INVOICE_STATUSES.has(invoiceStatus),
    production_out_of_scope: invoiceStatus === "PRODUCTION_OUT_OF_SCOPE",
  };
}

function countAging(summary, row, amount, referenceDate) {
  const bucket = classifyAgingBucket(row.invoice_date, referenceDate);
  summary.aging_buckets[bucket].count += 1;
  summary.aging_buckets[bucket].amount += amount;
}

function summarizeBillingRows(rows, referenceDate) {
  const summary = {
    total_records: 0,
    active_invoice_count: 0,
    pending_count: 0,
    partial_count: 0,
    paid_count: 0,
    overdue_count: 0,
    cancelled_count: 0,
    draft_only_count: 0,
    production_out_of_scope_count: 0,
    pending_total: 0,
    partial_total: 0,
    partial_paid_total: 0,
    paid_total: 0,
    overdue_total: 0,
    cancelled_total: 0,
    open_balance_total: 0,
    last_payment_at: null,
    oldest_pending_invoice_at: null,
    aging_buckets: emptyAgingBuckets(),
  };

  for (const row of rows) {
    summary.total_records += 1;

    if (row.production_out_of_scope) {
      summary.production_out_of_scope_count += 1;
      continue;
    }

    if (row.cancelled_for_billing) {
      summary.cancelled_count += 1;
      summary.cancelled_total += row.total;
      continue;
    }

    if (row.draft_only || row.invoice_status !== ACTIVE_INVOICE_STATUS || !ACTIVE_PAYMENT_STATUSES.has(row.payment_status)) {
      if (row.draft_only) summary.draft_only_count += 1;
      continue;
    }

    summary.active_invoice_count += 1;

    if (row.payment_status === "PENDIENTE") {
      const amount = row.payment_amount_remaining || row.total;
      summary.pending_count += 1;
      summary.pending_total += amount;
      summary.open_balance_total += amount;
      countAging(summary, row, amount, referenceDate);
    } else if (row.payment_status === "PARCIAL") {
      const amount = row.payment_amount_remaining;
      summary.partial_count += 1;
      summary.partial_total += amount;
      summary.partial_paid_total += row.payment_amount_paid;
      summary.open_balance_total += amount;
      countAging(summary, row, amount, referenceDate);
    } else if (row.payment_status === "PAGADO") {
      summary.paid_count += 1;
      summary.paid_total += row.total;
    } else if (row.payment_status === "VENCIDO") {
      const amount = row.payment_amount_remaining || row.total;
      summary.overdue_count += 1;
      summary.overdue_total += amount;
      summary.open_balance_total += amount;
      countAging(summary, row, amount, referenceDate);
    }

    if ((row.payment_status === "PAGADO" || row.payment_status === "PARCIAL") && row.last_payment_at) {
      if (!summary.last_payment_at || row.last_payment_at > summary.last_payment_at) {
        summary.last_payment_at = row.last_payment_at;
      }
    }

    if (["PENDIENTE", "PARCIAL", "VENCIDO"].includes(row.payment_status) && row.invoice_date) {
      if (!summary.oldest_pending_invoice_at || row.invoice_date < summary.oldest_pending_invoice_at) {
        summary.oldest_pending_invoice_at = row.invoice_date;
      }
    }
  }

  return summary;
}

function groupRowsByClient(rows, referenceDate) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.client_id || "CLIENTE";
    if (!groups.has(key)) {
      groups.set(key, {
        client_id: key,
        client_display: row.client_display || key,
        rows: [],
      });
    }
    groups.get(key).rows.push(row);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    summary: summarizeBillingRows(group.rows, referenceDate),
  }));
}

function buildClientBillingSummaryView(records = [], options = {}) {
  const clientId = options.client_id || options.clientId || "";
  const referenceDate = parseDateValue(options.reference_date || options.referenceDate) || new Date();
  const sanitized = records.map(sanitizeBillingRecord);
  const filtered = sanitized.filter((row) => !clientId || row.client_id === clientId);
  return {
    version: CLIENT_BILLING_SUMMARY_VIEW_VERSION,
    client_id: clientId || null,
    reference_date: referenceDate.toISOString().slice(0, 10),
    rows: filtered,
    groups: groupRowsByClient(filtered, referenceDate),
    summary: summarizeBillingRows(filtered, referenceDate),
  };
}

function renderAgingLines(summary) {
  return [
    "0-7 dias: " + summary.aging_buckets["0_7"].count + " | " + formatMoney(summary.aging_buckets["0_7"].amount),
    "8-15 dias: " + summary.aging_buckets["8_15"].count + " | " + formatMoney(summary.aging_buckets["8_15"].amount),
    "16-30 dias: " + summary.aging_buckets["16_30"].count + " | " + formatMoney(summary.aging_buckets["16_30"].amount),
    "31-60 dias: " + summary.aging_buckets["31_60"].count + " | " + formatMoney(summary.aging_buckets["31_60"].amount),
    "60+ dias: " + summary.aging_buckets["60_plus"].count + " | " + formatMoney(summary.aging_buckets["60_plus"].amount),
    "Sin fecha: " + summary.aging_buckets.UNKNOWN_DATE.count + " | " + formatMoney(summary.aging_buckets.UNKNOWN_DATE.amount),
  ];
}

function renderClientBillingSummaryText(view, options = {}) {
  const useHtml = Boolean(options.html);
  const title = options.mode === "aging" ? "Resumen vencidos" : "Resumen cobranza";
  const lines = [
    title,
    "",
    "Borrador sujeto a revision humana. No sustituye contador.",
  ];

  if (!view.rows.length) {
    lines.push("", "No hay facturas sandbox para calcular cobranza.");
    lines.push("No se modifica ningun estado de pago desde esta vista.");
    return lines.map((line) => maybeEscape(line, useHtml)).join("\n");
  }

  for (const group of view.groups.slice(0, options.max_clients || 5)) {
    const summary = group.summary;
    lines.push("", "Cliente: " + group.client_id);
    if (group.client_display && group.client_display !== group.client_id) {
      lines.push("Nombre: " + group.client_display);
    }
    lines.push("");
    lines.push("Activas: " + summary.active_invoice_count);
    lines.push("Pendientes: " + summary.pending_count + " | " + formatMoney(summary.pending_total));
    lines.push("Parciales: " + summary.partial_count + " | " + formatMoney(summary.partial_total));
    lines.push("Pagadas: " + summary.paid_count + " | " + formatMoney(summary.paid_total));
    lines.push("Vencidas: " + summary.overdue_count + " | " + formatMoney(summary.overdue_total));
    lines.push("Canceladas: " + summary.cancelled_count + " | " + formatMoney(summary.cancelled_total) + " separado");
    lines.push("Saldo abierto: " + formatMoney(summary.open_balance_total));
    if (summary.partial_paid_total > 0) {
      lines.push("Pagado parcial registrado: " + formatMoney(summary.partial_paid_total));
    }
    lines.push("");
    lines.push("Antiguedad pendientes:");
    lines.push(...renderAgingLines(summary));
    lines.push("");
    lines.push("Ultimo pago: " + (summary.last_payment_at || "N/A"));
    lines.push("Pendiente mas antiguo: " + (summary.oldest_pending_invoice_at || "N/A"));
  }

  lines.push("", "No hay cobro automatico ni conciliacion bancaria en esta fase.");
  return lines.map((line) => maybeEscape(line, useHtml)).join("\n");
}

function buildSafeBillingSummaryKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Ver pendientes", callback_data: "cfdi_nav:pay_pending" },
        { text: "Ver pagadas", callback_data: "cfdi_nav:pay_paid" },
      ],
      [
        { text: "Ver vencidas", callback_data: "cfdi_nav:aging" },
        { text: "Ver canceladas", callback_data: "cfdi_nav:pay_cancel" },
      ],
      [{ text: "Ver ledger cliente", callback_data: "cfdi_nav:client_ledger" }],
      [{ text: "Volver", callback_data: "cfdi_nav:clients" }],
    ],
  };
}

module.exports = {
  CLIENT_BILLING_SUMMARY_VIEW_VERSION,
  AGING_BUCKETS,
  sanitizeBillingRecord,
  buildClientBillingSummaryView,
  renderClientBillingSummaryText,
  buildSafeBillingSummaryKeyboard,
  classifyAgingBucket,
  formatMoney,
};

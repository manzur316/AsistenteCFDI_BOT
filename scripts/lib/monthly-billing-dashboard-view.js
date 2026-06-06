"use strict";

const {
  AGING_BUCKETS,
  classifyAgingBucket,
  formatMoney,
  sanitizeBillingRecord,
} = require("./client-billing-summary-view");

const MONTHLY_BILLING_DASHBOARD_VIEW_VERSION = "MONTHLY_BILLING_DASHBOARD_VIEW_V1";

const ACTIVE_INVOICE_STATUS = "SANDBOX_TIMBRADO";
const CANCELLED_INVOICE_STATUSES = new Set(["SANDBOX_CANCELADO", "CANCELADO"]);
const DRAFT_ONLY_INVOICE_STATUSES = new Set(["BORRADOR", "APROBADO"]);
const ACTIVE_PAYMENT_STATUSES = new Set(["PENDIENTE", "PARCIAL", "PAGADO", "VENCIDO"]);

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

function getDefaultBillingPeriod(now = new Date()) {
  const parsed = parseDateValue(now) || new Date();
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizePeriod(value, now = new Date()) {
  const period = String(value || "").trim();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return period;
  return getDefaultBillingPeriod(now);
}

function hasKnownAmount(record = {}) {
  const value = record.total ?? record.total_amount ?? record.amount;
  if (value === null || value === undefined || String(value).trim() === "") return false;
  return Number.isFinite(Number(value));
}

function rawInvoiceStatus(record = {}) {
  return String(record.invoice_status || record.status || "").trim().toUpperCase();
}

function isSandboxError(record = {}) {
  return /ERROR|FAILED|FALLO|RECHAZ/.test(rawInvoiceStatus(record));
}

function sanitizeMonthlyBillingRecord(record = {}) {
  const sanitized = sanitizeBillingRecord(record);
  const invoiceDate =
    sanitized.invoice_date ||
    toIsoDate(record.payment_due_at || record.due_at || record.invoice_date || record.issued_at || record.created_at || record.updated_at);
  return {
    ...sanitized,
    client_id: safeText(sanitized.client_id || record.client_id || "CLIENTE"),
    client_display: safeText(sanitized.client_display || record.client_display || record.client_name || "Cliente"),
    invoice_date: invoiceDate,
    period: invoiceDate ? invoiceDate.slice(0, 7) : null,
    amount_known: hasKnownAmount(record),
    sandbox_error: isSandboxError(record),
    raw_invoice_status: safeText(rawInvoiceStatus(record) || sanitized.invoice_status),
  };
}

function shouldIncludeRowInPeriod(row, period, options = {}) {
  if (row.period && row.period <= period) return true;
  if (!row.period && options.include_unknown_dates !== false) return true;
  return false;
}

function emptyAgingBuckets() {
  return AGING_BUCKETS.reduce((buckets, bucket) => {
    buckets[bucket] = { count: 0, amount: 0 };
    return buckets;
  }, {});
}

function emptyStatusTotals() {
  return {
    count: 0,
    amount: 0,
  };
}

function addAmount(target, amount) {
  target.count += 1;
  target.amount += amount;
}

function pendingBalance(row) {
  const remaining = Number(row.payment_amount_remaining);
  if (Number.isFinite(remaining) && remaining > 0) return remaining;
  return Number(row.total) || 0;
}

function summarizeClientBalances(openRows) {
  const groups = new Map();
  for (const row of openRows) {
    const key = row.client_id || "CLIENTE";
    if (!groups.has(key)) {
      groups.set(key, {
        client_id: key,
        client_display: row.client_display || key,
        status: "PENDIENTE",
        open_balance: 0,
        pending_count: 0,
        overdue_count: 0,
        partial_count: 0,
      });
    }
    const group = groups.get(key);
    const amount = pendingBalance(row);
    group.open_balance += amount;
    if (row.payment_status === "VENCIDO") {
      group.status = "VENCIDO";
      group.overdue_count += 1;
    } else if (row.payment_status === "PARCIAL" && group.status !== "VENCIDO") {
      group.status = "PARCIAL";
      group.partial_count += 1;
    } else if (row.payment_status === "PENDIENTE") {
      group.pending_count += 1;
    }
  }
  return Array.from(groups.values()).sort((a, b) => b.open_balance - a.open_balance);
}

function buildMonthlyBillingDashboardView(records = [], options = {}) {
  const period = normalizePeriod(options.period, options.now || options.reference_date || new Date());
  const referenceDate = parseDateValue(options.reference_date || options.now) || new Date(`${period}-28T00:00:00Z`);
  const rows = records
    .map(sanitizeMonthlyBillingRecord)
    .filter((row) => shouldIncludeRowInPeriod(row, period, options));

  const dashboard = {
    version: MONTHLY_BILLING_DASHBOARD_VIEW_VERSION,
    period,
    total_records: rows.length,
    invoice_status_totals: {
      active_count: 0,
      sandbox_stamped_count: 0,
      sandbox_cancelled_count: 0,
      sandbox_error_count: 0,
      draft_count: 0,
      approved_count: 0,
      production_out_of_scope_count: 0,
    },
    payment_status_totals: {
      pending: emptyStatusTotals(),
      partial: emptyStatusTotals(),
      paid: emptyStatusTotals(),
      overdue: emptyStatusTotals(),
    },
    aging_buckets: emptyAgingBuckets(),
    top_clients_with_balance: [],
    warnings: [],
    unknown_date_count: 0,
    unknown_amount_count: 0,
  };

  const openRows = [];

  for (const row of rows) {
    if (!row.invoice_date) dashboard.unknown_date_count += 1;
    if (!row.amount_known) dashboard.unknown_amount_count += 1;

    if (row.sandbox_error) {
      dashboard.invoice_status_totals.sandbox_error_count += 1;
      continue;
    }

    if (row.production_out_of_scope) {
      dashboard.invoice_status_totals.production_out_of_scope_count += 1;
      continue;
    }

    if (CANCELLED_INVOICE_STATUSES.has(row.invoice_status)) {
      dashboard.invoice_status_totals.sandbox_cancelled_count += 1;
      continue;
    }

    if (row.invoice_status === "BORRADOR") {
      dashboard.invoice_status_totals.draft_count += 1;
      continue;
    }

    if (row.invoice_status === "APROBADO") {
      dashboard.invoice_status_totals.approved_count += 1;
      continue;
    }

    if (row.invoice_status !== ACTIVE_INVOICE_STATUS || !ACTIVE_PAYMENT_STATUSES.has(row.payment_status)) {
      continue;
    }

    dashboard.invoice_status_totals.active_count += 1;
    dashboard.invoice_status_totals.sandbox_stamped_count += 1;

    if (row.payment_status === "PENDIENTE") {
      const amount = pendingBalance(row);
      addAmount(dashboard.payment_status_totals.pending, amount);
      openRows.push(row);
      const bucket = classifyAgingBucket(row.invoice_date, referenceDate);
      addAmount(dashboard.aging_buckets[bucket], amount);
    } else if (row.payment_status === "PARCIAL") {
      const amount = pendingBalance(row);
      addAmount(dashboard.payment_status_totals.partial, amount);
      openRows.push(row);
      const bucket = classifyAgingBucket(row.invoice_date, referenceDate);
      addAmount(dashboard.aging_buckets[bucket], amount);
    } else if (row.payment_status === "PAGADO") {
      addAmount(dashboard.payment_status_totals.paid, row.total);
    } else if (row.payment_status === "VENCIDO") {
      const amount = pendingBalance(row);
      addAmount(dashboard.payment_status_totals.overdue, amount);
      openRows.push(row);
      const bucket = classifyAgingBucket(row.invoice_date, referenceDate);
      addAmount(dashboard.aging_buckets[bucket], amount);
    }
  }

  dashboard.top_clients_with_balance = summarizeClientBalances(openRows).slice(0, options.max_clients || 5);

  if (dashboard.unknown_date_count > 0) {
    dashboard.warnings.push(`${dashboard.unknown_date_count} registro(s) sin fecha suficiente para aging.`);
  }
  if (dashboard.unknown_amount_count > 0) {
    dashboard.warnings.push(`${dashboard.unknown_amount_count} registro(s) sin monto confiable.`);
  }

  return dashboard;
}

function renderBucket(bucket) {
  return `${bucket.count} | ${formatMoney(bucket.amount)}`;
}

function renderMonthlyBillingDashboardText(view) {
  const lines = [
    "Resumen mensual de cobranza",
    "",
    `Periodo: ${view.period}`,
    "",
  ];

  if (!view.total_records) {
    lines.push("No hay facturas sandbox registradas para este periodo.");
    lines.push("");
    lines.push("Borrador sujeto a revision humana. No sustituye contador.");
    lines.push("No es declaracion fiscal definitiva.");
    return lines.join("\n");
  }

  lines.push("Facturas sandbox:");
  lines.push(`Activas: ${view.invoice_status_totals.active_count}`);
  lines.push(`Timbradas sandbox: ${view.invoice_status_totals.sandbox_stamped_count}`);
  lines.push(`Canceladas sandbox: ${view.invoice_status_totals.sandbox_cancelled_count} separado`);
  lines.push(`Errores sandbox: ${view.invoice_status_totals.sandbox_error_count}`);
  lines.push(`Borradores/aprobadas: ${view.invoice_status_totals.draft_count + view.invoice_status_totals.approved_count}`);
  lines.push("");
  lines.push("Cobranza:");
  lines.push(`Pendiente: ${renderBucket(view.payment_status_totals.pending)}`);
  lines.push(`Parcial: ${renderBucket(view.payment_status_totals.partial)}`);
  lines.push(`Pagado: ${renderBucket(view.payment_status_totals.paid)}`);
  lines.push(`Vencido: ${renderBucket(view.payment_status_totals.overdue)}`);
  lines.push("");
  lines.push("Aging pendientes:");
  lines.push(`0-7 dias: ${renderBucket(view.aging_buckets["0_7"])}`);
  lines.push(`8-15 dias: ${renderBucket(view.aging_buckets["8_15"])}`);
  lines.push(`16-30 dias: ${renderBucket(view.aging_buckets["16_30"])}`);
  lines.push(`31-60 dias: ${renderBucket(view.aging_buckets["31_60"])}`);
  lines.push(`60+ dias: ${renderBucket(view.aging_buckets["60_plus"])}`);
  lines.push(`Sin fecha: ${renderBucket(view.aging_buckets.UNKNOWN_DATE)}`);
  lines.push("");
  lines.push("Clientes con saldo:");
  if (!view.top_clients_with_balance.length) {
    lines.push("Sin saldos pendientes o vencidos.");
  } else {
    view.top_clients_with_balance.forEach((client, index) => {
      lines.push(`${index + 1}. ${client.client_id} | ${client.status} | ${formatMoney(client.open_balance)}`);
    });
  }

  if (view.warnings.length) {
    lines.push("");
    lines.push("Warnings:");
    view.warnings.forEach((warning) => lines.push(`- ${safeText(warning)}`));
  }

  lines.push("");
  lines.push("Borrador sujeto a revision humana. No sustituye contador.");
  lines.push("No es declaracion fiscal definitiva. No hay cobro automatico ni conciliacion bancaria.");
  return lines.join("\n");
}

function buildSafeMonthlyBillingDashboardKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: "Ver clientes con saldo", callback_data: "cfdi_nav:billing" },
        { text: "Ver vencidas", callback_data: "cfdi_nav:aging" },
      ],
      [
        { text: "Ver pagadas", callback_data: "cfdi_nav:pay_paid" },
        { text: "Ver canceladas", callback_data: "cfdi_nav:pay_cancel" },
      ],
      [{ text: "Paquete contador", callback_data: "cfdi_nav:acctpkg" }],
      [{ text: "Menu principal", callback_data: "cfdi_nav:menu" }],
    ],
  };
}

module.exports = {
  MONTHLY_BILLING_DASHBOARD_VIEW_VERSION,
  sanitizeMonthlyBillingRecord,
  getDefaultBillingPeriod,
  normalizePeriod,
  buildMonthlyBillingDashboardView,
  renderMonthlyBillingDashboardText,
  buildSafeMonthlyBillingDashboardKeyboard,
};

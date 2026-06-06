const {
  evaluatePaymentStatusChange,
} = require('./invoice-payment-status-model');

const CLIENT_INVOICE_LEDGER_VIEW_VERSION = 'CLIENT_INVOICE_LEDGER_VIEW_V1';

const ACTIVE_PAYMENT_STATUSES = new Set(['PENDIENTE', 'PARCIAL', 'VENCIDO']);
const PAID_PAYMENT_STATUSES = new Set(['PAGADO']);
const CANCELLED_INVOICE_STATUSES = new Set(['SANDBOX_CANCELADO', 'CANCELADO']);
const ACTIVE_INVOICE_STATUSES = new Set(['SANDBOX_TIMBRADO', 'APROBADO', 'BORRADOR']);

const SENSITIVE_VALUE_PATTERNS = [
  /\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
  /[A-Za-z]:[\\/][^\s]+/g,
  /\b(?:xml|pdf|zip|xlsx|xls)\b/gi,
  /\b(?:token|secret|apikey|api_key|credential|password|csd|\.env)\b/gi,
];

function safeText(value, fallback = 'N/A') {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;
  return SENSITIVE_VALUE_PATTERNS.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), raw);
}

function htmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toMoneyNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatMoney(value) {
  return '$' + toMoneyNumber(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizeInvoiceStatus(value) {
  const status = String(value || '').trim().toUpperCase();
  if (status === 'PENDIENTE') return 'BORRADOR';
  if (status === 'SANDBOX_STAMPED' || status === 'TIMBRADO') return 'SANDBOX_TIMBRADO';
  if (status === 'SANDBOX_CANCELLED' || status === 'CANCELLED') return 'SANDBOX_CANCELADO';
  if (['BORRADOR', 'APROBADO', 'SANDBOX_TIMBRADO', 'SANDBOX_CANCELADO', 'CANCELADO'].includes(status)) {
    return status;
  }
  return 'BORRADOR';
}

function expectedPaymentStatus(invoiceStatus) {
  if (invoiceStatus === 'SANDBOX_TIMBRADO') return 'PENDIENTE';
  return 'NO_APLICA';
}

function normalizePaymentStatus(value, invoiceStatus) {
  const status = String(value || '').trim().toUpperCase();
  if (!status) return expectedPaymentStatus(invoiceStatus);
  if (['NO_APLICA', 'PENDIENTE', 'PARCIAL', 'PAGADO', 'VENCIDO'].includes(status)) return status;
  return expectedPaymentStatus(invoiceStatus);
}

function sanitizeLedgerRecord(record = {}) {
  const invoiceStatus = normalizeInvoiceStatus(record.invoice_status || record.status);
  const paymentStatus = normalizePaymentStatus(record.payment_status, invoiceStatus);
  const total = toMoneyNumber(record.total || record.total_amount || record.amount);
  const amountPaid = toMoneyNumber(record.payment_amount_paid || record.amount_paid);
  return {
    client_id: safeText(record.client_id || record.clientId || 'CLIENTE'),
    client_display: safeText(
      record.client_display ||
        record.display_name ||
        record.client_name ||
        record.client_snapshot?.display_name ||
        record.client_id ||
        'Cliente'
    ),
    draft_id: safeText(record.draft_id || record.internal_invoice_id || record.invoice_id || 'DRAFT'),
    invoice_status: invoiceStatus,
    payment_status: paymentStatus,
    total,
    payment_amount_paid: amountPaid,
    payment_amount_remaining: Math.max(0, total - amountPaid),
    updated_at: safeText(record.updated_at || record.created_at || record.timestamp || ''),
  };
}

function rowMatchesFilter(row, filter) {
  if (filter === 'pending') {
    return ACTIVE_INVOICE_STATUSES.has(row.invoice_status) && ACTIVE_PAYMENT_STATUSES.has(row.payment_status);
  }
  if (filter === 'paid') {
    return ACTIVE_INVOICE_STATUSES.has(row.invoice_status) && PAID_PAYMENT_STATUSES.has(row.payment_status);
  }
  if (filter === 'cancelled') {
    return CANCELLED_INVOICE_STATUSES.has(row.invoice_status);
  }
  return true;
}

function summarizeLedgerRows(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total_records += 1;
      if (CANCELLED_INVOICE_STATUSES.has(row.invoice_status)) {
        summary.cancelled_count += 1;
        summary.cancelled_total += row.total;
        return summary;
      }
      if (PAID_PAYMENT_STATUSES.has(row.payment_status)) {
        summary.paid_count += 1;
        summary.paid_total += row.total;
        return summary;
      }
      if (ACTIVE_PAYMENT_STATUSES.has(row.payment_status)) {
        summary.pending_count += 1;
        summary.pending_total += row.payment_amount_remaining || row.total;
      }
      return summary;
    },
    {
      total_records: 0,
      pending_count: 0,
      paid_count: 0,
      cancelled_count: 0,
      pending_total: 0,
      paid_total: 0,
      cancelled_total: 0,
    }
  );
}

function groupRowsByClient(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.client_id || 'CLIENTE';
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
    summary: summarizeLedgerRows(group.rows),
  }));
}

function buildClientInvoiceLedgerView(records = [], options = {}) {
  const filter = options.filter || 'all';
  const clientId = options.client_id || options.clientId || '';
  const sanitized = records.map(sanitizeLedgerRecord);
  const filtered = sanitized
    .filter((row) => !clientId || row.client_id === clientId)
    .filter((row) => rowMatchesFilter(row, filter));
  return {
    version: CLIENT_INVOICE_LEDGER_VIEW_VERSION,
    filter,
    client_id: clientId || null,
    rows: filtered,
    groups: groupRowsByClient(filtered),
    summary: summarizeLedgerRows(filtered),
  };
}

function filterTitle(filter) {
  if (filter === 'pending') return 'Facturas pendientes de pago';
  if (filter === 'paid') return 'Facturas pagadas';
  if (filter === 'cancelled') return 'Facturas canceladas';
  return 'Facturas por cliente';
}

function maybeEscape(value, useHtml) {
  return useHtml ? htmlEscape(value) : String(value);
}

function renderClientInvoiceLedgerText(view, options = {}) {
  const useHtml = Boolean(options.html);
  const lines = [
    filterTitle(view.filter),
    'Borrador sujeto a revision humana. No sustituye contador.',
  ];

  if (!view.rows.length) {
    lines.push('', 'No hay facturas con ese filtro.');
    lines.push('Usa Clientes para buscar o crear un cliente antes de revisar su ledger.');
    return lines.map((line) => maybeEscape(line, useHtml)).join('\n');
  }

  for (const group of view.groups.slice(0, options.max_clients || 5)) {
    lines.push('', 'Cliente: ' + group.client_display + ' (' + group.client_id + ')');
    lines.push('Facturas sandbox:');
    for (const row of group.rows.slice(0, options.max_rows_per_client || 5)) {
      const date = row.updated_at ? ' | ' + row.updated_at.slice(0, 10) : '';
      lines.push(
        '- ' +
          row.invoice_status +
          ' | ' +
          row.payment_status +
          ' | ' +
          formatMoney(row.total) +
          ' | ' +
          row.draft_id +
          date
      );
    }
    lines.push('Totales activos:');
    lines.push('Pendiente: ' + formatMoney(group.summary.pending_total));
    lines.push('Pagado: ' + formatMoney(group.summary.paid_total));
    lines.push('Cancelado separado: ' + formatMoney(group.summary.cancelled_total));
  }

  lines.push('', 'Cambios de estado de pago: solo por comando/flujo autorizado en fases futuras.');
  return lines.map((line) => maybeEscape(line, useHtml)).join('\n');
}

function buildSafeLedgerKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: 'Pendientes', callback_data: 'cfdi_nav:pay_pending' },
        { text: 'Pagadas', callback_data: 'cfdi_nav:pay_paid' },
      ],
      [{ text: 'Canceladas', callback_data: 'cfdi_nav:pay_cancel' }],
      [{ text: 'Clientes', callback_data: 'cfdi_nav:clients' }],
      [{ text: 'Menu principal', callback_data: 'cfdi_nav:menu' }],
    ],
  };
}

function evaluateLedgerPaymentAction(invoice, targetStatus) {
  return evaluatePaymentStatusChange(invoice, targetStatus);
}

module.exports = {
  CLIENT_INVOICE_LEDGER_VIEW_VERSION,
  sanitizeLedgerRecord,
  buildClientInvoiceLedgerView,
  renderClientInvoiceLedgerText,
  buildSafeLedgerKeyboard,
  evaluateLedgerPaymentAction,
  formatMoney,
};

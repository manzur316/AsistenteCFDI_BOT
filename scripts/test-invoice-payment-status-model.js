const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const {
  INVOICE_STATUSES,
  PAYMENT_STATUSES,
  PAYMENT_EVENTS,
  normalizeInvoiceStatus,
  normalizePaymentStatus,
  isActiveInvoiceStatus,
  isCancelledInvoiceStatus,
  canMarkPaymentPending,
  canMarkPaid,
  canMarkPartial,
  canMarkOverdue,
  expectedPaymentStatusForInvoiceStatus,
  evaluatePaymentStatusChange,
  buildPaymentStatusEvent,
  buildClientInvoiceSummary,
} = require("./lib/invoice-payment-status-model");

const root = path.resolve(__dirname, "..");
const sqlPath = path.join(root, "sql", "007_invoice_payment_status.sql");
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  const suffix = item.value ? ` (${item.value})` : "";
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${suffix}`);
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function normalizeSql(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ");
}

function demoInvoice(overrides = {}) {
  return {
    draft_id: "DRAFT-TEST-1",
    client_id: "CLIENT-PRIVADA-RIVERA",
    invoice_status: INVOICE_STATUSES.SANDBOX_TIMBRADO,
    payment_status: PAYMENT_STATUSES.PENDIENTE,
    total: 10150,
    payment_amount_paid: 0,
    ...overrides,
  };
}

check("invoice_and_payment_status_are_separate", () => {
  const invoice = demoInvoice();
  assert.strictEqual(normalizeInvoiceStatus(invoice.invoice_status), "SANDBOX_TIMBRADO");
  assert.strictEqual(normalizePaymentStatus(invoice.payment_status), "PENDIENTE");
  assert.notStrictEqual(invoice.invoice_status, invoice.payment_status);
  return "invoice_status != payment_status";
});

check("normalizes_legacy_invoice_statuses", () => {
  assert.strictEqual(normalizeInvoiceStatus("PENDIENTE"), "BORRADOR");
  assert.strictEqual(normalizeInvoiceStatus("SANDBOX_STAMPED"), "SANDBOX_TIMBRADO");
  assert.strictEqual(normalizeInvoiceStatus("SANDBOX_CANCELLED"), "SANDBOX_CANCELADO");
  assert.throws(() => normalizeInvoiceStatus("PRODUCTION_STAMPED"), /invoice_status desconocido/);
  return "legacy aliases";
});

check("normalizes_payment_statuses_and_rejects_unknown", () => {
  assert.strictEqual(normalizePaymentStatus("UNPAID"), "PENDIENTE");
  assert.strictEqual(normalizePaymentStatus("PAID"), "PAGADO");
  assert.strictEqual(normalizePaymentStatus("PARTIALLY_PAID"), "PARCIAL");
  assert.throws(() => normalizePaymentStatus("COBRADO_RARO"), /payment_status desconocido/);
  return "payment aliases";
});

check("draft_and_approved_use_no_aplica", () => {
  assert.strictEqual(expectedPaymentStatusForInvoiceStatus("BORRADOR"), "NO_APLICA");
  assert.strictEqual(expectedPaymentStatusForInvoiceStatus("APROBADO"), "NO_APLICA");
  assert.strictEqual(canMarkPaid(demoInvoice({ invoice_status: "BORRADOR", payment_status: "NO_APLICA" })), false);
  assert.strictEqual(canMarkPaid(demoInvoice({ invoice_status: "APROBADO", payment_status: "NO_APLICA" })), false);
  return "NO_APLICA";
});

check("sandbox_timbrado_can_be_pending_partial_paid_overdue", () => {
  const invoice = demoInvoice();
  assert.strictEqual(isActiveInvoiceStatus(invoice.invoice_status), true);
  assert.strictEqual(canMarkPaymentPending(invoice), true);
  assert.strictEqual(canMarkPartial(invoice), true);
  assert.strictEqual(canMarkPaid(invoice), true);
  assert.strictEqual(canMarkOverdue(invoice), true);
  assert.strictEqual(evaluatePaymentStatusChange(invoice, "PAGADO").ok, true);
  assert.strictEqual(evaluatePaymentStatusChange(invoice, "PARCIAL").ok, true);
  assert.strictEqual(evaluatePaymentStatusChange(invoice, "VENCIDO").ok, true);
  return "collectible";
});

check("cancelled_invoice_does_not_allow_active_payment_change", () => {
  const cancelled = demoInvoice({ invoice_status: "SANDBOX_CANCELADO", payment_status: "NO_APLICA", total: 7500 });
  assert.strictEqual(isCancelledInvoiceStatus(cancelled.invoice_status), true);
  assert.strictEqual(isActiveInvoiceStatus(cancelled.invoice_status), false);
  const result = evaluatePaymentStatusChange(cancelled, "PAGADO");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "CANCELLED_INVOICE_PAYMENT_BLOCKED");
  return result.reason;
});

check("future_production_status_is_documented_but_blocked", () => {
  const future = demoInvoice({ invoice_status: "PRODUCCION_TIMBRADO_FUTURO", payment_status: "PENDIENTE" });
  const result = evaluatePaymentStatusChange(future, "PAGADO");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "PRODUCTION_STATUS_FUTURE_BLOCKED");
  return result.reason;
});

check("missing_invoice_cannot_be_marked_paid", () => {
  const result = evaluatePaymentStatusChange(null, "PAGADO");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "INVOICE_NOT_FOUND");
  assert.strictEqual(result.event_type, PAYMENT_EVENTS.PAYMENT_STATUS_CHANGE_BLOCKED);
  return result.reason;
});

check("mark_paid_is_idempotent", () => {
  const invoice = demoInvoice({ payment_status: "PAGADO" });
  const result = evaluatePaymentStatusChange(invoice, "PAGADO");
  const event = buildPaymentStatusEvent(invoice, "PAGADO");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.idempotent, true);
  assert.strictEqual(result.event_type, null);
  assert.strictEqual(event.event_type, null);
  return "already paid";
});

check("payment_events_are_named", () => {
  assert.strictEqual(buildPaymentStatusEvent(demoInvoice(), "PENDIENTE").event_type, null);
  assert.strictEqual(buildPaymentStatusEvent(demoInvoice(), "PAGADO").event_type, "PAYMENT_STATUS_MARKED_PAID");
  assert.strictEqual(buildPaymentStatusEvent(demoInvoice(), "PARCIAL").event_type, "PAYMENT_STATUS_MARKED_PARTIAL");
  assert.strictEqual(buildPaymentStatusEvent(demoInvoice(), "VENCIDO").event_type, "PAYMENT_STATUS_MARKED_OVERDUE");
  return "events ok";
});

check("client_summary_separates_pending_paid_cancelled", () => {
  const summary = buildClientInvoiceSummary([
    demoInvoice({ draft_id: "DRAFT-PENDING", payment_status: "PENDIENTE", total: 10150 }),
    demoInvoice({ draft_id: "DRAFT-PAID", payment_status: "PAGADO", total: 5000 }),
    demoInvoice({ draft_id: "DRAFT-PARTIAL", payment_status: "PARCIAL", total: 3000, payment_amount_paid: 1200 }),
    demoInvoice({ draft_id: "DRAFT-OVERDUE", payment_status: "VENCIDO", total: 2000 }),
    demoInvoice({ draft_id: "DRAFT-CANCEL", invoice_status: "SANDBOX_CANCELADO", payment_status: "NO_APLICA", total: 7500 }),
    demoInvoice({ draft_id: "DRAFT-BORRADOR", invoice_status: "BORRADOR", payment_status: "NO_APLICA", total: 9000 }),
  ], { generated_at: "2026-06-05T00:00:00.000Z" });
  const client = summary.by_client["CLIENT-PRIVADA-RIVERA"];
  assert.strictEqual(summary.totals.active_count, 4);
  assert.strictEqual(summary.totals.cancelled_count, 1);
  assert.strictEqual(summary.totals.draft_count, 1);
  assert.strictEqual(summary.totals.pending_total, 10150 + 1800 + 2000);
  assert.strictEqual(summary.totals.paid_total, 5000);
  assert.strictEqual(summary.totals.partial_paid_total, 1200);
  assert.strictEqual(summary.totals.cancelled_total, 7500);
  assert.strictEqual(client.cancelled_total, 7500);
  return JSON.stringify(summary.totals);
});

check("summary_sanitizes_visible_ids", () => {
  const summary = buildClientInvoiceSummary([
    demoInvoice({
      client_id: "XAXX010101000",
      draft_id: "00000000-0000-4000-8000-000000000555",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PAGADO",
      total: 1,
    }),
  ], { generated_at: "2026-06-05T00:00:00.000Z" });
  const text = JSON.stringify(summary);
  assert(!text.includes("XAXX010101000"));
  assert(!text.includes("00000000-0000-4000-8000-000000000555"));
  assert(!/[A-Za-z]:[\\/]/.test(text));
  assert(!/token|secret|api[-_ ]?key/i.test(text));
  return Object.keys(summary.by_client)[0];
});

check("sql_migration_contains_expected_columns_tables_views", () => {
  assert(fs.existsSync(sqlPath), "sql/007 missing");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const normalized = normalizeSql(sql);
  for (const expected of [
    "alter table cfdi_drafts add column if not exists invoice_status text",
    "alter table cfdi_drafts add column if not exists payment_status text",
    "create table if not exists cfdi_payment_status_events",
    "create or replace view cfdi_invoice_payment_state",
    "create or replace view cfdi_client_invoice_payment_summary",
    "payment_status in",
    "invoice_status in",
    "payment_status_change_blocked",
  ]) {
    assert(normalized.includes(normalizeSql(expected)), expected);
  }
  return "007";
});

check("sql_supports_required_queries", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert(sql.includes("Facturas por cliente"));
  assert(sql.includes("Facturas pendientes de pago"));
  assert(sql.includes("Facturas pagadas"));
  assert(sql.includes("Facturas vencidas"));
  assert(sql.includes("Facturas canceladas"));
  assert(sql.includes("Resumen por cliente"));
  return "queries documented";
});

check("no_pac_production_or_file_send_in_model", () => {
  const files = [
    "scripts/lib/invoice-payment-status-model.js",
    "sql/007_invoice_payment_status.sql",
    "docs/PHASE_7_9_INVOICE_PAYMENT_STATUS_MODEL.md",
  ];
  const combined = files
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  assert(!combined.includes("stampProduction"));
  assert(!combined.includes("https://api.factura.com"));
  assert(!/send(Document|Photo|Media|Audio|Video)/i.test(combined));
  return "safe";
});

check("protected_files_not_modified", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  assert(!changed.includes("data/concepts.normalized.json"));
  assert(!changed.some((file) => file.startsWith("runtime/")));
  return "protected clean";
});

console.log("Invoice Payment Status Model Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

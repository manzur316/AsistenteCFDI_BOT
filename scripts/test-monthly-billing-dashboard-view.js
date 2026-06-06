const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  ROLES,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  buildMonthlyBillingDashboardView,
  buildSafeMonthlyBillingDashboardKeyboard,
  getDefaultBillingPeriod,
  normalizePeriod,
  renderMonthlyBillingDashboardText,
} = require("./lib/monthly-billing-dashboard-view");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const period = "2026-06";
const referenceDate = "2026-06-05T00:00:00Z";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, nodeConfig = {}) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath,
        runnerSecret: "TEST_SECRET",
        ...nodeConfig,
      },
    },
  };
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeContext, () => [], 0)[0].json;
}

function hasSensitiveValue(value) {
  return /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|[A-Za-z]:[\\/]|\.env|token\s*real|secret|api[_-]?key|csd|\.(?:xml|pdf|zip|xlsx|xls)\b/i.test(String(value || ""));
}

function flattenCallbacks(payload) {
  return (payload.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data);
}

function monthlyRows() {
  return [
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-001",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 10150,
      invoice_date: "2026-06-04T10:00:00Z",
      rfc: "AAA010101AAA",
      uuid: "123e4567-e89b-12d3-a456-426614174000",
      file_path: "C:/secret/runtime/factura.xml",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-002",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 800,
      invoice_date: "2026-05-25T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-003",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1600,
      invoice_date: "2026-05-12T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-004",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 3100,
      invoice_date: "2026-04-20T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-005",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "VENCIDO",
      total: 5000,
      invoice_date: "2026-03-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-006",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PARCIAL",
      total: 3000,
      payment_amount_paid: 1000,
      invoice_date: "2026-06-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-007",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PAGADO",
      total: 5000,
      payment_amount_paid: 5000,
      invoice_date: "2026-05-30T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-008",
      invoice_status: "SANDBOX_CANCELADO",
      payment_status: "NO_APLICA",
      total: 7500,
      invoice_date: "2026-05-10T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-009",
      invoice_status: "BORRADOR",
      payment_status: "NO_APLICA",
      total: 999999,
      invoice_date: "2026-06-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-010",
      invoice_status: "APROBADO",
      payment_status: "NO_APLICA",
      total: 888888,
      invoice_date: "2026-06-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-MONTH-011",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 900,
      invoice_date: "",
    },
    {
      client_id: "CLIENT-PRIVADA-AREATZA",
      client_display: "Privada Areatza",
      draft_id: "DRAFT-MONTH-012",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "VENCIDO",
      total: 4000,
      invoice_date: "2026-05-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-ERROR",
      client_display: "Cliente Error Sandbox",
      draft_id: "DRAFT-MONTH-013",
      invoice_status: "SANDBOX_ERROR",
      payment_status: "NO_APLICA",
      total: "",
      invoice_date: "2026-06-02T10:00:00Z",
    },
    {
      client_id: "CLIENT-FUTURE",
      client_display: "Cliente Futuro",
      draft_id: "DRAFT-MONTH-014",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 7777,
      invoice_date: "2026-07-01T10:00:00Z",
    },
  ];
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-${role}`,
    telegram_chat_id: "CHAT-MONTH",
    telegram_user_id: "TGUSER-MONTH",
    display_name: "Usuario Mensual",
    role,
    enabled: true,
  };
}

function baseInput(callbackData, extra = {}) {
  const user = authorizedUser(extra.role || ROLES.OWNER);
  return {
    update_id: extra.update_id || 13101,
    chat_id: "CHAT-MONTH",
    telegram_user_id: "TGUSER-MONTH",
    message_id: String(extra.update_id || 13101),
    text: callbackData,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    client_invoice_ledger: extra.client_invoice_ledger || monthlyRows(),
    client_invoice_summary: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: {},
    today_summary: extra.today_summary || { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-MONTH",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
  };
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

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;

function dashboard() {
  return buildMonthlyBillingDashboardView(monthlyRows(), { period, reference_date: referenceDate });
}

check("dashboard_sums_pending", () => {
  const view = dashboard();
  assert.strictEqual(view.payment_status_totals.pending.count, 5);
  assert.strictEqual(view.payment_status_totals.pending.amount, 16550);
  return view.payment_status_totals.pending.amount;
});

check("dashboard_sums_paid", () => {
  const view = dashboard();
  assert.strictEqual(view.payment_status_totals.paid.count, 1);
  assert.strictEqual(view.payment_status_totals.paid.amount, 5000);
  return view.payment_status_totals.paid.amount;
});

check("dashboard_sums_partial", () => {
  const view = dashboard();
  assert.strictEqual(view.payment_status_totals.partial.count, 1);
  assert.strictEqual(view.payment_status_totals.partial.amount, 2000);
  return view.payment_status_totals.partial.amount;
});

check("dashboard_sums_overdue", () => {
  const view = dashboard();
  assert.strictEqual(view.payment_status_totals.overdue.count, 2);
  assert.strictEqual(view.payment_status_totals.overdue.amount, 9000);
  return view.payment_status_totals.overdue.amount;
});

check("cancelled_separated", () => {
  const view = dashboard();
  assert.strictEqual(view.invoice_status_totals.sandbox_cancelled_count, 1);
  assert.strictEqual(view.invoice_status_totals.active_count, 9);
  return "cancelled separated";
});

check("sandbox_errors_separated", () => {
  const view = dashboard();
  assert.strictEqual(view.invoice_status_totals.sandbox_error_count, 1);
  return "sandbox errors separated";
});

check("drafts_approved_not_active_collection", () => {
  const view = dashboard();
  assert.strictEqual(view.invoice_status_totals.draft_count, 1);
  assert.strictEqual(view.invoice_status_totals.approved_count, 1);
  assert(!JSON.stringify(view.payment_status_totals).includes("999999"));
  assert(!JSON.stringify(view.payment_status_totals).includes("888888"));
  return "drafts excluded";
});

check("aging_0_7_global", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets["0_7"].count, 2);
  assert.strictEqual(view.aging_buckets["0_7"].amount, 12150);
  return "0_7";
});

check("aging_8_15_global", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets["8_15"].amount, 800);
  return "8_15";
});

check("aging_16_30_global", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets["16_30"].amount, 1600);
  return "16_30";
});

check("aging_31_60_global", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets["31_60"].amount, 7100);
  return "31_60";
});

check("aging_60_plus_global", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets["60_plus"].amount, 5000);
  return "60_plus";
});

check("unknown_date_bucket", () => {
  const view = dashboard();
  assert.strictEqual(view.aging_buckets.UNKNOWN_DATE.amount, 900);
  assert.strictEqual(view.unknown_date_count, 1);
  return "UNKNOWN_DATE";
});

check("top_clients_with_balance", () => {
  const view = dashboard();
  assert.strictEqual(view.top_clients_with_balance[0].client_id, "CLIENT-PRIVADA-RIVERA");
  assert.strictEqual(view.top_clients_with_balance[0].status, "VENCIDO");
  assert.strictEqual(view.top_clients_with_balance[0].open_balance, 23550);
  assert.strictEqual(view.top_clients_with_balance[1].client_id, "CLIENT-PRIVADA-AREATZA");
  return "top_clients";
});

check("period_default_works", () => {
  assert.strictEqual(getDefaultBillingPeriod(new Date("2026-06-05T00:00:00")), "2026-06");
  assert.strictEqual(normalizePeriod("", new Date("2026-06-05T00:00:00")), "2026-06");
  return "default period";
});

check("period_yyyy_mm_works", () => {
  const view = buildMonthlyBillingDashboardView(monthlyRows(), { period: "2026-05", reference_date: referenceDate });
  assert.strictEqual(view.period, "2026-05");
  assert(view.total_records > 0);
  assert(!JSON.stringify(view).includes("DRAFT-MONTH-001"));
  return view.period;
});

check("empty_message_works", () => {
  const view = buildMonthlyBillingDashboardView([], { period, reference_date: referenceDate });
  const text = renderMonthlyBillingDashboardText(view);
  assert(text.includes("No hay facturas sandbox registradas para este periodo."));
  assert(text.includes("No es declaracion fiscal definitiva."));
  return "empty";
});

check("no_sensitive_values_in_helper_output", () => {
  const view = dashboard();
  const text = renderMonthlyBillingDashboardText(view);
  assert(!hasSensitiveValue(JSON.stringify(view)));
  assert(!hasSensitiveValue(text));
  return "sanitized";
});

check("no_file_delivery_terms", () => {
  const helperText = fs.readFileSync(path.join(root, "scripts", "lib", "monthly-billing-dashboard-view.js"), "utf8");
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText + helperText));
  assert(!/\.(?:xml|pdf|zip|xlsx)\s*por Telegram/i.test(helperText));
  return "no files";
});

check("no_production_pac_terms", () => {
  const helperText = fs.readFileSync(path.join(root, "scripts", "lib", "monthly-billing-dashboard-view.js"), "utf8");
  assert(!/stampProduction|F-Api-Key|F-Secret-Key|productionUrl/i.test(helperText));
  return "no PAC prod";
});

check("workflow_json_valid_and_report_routes_dashboard", () => {
  assert(workflow.nodes.length > 0);
  assert(workflowText.includes("cfdi_nav:report"));
  assert(workflowText.includes("Resumen mensual de cobranza"));
  assert(workflowText.includes("No hay facturas sandbox registradas para este periodo."));
  return "workflow ok";
});

check("workflow_report_renders_monthly_dashboard", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:report", { update_id: 13131 }));
  assert.strictEqual(result.action, "COMMAND_RESUMEN");
  assert(result.telegram_message.includes("Resumen mensual de cobranza"));
  assert(result.telegram_message.includes("Periodo:"));
  assert(result.telegram_message.includes("Pendiente: 5 | $16550.00"));
  assert(result.telegram_message.includes("Vencido: 2 | $9000.00"));
  assert(result.telegram_message.includes("Clientes con saldo:"));
  assert(result.telegram_message.includes("CLIENT-PRIVADA-RIVERA | VENCIDO | $23550.00"));
  assert(!hasSensitiveValue(result.telegram_message));
  return result.action;
});

check("workflow_report_empty_message", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:report", { update_id: 13132, client_invoice_ledger: [] }));
  assert.strictEqual(result.action, "COMMAND_RESUMEN");
  assert(result.telegram_message.includes("No hay facturas sandbox registradas para este periodo."));
  return result.action;
});

check("dashboard_keyboard_callbacks_safe", () => {
  const callbacks = flattenCallbacks({ reply_markup: buildSafeMonthlyBillingDashboardKeyboard() });
  assert(callbacks.includes("cfdi_nav:billing"));
  assert(callbacks.includes("cfdi_nav:aging"));
  assert(callbacks.includes("cfdi_nav:pay_paid"));
  assert(callbacks.includes("cfdi_nav:pay_cancel"));
  assert(callbacks.includes("cfdi_nav:acctpkg"));
  assert(callbacks.includes("cfdi_nav:menu"));
  for (const callbackData of callbacks) {
    const validation = validateTelegramCallbackData(callbackData);
    assert(validation.ok, `${callbackData}: ${validation.errors.join(",")}`);
    assert(callbackData.length <= 32, callbackData);
    assert(!hasSensitiveValue(callbackData), callbackData);
  }
  return callbacks.join(",");
});

check("runtime_not_versioned", () => {
  const trackedRuntime = git(["ls-files", "runtime"]);
  const unexpected = trackedRuntime.filter((item) => item !== "runtime/.gitkeep");
  assert.strictEqual(unexpected.length, 0, unexpected.join(","));
  return trackedRuntime.length ? "only .gitkeep" : "runtime ignored";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

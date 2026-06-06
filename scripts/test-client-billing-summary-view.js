const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  ROLES,
  getTelegramSubmenu,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  buildClientBillingSummaryView,
  buildSafeBillingSummaryKeyboard,
  classifyAgingBucket,
  renderClientBillingSummaryText,
} = require("./lib/client-billing-summary-view");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
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

function billingRows() {
  return [
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-001",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 10150,
      payment_amount_paid: 0,
      invoice_date: "2026-06-04T10:00:00Z",
      rfc: "AAA010101AAA",
      uuid: "123e4567-e89b-12d3-a456-426614174000",
      file_path: "C:/secret/runtime/factura.xml",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-002",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 800,
      invoice_date: "2026-05-25T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-003",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1600,
      invoice_date: "2026-05-12T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-004",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 3100,
      invoice_date: "2026-04-20T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-005",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "VENCIDO",
      total: 5000,
      invoice_date: "2026-03-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-006",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PARCIAL",
      total: 3000,
      payment_amount_paid: 1000,
      invoice_date: "2026-06-01T10:00:00Z",
      payment_paid_at: "2026-06-02T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-007",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PAGADO",
      total: 5000,
      payment_amount_paid: 5000,
      invoice_date: "2026-05-30T10:00:00Z",
      payment_paid_at: "2026-06-03T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-008",
      invoice_status: "SANDBOX_CANCELADO",
      payment_status: "NO_APLICA",
      total: 7500,
      invoice_date: "2026-05-10T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-009",
      invoice_status: "BORRADOR",
      payment_status: "NO_APLICA",
      total: 999999,
      invoice_date: "2026-06-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-010",
      invoice_status: "APROBADO",
      payment_status: "NO_APLICA",
      total: 888888,
      invoice_date: "2026-06-01T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-BILL-011",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 900,
      invoice_date: "",
    },
  ];
}

function clients() {
  return [
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      display_name: "Privada Rivera",
      rfc: "AAA010101AAA",
      validated_by_human: true,
    },
  ];
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-${role}`,
    telegram_chat_id: "CHAT-BILL",
    telegram_user_id: "TGUSER-BILL",
    display_name: "Usuario Billing",
    role,
    enabled: true,
  };
}

function baseInput(callbackData, role = ROLES.OWNER) {
  const user = authorizedUser(role);
  return {
    update_id: 12101,
    chat_id: "CHAT-BILL",
    telegram_user_id: "TGUSER-BILL",
    message_id: "12101",
    text: callbackData,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: clients(),
    client_invoice_ledger: billingRows(),
    client_invoice_summary: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-BILL",
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

check("helper_sums_pending_correctly", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.pending_count, 5);
  assert.strictEqual(view.summary.pending_total, 16550);
  assert.strictEqual(view.summary.open_balance_total, 23550);
  return view.summary.pending_total;
});

check("helper_sums_paid_correctly", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.paid_count, 1);
  assert.strictEqual(view.summary.paid_total, 5000);
  assert.strictEqual(view.summary.last_payment_at, "2026-06-03");
  return view.summary.paid_total;
});

check("helper_separates_partial_balances", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.partial_count, 1);
  assert.strictEqual(view.summary.partial_total, 2000);
  assert.strictEqual(view.summary.partial_paid_total, 1000);
  return `${view.summary.partial_total}/${view.summary.partial_paid_total}`;
});

check("helper_separates_overdue", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.overdue_count, 1);
  assert.strictEqual(view.summary.overdue_total, 5000);
  return view.summary.overdue_total;
});

check("cancelled_not_active", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.cancelled_count, 1);
  assert.strictEqual(view.summary.cancelled_total, 7500);
  assert.strictEqual(view.summary.active_invoice_count, 8);
  return "cancelled separated";
});

check("drafts_and_approved_do_not_count_collection", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(view.summary.draft_only_count, 2);
  assert(!JSON.stringify(view.summary).includes("999999"));
  assert(!JSON.stringify(view.summary).includes("888888"));
  return "drafts excluded";
});

check("aging_0_7_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("2026-06-04", referenceDate), "0_7");
  assert.strictEqual(view.summary.aging_buckets["0_7"].count, 2);
  assert.strictEqual(view.summary.aging_buckets["0_7"].amount, 12150);
  return "0_7";
});

check("aging_8_15_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("2026-05-25", referenceDate), "8_15");
  assert.strictEqual(view.summary.aging_buckets["8_15"].amount, 800);
  return "8_15";
});

check("aging_16_30_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("2026-05-12", referenceDate), "16_30");
  assert.strictEqual(view.summary.aging_buckets["16_30"].amount, 1600);
  return "16_30";
});

check("aging_31_60_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("2026-04-20", referenceDate), "31_60");
  assert.strictEqual(view.summary.aging_buckets["31_60"].amount, 3100);
  return "31_60";
});

check("aging_60_plus_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("2026-03-01", referenceDate), "60_plus");
  assert.strictEqual(view.summary.aging_buckets["60_plus"].amount, 5000);
  return "60_plus";
});

check("aging_unknown_date_works", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  assert.strictEqual(classifyAgingBucket("", referenceDate), "UNKNOWN_DATE");
  assert.strictEqual(view.summary.aging_buckets.UNKNOWN_DATE.amount, 900);
  return "UNKNOWN_DATE";
});

check("helper_output_does_not_expose_sensitive_values", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  const text = renderClientBillingSummaryText(view);
  assert(!hasSensitiveValue(text));
  assert(!hasSensitiveValue(JSON.stringify(view)));
  return "sanitized";
});

check("telegram_summary_contains_human_review_legend", () => {
  const view = buildClientBillingSummaryView(billingRows(), { reference_date: referenceDate });
  const text = renderClientBillingSummaryText(view);
  assert(text.includes("Borrador sujeto a revision humana"));
  assert(text.includes("No sustituye contador"));
  assert(text.includes("No hay cobro automatico ni conciliacion bancaria"));
  return "legend_ok";
});

check("billing_keyboard_callbacks_are_safe", () => {
  const callbacks = flattenCallbacks({ reply_markup: buildSafeBillingSummaryKeyboard() });
  assert(callbacks.includes("cfdi_nav:pay_pending"));
  assert(callbacks.includes("cfdi_nav:pay_paid"));
  assert(callbacks.includes("cfdi_nav:aging"));
  assert(callbacks.includes("cfdi_nav:pay_cancel"));
  assert(callbacks.includes("cfdi_nav:client_ledger"));
  for (const callbackData of callbacks) {
    const validation = validateTelegramCallbackData(callbackData);
    assert(validation.ok, `${callbackData}: ${validation.errors.join(",")}`);
    assert(callbackData.length <= 32, callbackData);
    assert(!hasSensitiveValue(callbackData), callbackData);
  }
  return callbacks.join(",");
});

check("no_file_delivery_or_production_pac_terms", () => {
  const helperText = fs.readFileSync(path.join(root, "scripts", "lib", "client-billing-summary-view.js"), "utf8");
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText + helperText));
  assert(!/stampProduction|produccion fiscal real|F-Api-Key|F-Secret-Key/i.test(helperText));
  assert(!/\.(?:xml|pdf|zip|xlsx)\s*por Telegram/i.test(helperText));
  return "safe";
});

check("workflow_json_is_valid_and_has_billing_callbacks", () => {
  assert(workflow.nodes.length > 0);
  assert(workflowText.includes("cfdi_nav:billing"));
  assert(workflowText.includes("cfdi_nav:aging"));
  assert(workflowText.includes("CLIENT_BILLING_SUMMARY"));
  assert(workflowText.includes("CLIENT_BILLING_AGING"));
  return "workflow_ok";
});

check("contract_clients_submenu_contains_billing_callbacks", () => {
  const callbacks = flattenCallbacks(getTelegramSubmenu("clients", ROLES.ASSISTANT_OPERATOR));
  assert(callbacks.includes("cfdi_nav:billing"));
  assert(callbacks.includes("cfdi_nav:aging"));
  assert(!callbacks.includes("cfdi_nav:client_validate"));
  return callbacks.join(",");
});

check("workflow_clients_menu_exposes_billing_buttons", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:clients"));
  const text = result.telegram_message + "\n" + JSON.stringify(result.reply_markup || {});
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(text.includes("cfdi_nav:billing"));
  assert(text.includes("cfdi_nav:aging"));
  assert(!hasSensitiveValue(text));
  return result.action;
});

check("workflow_renders_billing_summary", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:billing"));
  assert.strictEqual(result.action, "CLIENT_BILLING_SUMMARY");
  assert(result.telegram_message.includes("Resumen cobranza"));
  assert(result.telegram_message.includes("Cliente: CLIENT-PRIVADA-RIVERA"));
  assert(result.telegram_message.includes("Activas: 8"));
  assert(result.telegram_message.includes("Pendientes: 5 | $16550.00"));
  assert(result.telegram_message.includes("Parciales: 1 | $2000.00"));
  assert(result.telegram_message.includes("Pagadas: 1 | $5000.00"));
  assert(result.telegram_message.includes("Vencidas: 1 | $5000.00"));
  assert(result.telegram_message.includes("Canceladas: 1 | $7500.00 separado"));
  assert(result.telegram_message.includes("Antiguedad pendientes"));
  assert(!hasSensitiveValue(result.telegram_message));
  return result.action;
});

check("workflow_renders_aging_summary", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:aging"));
  assert.strictEqual(result.action, "CLIENT_BILLING_AGING");
  assert(result.telegram_message.includes("Resumen vencidos"));
  assert(result.telegram_message.includes("60+ dias:"));
  assert(result.telegram_message.includes("Sin fecha:"));
  assert(!hasSensitiveValue(result.telegram_message));
  return result.action;
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

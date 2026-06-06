const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ROLES,
  getTelegramSubmenu,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  buildClientInvoiceLedgerView,
  buildSafeLedgerKeyboard,
  evaluateLedgerPaymentAction,
  renderClientInvoiceLedgerText,
} = require("./lib/client-invoice-ledger-view");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

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

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-${role}`,
    telegram_chat_id: "CHAT-LEDGER",
    telegram_user_id: "TGUSER-LEDGER",
    display_name: "Usuario Ledger",
    role,
    enabled: true,
  };
}

function ledgerRows() {
  return [
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-LEDGER-001",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 10150,
      payment_amount_paid: 0,
      updated_at: "2026-06-05T10:00:00Z",
      rfc: "AAA010101AAA",
      uuid: "123e4567-e89b-12d3-a456-426614174000",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-LEDGER-002",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PAGADO",
      total: 5000,
      payment_amount_paid: 5000,
      updated_at: "2026-06-04T10:00:00Z",
    },
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      client_display: "Privada Rivera",
      draft_id: "DRAFT-LEDGER-003",
      invoice_status: "SANDBOX_CANCELADO",
      payment_status: "NO_APLICA",
      total: 7500,
      payment_amount_paid: 0,
      updated_at: "2026-06-03T10:00:00Z",
    },
  ];
}

function clients() {
  return [
    {
      client_id: "CLIENT-PRIVADA-RIVERA",
      display_name: "Privada Rivera",
      rfc: "AAA010101AAA",
      tipo_persona: "MORAL",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
      validated_by_human: true,
      aliases: [{ alias: "privada rivera", normalized_alias: "privada rivera" }],
    },
  ];
}

function baseInput(callbackData, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 9501,
    chat_id: "CHAT-LEDGER",
    telegram_user_id: "TGUSER-LEDGER",
    message_id: "9501",
    text: callbackData,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients(),
    client_invoice_ledger: extra.client_invoice_ledger || ledgerRows(),
    client_invoice_summary: extra.client_invoice_summary || [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-LEDGER",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
  };
}

function flattenCallbacks(payload) {
  return (payload.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data);
}

function hasSensitiveValue(value) {
  return /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|[A-Za-z]:[\\/]|\.env|token|secret|api[_-]?key|csd|\.(?:xml|pdf|zip|xlsx)\b/i.test(String(value || ""));
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
const loadContextCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;

check("helper_builds_client_invoice_ledger_summary", () => {
  const view = buildClientInvoiceLedgerView(ledgerRows());
  assert.strictEqual(view.summary.pending_count, 1);
  assert.strictEqual(view.summary.pending_total, 10150);
  assert.strictEqual(view.summary.paid_count, 1);
  assert.strictEqual(view.summary.paid_total, 5000);
  assert.strictEqual(view.summary.cancelled_count, 1);
  assert.strictEqual(view.summary.cancelled_total, 7500);
  const text = renderClientInvoiceLedgerText(view);
  assert(text.includes("Facturas por cliente"));
  assert(text.includes("SANDBOX_TIMBRADO | PENDIENTE"));
  assert(text.includes("SANDBOX_CANCELADO | NO_APLICA"));
  assert(!hasSensitiveValue(text));
  return "pending/paid/cancelled";
});

check("helper_filters_pending_paid_cancelled", () => {
  const pending = buildClientInvoiceLedgerView(ledgerRows(), { filter: "pending" });
  const paid = buildClientInvoiceLedgerView(ledgerRows(), { filter: "paid" });
  const cancelled = buildClientInvoiceLedgerView(ledgerRows(), { filter: "cancelled" });
  assert.strictEqual(pending.rows.length, 1);
  assert.strictEqual(paid.rows.length, 1);
  assert.strictEqual(cancelled.rows.length, 1);
  assert.strictEqual(pending.rows[0].payment_status, "PENDIENTE");
  assert.strictEqual(paid.rows[0].payment_status, "PAGADO");
  assert.strictEqual(cancelled.rows[0].invoice_status, "SANDBOX_CANCELADO");
  return "filters_ok";
});

check("payment_action_guardrails_are_reused", () => {
  const blocked = evaluateLedgerPaymentAction({ invoice_status: "SANDBOX_CANCELADO", payment_status: "NO_APLICA" }, "PAGADO");
  const allowed = evaluateLedgerPaymentAction({ invoice_status: "SANDBOX_TIMBRADO", payment_status: "PENDIENTE" }, "PAGADO");
  assert.strictEqual(blocked.ok, false);
  assert.strictEqual(blocked.reason, "CANCELLED_INVOICE_PAYMENT_BLOCKED");
  assert.strictEqual(allowed.ok, true);
  return "guardrails_ok";
});

check("safe_ledger_keyboard_callbacks_are_short", () => {
  const callbacks = flattenCallbacks({ reply_markup: buildSafeLedgerKeyboard() });
  for (const callbackData of callbacks) {
    const validation = validateTelegramCallbackData(callbackData);
    assert(validation.ok, `${callbackData}: ${validation.errors.join(",")}`);
    assert(callbackData.length <= 32, callbackData);
    assert(!hasSensitiveValue(callbackData), callbackData);
  }
  return callbacks.join(",");
});

check("contract_clients_submenu_contains_ledger_callbacks", () => {
  const callbacks = flattenCallbacks(getTelegramSubmenu("clients", ROLES.ASSISTANT_OPERATOR));
  assert(callbacks.includes("cfdi_nav:client_ledger"));
  assert(callbacks.includes("cfdi_nav:pay_pending"));
  assert(callbacks.includes("cfdi_nav:pay_paid"));
  assert(callbacks.includes("cfdi_nav:pay_cancel"));
  assert(!callbacks.includes("cfdi_nav:client_validate"));
  return callbacks.join(",");
});

check("workflow_loads_invoice_payment_views", () => {
  assert(loadContextCode.includes("cfdi_invoice_payment_state"));
  assert(loadContextCode.includes("cfdi_client_invoice_payment_summary"));
  assert(loadContextCode.includes("client_invoice_ledger"));
  assert(loadContextCode.includes("client_invoice_summary"));
  const result = executeCode(loadContextCode, { chat_id: "CHAT-LEDGER", update_id: 9500 });
  assert(result.load_context_sql.includes("cfdi_invoice_payment_state"));
  assert(result.load_context_sql.includes("client_invoice_ledger"));
  return "views_loaded";
});

check("workflow_clients_menu_exposes_ledger_buttons", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:clients"));
  const text = result.telegram_message + "\n" + JSON.stringify(result.reply_markup || {});
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(text.includes("cfdi_nav:client_ledger"));
  assert(text.includes("cfdi_nav:pay_pending"));
  assert(text.includes("cfdi_nav:pay_paid"));
  assert(text.includes("cfdi_nav:pay_cancel"));
  assert(!hasSensitiveValue(text));
  return result.action;
});

check("workflow_renders_client_invoice_ledger", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger"));
  assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER");
  assert(result.telegram_message.includes("Facturas por cliente"));
  assert(result.telegram_message.includes("Cliente: Privada Rivera"));
  assert(result.telegram_message.includes("SANDBOX_TIMBRADO | PENDIENTE | $10150.00"));
  assert(result.telegram_message.includes("SANDBOX_TIMBRADO | PAGADO | $5000.00"));
  assert(result.telegram_message.includes("SANDBOX_CANCELADO | NO_APLICA | $7500.00"));
  assert(result.telegram_message.includes("Pendiente: $10150.00"));
  assert(result.telegram_message.includes("Pagado: $5000.00"));
  assert(result.telegram_message.includes("Cancelado separado: $7500.00"));
  assert(!hasSensitiveValue(result.telegram_message));
  return result.action;
});

check("workflow_renders_payment_filters", () => {
  const pending = executeCode(handleCode, baseInput("cfdi_nav:pay_pending"));
  const paid = executeCode(handleCode, baseInput("cfdi_nav:pay_paid"));
  const cancelled = executeCode(handleCode, baseInput("cfdi_nav:pay_cancel"));
  assert.strictEqual(pending.action, "CLIENT_PAYMENT_PENDING");
  assert.strictEqual(paid.action, "CLIENT_PAYMENT_PAID");
  assert.strictEqual(cancelled.action, "CLIENT_PAYMENT_CANCELLED");
  assert(pending.telegram_message.includes("PENDIENTE"));
  assert(!pending.telegram_message.includes("PAGADO | $5000.00"));
  assert(paid.telegram_message.includes("PAGADO | $5000.00"));
  assert(!paid.telegram_message.includes("PENDIENTE | $10150.00"));
  assert(cancelled.telegram_message.includes("SANDBOX_CANCELADO"));
  assert(!cancelled.telegram_message.includes("SANDBOX_TIMBRADO | PENDIENTE"));
  return "filters_rendered";
});

check("workflow_cliente_command_hides_rfc_and_adds_ledger", () => {
  const input = baseInput("/cliente Privada Rivera", ROLES.OWNER, { update_id: 9510 });
  input.source_kind = "MESSAGE";
  input.callback_query_id = "";
  input.text = "/cliente Privada Rivera";
  const result = executeCode(handleCode, input);
  assert.strictEqual(result.action, "COMMAND_CLIENTE");
  assert(result.telegram_message.includes("RFC: registrado localmente (oculto)"));
  assert(result.telegram_message.includes("Facturas por cliente"));
  assert(!hasSensitiveValue(result.telegram_message));
  return result.action;
});

check("assistant_can_view_ledger_admin_stays_hidden", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger", ROLES.ASSISTANT_OPERATOR));
  assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER");
  const denied = executeCode(handleCode, baseInput("cfdi_nav:client_validate", ROLES.ASSISTANT_OPERATOR, { update_id: 9511 }));
  assert.strictEqual(denied.action, "ACCESS_DENIED");
  return "role_ok";
});

check("workflow_does_not_send_documents_or_call_production_pac", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText));
  assert(!/https:\/\/api\.factura\.com|stampProduction|timbre_fiscal|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(workflowText));
  assert(!workflowText.includes("data/concepts.normalized.json\": {}"));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

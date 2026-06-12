const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  PAYMENT_STATUSES,
  evaluatePaymentStatusChange,
} = require("./lib/invoice-payment-status-model");
const {
  PAYMENT_STATUS_ACTIONS,
  markInvoicePending,
  markInvoicePaid,
  markInvoicePartial,
  markInvoiceOverdue,
  paymentStatusFromAction,
} = require("./lib/payment-status-action");
const {
  buildClientInvoiceLedgerView,
} = require("./lib/client-invoice-ledger-view");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
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
  return /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|[A-Za-z]:[\\/]|\.env|token\s*real|secret|api[_-]?key|csd|\.(?:xml|pdf|zip|xlsx)\b/i.test(String(value || ""));
}

function flattenCallbacks(payload) {
  return (payload.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data);
}

function activeDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-PAY-001",
    status: "SANDBOX_TIMBRADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    client_id: "CLIENT-PRIVADA-RIVERA",
    client_snapshot: {
      client_id: "CLIENT-PRIVADA-RIVERA",
      display_name: "Privada Rivera",
    },
    message_original: "servicio de CCTV sandbox",
    concept: {
      id: "SVC-CCTV-001",
      concepto_factura: "Servicio CCTV",
      clave_prod_serv: "81111811",
      unidad: "Servicio",
      familia: "CCTV",
      tipo: "SERVICIO",
    },
    amount: 8750,
    subtotal: 8750,
    iva_amount: 1400,
    total: 10150,
    updated_at: "2026-06-05T10:00:00Z",
    ...overrides,
  };
}

function cancelledDraft() {
  return activeDraft({
    draft_id: "DRAFT-CANCEL-001",
    status: "SANDBOX_CANCELADO",
    invoice_status: "SANDBOX_CANCELADO",
    payment_status: "NO_APLICA",
  });
}

function draftLike(status) {
  return activeDraft({
    draft_id: `DRAFT-${status}`,
    status,
    invoice_status: status === "PENDIENTE" ? "BORRADOR" : status,
    payment_status: "NO_APLICA",
  });
}

function authorizedUser(role = "OWNER") {
  return {
    user_id: `USER-${role}`,
    telegram_chat_id: "CHAT-PAY",
    telegram_user_id: "TGUSER-PAY",
    display_name: "Usuario Pago",
    role,
    enabled: true,
  };
}

function baseInput(text, extra = {}) {
  const user = authorizedUser(extra.role || "OWNER");
  const drafts = extra.recent_drafts || [activeDraft(), cancelledDraft(), draftLike("APROBADO")];
  return {
    update_id: extra.update_id || 11701,
    chat_id: "CHAT-PAY",
    telegram_user_id: "TGUSER-PAY",
    message_id: String(extra.update_id || 11701),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    client_invoice_ledger: extra.client_invoice_ledger || drafts,
    client_invoice_summary: [],
    tax_rules: [],
    chat_state: null,
    action_token: extra.action_token || null,
    recent_drafts: drafts,
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
  };
}

function callbackInput(action, draft, token = "TOKPAY000001", updateId = 11801) {
  return baseInput(`cfdi:${token}`, {
    update_id: updateId,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CB-${updateId}`,
    callback_message_id: "99",
    source_message_id: "99",
    recent_drafts: [draft],
    client_invoice_ledger: [draft],
    action_token: {
      token,
      chat_id: "CHAT-PAY",
      draft_id: draft.draft_id,
      action,
      expires_at: "2099-01-01T00:00:00.000Z",
      used_at: null,
      payload: { draft_id: draft.draft_id, action, state: "DRAFT_DETAIL" },
    },
  });
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

check("helper_only_sandbox_timbrado_allows_payment_changes", () => {
  assert.strictEqual(evaluatePaymentStatusChange(activeDraft(), "PAGADO").ok, true);
  assert.strictEqual(evaluatePaymentStatusChange(cancelledDraft(), "PAGADO").ok, false);
  assert.strictEqual(evaluatePaymentStatusChange(draftLike("BORRADOR"), "PAGADO").ok, false);
  assert.strictEqual(evaluatePaymentStatusChange(draftLike("APROBADO"), "PAGADO").ok, false);
  return "SANDBOX_TIMBRADO only";
});

check("helper_marks_each_supported_payment_status", () => {
  assert.strictEqual(markInvoicePending(activeDraft({ payment_status: "PAGADO" })).new_payment_status, PAYMENT_STATUSES.PENDIENTE);
  assert.strictEqual(markInvoicePaid(activeDraft()).invoice.payment_status, PAYMENT_STATUSES.PAGADO);
  assert.strictEqual(markInvoicePartial(activeDraft()).invoice.payment_status, PAYMENT_STATUSES.PARCIAL);
  assert.strictEqual(markInvoiceOverdue(activeDraft()).invoice.payment_status, PAYMENT_STATUSES.VENCIDO);
  return Object.values(PAYMENT_STATUS_ACTIONS).join(",");
});

check("helper_paid_twice_is_idempotent", () => {
  const result = markInvoicePaid(activeDraft({ payment_status: "PAGADO" }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.idempotent, true);
  assert.strictEqual(result.event_type, null);
  assert(result.telegram_message.includes("No se duplico el evento"));
  return result.reason;
});

check("helper_sanitizes_visible_output", () => {
  const result = markInvoicePaid(activeDraft({
    client_id: "AAA010101AAA",
    draft_id: "123e4567-e89b-12d3-a456-426614174000",
  }));
  assert(!hasSensitiveValue(JSON.stringify(result)));
  return "sanitized";
});

check("workflow_json_is_valid_and_registers_payment_actions", () => {
  assert(workflowText.includes("MARK_PAYMENT_PENDING"));
  assert(workflowText.includes("MARK_PAYMENT_PAID"));
  assert(workflowText.includes("MARK_PAYMENT_PARTIAL"));
  assert(workflowText.includes("MARK_PAYMENT_OVERDUE"));
  assert(workflowText.includes("cfdi_payment_status_events"));
  assert.strictEqual(paymentStatusFromAction("MARK_PAYMENT_PAID"), "PAGADO");
  return "actions present";
});

check("workflow_detail_shows_payment_buttons_with_safe_tokens", () => {
  const input = baseInput("/detalle DRAFT-PAY-001", { update_id: 11711 });
  const result = executeCode(handleCode, input);
  assert.strictEqual(result.action, "COMMAND_DETALLE");
  assert(result.telegram_message.includes("sandbox_timbrado"));
  assert(flattenCallbacks(result).length > 0);
  assert(result.persistence_sql.includes("MARK_PAYMENT_PAID"));
  const callbacks = flattenCallbacks(result);
  assert(callbacks.some((item) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(item)));
  for (const callbackData of callbacks) {
    assert(callbackData.length <= 32, callbackData);
    assert(!hasSensitiveValue(callbackData), callbackData);
  }
  return callbacks.length;
});

function assertPaymentWorkflow(action, target, eventType, updateId, draft = activeDraft()) {
  const token = `TOKPAY${String(updateId).padStart(6, "0")}`;
  const result = executeCode(handleCode, callbackInput(action, draft, token, updateId));
  assert.strictEqual(result.action, eventType);
  assert(result.telegram_message.includes("Pago actualizado"));
  assert(result.telegram_message.includes(`Estado pago: ${target}`));
  assert(result.persistence_sql.includes(`payment_status = '${target}'`));
  assert(result.persistence_sql.includes("INSERT INTO cfdi_payment_status_events"));
  assert(result.persistence_sql.includes(eventType));
  assert(!result.persistence_sql.includes("SET invoice_status"));
  assert(!/sendDocument|sendPhoto|sendMediaGroup/i.test(result.persistence_sql));
  assert(!hasSensitiveValue(result.telegram_message));
  return result;
}

check("workflow_marks_paid_and_records_event_without_invoice_status_change", () => {
  const result = assertPaymentWorkflow("MARK_PAYMENT_PAID", "PAGADO", "PAYMENT_STATUS_MARKED_PAID", 11811);
  return result.action;
});

check("workflow_marks_pending_partial_overdue", () => {
  assertPaymentWorkflow("MARK_PAYMENT_PENDING", "PENDIENTE", "PAYMENT_STATUS_SET_PENDING", 11812, activeDraft({ payment_status: "PAGADO" }));
  assertPaymentWorkflow("MARK_PAYMENT_PARTIAL", "PARCIAL", "PAYMENT_STATUS_MARKED_PARTIAL", 11813);
  assertPaymentWorkflow("MARK_PAYMENT_OVERDUE", "VENCIDO", "PAYMENT_STATUS_MARKED_OVERDUE", 11814);
  return "all targets";
});

check("workflow_paid_twice_is_idempotent_and_skips_critical_event", () => {
  const draft = activeDraft({ payment_status: "PAGADO" });
  const result = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", draft, "TOKPAY011815", 11815));
  assert.strictEqual(result.action, "PAYMENT_STATUS_ALREADY_PAGADO");
  assert(result.telegram_message.includes("No se duplico el evento"));
  assert(!result.persistence_sql.includes("INSERT INTO cfdi_payment_status_events"));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return result.action;
});

check("workflow_blocks_cancelled_and_draft_like_invoices", () => {
  const cancelled = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", cancelledDraft(), "TOKPAY011816", 11816));
  assert.strictEqual(cancelled.action, "PAYMENT_STATUS_CHANGE_BLOCKED");
  assert(cancelled.telegram_message.includes("cancelada en sandbox"));
  assert(!cancelled.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  assert(cancelled.persistence_sql.includes("PAYMENT_STATUS_CHANGE_BLOCKED"));

  const approved = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", draftLike("APROBADO"), "TOKPAY011817", 11817));
  assert.strictEqual(approved.action, "PAYMENT_STATUS_CHANGE_BLOCKED");
  assert(!approved.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return "blocked";
});

check("ledger_reflects_payment_status_change", () => {
  const paid = markInvoicePaid(activeDraft()).invoice;
  const view = buildClientInvoiceLedgerView([paid]);
  assert.strictEqual(view.summary.paid_count, 1);
  assert.strictEqual(view.summary.paid_total, 10150);
  return JSON.stringify(view.summary);
});

check("workflow_ledger_blocks_ambiguous_payment_buttons_for_active_invoice", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger", {
    update_id: 11712,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-LEDGER-PAY",
    callback_message_id: "99",
  }));
  assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER");
  assert(result.telegram_message.includes("Pendientes pago -> facturas N -> pagar N"));
  assert(!result.persistence_sql.includes("MARK_PAYMENT_PAID"));
  const callbacks = flattenCallbacks(result);
  assert(callbacks.every((item) => item.length <= 32));
  return "ambiguous payment blocked";
});

check("workflow_keeps_7_10_latency_and_startup_contracts", () => {
  assert(workflowText.includes("TELEGRAM_LATENCY_EVENT"));
  assert(workflowText.includes("callback_ack_text"));
  assert(fs.existsSync(path.join(root, "scripts", "export-telegram-latency-events.js")));
  assert(fs.existsSync(path.join(root, "scripts", "local", "start-n8n-pac-sandbox.example.ps1")));
  assert(fs.existsSync(path.join(root, "scripts", "local", "start-runner.local.example.ps1")));
  return "7.10C/D/E present";
});

check("workflow_does_not_send_files_or_call_production_pac", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText));
  assert(!/stampProduction|https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|produccion fiscal real habilitada/i.test(workflowText));
  return "safe";
});

check("runtime_and_catalog_are_not_modified", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  assert(!changed.includes("data/concepts.normalized.json"));
  assert(!changed.some((file) => file.startsWith("runtime/")));
  return "protected";
});

console.log("Payment Status Command Adapter Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

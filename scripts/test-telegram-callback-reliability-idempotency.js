const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const docPath = path.join(root, "docs", "PHASE_7_5C_TELEGRAM_CALLBACK_RELIABILITY_IDEMPOTENCY.md");
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

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-CALLBACK-${role}`,
    telegram_chat_id: "CHAT-CB",
    telegram_user_id: "TGUSER-CB",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 9101,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 9101,
    chat_id: "CHAT-CB",
    telegram_user_id: "TGUSER-CB",
    message_id: String((extra.update_id || 9101) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-${extra.update_id || 9101}`,
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function recentEvent(callbackData, status = "IN_PROGRESS") {
  return {
    event_type: status === "IN_PROGRESS" ? "PAC_SANDBOX_ACTION_IN_PROGRESS" : "PAC_SANDBOX_ACTION_RESULT",
    created_at: new Date().toISOString(),
    idempotency_key: `pac_sandbox:${callbackData}`,
    idempotency_status: status,
    callback_data: callbackData,
  };
}

function assertNoSensitiveWorkflowText(text) {
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url");
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "provider headers");
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(text), "file send");
  assert(!/%PDF-|<cfdi:Comprobante|sendDocument|sendMediaGroup|sendPhoto/i.test(text), "document send/content");
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

check("workflow_json_valid", () => {
  assert(workflow.nodes.length > 0);
  return `${workflow.nodes.length} nodes`;
});

check("callback_ack_is_early_and_textual", () => {
  const answerNode = getNode(workflow, "Telegram answerCallbackQuery");
  const handleConnections = workflow.connections["Handle Commands And Scoring"].main[0].map((item) => item.node);
  const restoreConnections = workflow.connections["Restore Response After Persistence"].main[0].map((item) => item.node);
  assert(handleConnections.includes("Is Callback Query"), "callback ACK no sale desde Handle");
  assert(!restoreConnections.includes("Is Callback Query"), "callback ACK sigue esperando persistencia");
  assert(String(answerNode.parameters.jsonBody).includes("callback_ack_text"));
  assert(String(answerNode.parameters.jsonBody).includes("Accion recibida."));
  return "answerCallbackQuery";
});

check("pac_sandbox_processing_lock_before_execute", () => {
  assert(getNode(workflow, "Postgres Mark Callback Processing"));
  assert(getNode(workflow, "Restore Processing Lock Context"));
  assert.strictEqual(workflow.connections["Should Execute PAC Sandbox Action"].main[0][0].node, "Postgres Mark Callback Processing");
  assert.strictEqual(workflow.connections["Postgres Mark Callback Processing"].main[0][0].node, "Restore Processing Lock Context");
  assert.strictEqual(workflow.connections["Restore Processing Lock Context"].main[0][0].node, "Execute PAC Sandbox Action");
  return "lock -> execute";
});

check("smoke_create_first_click_executes_once_with_lock", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:smoke_create", ROLES.OWNER, { update_id: 9110 }));
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.callback_ack_text, "Procesando accion...");
  assert(result.callback_processing_sql.includes("PAC_SANDBOX_ACTION_IN_PROGRESS"));
  assert(result.callback_processing_sql.includes("pac_sandbox:cfdi_sbx:smoke_create"));
  assert(result.callback_processing_sql.includes("passthrough_b64"));
  return result.requested_sandbox_action;
});

for (const callbackData of ["cfdi_sbx:smoke_create", "cfdi_sbx:smoke_download", "cfdi_sbx:smoke_cancel"]) {
  check(`${callbackData}_duplicate_in_progress_blocked`, () => {
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.OWNER, {
      update_id: 9120 + callbackData.length,
      recent_callback_events: [recentEvent(callbackData, "IN_PROGRESS")],
    }));
    assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
    assert.strictEqual(result.should_execute_sandbox_action, undefined);
    assert.strictEqual(result.callback_ack_text, "Accion ya en proceso.");
    assert(result.telegram_message.includes("Esta accion ya esta en proceso."));
    assert(result.telegram_message.includes("No se ejecuto de nuevo."));
    assert(result.reply_markup);
    assert(result.persistence_sql.includes("CALLBACK_DUPLICATE_BLOCKED"));
    return "blocked";
  });
}

check("pac_sandbox_processed_duplicate_blocked", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:smoke_cancel", ROLES.OWNER, {
    update_id: 9131,
    recent_callback_events: [recentEvent("cfdi_sbx:smoke_cancel", "PROCESSED")],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya ejecutada.");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  assert(result.reply_markup);
  return "processed";
});

check("confirm_draft_used_token_not_reexecuted", () => {
  const token = "USEDTOKEN1234";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 9141,
    action_token: {
      token,
      chat_id: "CHAT-CB",
      action: "CONFIRM",
      used_at: new Date().toISOString(),
      payload: { draft_id: "DRAFT-CB-1" },
      expires_at: new Date(Date.now() + 600000).toISOString(),
    },
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  return "confirm blocked";
});

check("restore_draft_used_token_not_reexecuted", () => {
  const token = "RESTORETOKEN12";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 9142,
    action_token: {
      token,
      chat_id: "CHAT-CB",
      action: "RESTORE_DRAFT",
      used_at: new Date().toISOString(),
      payload: { draft_id: "DRAFT-CB-2" },
      expires_at: new Date(Date.now() + 600000).toISOString(),
    },
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  return "restore blocked";
});

check("unknown_callback_answers_without_blocking", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:unknown", ROLES.OWNER, { update_id: 9151 }));
  assert.strictEqual(result.action, "PRODUCT_MENU_PENDING");
  assert.strictEqual(result.should_execute_sandbox_action, undefined);
  assert(result.telegram_message.includes("preparacion"));
  return result.action;
});

check("normal_user_cannot_execute_admin_sandbox", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:smoke_create", ROLES.ASSISTANT_OPERATOR, { update_id: 9161 }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.telegram_message, "Acceso no autorizado.");
  return result.action;
});

check("workflow_has_no_pac_credentials_or_file_send", () => {
  assertNoSensitiveWorkflowText(workflowText);
  return "safe";
});

check("phase_document_exists", () => {
  const text = fs.readFileSync(docPath, "utf8");
  assert(text.includes("ACK Rapido"));
  assert(text.includes("Deduplicacion"));
  assert(text.includes("PAC Sandbox"));
  assert(text.includes("7.6 Approved Draft to PAC Sandbox"));
  return "doc";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

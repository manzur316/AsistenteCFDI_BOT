const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ACTIONS,
  ACTION_CATEGORIES,
  actionTokenCategory,
  isOneTimeAction,
  isReusableActionToken,
  validateActionTokenRecord,
} = require("./lib/telegram-action-token-utils");
const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-7-14B-${role}`,
    telegram_chat_id: "CHAT-7-14B",
    telegram_user_id: "TGUSER-7-14B",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 71420,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 71420,
    chat_id: "CHAT-7-14B",
    telegram_user_id: "TGUSER-7-14B",
    message_id: String((extra.update_id || 71420) + 100),
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
    callback_query_id: `CALLBACK-7-14B-${extra.update_id || 71420}`,
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

function tokenRecord(token, action, overrides = {}) {
  return {
    token,
    chat_id: "CHAT-7-14B",
    action,
    used_at: overrides.used_at ?? null,
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    payload: overrides.payload || {},
    draft_id: overrides.draft_id || null,
  };
}

function recentEventForCallback(callbackData, status = "PROCESSED") {
  return {
    event_type: status === "IN_PROGRESS" ? "PAC_SANDBOX_ACTION_IN_PROGRESS" : "PAC_SANDBOX_ACTION_RESULT",
    created_at: new Date().toISOString(),
    idempotency_key: `pac_sandbox:${callbackData}`,
    idempotency_status: status,
    callback_data: callbackData,
  };
}

function noExecutedMessage(result) {
  return !/Accion ya ejecutada|Esta accion ya fue procesada|No se ejecuto de nuevo/i.test(String(result.telegram_message || ""));
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;

check("token_categories_are_exported", () => {
  assert.strictEqual(actionTokenCategory(ACTIONS.MENU), ACTION_CATEGORIES.NAVIGATION);
  assert.strictEqual(actionTokenCategory(ACTIONS.VIEW_DRAFT), ACTION_CATEGORIES.VIEW);
  assert.strictEqual(actionTokenCategory(ACTIONS.STAMP_DRAFT_SANDBOX), ACTION_CATEGORIES.PAC_SANDBOX);
  assert.strictEqual(actionTokenCategory(ACTIONS.DOWNLOAD_SANDBOX_ARTIFACTS), ACTION_CATEGORIES.PAC_SANDBOX);
  assert.strictEqual(actionTokenCategory("MARK_PAYMENT_PAID"), ACTION_CATEGORIES.PAYMENT_STATUS);
  return "categories";
});

check("navigation_and_view_tokens_reusable_even_if_used", () => {
  for (const action of [ACTIONS.MENU, ACTIONS.LIST_PENDING, ACTIONS.VIEW_DRAFT, ACTIONS.VIEW_SUMMARY, ACTIONS.HELP]) {
    assert.strictEqual(isReusableActionToken(action), true, action);
    assert.strictEqual(isOneTimeAction(action), false, action);
    const validation = validateActionTokenRecord(tokenRecord("REUSE714B0001", action, { used_at: "2026-06-06T00:00:00.000Z" }), { chatId: "CHAT-7-14B" });
    assert.strictEqual(validation.ok, true, action);
  }
  return "reusable";
});

check("sensitive_tokens_remain_one_time", () => {
  for (const action of [ACTIONS.CONFIRM, ACTIONS.APPROVE_DRAFT, ACTIONS.DISCARD_DRAFT, ACTIONS.RESTORE_DRAFT, ACTIONS.STAMP_DRAFT_SANDBOX, ACTIONS.DOWNLOAD_SANDBOX_ARTIFACTS]) {
    assert.strictEqual(isOneTimeAction(action), true, action);
    const validation = validateActionTokenRecord(tokenRecord("USED714B00001", action, { used_at: "2026-06-06T00:00:00.000Z" }), { chatId: "CHAT-7-14B" });
    assert.strictEqual(validation.ok, false, action);
    assert.strictEqual(validation.reason, "token_usado", action);
  }
  return "one-time";
});

check("menu_token_can_execute_twice_without_duplicate_message", () => {
  const token = "MENUREUSE714B";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 71421,
    action_token: tokenRecord(token, "MENU", { used_at: "2026-06-06T00:00:00.000Z" }),
  }));
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
  assert(noExecutedMessage(result));
  return result.action;
});

check("view_tokens_do_not_consume_used_at", () => {
  const token = "VIEWREUSE714B";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 71422,
    action_token: tokenRecord(token, "LIST_PENDING", { used_at: "2026-06-06T00:00:00.000Z" }),
    recent_drafts: [],
  }));
  assert.strictEqual(result.action, "COMMAND_PENDIENTES");
  assert(noExecutedMessage(result));
  return result.action;
});

check("admin_sandbox_navigation_can_open_repeatedly", () => {
  const first = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.OWNER, { update_id: 71423 }));
  const second = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.OWNER, {
    update_id: 71424,
    recent_callback_events: [recentEventForCallback("cfdi_nav:admin")],
  }));
  assert.strictEqual(first.action, "PRODUCT_ADMIN_SANDBOX");
  assert.strictEqual(second.action, "PRODUCT_ADMIN_SANDBOX");
  assert(noExecutedMessage(second));
  return "admin reusable";
});

check("pac_sandbox_navigation_can_open_repeatedly", () => {
  const first = executeCode(handleCode, baseInput("cfdi_nav:pac_sbx", ROLES.OWNER, { update_id: 71425 }));
  const second = executeCode(handleCode, baseInput("cfdi_nav:pac_sbx", ROLES.OWNER, {
    update_id: 71426,
    recent_callback_events: [recentEventForCallback("cfdi_nav:pac_sbx")],
  }));
  assert.strictEqual(first.action, "PRODUCT_PAC_SANDBOX_CONSOLE");
  assert.strictEqual(second.action, "PRODUCT_PAC_SANDBOX_CONSOLE");
  assert(noExecutedMessage(second));
  return "pac menu reusable";
});

check("pac_preflight_is_reusable_view_like_action", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:preflight", ROLES.OWNER, {
    update_id: 71427,
    recent_callback_events: [recentEventForCallback("cfdi_sbx:preflight")],
  }));
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.preflight");
  assert(noExecutedMessage(result));
  return result.requested_sandbox_action;
});

check("long_running_sandbox_duplicate_still_blocked_contextually", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:smoke_create", ROLES.OWNER, {
    update_id: 71428,
    recent_callback_events: [recentEventForCallback("cfdi_sbx:smoke_create")],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya ejecutada.");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  assert(result.reply_markup);
  return "blocked";
});

check("stamp_used_token_still_not_reexecuted", () => {
  const token = "STAMPUSED714B";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 71429,
    action_token: tokenRecord(token, "STAMP_DRAFT_SANDBOX", {
      used_at: "2026-06-06T00:00:00.000Z",
      draft_id: "DRAFT-714B",
      payload: { draft_id: "DRAFT-714B" },
    }),
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(!String(result.sandbox_execute_command || "").includes("sandbox.draft.stamp"), "used stamp token must not re-execute");
  assert(result.reply_markup);
  return "recovered";
});

check("workflow_safe_no_production_or_file_send", () => {
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|sendDocument|sendMediaGroup|sendPhoto|<\?xml|%PDF-/i.test(workflowText));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

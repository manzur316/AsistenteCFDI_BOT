const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json");
const sqlPath = path.join(root, "sql", "001_init_cfdi_bot.sql");
const expectedPlaceholder = "REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N";
const expectedWorkflowVersion = "CFDI_POSTGRES_POLLING_V1";
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const fakeLeakToken = ["123456789", "ABCDEF_abcdef-1234567890"].join(":");

const forbiddenTexts = [
  "process.",
  "process.cwd",
  "process.env",
  "__dirname",
  "__filename",
  "scripts/scoring.js",
  "code-node-n8n-bundle.js",
  "require('./",
  'require("./',
  "require('../",
  'require("../',
  "telegram-state.json",
  ".jsonl",
  "webhook",
  "telegramTrigger",
];

const commands = ["/start", "/help", "/debug", "/pendientes", "/hoy", "/aprobadas", "/aprobar", "/descartar", "/detalle", "/cancelar"];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function requireCalls(text) {
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  const calls = [];
  let match = null;
  while ((match = pattern.exec(text))) calls.push(match[1]);
  return calls;
}

function tokenLikeValues(text) {
  return text.match(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g) || [];
}

function loadWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, "utf8"));
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, context = {}) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(
    require,
    input,
    context.nodeContext || {},
    context.itemsGetter || (() => []),
    context.itemIndex || 0,
  );
}

function makeUpdate(updateId, text, chatId = "chat-postgres-test") {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 1000,
      chat: { id: chatId },
      text,
    },
  };
}

function makeNonTextUpdate(updateId, chatId = "chat-postgres-test") {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 1000,
      chat: { id: chatId },
      sticker: { file_id: "TEST_STICKER" },
    },
  };
}

function makeNestedUpdate(updateId, text, chatId = "chat-postgres-test") {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 1000,
      chat: { id: chatId, type: "private", first_name: "Prueba" },
      text,
      entities: [{ offset: 0, length: 6, type: "bold" }],
      reply_to_message: {
        message_id: 99,
        chat: { id: chatId },
        text: "mensaje anterior",
      },
    },
  };
}

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 501,
    chat_id: extra.chat_id || "chat-postgres-test",
    message_id: String((extra.update_id || 501) + 1000),
    text,
    catalog_path: expectedCatalogPath,
    workflow_version: expectedWorkflowVersion,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: extra.bot_state || { lastTelegramUpdateId: 500, workflowVersion: expectedWorkflowVersion },
    today_summary: extra.today_summary || { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function extractBase64Select(sql) {
  const match = String(sql || "").match(/SELECT '([^']+)'::text AS passthrough_b64;/);
  return match ? match[1] : "";
}

function conceptId(response) {
  return response?.concept?.id || null;
}

function hasLiteralBackslashN(value) {
  const text = String(value || "");
  return text.includes("\\n") || text.includes("\\\\n");
}

function hasBadSqlStatementSeparator(value) {
  const text = String(value || "");
  return hasLiteralBackslashN(text) || text.includes(";\n") || text.includes("\nSELECT");
}

function sqlSeparatorStatus(value) {
  const text = String(value || "");
  if (text.includes("\\n")) return "contains \\n";
  if (text.includes("\\\\n")) return "contains \\\\n";
  if (text.includes(";\n")) return "contains ; newline";
  if (text.includes("\nSELECT")) return "contains newline SELECT";
  return "clean";
}

const checks = [];
checks.push({ name: "workflow_exists", pass: fs.existsSync(workflowPath), value: workflowPath });

let raw = "";
let sqlRaw = "";
let workflow = null;
let nodes = [];
let handleCode = "";
let prepareCode = "";
let extractCode = "";
let buildContextCode = "";
let restoreCode = "";
let logCode = "";

try {
  raw = fs.readFileSync(workflowPath, "utf8");
  if (fs.existsSync(sqlPath)) sqlRaw = fs.readFileSync(sqlPath, "utf8");
  workflow = loadWorkflow();
  nodes = workflow.nodes || [];
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  prepareCode = getNode(workflow, "Prepare Telegram Request").parameters.jsCode;
  extractCode = getNode(workflow, "Extract Telegram Updates").parameters.jsCode;
  buildContextCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  restoreCode = getNode(workflow, "Restore Response After Persistence").parameters.jsCode;
  logCode = getNode(workflow, "Log Send Result SQL").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

if (workflow) {
  const sendNode = getNode(workflow, "Telegram sendMessage");
  const postgresNodes = nodes.filter((node) => node.type === "n8n-nodes-base.postgres");
  const requireDisallowed = requireCalls(handleCode).filter((item) => !["fs", "path"].includes(item));
  const tokenMatches = tokenLikeValues(raw);

  checks.push({ name: "no_real_telegram_token", pass: tokenMatches.length === 0, value: tokenMatches.length ? tokenMatches.join(",") : "none" });
  checks.push({ name: "contains_token_placeholder", pass: raw.includes(expectedPlaceholder), value: expectedPlaceholder });
  checks.push({ name: "postgres_nodes", pass: postgresNodes.length >= 5, value: `${postgresNodes.length}` });
  checks.push({ name: "uses_getUpdates", pass: raw.includes("getUpdates"), value: "Telegram getUpdates" });
  checks.push({ name: "uses_sendMessage", pass: raw.includes("sendMessage"), value: "Telegram sendMessage" });
  checks.push({ name: "sendMessage_continue_on_fail", pass: sendNode.continueOnFail === true, value: sendNode.continueOnFail === true ? "true" : "false" });
  checks.push({ name: "sendMessage_token_from_set_config", pass: sendNode.parameters.url.includes('$node["Set Config"].json.telegramBotToken'), value: "Set Config only" });
  checks.push({ name: "uses_bot_state_offset", pass: raw.includes("bot_state") && raw.includes("lastTelegramUpdateId") && raw.includes("nextOffset"), value: "bot_state.lastTelegramUpdateId" });
  checks.push({ name: "insert_updates_on_conflict", pass: raw.includes("ON CONFLICT (update_id) DO NOTHING") && raw.includes("RETURNING update_id"), value: "telegram_updates dedupe" });
  checks.push({ name: "raw_payload_default_in_schema", pass: sqlRaw.toLowerCase().includes("raw_payload jsonb not null default '{}'::jsonb"), value: "schema default" });
  checks.push({ name: "does_not_insert_raw_payload", pass: !extractCode.includes("raw_payload") && !extractCode.includes("sqlJson(update)"), value: "telegram_updates default raw_payload" });
  checks.push({ name: "stores_draft_action_and_message", pass: raw.includes("action, ready_to_copy") && raw.includes("telegram_message") && raw.includes("createDraftStatement"), value: "cfdi_drafts action/message" });
  checks.push({ name: "does_not_return_telegram_bot_token_sql_field", pass: !raw.includes("AS telegram_bot_token") && !raw.includes("input.telegram_bot_token"), value: "no SQL token field" });
  checks.push({ name: "offset_commit_for_seen_updates", pass: raw.includes("maxSeenUpdateId") && raw.includes("skip_send") && raw.includes("IGNORED_UPDATE"), value: "maxSeenUpdateId" });
  checks.push({ name: "send_logs_payload_sanitized", pass: logCode.includes("stripSensitive") && logCode.includes("safeSource") && logCode.includes("safeCurrent"), value: "send_logs payload" });
  checks.push({ name: "bot_events_payload_no_sql_token_field", pass: !handleCode.includes("telegram_bot_token") && !handleCode.includes("const telegramBotToken"), value: "bot_events payload" });
  checks.push({ name: "updates_bot_state_after_send", pass: raw.includes("Postgres Persist Send Log And State") && raw.includes("INSERT INTO bot_state") && raw.includes("GREATEST"), value: "send log state commit" });
  checks.push({ name: "logs_send_result", pass: raw.includes("INSERT INTO send_logs") && raw.includes("send_failed"), value: "send_logs" });
  checks.push({ name: "self_contained_scoring", pass: handleCode.includes("function classifyMessage") && handleCode.includes("function buildN8nResponse") && handleCode.length > 30000, value: `${handleCode.length} chars` });
  checks.push({ name: "requires_only_fs_path", pass: requireDisallowed.length === 0, value: requireCalls(handleCode).join(",") || "none" });

  for (const command of commands) {
    checks.push({ name: `command:${command}`, pass: raw.includes(command), value: raw.includes(command) ? "found" : "missing" });
  }

  for (const token of forbiddenTexts) {
    checks.push({
      name: `forbidden:${token}`,
      pass: !raw.toLowerCase().includes(token.toLowerCase()),
      value: raw.toLowerCase().includes(token.toLowerCase()) ? "found" : "not found",
    });
  }
}

let behavior = {};
try {
  const config = {
    telegramBotToken: "TEST_TELEGRAM_TOKEN",
    catalogPath: expectedCatalogPath,
    workflowVersion: expectedWorkflowVersion,
    pollingLimit: 10,
  };
  behavior.prepare = executeCode(prepareCode, { last_telegram_update_id: 500 }, { nodeContext: { "Set Config": { json: config } } })[0].json;
  behavior.empty = executeCode(extractCode, { ok: true, result: [] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.old = executeCode(extractCode, { ok: true, result: [makeUpdate(500, "revis\u00e9 c\u00e1maras")] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.normalExtract = executeCode(extractCode, { ok: true, result: [makeUpdate(501, "revis\u00e9 c\u00e1maras hikvision sin imagen")] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.accentExtract = executeCode(extractCode, { ok: true, result: [makeUpdate(511, "revis\u00e9 c\u00e1maras hikvision sin imagen")] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.multilineText = "revis\u00e9 c\u00e1maras hikvision sin imagen\nservicio t\u00e9cnico general\ndesarroll\u00e9 una app m\u00f3vil\nventa de fuente de poder para c\u00e1mara";
  behavior.multilineExtract = executeCode(extractCode, { ok: true, result: [makeUpdate(512, behavior.multilineText)] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.nestedExtract = executeCode(extractCode, { ok: true, result: [makeNestedUpdate(513, "revis\u00e9 c\u00e1maras con reply anidado")] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.nonTextOnlyExtract = executeCode(extractCode, { ok: true, result: [makeNonTextUpdate(510)] }, { nodeContext: { "Prepare Telegram Request": { json: behavior.prepare } } });
  behavior.nonTextBuild = executeCode(buildContextCode, { skip_send: true, max_seen_update_id: 510 });
  behavior.loadSql = executeCode(buildContextCode, {
    update_id: 501,
    chat_id: "chat-postgres-test",
    message_id: "1501",
    text: "revis\u00e9 c\u00e1maras hikvision sin imagen",
    catalog_path: expectedCatalogPath,
    workflow_version: expectedWorkflowVersion,
    max_seen_update_id: 501,
  })[0].json;
  behavior.normal = executeCode(handleCode, contextInput("revis\u00e9 c\u00e1maras hikvision sin imagen", { update_id: 501 }))[0].json;
  behavior.generic = executeCode(handleCode, contextInput("servicio t\u00e9cnico general", { update_id: 502 }))[0].json;
  behavior.clarified = executeCode(handleCode, contextInput("cctv", {
    update_id: 503,
    chat_state: { chat_id: "chat-postgres-test", state: "PEDIR_ACLARACION", original_text: "servicio t\u00e9cnico general" },
  }))[0].json;
  const draft = {
    draft_id: "DRAFT-TEST-1",
    status: "PENDIENTE",
    message_original: "revis\u00e9 c\u00e1maras hikvision sin imagen",
    concept: { id: "SVC-CCTV-001", concepto_factura: "SERVICIO CCTV" },
    updated_at: new Date().toISOString(),
  };
  behavior.pending = executeCode(handleCode, contextInput("/pendientes", { update_id: 504, recent_drafts: [draft] }))[0].json;
  behavior.approve = executeCode(handleCode, contextInput("/aprobar DRAFT-TEST-1", { update_id: 505, recent_drafts: [draft] }))[0].json;
  behavior.discard = executeCode(handleCode, contextInput("/descartar DRAFT-TEST-1", { update_id: 506, recent_drafts: [draft] }))[0].json;
  behavior.debug = executeCode(handleCode, contextInput("/debug", {
    update_id: 507,
    bot_state: { lastTelegramUpdateId: 999, workflowVersion: expectedWorkflowVersion },
    chat_state: { chat_id: "chat-postgres-test", state: "PEDIR_ACLARACION", original_text: "servicio t\u00e9cnico general" },
  }))[0].json;
  const passthrough = extractBase64Select(behavior.normal.persistence_sql);
  behavior.restored = executeCode(restoreCode, { passthrough_b64: passthrough })[0].json;
  behavior.sendOk = executeCode(logCode, {
    ok: true,
    result: { message_id: 99001 },
  }, {
    itemsGetter: (nodeName) => nodeName === "Restore Response After Persistence" ? [{ json: behavior.restored }] : [],
  })[0].json;
  behavior.sendFail = executeCode(logCode, {
    error: {
      message: "The connection to the server was closed unexpectedly for https://api.telegram.org/bot" + fakeLeakToken + "/sendMessage",
      telegramBotToken: fakeLeakToken,
    },
    telegramBotToken: fakeLeakToken,
  }, {
    itemsGetter: (nodeName) => nodeName === "Restore Response After Persistence" ? [{ json: behavior.restored }] : [],
  })[0].json;
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.normal) {
  const normalValidItem = Array.isArray(behavior.normalExtract) ? behavior.normalExtract.find((item) => item.json && item.json.skip_send !== true) : null;
  const normalOffsetItem = Array.isArray(behavior.normalExtract) ? behavior.normalExtract.find((item) => item.json && item.json.skip_send === true) : null;
  const accentValidItem = Array.isArray(behavior.accentExtract) ? behavior.accentExtract.find((item) => item.json && item.json.skip_send !== true) : null;
  const multilineValidItem = Array.isArray(behavior.multilineExtract) ? behavior.multilineExtract.find((item) => item.json && item.json.skip_send !== true) : null;
  const nestedValidItem = Array.isArray(behavior.nestedExtract) ? behavior.nestedExtract.find((item) => item.json && item.json.skip_send !== true) : null;
  const nonTextOffsetItem = Array.isArray(behavior.nonTextOnlyExtract) ? behavior.nonTextOnlyExtract.find((item) => item.json && item.json.skip_send === true) : null;
  checks.push({ name: "empty_getUpdates_zero_send", pass: Array.isArray(behavior.empty) && behavior.empty.length === 0, value: `items=${behavior.empty.length}` });
  checks.push({ name: "old_update_zero_send", pass: Array.isArray(behavior.old) && behavior.old.length === 0, value: `items=${behavior.old.length}` });
  checks.push({ name: "normal_extract_builds_insert_sql", pass: behavior.normalExtract.length === 2 && normalValidItem && String(normalValidItem.json.insert_update_sql).includes("ON CONFLICT (update_id) DO NOTHING"), value: `items=${behavior.normalExtract.length}` });
  checks.push({ name: "normal_extract_omits_raw_payload", pass: Boolean(normalValidItem) && !String(normalValidItem.json.insert_update_sql).includes("raw_payload") && !String(normalValidItem.json.insert_update_sql).includes("sqlJson(update)"), value: "raw_payload default" });
  checks.push({ name: "normal_extract_has_no_escaped_jsonb_payload", pass: Boolean(normalValidItem) && !String(normalValidItem.json.insert_update_sql).includes("\\\\\"") && !String(normalValidItem.json.insert_update_sql).includes("'{'"), value: "no raw JSON payload" });
  checks.push({ name: "normal_extract_has_offset_commit_item", pass: Boolean(normalOffsetItem) && String(normalOffsetItem.json.insert_update_sql).includes("INSERT INTO bot_state") && normalOffsetItem.json.max_seen_update_id === 501, value: normalOffsetItem ? `max=${normalOffsetItem.json.max_seen_update_id}` : "missing" });
  checks.push({ name: "insert_sql_excludes_token_placeholder", pass: Boolean(normalValidItem) && !String(normalValidItem.json.insert_update_sql).includes(expectedPlaceholder) && !String(normalValidItem.json.insert_update_sql).includes("TEST_TELEGRAM_TOKEN"), value: "insert_update_sql" });
  checks.push({ name: "accent_message_insert_sql", pass: Boolean(accentValidItem) && String(accentValidItem.json.insert_update_sql).includes("revis\u00e9 c\u00e1maras") && !String(accentValidItem.json.insert_update_sql).includes("raw_payload"), value: "acentos" });
  checks.push({ name: "multiline_message_insert_sql", pass: Boolean(multilineValidItem) && String(multilineValidItem.json.insert_update_sql).includes("servicio t\u00e9cnico general") && String(multilineValidItem.json.insert_update_sql).includes("venta de fuente de poder para c\u00e1mara") && !String(multilineValidItem.json.insert_update_sql).includes("raw_payload") && !String(multilineValidItem.json.insert_update_sql).includes("\\\\\""), value: "multiline text" });
  checks.push({ name: "nested_update_does_not_insert_raw_object", pass: Boolean(nestedValidItem) && String(nestedValidItem.json.insert_update_sql).includes("reply anidado") && !String(nestedValidItem.json.insert_update_sql).includes("reply_to_message") && !String(nestedValidItem.json.insert_update_sql).includes("raw_payload"), value: "nested update" });
  checks.push({ name: "normal_insert_sql_no_literal_newline_escape", pass: Boolean(normalValidItem) && !hasBadSqlStatementSeparator(normalValidItem.json.insert_update_sql), value: normalValidItem ? sqlSeparatorStatus(normalValidItem.json.insert_update_sql) : "missing" });
  checks.push({ name: "offset_skip_send_sql_no_literal_newline_escape", pass: Boolean(normalOffsetItem) && !hasBadSqlStatementSeparator(normalOffsetItem.json.insert_update_sql) && String(normalOffsetItem.json.insert_update_sql).includes("INSERT INTO bot_state") && String(normalOffsetItem.json.insert_update_sql).includes("SELECT true::boolean AS skip_send"), value: normalOffsetItem ? sqlSeparatorStatus(normalOffsetItem.json.insert_update_sql) : "missing" });
  checks.push({ name: "multiline_insert_sql_no_literal_newline_escape", pass: Boolean(multilineValidItem) && !hasBadSqlStatementSeparator(multilineValidItem.json.insert_update_sql), value: multilineValidItem ? sqlSeparatorStatus(multilineValidItem.json.insert_update_sql) : "missing" });
  checks.push({ name: "non_text_update_offset_only", pass: behavior.nonTextOnlyExtract.length === 1 && Boolean(nonTextOffsetItem) && nonTextOffsetItem.json.max_seen_update_id === 510, value: `items=${behavior.nonTextOnlyExtract.length}` });
  checks.push({ name: "non_text_update_logs_ignored_event", pass: Boolean(nonTextOffsetItem) && String(nonTextOffsetItem.json.insert_update_sql).includes("IGNORED_UPDATE") && String(nonTextOffsetItem.json.insert_update_sql).includes("missing_text"), value: "IGNORED_UPDATE" });
  checks.push({ name: "non_text_offset_sql_no_literal_newline_escape", pass: Boolean(nonTextOffsetItem) && !hasBadSqlStatementSeparator(nonTextOffsetItem.json.insert_update_sql) && String(nonTextOffsetItem.json.insert_update_sql).includes("INSERT INTO bot_state") && String(nonTextOffsetItem.json.insert_update_sql).includes("SELECT true::boolean AS skip_send"), value: nonTextOffsetItem ? sqlSeparatorStatus(nonTextOffsetItem.json.insert_update_sql) : "missing" });
  checks.push({ name: "non_text_update_zero_send_after_build", pass: Array.isArray(behavior.nonTextBuild) && behavior.nonTextBuild.length === 0, value: `items=${behavior.nonTextBuild.length}` });
  checks.push({ name: "load_context_sql", pass: String(behavior.loadSql.load_context_sql).includes("chat_states") && String(behavior.loadSql.load_context_sql).includes("cfdi_drafts"), value: "context query" });
  checks.push({ name: "load_context_sql_excludes_token", pass: !String(behavior.loadSql.load_context_sql).includes("telegram_bot_token") && !String(behavior.loadSql.load_context_sql).includes("TEST_TELEGRAM_TOKEN"), value: "context query" });
  checks.push({ name: "load_context_sql_no_literal_newline_escape", pass: !hasBadSqlStatementSeparator(behavior.loadSql.load_context_sql), value: sqlSeparatorStatus(behavior.loadSql.load_context_sql) });
  checks.push({ name: "normal_goes_to_scoring", pass: behavior.normal.action === "SUGERIR" && behavior.normal.ready_to_copy === true && behavior.normal.concept?.familia === "CCTV", value: `${behavior.normal.action}/${conceptId(behavior.normal)}` });
  checks.push({ name: "normal_output_excludes_token", pass: !JSON.stringify(behavior.normal).includes("TEST_TELEGRAM_TOKEN") && !JSON.stringify(behavior.normal).includes("telegram_bot_token"), value: "Handle output" });
  checks.push({ name: "sugerir_creates_draft_sql", pass: String(behavior.normal.persistence_sql).includes("INSERT INTO cfdi_drafts") && String(behavior.normal.persistence_sql).includes("PENDIENTE"), value: "cfdi_drafts" });
  checks.push({ name: "persistence_sql_no_literal_newline_escape", pass: !hasLiteralBackslashN(behavior.normal.persistence_sql) && !String(behavior.normal.persistence_sql).includes(";\nSELECT") && !String(behavior.normal.persistence_sql).includes("\nSELECT"), value: sqlSeparatorStatus(behavior.normal.persistence_sql) });
  checks.push({ name: "bot_events_sql_excludes_token", pass: !String(behavior.normal.persistence_sql).includes("TEST_TELEGRAM_TOKEN") && !String(behavior.normal.persistence_sql).includes("telegram_bot_token"), value: "bot_events payload SQL" });
  checks.push({ name: "sugerir_persists_action_and_telegram_message", pass: String(behavior.normal.persistence_sql).includes("action, ready_to_copy") && String(behavior.normal.persistence_sql).includes("telegram_message"), value: "draft contract" });
  checks.push({ name: "generic_saves_chat_state", pass: behavior.generic.action === "PEDIR_ACLARACION" && String(behavior.generic.persistence_sql).includes("INSERT INTO chat_states"), value: behavior.generic.action });
  checks.push({ name: "clarified_uses_chat_state", pass: behavior.clarified.action === "SUGERIR" && behavior.clarified.json_debug?.used_chat_state === true, value: `${behavior.clarified.action}/${behavior.clarified.json_debug?.used_chat_state}` });
  checks.push({ name: "pendientes_lists_drafts", pass: behavior.pending.action === "COMMAND_PENDIENTES" && String(behavior.pending.telegram_message).includes("DRAFT-TEST-1"), value: behavior.pending.action });
  checks.push({ name: "aprobar_updates_status", pass: behavior.approve.action === "COMMAND_APROBAR" && String(behavior.approve.persistence_sql).includes("status = 'APROBADO'"), value: behavior.approve.action });
  checks.push({ name: "descartar_updates_status", pass: behavior.discard.action === "COMMAND_DESCARTAR" && String(behavior.discard.persistence_sql).includes("status = 'DESCARTADO'"), value: behavior.discard.action });
  checks.push({ name: "debug_shows_real_state", pass: behavior.debug.action === "COMMAND_DEBUG" && String(behavior.debug.telegram_message).includes("lastTelegramUpdateId: 999") && String(behavior.debug.telegram_message).includes("chatState: existe"), value: behavior.debug.action });
  checks.push({ name: "restore_passthrough", pass: behavior.restored.action === "SUGERIR" && behavior.restored.update_id === 501, value: `${behavior.restored.action}/${behavior.restored.update_id}` });
  checks.push({ name: "send_ok_sql_no_literal_newline_escape", pass: behavior.sendOk.send_failed === false && !hasBadSqlStatementSeparator(behavior.sendOk.send_log_sql) && String(behavior.sendOk.send_log_sql).includes("INSERT INTO send_logs") && String(behavior.sendOk.send_log_sql).includes("INSERT INTO bot_state") && String(behavior.sendOk.send_log_sql).includes("SELECT"), value: sqlSeparatorStatus(behavior.sendOk.send_log_sql) });
  checks.push({ name: "send_failure_logged_no_retry_contract", pass: behavior.sendFail.send_failed === true && String(behavior.sendFail.send_log_sql).includes("INSERT INTO send_logs") && String(behavior.sendFail.send_log_sql).includes("INSERT INTO bot_state") && String(behavior.sendFail.send_log_sql).includes("501"), value: `send_failed=${behavior.sendFail.send_failed}` });
  checks.push({ name: "send_fail_sql_no_literal_newline_escape", pass: behavior.sendFail.send_failed === true && !hasBadSqlStatementSeparator(behavior.sendFail.send_log_sql) && String(behavior.sendFail.send_log_sql).includes("INSERT INTO send_logs") && String(behavior.sendFail.send_log_sql).includes("INSERT INTO bot_state") && String(behavior.sendFail.send_log_sql).includes("SELECT"), value: sqlSeparatorStatus(behavior.sendFail.send_log_sql) });
  checks.push({ name: "send_logs_payload_excludes_token", pass: !String(behavior.sendFail.send_log_sql).includes(fakeLeakToken) && !String(behavior.sendFail.send_log_sql).includes("telegramBotToken") && !String(behavior.sendFail.send_log_sql).includes("TEST_TELEGRAM_TOKEN"), value: "send_logs payload" });
  {
    const generatedSql = [
      normalValidItem?.json?.insert_update_sql,
      normalOffsetItem?.json?.insert_update_sql,
      accentValidItem?.json?.insert_update_sql,
      multilineValidItem?.json?.insert_update_sql,
      nestedValidItem?.json?.insert_update_sql,
      nonTextOffsetItem?.json?.insert_update_sql,
      behavior.loadSql.load_context_sql,
      behavior.normal.persistence_sql,
      behavior.sendOk.send_log_sql,
      behavior.sendFail.send_log_sql,
    ].filter(Boolean);
    const dirty = generatedSql.filter(hasLiteralBackslashN);
    checks.push({ name: "postgres_generated_sql_has_no_literal_backslash_n", pass: dirty.length === 0, value: dirty.length ? `${dirty.length} dirty SQL strings` : "clean" });
  }
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Postgres polling workflow contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_polling_with_history.n8n.json");
const expectedPlaceholder = "REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N";
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const expectedRuntimePath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime";
const expectedWorkflowVersion = "CFDI_WITH_HISTORY_3C2_ROUTER_FIX";

const commands = ["/start", "/help", "/debug", "/cancelar", "/pendientes", "/hoy", "/aprobadas", "/aprobar", "/descartar", "/detalle"];
const forbiddenTexts = [
  "scripts/scoring.js",
  "code-node-n8n-bundle.js",
  "scoringModulePath",
  "process.",
  "process.cwd",
  "process.env",
  "__dirname",
  "__filename",
  "require('./",
  'require("./',
  "require('../",
  'require("../',
  "require('C:",
  'require("C:',
];

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

const checks = [];
checks.push({ name: "workflow_exists", pass: fs.existsSync(workflowPath), value: workflowPath });

let raw = "";
let workflow = null;
let nodes = [];
let historyCode = "";

if (fs.existsSync(workflowPath)) {
  raw = fs.readFileSync(workflowPath, "utf8");
  try {
    workflow = JSON.parse(raw);
    nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const node = nodes.find((item) => item.name === "Handle Commands And Scoring");
    historyCode = node?.parameters?.jsCode || "";
    checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
  } catch (error) {
    checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
  }
}

checks.push({
  name: "no_real_telegram_token",
  pass: raw ? tokenLikeValues(raw).length === 0 : false,
  value: tokenLikeValues(raw).length ? tokenLikeValues(raw).join(",") : "none",
});

checks.push({
  name: "contains_token_placeholder",
  pass: raw.includes(expectedPlaceholder),
  value: expectedPlaceholder,
});

checks.push({
  name: "no_webhook",
  pass: nodes.every((node) => !String(node.type || "").toLowerCase().includes("webhook")) && !raw.toLowerCase().includes("webhook"),
  value: "no webhook",
});

checks.push({
  name: "no_telegram_trigger",
  pass: nodes.every((node) => !String(node.type || "").toLowerCase().includes("telegramtrigger")),
  value: "node types",
});

checks.push({ name: "uses_getUpdates", pass: raw.includes("getUpdates"), value: "getUpdates" });
checks.push({ name: "uses_sendMessage", pass: raw.includes("sendMessage"), value: "sendMessage" });
checks.push({ name: "uses_state_file", pass: raw.includes("telegram-state.json") && raw.includes("processedUpdateIds") && raw.includes("chatStates"), value: "runtime/telegram-state.json" });
checks.push({ name: "uses_runtime_file_offset", pass: raw.includes("runtime_file_state") && raw.includes("lastTelegramUpdateId") && raw.includes("nextOffset"), value: "runtime file offset" });

for (const command of commands) {
  checks.push({
    name: `command:${command}`,
    pass: raw.includes(command),
    value: raw.includes(command) ? "found" : "missing",
  });
}

checks.push({
  name: "writes_telegram_events",
  pass: raw.includes("telegram-events.jsonl") && raw.includes("appendJsonl(paths.eventsPath"),
  value: "runtime/telegram-events.jsonl",
});

checks.push({
  name: "writes_cfdi_drafts",
  pass: raw.includes("cfdi-drafts.jsonl") && raw.includes("appendJsonl(paths.draftsPath"),
  value: "runtime/cfdi-drafts.jsonl",
});

checks.push({
  name: "writes_actions_log",
  pass: raw.includes("actions-log.jsonl") && raw.includes("appendJsonl(paths.actionsPath"),
  value: "runtime/actions-log.jsonl",
});

checks.push({
  name: "precommits_update_before_send",
  pass:
    raw.includes("TELEGRAM_UPDATE_PRECOMMITTED") &&
    raw.includes("update_precommitted") &&
    raw.indexOf("writeState(statePath, state)") < raw.indexOf("Telegram sendMessage"),
  value: "state write before sendMessage node",
});

const sendNode = nodes.find((node) => node.name === "Telegram sendMessage");
checks.push({
  name: "sendMessage_continue_on_fail",
  pass: sendNode?.continueOnFail === true,
  value: sendNode?.continueOnFail === true ? "true" : "false",
});

checks.push({
  name: "logs_send_result",
  pass: nodes.some((node) => node.name === "Log Telegram Send Result") && raw.includes("SEND_MESSAGE_FAILED") && raw.includes("SEND_MESSAGE_OK"),
  value: "Log Telegram Send Result",
});

checks.push({
  name: "catalogPath_absolute",
  pass: raw.includes(expectedCatalogPath),
  value: expectedCatalogPath,
});

checks.push({
  name: "runtimePath_from_set_config",
  pass: raw.includes(expectedRuntimePath) && raw.includes("runtimePath"),
  value: expectedRuntimePath,
});

checks.push({
  name: "workflowVersion_from_set_config",
  pass: raw.includes(expectedWorkflowVersion) && raw.includes("workflowVersion"),
  value: expectedWorkflowVersion,
});

for (const token of forbiddenTexts) {
  checks.push({
    name: `forbidden:${token}`,
    pass: !raw.includes(token),
    value: raw.includes(token) ? "found" : "not found",
  });
}

checks.push({ name: "contract_ready_to_copy", pass: raw.includes("ready_to_copy"), value: "ready_to_copy" });
checks.push({ name: "contract_human_review", pass: raw.includes("requires_human_review"), value: "requires_human_review" });
const commandGuardIndex = historyCode.lastIndexOf("message.startsWith('/')");
const scoringCallIndex = historyCode.lastIndexOf("classifyMessage(scoringMessage, catalog)");
checks.push({
  name: "commands_before_scoring",
  pass: commandGuardIndex >= 0 && scoringCallIndex >= 0 && commandGuardIndex < scoringCallIndex,
  value: "command guard",
});
checks.push({ name: "start_help_explicit", pass: raw.includes("command === '/start' || command === '/help'"), value: "/start,/help" });
checks.push({ name: "debug_command_explicit", pass: raw.includes("COMMAND_DEBUG") && raw.includes("buildDebugMessage") && raw.includes("lastTelegramUpdateId") && raw.includes("chatState"), value: "/debug" });
checks.push({ name: "cancelar_command_explicit", pass: raw.includes("COMMAND_CANCELAR") && raw.includes("clearChatState"), value: "/cancelar" });
checks.push({ name: "normal_messages_include_version", pass: historyCode.includes("appendWorkflowVersion") && historyCode.includes("Versi\\u00f3n:") && raw.includes(expectedWorkflowVersion), value: expectedWorkflowVersion });
checks.push({ name: "unknown_command_explicit", pass: raw.includes("COMMAND_UNKNOWN") && raw.includes("Comando no reconocido"), value: "unknown command guard" });
checks.push({ name: "multiline_split_guard", pass: raw.includes("PEDIR_SEPARAR_MENSAJES") && raw.includes("shouldAskToSeparateMessages"), value: "split normal messages" });
checks.push({ name: "empty_updates_return_no_items", pass: raw.includes("if (updates.length === 0)") && raw.includes("return [];"), value: "no sendMessage without updates" });
checks.push({ name: "old_updates_ignored", pass: raw.includes("updateId <= lastUpdateId") && raw.includes("return []"), value: "update_id guard" });
checks.push({ name: "processed_updates_ignored", pass: raw.includes("processed.has(String(updateId))") && raw.includes("processedUpdateIds"), value: "processed update guard" });
checks.push({
  name: "offset_after_valid_items",
  pass:
    raw.includes("maxValidUpdateId") &&
    raw.includes("if (validUpdates.length === 0)") &&
    raw.indexOf("maxValidUpdateId = Math.max") > raw.indexOf("if (!text || chatId === null) return"),
  value: "valid updates only",
});
checks.push({ name: "no_duplicate_drafts", pass: raw.includes("draft.update_id") && raw.includes("return null"), value: "update_id guard" });
checks.push({ name: "draft_id_stable_format", pass: raw.includes("DRAFT-") && raw.includes("draftIdFromTimestamp"), value: "DRAFT-YYYYMMDD-HHMMSS-updateId" });

checks.push({
  name: "no_timbra_cfdi",
  pass: !raw.toLowerCase().includes("timbrado cfdi") && !raw.toLowerCase().includes("timbrar cfdi"),
  value: "no CFDI stamping node/text",
});

checks.push({
  name: "no_pac",
  pass: !/\bpac\b/i.test(raw),
  value: "no PAC",
});

checks.push({
  name: "no_whatsapp_api",
  pass: !raw.toLowerCase().includes("whatsapp"),
  value: "no WhatsApp API",
});

if (historyCode) {
  const calls = requireCalls(historyCode);
  const disallowed = calls.filter((item) => !["fs", "path"].includes(item));
  checks.push({
    name: "history_node_requires_only_fs_path",
    pass: disallowed.length === 0,
    value: calls.length ? calls.join(",") : "none",
  });
  checks.push({
    name: "history_node_self_contained",
    pass:
      historyCode.length > 15000 &&
      historyCode.includes("function normalizeText") &&
      historyCode.includes("function handleCommand") &&
      historyCode.includes("function appendDraftIfNeeded"),
    value: `${historyCode.length} chars`,
  });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("History workflow contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");

for (const check of checks) printCheck(check.name, check.pass, check.value);

console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

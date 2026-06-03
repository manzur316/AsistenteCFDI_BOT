const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_polling_with_history.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const runtimePath = path.join(root, "runtime", "test-telegram-polling-behavior");
const runtimePathForN8n = runtimePath.replace(/\\/g, "/");
const statePath = path.join(runtimePath, "telegram-state.json");
const expectedWorkflowVersion = "CFDI_WITH_HISTORY_3C2_ROUTER_FIX";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function defaultState(overrides = {}) {
  return {
    lastTelegramUpdateId: 0,
    processedUpdateIds: [],
    chatStates: {},
    lastRunAt: "",
    workflowVersion: expectedWorkflowVersion,
    ...overrides,
  };
}

function writeState(state) {
  fs.mkdirSync(runtimePath, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(defaultState(state), null, 2), "utf8");
}

function readState() {
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function resetRuntime(state) {
  if (fs.existsSync(runtimePath)) {
    fs.rmSync(runtimePath, { recursive: true, force: true });
  }
  fs.mkdirSync(runtimePath, { recursive: true });
  writeState(state || {});
}

function loadWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, "utf8"));
}

function loadNodeCode(name) {
  const workflow = loadWorkflow();
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node || typeof node.parameters?.jsCode !== "string") {
    throw new Error(`No encontre jsCode para ${name}.`);
  }
  return node.parameters.jsCode;
}

function loadNode(name) {
  const workflow = loadWorkflow();
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function makeUpdate(updateId, text, chatId = "chat-polling-test") {
  return {
    update_id: updateId,
    message: {
      message_id: updateId + 1000,
      date: 1780000000,
      chat: { id: chatId },
      text,
    },
  };
}

function includesCommands(response) {
  return String(response?.telegram_message || "").includes("Comandos disponibles");
}

function executeCodeNode(code, inputJson, context = {}) {
  const fn = new Function("require", "$json", "$node", "$getWorkflowStaticData", "$items", "$itemIndex", code);
  return fn(
    require,
    inputJson,
    context.nodeContext || {},
    () => context.staticData || {},
    context.itemsGetter || (() => []),
    context.itemIndex || 0,
  );
}

function createPipeline() {
  const prepareCode = loadNodeCode("Prepare Telegram Request");
  const manageCode = loadNodeCode("Manage Telegram Updates");
  const handleCode = loadNodeCode("Handle Commands And Scoring");
  const logCode = loadNodeCode("Log Telegram Send Result");

  const config = {
    telegramBotToken: "TEST_TELEGRAM_TOKEN",
    workflowVersion: expectedWorkflowVersion,
    catalogPath,
    runtimePath: runtimePathForN8n,
    pollingLimit: 10,
  };

  function runPollingCase(updates, initialState, options = {}) {
    if (options.reset !== false) resetRuntime(initialState);

    const prepareOutput = executeCodeNode(prepareCode, config);
    const prepareItem = prepareOutput[0].json;
    const nodeContext = {
      "Prepare Telegram Request": {
        json: prepareItem,
      },
    };

    const manageOutput = executeCodeNode(
      manageCode,
      { ok: true, result: updates },
      { nodeContext },
    );
    const manageItems = Array.isArray(manageOutput) ? manageOutput : [];
    const responses = [];

    for (const item of manageItems) {
      const handleOutput = executeCodeNode(
        handleCode,
        item.json,
        { nodeContext },
      );
      if (Array.isArray(handleOutput)) responses.push(...handleOutput.map((entry) => entry.json));
    }

    return {
      prepareItem,
      manageItems,
      responses,
      state: readState(),
      drafts: readJsonl(path.join(runtimePath, "cfdi-drafts.jsonl")),
      events: readJsonl(path.join(runtimePath, "telegram-events.jsonl")),
      actions: readJsonl(path.join(runtimePath, "actions-log.jsonl")),
    };
  }

  function runSendLog(sendResult, sourceJson) {
    return executeCodeNode(
      logCode,
      sendResult,
      {
        itemsGetter: (nodeName) => {
          if (nodeName === "Handle Commands And Scoring") return [{ json: sourceJson || {} }];
          return [];
        },
        itemIndex: 0,
      },
    );
  }

  return { runPollingCase, runSendLog };
}

function hasDraftForUpdate(caseResult, updateId) {
  return caseResult.drafts.some((draft) => String(draft.update_id) === String(updateId));
}

function actionLogged(caseResult, command) {
  return caseResult.actions.some((entry) => entry.command === command);
}

const checks = [];

checks.push({
  name: "workflow_exists",
  pass: fs.existsSync(workflowPath),
  value: workflowPath,
});

let pipeline = null;
let cases = {};

try {
  pipeline = createPipeline();
  cases.empty = pipeline.runPollingCase([], { lastTelegramUpdateId: 500 });
  cases.old = pipeline.runPollingCase([makeUpdate(500, "revis\u00e9 c\u00e1maras hikvision sin imagen")], { lastTelegramUpdateId: 500 });
  cases.processed = pipeline.runPollingCase([makeUpdate(501, "revis\u00e9 c\u00e1maras hikvision sin imagen")], {
    lastTelegramUpdateId: 500,
    processedUpdateIds: [501],
  });
  cases.invalid = pipeline.runPollingCase([{ update_id: 502, message: { message_id: 1502, chat: { id: "chat" } } }], { lastTelegramUpdateId: 500 });
  cases.normal = pipeline.runPollingCase([makeUpdate(503, "revis\u00e9 c\u00e1maras hikvision sin imagen")], { lastTelegramUpdateId: 500 });
  cases.start = pipeline.runPollingCase([makeUpdate(504, "/start")], { lastTelegramUpdateId: 503 });
  cases.pending = pipeline.runPollingCase([makeUpdate(505, "/pendientes")], { lastTelegramUpdateId: 504 });
  cases.debug = pipeline.runPollingCase([makeUpdate(506, "/debug")], { lastTelegramUpdateId: 505 });
  cases.multiline = pipeline.runPollingCase([
    makeUpdate(
      507,
      [
        "revis\u00e9 c\u00e1maras hikvision sin imagen",
        "servicio t\u00e9cnico general",
        "venta de fuente de poder para c\u00e1mara",
      ].join("\n"),
    ),
  ], { lastTelegramUpdateId: 506 });
  cases.blocked = pipeline.runPollingCase([makeUpdate(508, "desarroll\u00e9 una app m\u00f3vil")], { lastTelegramUpdateId: 507 });

  cases.clarify = pipeline.runPollingCase([makeUpdate(601, "servicio t\u00e9cnico general")], { lastTelegramUpdateId: 600 });
  cases.clarifyState = readState();
  cases.clarified = pipeline.runPollingCase([makeUpdate(602, "c\u00e1maras hikvision")], null, { reset: false });

  cases.sendFailFirst = pipeline.runPollingCase([makeUpdate(701, "revis\u00e9 c\u00e1maras hikvision sin imagen")], { lastTelegramUpdateId: 700 });
  pipeline.runSendLog(
    { error: { message: "The connection to the server was closed unexpectedly" } },
    cases.sendFailFirst.responses[0],
  );
  cases.sendFailState = readState();
  cases.sendFailActions = readJsonl(path.join(runtimePath, "actions-log.jsonl"));
  cases.sendFailRetry = pipeline.runPollingCase([makeUpdate(701, "revis\u00e9 c\u00e1maras hikvision sin imagen")], null, { reset: false });
} catch (error) {
  checks.push({ name: "polling_execution", pass: false, value: error.message });
}

if (pipeline) {
  const sendNode = loadNode("Telegram sendMessage");

  checks.push({
    name: "sendMessage_continue_on_fail",
    pass: sendNode.continueOnFail === true,
    value: sendNode.continueOnFail === true ? "true" : "false",
  });
  checks.push({
    name: "empty_getUpdates_zero_sendMessage",
    pass: cases.empty.manageItems.length === 0 && cases.empty.responses.length === 0,
    value: `items=${cases.empty.manageItems.length}, responses=${cases.empty.responses.length}`,
  });
  checks.push({
    name: "empty_does_not_advance_offset",
    pass: Number(cases.empty.state.lastTelegramUpdateId) === 500,
    value: cases.empty.state.lastTelegramUpdateId,
  });
  checks.push({
    name: "old_update_zero_sendMessage",
    pass: cases.old.manageItems.length === 0 && cases.old.responses.length === 0,
    value: `items=${cases.old.manageItems.length}, responses=${cases.old.responses.length}`,
  });
  checks.push({
    name: "processed_update_zero_sendMessage",
    pass: cases.processed.manageItems.length === 0 && cases.processed.responses.length === 0,
    value: `items=${cases.processed.manageItems.length}, responses=${cases.processed.responses.length}`,
  });
  checks.push({
    name: "invalid_update_zero_sendMessage",
    pass: cases.invalid.manageItems.length === 0 && cases.invalid.responses.length === 0,
    value: `items=${cases.invalid.manageItems.length}, responses=${cases.invalid.responses.length}`,
  });
  checks.push({
    name: "normal_message_scoring_no_commands",
    pass:
      cases.normal.responses.length === 1 &&
      cases.normal.responses[0].action === "SUGERIR" &&
      cases.normal.responses[0].ready_to_copy === true &&
      cases.normal.responses[0].concept?.familia === "CCTV" &&
      !includesCommands(cases.normal.responses[0]) &&
      String(cases.normal.responses[0].telegram_message || "").includes("Versi\u00f3n: " + expectedWorkflowVersion),
    value: cases.normal.responses[0] ? `${cases.normal.responses[0].action}/${cases.normal.responses[0].concept?.id}` : "missing",
  });
  checks.push({
    name: "normal_precommits_update_before_send",
    pass:
      Number(cases.normal.state.lastTelegramUpdateId) === 503 &&
      cases.normal.state.processedUpdateIds.includes(503) &&
      actionLogged(cases.normal, "TELEGRAM_UPDATE_PRECOMMITTED"),
    value: `last=${cases.normal.state.lastTelegramUpdateId}, processed=${cases.normal.state.processedUpdateIds.join(",")}`,
  });
  checks.push({
    name: "start_shows_commands",
    pass: cases.start.responses.length === 1 && cases.start.responses[0].action === "COMMAND_HELP" && includesCommands(cases.start.responses[0]),
    value: cases.start.responses[0] ? cases.start.responses[0].action : "missing",
  });
  checks.push({
    name: "debug_reports_version_and_state",
    pass:
      cases.debug.responses.length === 1 &&
      cases.debug.responses[0].action === "COMMAND_DEBUG" &&
      String(cases.debug.responses[0].telegram_message || "").includes(expectedWorkflowVersion) &&
      String(cases.debug.responses[0].telegram_message || "").includes(catalogPath) &&
      String(cases.debug.responses[0].telegram_message || "").includes(runtimePathForN8n) &&
      String(cases.debug.responses[0].telegram_message || "").includes("lastTelegramUpdateId: 506") &&
      String(cases.debug.responses[0].telegram_message || "").includes("chatState:") &&
      String(cases.debug.responses[0].telegram_message || "").includes("timestamp:") &&
      !includesCommands(cases.debug.responses[0]),
    value: cases.debug.responses[0] ? cases.debug.responses[0].action : "missing",
  });
  checks.push({
    name: "pendientes_command",
    pass: cases.pending.responses.length === 1 && cases.pending.responses[0].action === "COMMAND_PENDIENTES",
    value: cases.pending.responses[0] ? cases.pending.responses[0].action : "missing",
  });
  checks.push({
    name: "multiline_split",
    pass:
      cases.multiline.responses.length === 1 &&
      cases.multiline.responses[0].action === "PEDIR_SEPARAR_MENSAJES" &&
      cases.multiline.responses[0].ready_to_copy === false &&
      String(cases.multiline.responses[0].telegram_message || "").includes("Versi\u00f3n: " + expectedWorkflowVersion),
    value: cases.multiline.responses[0] ? cases.multiline.responses[0].action : "missing",
  });
  checks.push({
    name: "blocked_no_draft",
    pass:
      cases.blocked.responses.length === 1 &&
      ["BLOQUEAR", "AGREGAR_ACTIVIDAD"].includes(cases.blocked.responses[0].action) &&
      !hasDraftForUpdate(cases.blocked, 508),
    value: cases.blocked.responses[0] ? cases.blocked.responses[0].action : "missing",
  });
  checks.push({
    name: "servicio_general_stores_chat_state",
    pass:
      cases.clarify.responses.length === 1 &&
      cases.clarify.responses[0].action === "PEDIR_ACLARACION" &&
      Boolean(cases.clarifyState.chatStates["chat-polling-test"]?.original_text) &&
      !hasDraftForUpdate(cases.clarify, 601),
    value: cases.clarifyState.chatStates["chat-polling-test"]?.original_text || "missing",
  });
  checks.push({
    name: "cctv_after_clarification_uses_chat_state",
    pass:
      cases.clarified.responses.length === 1 &&
      cases.clarified.responses[0].action === "SUGERIR" &&
      cases.clarified.responses[0].json_debug?.used_chat_state === true &&
      cases.clarified.responses[0].concept?.familia === "CCTV" &&
      !cases.clarified.state.chatStates["chat-polling-test"],
    value: `${cases.clarified.responses[0]?.action}/${cases.clarified.responses[0]?.json_debug?.used_chat_state}`,
  });
  checks.push({
    name: "commands_do_not_create_drafts",
    pass: !hasDraftForUpdate(cases.start, 504) && !hasDraftForUpdate(cases.pending, 505) && !hasDraftForUpdate(cases.debug, 506),
    value: "start,pendientes,debug",
  });
  checks.push({
    name: "sugerir_creates_pending_draft",
    pass: hasDraftForUpdate(cases.normal, 503) && hasDraftForUpdate(cases.clarified, 602),
    value: "SUGERIR drafts",
  });
  checks.push({
    name: "clarify_block_split_do_not_create_drafts",
    pass: !hasDraftForUpdate(cases.clarify, 601) && !hasDraftForUpdate(cases.multiline, 507) && !hasDraftForUpdate(cases.blocked, 508),
    value: "clarify,split,blocked",
  });
  checks.push({
    name: "send_failure_keeps_update_processed",
    pass:
      cases.sendFailState.processedUpdateIds.includes(701) &&
      Number(cases.sendFailState.lastTelegramUpdateId) === 701 &&
      cases.sendFailRetry.manageItems.length === 0 &&
      cases.sendFailRetry.responses.length === 0,
    value: `processed=${cases.sendFailState.processedUpdateIds.join(",")}, retry=${cases.sendFailRetry.responses.length}`,
  });
  checks.push({
    name: "send_failure_logged",
    pass: cases.sendFailActions.some((entry) => entry.command === "SEND_MESSAGE_FAILED" && Number(entry.update_id) === 701),
    value: cases.sendFailActions.map((entry) => entry.command).join(","),
  });
  checks.push({
    name: "one_sendMessage_per_new_update",
    pass:
      cases.normal.responses.length === cases.normal.manageItems.length &&
      cases.start.responses.length === cases.start.manageItems.length &&
      cases.pending.responses.length === cases.pending.manageItems.length &&
      cases.debug.responses.length === cases.debug.manageItems.length &&
      cases.multiline.responses.length === cases.multiline.manageItems.length,
    value: "responses == valid update items",
  });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Telegram polling behavior");
console.log(`Workflow: ${workflowPath}`);
console.log(`Runtime test path: ${runtimePath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");

for (const check of checks) printCheck(check.name, check.pass, check.value);

if (pipeline) {
  console.log("");
  console.log("Casos ejecutados:");
  for (const [name, item] of Object.entries(cases)) {
    if (!item || !Array.isArray(item.responses)) continue;
    const actions = item.responses.map((response) => response.action).join(",") || "none";
    const last = item.state?.lastTelegramUpdateId ?? "none";
    console.log(` - ${name}: valid_items=${item.manageItems.length} responses=${item.responses.length} actions=${actions} last=${last}`);
  }
}

console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

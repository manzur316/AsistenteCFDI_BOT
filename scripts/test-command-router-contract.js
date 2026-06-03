const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_polling_with_history.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const runtimePath = path.join(root, "runtime", "test-command-router-contract");
const runtimePathForN8n = runtimePath.replace(/\\/g, "/");
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

function readState() {
  const statePath = path.join(runtimePath, "telegram-state.json");
  if (!fs.existsSync(statePath)) return null;
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function writeState(state) {
  const statePath = path.join(runtimePath, "telegram-state.json");
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function getHistoryCode() {
  const raw = fs.readFileSync(workflowPath, "utf8");
  const workflow = JSON.parse(raw);
  const node = (workflow.nodes || []).find((item) => item.name === "Handle Commands And Scoring");
  if (!node || typeof node.parameters?.jsCode !== "string") {
    throw new Error("No encontre el nodo Handle Commands And Scoring con jsCode.");
  }
  return node.parameters.jsCode;
}

function createRunner(code) {
  const fn = new Function("require", "$json", code);
  return function run(text, updateId) {
    const input = {
      message: text,
      text,
      update_id: updateId,
      message_id: updateId + 1000,
      chat_id: "chat-test-router",
      catalogPath,
      runtimePath: runtimePathForN8n,
      workflowVersion: expectedWorkflowVersion,
      lastTelegramUpdateId: 309999,
      telegramBotToken: "REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N",
    };
    const output = fn(require, input);
    if (!Array.isArray(output) || !output[0] || !output[0].json) {
      throw new Error("El Code Node no devolvio [{ json }].");
    }
    return output[0].json;
  };
}

function includesCommands(response) {
  return String(response.telegram_message || "").includes("Comandos disponibles");
}

function conceptId(response) {
  return response?.concept?.id || null;
}

function conceptFamily(response) {
  return response?.concept?.familia || null;
}

function hasDraftForUpdate(updateId) {
  const drafts = readJsonl(path.join(runtimePath, "cfdi-drafts.jsonl"));
  return drafts.some((draft) => String(draft.update_id) === String(updateId));
}

function eventForUpdate(updateId) {
  const events = readJsonl(path.join(runtimePath, "telegram-events.jsonl"));
  return events.find((event) => String(event.update_id) === String(updateId)) || null;
}

const checks = [];

checks.push({
  name: "workflow_exists",
  pass: fs.existsSync(workflowPath),
  value: workflowPath,
});

if (fs.existsSync(runtimePath)) {
  fs.rmSync(runtimePath, { recursive: true, force: true });
}
fs.mkdirSync(runtimePath, { recursive: true });
writeState({
  lastTelegramUpdateId: 309999,
  processedUpdateIds: [],
  chatStates: {},
  lastRunAt: "",
  workflowVersion: expectedWorkflowVersion,
});

let results = {};
let run = null;

try {
  const code = getHistoryCode();
  run = createRunner(code);

  results.start = run("/start", 310001);
  results.help = run("/help", 310002);
  results.cctv = run("revis\u00e9 c\u00e1maras hikvision sin imagen", 310003);
  results.pending = run("/pendientes", 310004);
  results.powerSale = run("venta de fuente de poder para c\u00e1mara", 310005);
  results.generic = run("servicio t\u00e9cnico general", 310006);
  results.stateAfterGeneric = readState();
  results.debugPending = run("/debug", 310007);
  results.clarified = run("c\u00e1maras hikvision", 310008);
  results.genericForCancel = run("servicio t\u00e9cnico general", 310009);
  results.cancel = run("/cancelar", 310010);
  results.stateAfterCancel = readState();
  results.blocked = run("desarroll\u00e9 una app m\u00f3vil", 310011);
  results.multiline = run(
    [
      "revis\u00e9 c\u00e1maras hikvision sin imagen",
      "servicio t\u00e9cnico general",
      "venta de fuente de poder para c\u00e1mara",
    ].join("\n"),
    310012,
  );
  results.unknown = run("/noexiste", 310013);
  results.debug = run("/debug", 310014);
} catch (error) {
  checks.push({ name: "router_execution", pass: false, value: error.message });
}

if (run) {
  checks.push({
    name: "start_shows_help",
    pass: results.start.action === "COMMAND_HELP" && includesCommands(results.start),
    value: `${results.start.action}`,
  });
  checks.push({
    name: "help_shows_help",
    pass: results.help.action === "COMMAND_HELP" && includesCommands(results.help) && String(results.help.telegram_message || "").includes("/debug"),
    value: `${results.help.action}`,
  });
  checks.push({
    name: "debug_command",
    pass:
      results.debug.action === "COMMAND_DEBUG" &&
      String(results.debug.telegram_message || "").includes(expectedWorkflowVersion) &&
      String(results.debug.telegram_message || "").includes(catalogPath) &&
      String(results.debug.telegram_message || "").includes(runtimePathForN8n) &&
      String(results.debug.telegram_message || "").includes("lastTelegramUpdateId: 309999") &&
      String(results.debug.telegram_message || "").includes("chatState:") &&
      String(results.debug.telegram_message || "").includes("timestamp:"),
    value: `${results.debug.action}`,
  });
  checks.push({
    name: "debug_pending_reads_chat_state",
    pass:
      results.debugPending.action === "COMMAND_DEBUG" &&
      String(results.debugPending.telegram_message || "").includes("chatState: existe") &&
      !includesCommands(results.debugPending),
    value: `${results.debugPending.action}`,
  });
  checks.push({
    name: "pendientes_command",
    pass: results.pending.action === "COMMAND_PENDIENTES" && !results.pending.ready_to_copy,
    value: `${results.pending.action}`,
  });
  checks.push({
    name: "unknown_command",
    pass: results.unknown.action === "COMMAND_UNKNOWN" && String(results.unknown.telegram_message || "").includes("Comando no reconocido") && includesCommands(results.unknown),
    value: `${results.unknown.action}`,
  });
  checks.push({
    name: "normal_cctv_goes_to_scoring",
    pass:
      results.cctv.action === "SUGERIR" &&
      results.cctv.ready_to_copy === true &&
      conceptFamily(results.cctv) === "CCTV" &&
      !includesCommands(results.cctv) &&
      String(results.cctv.telegram_message || "").includes("Versi\u00f3n: " + expectedWorkflowVersion),
    value: `${results.cctv.action}/${conceptFamily(results.cctv)}/${conceptId(results.cctv)}`,
  });
  checks.push({
    name: "power_sale_goes_to_scoring",
    pass:
      results.powerSale.action === "SUGERIR" &&
      results.powerSale.ready_to_copy === true &&
      conceptId(results.powerSale) === "PROD-CCTV-007" &&
      !includesCommands(results.powerSale) &&
      String(results.powerSale.telegram_message || "").includes("Versi\u00f3n: " + expectedWorkflowVersion),
    value: `${results.powerSale.action}/${conceptId(results.powerSale)}`,
  });
  checks.push({
    name: "generic_needs_clarification",
    pass: results.generic.action === "PEDIR_ACLARACION" && results.generic.ready_to_copy === false && !includesCommands(results.generic),
    value: `${results.generic.action}`,
  });
  checks.push({
    name: "generic_stores_chat_state",
    pass: Boolean(results.stateAfterGeneric?.chatStates?.["chat-test-router"]?.original_text),
    value: results.stateAfterGeneric?.chatStates?.["chat-test-router"]?.original_text || "missing",
  });
  checks.push({
    name: "clarification_uses_chat_state",
    pass:
      results.clarified.action === "SUGERIR" &&
      results.clarified.ready_to_copy === true &&
      results.clarified.json_debug?.used_chat_state === true &&
      conceptFamily(results.clarified) === "CCTV" &&
      !includesCommands(results.clarified),
    value: `${results.clarified.action}/${conceptFamily(results.clarified)}/${results.clarified.json_debug?.used_chat_state}`,
  });
  checks.push({
    name: "cancelar_clears_chat_state",
    pass: results.cancel.action === "COMMAND_CANCELAR" && !results.stateAfterCancel?.chatStates?.["chat-test-router"],
    value: `${results.cancel.action}`,
  });
  checks.push({
    name: "software_blocked",
    pass: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"].includes(results.blocked.action) && results.blocked.ready_to_copy === false && !includesCommands(results.blocked),
    value: `${results.blocked.action}`,
  });
  checks.push({
    name: "multiline_asks_to_separate",
    pass:
      results.multiline.action === "PEDIR_SEPARAR_MENSAJES" &&
      results.multiline.ready_to_copy === false &&
      String(results.multiline.telegram_message || "").includes("Detect") &&
      String(results.multiline.telegram_message || "").includes("una actividad por mensaje"),
    value: `${results.multiline.action}`,
  });
  checks.push({
    name: "commands_do_not_create_drafts",
    pass:
      !hasDraftForUpdate(310001) &&
      !hasDraftForUpdate(310002) &&
      !hasDraftForUpdate(310004) &&
      !hasDraftForUpdate(310007) &&
      !hasDraftForUpdate(310010) &&
      !hasDraftForUpdate(310013) &&
      !hasDraftForUpdate(310014),
    value: "command update_ids",
  });
  checks.push({
    name: "normal_sugerir_creates_drafts",
    pass: hasDraftForUpdate(310003) && hasDraftForUpdate(310005) && hasDraftForUpdate(310008),
    value: "SUGERIR drafts",
  });
  checks.push({
    name: "non_ready_results_do_not_create_drafts",
    pass: !hasDraftForUpdate(310006) && !hasDraftForUpdate(310009) && !hasDraftForUpdate(310011) && !hasDraftForUpdate(310012),
    value: "clarify/block/split",
  });
  checks.push({
    name: "split_saved_as_event",
    pass: eventForUpdate(310012)?.result_action === "PEDIR_SEPARAR_MENSAJES",
    value: eventForUpdate(310012)?.result_action || "missing",
  });
  checks.push({
    name: "normal_messages_do_not_show_commands",
    pass:
      !includesCommands(results.cctv) &&
      !includesCommands(results.powerSale) &&
      !includesCommands(results.generic) &&
      !includesCommands(results.blocked) &&
      !includesCommands(results.multiline),
    value: "normal route",
  });
  checks.push({
    name: "commands_do_not_pass_scoring_shape",
    pass:
      results.start.ready_to_copy === false &&
      results.start.concept?.id === null &&
      Array.isArray(results.start.top_3) &&
      results.start.top_3.length === 0 &&
      results.pending.concept?.id === null,
    value: "command shape",
  });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Command router workflow contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Runtime test path: ${runtimePath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");

for (const check of checks) printCheck(check.name, check.pass, check.value);

if (run) {
  console.log("");
  console.log("Casos ejecutados:");
  for (const [name, result] of Object.entries(results)) {
    if (!result || !Object.prototype.hasOwnProperty.call(result, "action")) continue;
    console.log(` - ${name}: action=${result.action} ready_to_copy=${result.ready_to_copy} concept=${conceptId(result) || "null"}`);
  }
}

console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

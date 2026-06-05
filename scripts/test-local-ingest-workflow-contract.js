const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const expectedPlaceholder = "REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N";
const expectedSecretPlaceholder = "CAMBIAR_SECRET_LOCAL";
const expectedWorkflowVersion = "CFDI_LOCAL_INGEST_V1";
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function tokenLikeValues(text) {
  return text.match(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g) || [];
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function requireCalls(text) {
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  const calls = [];
  let match = null;
  while ((match = pattern.exec(text))) calls.push(match[1]);
  return calls;
}

function executeCode(code, input, config = {}) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: expectedWorkflowVersion,
        catalogPath: expectedCatalogPath,
        runnerSecret: "TEST_SECRET",
        ...config,
      },
    },
  };
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeContext, () => [], 0);
}

function makeWebhookInput(update, secret = "TEST_SECRET") {
  return {
    headers: { "x-cfdi-runner-secret": secret },
    body: update,
  };
}

const checks = [];
let workflow = null;
let raw = "";
let extractCode = "";
let handleCode = "";

try {
  raw = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(raw);
  extractCode = getNode(workflow, "Extract Local Ingest Update").parameters.jsCode;
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_exists", pass: true, value: "workflow/cfdi_telegram_local_ingest.n8n.json" });
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_loads", pass: false, value: error.message });
}

if (workflow) {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map((node) => node.type);
  const webhookNode = getNode(workflow, "Webhook Local Ingest");
  const sendNode = getNode(workflow, "Telegram sendMessage");
  const answerCallbackNode = getNode(workflow, "Telegram answerCallbackQuery");
  const respondNode = getNode(workflow, "Respond to Webhook");
  const postgresNodes = nodes.filter((node) => node.type === "n8n-nodes-base.postgres");
  const allCode = nodes.map((node) => node.parameters?.jsCode || "").join("\n");
  const disallowedRequires = requireCalls(allCode).filter((item) => !["fs", "path"].includes(item));

  checks.push({ name: "uses_webhook_node", pass: webhookNode.type === "n8n-nodes-base.webhook", value: webhookNode.parameters.path });
  checks.push({ name: "webhook_post_path", pass: webhookNode.parameters.httpMethod === "POST" && webhookNode.parameters.path === "cfdi-local-ingest", value: "POST /cfdi-local-ingest" });
  checks.push({ name: "webhook_uses_response_node", pass: webhookNode.parameters.responseMode === "responseNode", value: webhookNode.parameters.responseMode });
  checks.push({ name: "uses_respond_to_webhook_final_node", pass: respondNode.type === "n8n-nodes-base.respondToWebhook" && respondNode.parameters.respondWith === "json", value: "Respond to Webhook" });
  checks.push({ name: "no_schedule_trigger", pass: !nodeTypes.includes("n8n-nodes-base.scheduleTrigger") && !raw.includes("Schedule Trigger"), value: "none" });
  checks.push({ name: "no_telegram_trigger", pass: !/telegramTrigger/i.test(raw), value: "none" });
  checks.push({ name: "no_telegram_getUpdates", pass: !raw.includes("getUpdates"), value: "none" });
  checks.push({ name: "uses_postgres", pass: postgresNodes.length >= 4, value: `${postgresNodes.length}` });
  checks.push({ name: "uses_sendMessage", pass: raw.includes("sendMessage") && sendNode.type === "n8n-nodes-base.httpRequest", value: "Telegram sendMessage" });
  checks.push({ name: "sendMessage_continue_on_fail", pass: sendNode.continueOnFail === true, value: sendNode.continueOnFail === true ? "true" : "false" });
  checks.push({ name: "sendMessage_replies_to_source_message_id", pass: String(sendNode.parameters.jsonBody || "").includes("reply_parameters") && String(sendNode.parameters.jsonBody || "").includes("source_message_id"), value: "reply_parameters.message_id" });
  checks.push({ name: "sendMessage_skips_reply_parameters_for_callbacks", pass: String(sendNode.parameters.jsonBody || "").includes("source_kind !== 'CALLBACK_QUERY'"), value: "callback guard" });
  checks.push({ name: "uses_answerCallbackQuery_for_callbacks", pass: raw.includes("answerCallbackQuery") && answerCallbackNode.continueOnFail === true, value: "answerCallbackQuery" });
  checks.push({ name: "token_placeholder_only", pass: raw.includes(expectedPlaceholder) && tokenLikeValues(raw).length === 0, value: expectedPlaceholder });
  checks.push({ name: "runner_secret_placeholder", pass: raw.includes(expectedSecretPlaceholder) && raw.includes("runnerSecret"), value: expectedSecretPlaceholder });
  checks.push({ name: "validates_runner_secret_header", pass: extractCode.includes("x-cfdi-runner-secret") && extractCode.includes("RUNNER_SECRET invalido"), value: "X-CFDI-Runner-Secret" });
  checks.push({ name: "processes_message_text", pass: extractCode.includes("message.text") && extractCode.includes("typeof message.text"), value: "message.text" });
  checks.push({ name: "processes_callback_query_data", pass: extractCode.includes("callback_query") && extractCode.includes("callbackQuery.data"), value: "callback_query.data" });
  checks.push({ name: "normalizes_source_kind_and_message_id", pass: extractCode.includes("sourceKind") && extractCode.includes("sourceMessageId") && extractCode.includes("callbackQueryId"), value: "source fields" });
  checks.push({ name: "dedupe_by_update_id", pass: extractCode.includes("ON CONFLICT (update_id) DO NOTHING"), value: "telegram_updates.update_id" });
  checks.push({ name: "duplicate_update_dedupes_before_send", pass: webhookNode.parameters.responseMode === "responseNode" && extractCode.includes("ON CONFLICT (update_id) DO NOTHING") && extractCode.includes("webhook_status") && extractCode.includes("duplicate") && !extractCode.includes("ON CONFLICT (update_id) DO UPDATE"), value: "dedupe/no resend" });
  checks.push({ name: "uses_telegram_updates_table", pass: raw.includes("telegram_updates") && raw.includes("RECEIVED"), value: "telegram_updates" });
  checks.push({ name: "uses_chat_states", pass: raw.includes("chat_states"), value: "chat_states" });
  checks.push({ name: "uses_cfdi_drafts", pass: raw.includes("cfdi_drafts"), value: "cfdi_drafts" });
  checks.push({ name: "keeps_bot_state_observability", pass: raw.includes("bot_state") && raw.includes("lastTelegramUpdateId"), value: "bot_state" });
  checks.push({ name: "run_scoring_self_contained", pass: handleCode.includes("function classifyMessage") && handleCode.includes("function buildN8nResponse"), value: `${handleCode.length} chars` });
  checks.push({ name: "no_process_dirname_filename", pass: !/process\.|__dirname|__filename/.test(raw), value: "none" });
  checks.push({ name: "no_local_js_require", pass: disallowedRequires.length === 0 && !/require\(\s*["'][.]{1,2}\//.test(raw) && !raw.includes("scripts/scoring.js"), value: disallowedRequires.join(",") || "none" });
  checks.push({ name: "no_public_webhook_setup", pass: !/setWebhook|ngrok|public webhook|webhook publico/i.test(raw), value: "local only" });
  checks.push({
    name: "no_pac_production_or_direct_provider_secrets",
    pass: !/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|timbre_fiscal|WhatsApp|whatsapp|sendDocument|sendMediaGroup|sendPhoto/i.test(raw),
    value: "sandbox console only",
  });
  checks.push({
    name: "pac_sandbox_uses_action_layer",
    pass: raw.includes("Execute PAC Sandbox Action") && raw.includes("node scripts/run-sandbox-action.js") && raw.includes("sandbox_execute_command"),
    value: "Action Layer allowlisted",
  });

  try {
    const result = executeCode(extractCode, makeWebhookInput({
      update_id: 4101,
      message: { message_id: 11, chat: { id: "chat-local" }, text: "revisé cámaras hikvision sin imagen" },
    }))[0].json;
    checks.push({ name: "extract_message_text", pass: result.text.includes("cámaras") || result.text.includes("c?maras"), value: result.text });
    checks.push({ name: "extract_message_sql_insert", pass: result.insert_update_sql.includes("INSERT INTO telegram_updates") && !result.insert_update_sql.includes("raw_payload"), value: "insert without raw_payload" });
    checks.push({ name: "extract_message_source_message_id", pass: result.source_kind === "MESSAGE" && result.source_message_id === "11" && result.callback_query_id === "", value: `${result.source_kind}/${result.source_message_id}` });
  } catch (error) {
    checks.push({ name: "extract_message_text", pass: false, value: error.message });
  }

  try {
    const result = executeCode(extractCode, makeWebhookInput({
      update_id: 4102,
      callback_query: { id: "cb-test", from: { id: "chat-local" }, data: "/pendientes", message: { message_id: 22, chat: { id: "chat-local" } } },
    }))[0].json;
    checks.push({ name: "extract_callback_data", pass: result.text === "/pendientes" && result.ingest_source === "callback_query", value: result.text });
    checks.push({ name: "extract_callback_context", pass: result.source_kind === "CALLBACK_QUERY" && result.callback_query_id === "cb-test" && result.callback_message_id === "22" && result.source_message_id === "", value: `${result.source_kind}/${result.callback_query_id}/${result.callback_message_id}` });
  } catch (error) {
    checks.push({ name: "extract_callback_data", pass: false, value: error.message });
  }

  try {
    const result = executeCode(extractCode, makeWebhookInput({
      update_id: 4103,
      message: { message_id: 12, chat: { id: "chat-local" }, sticker: { file_id: "STICKER" } },
    }))[0].json;
    checks.push({ name: "ignored_non_text_update", pass: result.skip_send === true && result.insert_update_sql.includes("IGNORED_UPDATE"), value: "skip_send" });
  } catch (error) {
    checks.push({ name: "ignored_non_text_update", pass: false, value: error.message });
  }

  try {
    executeCode(extractCode, makeWebhookInput({ update_id: 4104 }, "BAD_SECRET"));
    checks.push({ name: "rejects_bad_runner_secret", pass: false, value: "accepted" });
  } catch (error) {
    checks.push({ name: "rejects_bad_runner_secret", pass: /RUNNER_SECRET invalido/.test(error.message), value: error.message });
  }
}

console.log("Local ingest workflow contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`PASS TOTAL: ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);

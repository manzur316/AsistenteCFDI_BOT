const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, options = {}) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath: expectedCatalogPath,
        runnerSecret: "TEST_SECRET",
      },
    },
  };
  const items = options.items || (() => []);
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeContext, items, options.itemIndex || 0);
}

function makeWebhookInput(update, secret = "TEST_SECRET") {
  return { headers: { "x-cfdi-runner-secret": secret }, body: update };
}

function normalPostgresRow(overrides = {}) {
  return {
    update_id: 5101,
    chat_id: "chat-local",
    message_id: "31",
    text: "revisé cámaras hikvision sin imagen",
    catalog_path: expectedCatalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    max_seen_update_id: 5101,
    source_message_id: "31",
    callback_query_id: "",
    callback_message_id: "",
    source_kind: "MESSAGE",
    skip_send: false,
    webhook_status: "processed",
    webhook_message: "Update accepted for processing",
    ...overrides,
  };
}

function responseStatus(item) {
  return item?.json?.webhook_response?.status;
}

const checks = [];
let workflow = null;
let raw = "";
let extractCode = "";
let buildLoadCode = "";
let buildResponseCode = "";
let logSendCode = "";

try {
  raw = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(raw);
  extractCode = getNode(workflow, "Extract Local Ingest Update").parameters.jsCode;
  buildLoadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  buildResponseCode = getNode(workflow, "Build Webhook Response").parameters.jsCode;
  logSendCode = getNode(workflow, "Log Send Result SQL").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

if (workflow) {
  const webhookNode = getNode(workflow, "Webhook Local Ingest");
  const respondNode = getNode(workflow, "Respond to Webhook");
  const nodeTypes = (workflow.nodes || []).map((node) => node.type);
  const codeText = (workflow.nodes || []).map((node) => node.parameters?.jsCode || "").join("\n");

  checks.push({ name: "contains_respond_to_webhook", pass: respondNode.type === "n8n-nodes-base.respondToWebhook" && respondNode.parameters.respondWith === "json", value: "Respond to Webhook" });
  checks.push({ name: "does_not_use_respond_immediately", pass: webhookNode.parameters.responseMode === "responseNode" && webhookNode.parameters.responseMode !== "onReceived", value: webhookNode.parameters.responseMode });
  checks.push({ name: "responds_json_200_shape", pass: String(respondNode.parameters.responseBody || "").includes("webhook_response") && Number(respondNode.parameters.options?.responseCode) === 200, value: "webhook_response/200" });
  checks.push({ name: "has_response_build_node", pass: raw.includes("Build Webhook Response") && buildResponseCode.includes("webhook_response"), value: "Build Webhook Response" });
  checks.push({ name: "has_load_context_router", pass: raw.includes("Has Load Context") && raw.includes("Should Send Telegram"), value: "routers" });
  checks.push({ name: "no_terminal_code_returns_empty_items", pass: !buildLoadCode.includes("return []") && !buildResponseCode.includes("return []") && !codeText.includes("Build Callback Answer"), value: "no empty terminal code" });
  checks.push({ name: "no_token_real", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(raw), value: "none" });
  checks.push({ name: "no_telegram_trigger_or_getUpdates", pass: !nodeTypes.includes("n8n-nodes-base.telegramTrigger") && !raw.includes("getUpdates"), value: "none" });
  checks.push({
    name: "no_pac_production_or_direct_provider_secrets",
    pass: !/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|timbre_fiscal|WhatsApp|whatsapp|sendDocument|sendMediaGroup|sendPhoto/i.test(raw),
    value: "sandbox console only",
  });

  try {
    const extracted = executeCode(extractCode, makeWebhookInput({
      update_id: 5101,
      message: { message_id: 31, chat: { id: "chat-local" }, text: "revisé cámaras hikvision sin imagen" },
    }))[0].json;
    const build = executeCode(buildLoadCode, normalPostgresRow({ update_id: extracted.update_id, text: extracted.text }))[0].json;
    const response = executeCode(buildResponseCode, { update_id: 5101, webhook_status: "processed", webhook_message: "Update processed" })[0];
    checks.push({ name: "normal_update_has_load_context", pass: Boolean(build.load_context_sql) && !build.webhook_response, value: "load_context_sql" });
    checks.push({ name: "normal_update_response_processed", pass: responseStatus(response) === "processed", value: responseStatus(response) });
  } catch (error) {
    checks.push({ name: "normal_update_response_processed", pass: false, value: error.message });
  }

  try {
    const duplicate = executeCode(buildLoadCode, normalPostgresRow({ skip_send: true, webhook_status: "duplicate", webhook_message: "Duplicate update ignored" }))[0];
    const response = executeCode(buildResponseCode, duplicate.json)[0];
    checks.push({ name: "duplicate_update_response_200_duplicate", pass: responseStatus(response) === "duplicate" && duplicate.json.should_send_telegram === false && !duplicate.json.load_context_sql, value: responseStatus(response) });
  } catch (error) {
    checks.push({ name: "duplicate_update_response_200_duplicate", pass: false, value: error.message });
  }

  try {
    const ignoredExtract = executeCode(extractCode, makeWebhookInput({
      update_id: 5102,
      message: { message_id: 32, chat: { id: "chat-local" }, sticker: { file_id: "STICKER" } },
    }))[0].json;
    const ignored = executeCode(buildLoadCode, { ...ignoredExtract, update_id: 5102, chat_id: "chat-local", skip_send: true, webhook_status: "ignored", webhook_message: "Update ignored" })[0];
    const response = executeCode(buildResponseCode, ignored.json)[0];
    checks.push({ name: "ignored_no_text_response_200_ignored", pass: ignoredExtract.insert_update_sql.includes("IGNORED_UPDATE") && responseStatus(response) === "ignored", value: responseStatus(response) });
  } catch (error) {
    checks.push({ name: "ignored_no_text_response_200_ignored", pass: false, value: error.message });
  }

  try {
    const extracted = executeCode(extractCode, makeWebhookInput({
      update_id: 5103,
      callback_query: { id: "cb-5103", from: { id: "chat-local" }, data: "/pendientes", message: { message_id: 88, chat: { id: "chat-local" } } },
    }))[0].json;
    const build = executeCode(buildLoadCode, normalPostgresRow({
      update_id: extracted.update_id,
      message_id: extracted.message_id,
      text: extracted.text,
      source_kind: extracted.source_kind,
      callback_query_id: extracted.callback_query_id,
      callback_message_id: extracted.callback_message_id,
      source_message_id: "",
    }))[0].json;
    const response = executeCode(buildResponseCode, { update_id: 5103, webhook_status: "processed", webhook_message: "Callback processed" })[0];
    checks.push({ name: "callback_query_processed_response", pass: extracted.source_kind === "CALLBACK_QUERY" && extracted.callback_query_id === "cb-5103" && Boolean(build.load_context_sql) && responseStatus(response) === "processed", value: `${extracted.source_kind}/${responseStatus(response)}` });
  } catch (error) {
    checks.push({ name: "callback_query_processed_response", pass: false, value: error.message });
  }

  try {
    const callbackDuplicate = executeCode(buildLoadCode, normalPostgresRow({
      update_id: 5104,
      skip_send: true,
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-dup",
      webhook_status: "duplicate",
      webhook_message: "Duplicate update ignored",
    }))[0];
    const response = executeCode(buildResponseCode, callbackDuplicate.json)[0];
    checks.push({ name: "callback_duplicate_response_200_duplicate", pass: responseStatus(response) === "duplicate" && callbackDuplicate.json.should_send_telegram === false, value: responseStatus(response) });
  } catch (error) {
    checks.push({ name: "callback_duplicate_response_200_duplicate", pass: false, value: error.message });
  }

  try {
    const noAction = executeCode(buildResponseCode, { update_id: 5105, webhook_status: "no_action", webhook_message: "No Telegram action needed" })[0];
    checks.push({ name: "no_action_response_200_no_action", pass: responseStatus(noAction) === "no_action", value: responseStatus(noAction) });
  } catch (error) {
    checks.push({ name: "no_action_response_200_no_action", pass: false, value: error.message });
  }

  try {
    const source = normalPostgresRow({ update_id: 5106, webhook_status: "processed", should_send_telegram: true });
    const logged = executeCode(logSendCode, { statusCode: 500, error: { message: "Telegram closed connection" } }, {
      items: (name) => name === "Restore Response After Persistence" ? [{ json: source }] : [],
    })[0].json;
    const response = executeCode(buildResponseCode, { update_id: 5106, send_failed: true, webhook_status: "handled_error", webhook_message: "Telegram sendMessage failed but update was handled" })[0];
    checks.push({ name: "sendMessage_fail_response_200_handled_error", pass: logged.send_log_sql.includes("handled_error") && responseStatus(response) === "handled_error", value: responseStatus(response) });
  } catch (error) {
    checks.push({ name: "sendMessage_fail_response_200_handled_error", pass: false, value: error.message });
  }
}

console.log("Local ingest response contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`PASS TOTAL: ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);

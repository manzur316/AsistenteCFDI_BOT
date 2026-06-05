const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_sandbox_action_router.n8n.json");
const expectedWorkflow = "workflow/cfdi_sandbox_action_router.n8n.json";
const expectedCommands = {
  "/sandbox_preflight": "sandbox.preflight",
  "/sandbox_report": "sandbox.report.generate",
  "/sandbox_package": "sandbox.package.generate",
  "/sandbox_excel": "sandbox.excel.generate",
  "/sandbox_checklist": "sandbox.checklist.generate",
  "/sandbox_full_package": "sandbox.full.monthly.package",
  "/sandbox_smoke_create": "sandbox.smoke.create",
  "/sandbox_smoke_download": "sandbox.smoke.download",
  "/sandbox_smoke_cancel": "sandbox.smoke.cancel",
};
const expectedCallbacks = {
  "cfdi_sbx:report": "sandbox.report.generate",
  "cfdi_sbx:package": "sandbox.package.generate",
  "cfdi_sbx:excel": "sandbox.excel.generate",
  "cfdi_sbx:checklist": "sandbox.checklist.generate",
  "cfdi_sbx:full": "sandbox.full.monthly.package",
  "cfdi_sbx:preflight": "sandbox.preflight",
  "cfdi_sbx:smoke_create": "sandbox.smoke.create",
  "cfdi_sbx:smoke_download": "sandbox.smoke.download",
  "cfdi_sbx:smoke_cancel": "sandbox.smoke.cancel",
};
const expectedUiCallbacks = [
  "cfdi_sbx:menu",
  "cfdi_sbx:smoke_menu",
  "cfdi_sbx:cancel",
];

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

function tokenLikeValues(text) {
  return text.match(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g) || [];
}

function requireCalls(text) {
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  const calls = [];
  let match = null;
  while ((match = pattern.exec(text))) calls.push(match[1]);
  return calls;
}

function executeCode(code, input, config = {}, nodeOverrides = {}) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_SANDBOX_ACTION_ROUTER_V1",
        projectRoot: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI",
        allowedChatId: "12345",
        telegramBotToken: "",
        ...config,
      },
    },
    ...nodeOverrides,
  };
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeContext, () => [], 0);
}

function makeMessage(text, chatId = "12345") {
  return {
    body: {
      message: {
        chat: { id: chatId },
        from: { id: "user-1" },
        text,
      },
    },
  };
}

function makeCallback(data, chatId = "12345") {
  return {
    body: {
      callback_query: {
        id: "callback-test",
        from: { id: "user-1" },
        data,
        message: {
          message_id: 20,
          chat: { id: chatId },
        },
      },
    },
  };
}

function workflowCallbackDataValues(text) {
  const matches = [...text.matchAll(/callback_data:\s*'([^']+)'/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

let workflow = null;
let raw = "";
let normalizeCode = "";
let summaryCode = "";
let prepareWebhookCode = "";

try {
  raw = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(raw);
  normalizeCode = getNode(workflow, "Normalize Input And Route").parameters.jsCode;
  summaryCode = getNode(workflow, "Build Safe Action Summary").parameters.jsCode;
  prepareWebhookCode = getNode(workflow, "Prepare Webhook JSON Body").parameters.jsCode;
  checks.push({ name: "workflow_exists", pass: true, value: expectedWorkflow });
  checks.push({ name: "workflow_valid_json", pass: true, value: workflow.name });
} catch (error) {
  checks.push({ name: "workflow_loads", pass: false, value: error.message });
}

if (workflow) {
  const nodes = workflow.nodes || [];
  const nodeTypes = nodes.map((node) => node.type);
  const webhookNode = getNode(workflow, "Webhook Sandbox Action Router");
  const configNode = getNode(workflow, "Set Config");
  const executeNode = getNode(workflow, "Execute Sandbox Action");
  const prepareWebhookNode = getNode(workflow, "Prepare Webhook JSON Body");
  const respondNode = getNode(workflow, "Respond to Webhook");
  const telegramNode = getNode(workflow, "Telegram sendMessage");
  const executeNodes = nodes.filter((node) => node.type === "n8n-nodes-base.executeCommand");
  const httpNodes = nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
  const allCode = nodes.map((node) => node.parameters?.jsCode || "").join("\n");
  const disallowedRequires = requireCalls(allCode);
  const callbackDataValues = workflowCallbackDataValues(raw);

  check("uses_webhook_local_test", () => {
    assert.strictEqual(webhookNode.type, "n8n-nodes-base.webhook");
    assert.strictEqual(webhookNode.parameters.path, "cfdi-sandbox-action-router");
    assert.strictEqual(webhookNode.parameters.responseMode, "responseNode");
    return "POST /cfdi-sandbox-action-router";
  });

  check("responds_with_response_node", () => {
    assert.strictEqual(respondNode.type, "n8n-nodes-base.respondToWebhook");
    assert.strictEqual(respondNode.parameters.respondWith, "firstIncomingItem");
    assert(!("responseBody" in respondNode.parameters));
    assert.strictEqual(respondNode.parameters.options.responseCode, 200);
    return "Respond to Webhook firstIncomingItem";
  });

  check("prepare_webhook_json_body_node_present", () => {
    assert.strictEqual(prepareWebhookNode.type, "n8n-nodes-base.code");
    assert(prepareWebhookCode.includes("webhook_response"));
    assert(prepareWebhookCode.includes("warnings"));
    assert(prepareWebhookCode.includes("errors"));
    assert(prepareWebhookCode.includes("source_kind"));
    assert(prepareWebhookCode.includes("callback_data"));
    return "Prepare Webhook JSON Body";
  });

  check("no_hardcoded_credentials_or_tokens", () => {
    assert.strictEqual(tokenLikeValues(raw).length, 0);
    assert(!/FACTURACOM_(API|SECRET)_KEY|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(raw));
    assert(!/REEMPLAZAR_[A-Z0-9_]{8,}:[A-Za-z0-9_-]{20,}/.test(raw));
    return "none";
  });

  check("no_facturacom_production_url", () => {
    assert(!/https:\/\/api\.factura\.com/i.test(raw));
    return "none";
  });

  check("no_facturacom_http_request_or_headers", () => {
    for (const node of httpNodes) {
      const url = String(node.parameters?.url || "");
      assert(!/factura\.com/i.test(url), `${node.name} -> ${url}`);
    }
    assert(!/Factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(raw));
    return `${httpNodes.length} http node(s), none to Factura`;
  });

  check("no_telegram_trigger_credentials_required", () => {
    assert(!nodeTypes.includes("n8n-nodes-base.telegramTrigger"));
    assert(!/telegramTrigger/i.test(raw));
    return "webhook local";
  });

  check("uses_optional_telegram_send_message", () => {
    assert.strictEqual(telegramNode.type, "n8n-nodes-base.httpRequest");
    assert.strictEqual(telegramNode.continueOnFail, true);
    assert(String(telegramNode.parameters.url).includes("api.telegram.org"));
    assert(String(telegramNode.parameters.url).includes("telegram_bot_token"));
    assert(!String(telegramNode.parameters.url).includes("REEMPLAZAR"));
    return "sendMessage optional";
  });

  check("access_gate_by_chat_id_env", () => {
    const configValues = JSON.stringify(configNode.parameters.values);
    assert(configValues.includes("CFDI_ALLOWED_TELEGRAM_CHAT_ID"));
    assert(normalizeCode.includes("allowedChatId"));
    assert(normalizeCode.includes("No autorizado"));
    return "CFDI_ALLOWED_TELEGRAM_CHAT_ID";
  });

  check("expected_sandbox_commands_present", () => {
    for (const [command, action] of Object.entries(expectedCommands)) {
      assert(raw.includes(command), command);
      assert(raw.includes(action), action);
    }
    return `${Object.keys(expectedCommands).length} commands`;
  });

  check("inline_keyboard_present", () => {
    assert(raw.includes("inline_keyboard"));
    assert(raw.includes("MAIN_MENU_KEYBOARD"));
    assert(raw.includes("SMOKE_MENU_KEYBOARD"));
    return "main + smoke menu";
  });

  check("callback_data_allowlist_present", () => {
    for (const [callbackData, action] of Object.entries(expectedCallbacks)) {
      assert(raw.includes(callbackData), callbackData);
      assert(raw.includes(action), action);
    }
    for (const callbackData of expectedUiCallbacks) assert(raw.includes(callbackData), callbackData);
    return `${callbackDataValues.length} callback_data`;
  });

  check("callback_data_safe_and_short", () => {
    assert(callbackDataValues.length >= Object.keys(expectedCallbacks).length + expectedUiCallbacks.length);
    for (const value of callbackDataValues) {
      assert(value.length <= 32, `${value} length=${value.length}`);
      assert(/^cfdi_sbx:[a-z_]+$/.test(value), value);
      assert(!/[A-Z&?=/:\\.\d]/.test(value.replace("cfdi_sbx:", "")), value);
      assert(!/RFC|UUID|UID|MXN|IVA|runtime|xml|pdf|zip|xlsx|key|secret|token|factura/i.test(value), value);
    }
    return callbackDataValues.join(", ");
  });

  check("uses_action_allowlist", () => {
    assert(normalizeCode.includes("ACTION_MAP"));
    assert(normalizeCode.includes("CALLBACK_ACTION_MAP"));
    assert(normalizeCode.includes("CALLBACK_ALLOWLIST"));
    assert(normalizeCode.includes("Object.freeze"));
    assert(normalizeCode.includes("ACTION_MAP[commandToken]"));
    assert(normalizeCode.includes("CALLBACK_ACTION_MAP[callbackToken]"));
    return "ACTION_MAP + CALLBACK_ACTION_MAP";
  });

  check("execute_command_node_is_single_and_allowlisted", () => {
    assert.strictEqual(executeNodes.length, 1);
    assert.strictEqual(executeNode.type, "n8n-nodes-base.executeCommand");
    assert.strictEqual(executeNode.parameters.command, "={{$json.execute_command}}");
    assert(normalizeCode.includes("'node scripts/run-sandbox-action.js ' + requestedAction"));
    return "node scripts/run-sandbox-action.js <action>";
  });

  check("does_not_execute_arbitrary_input", () => {
    const result = executeCode(normalizeCode, makeMessage("/sandbox_report; whoami"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.execute_command, "");
    assert.strictEqual(result.router_status, "help");
    return "malicious command rejected";
  });

  check("known_command_builds_safe_command", () => {
    const result = executeCode(normalizeCode, makeMessage("/sandbox_report cualquier texto extra"))[0].json;
    assert.strictEqual(result.should_execute, true);
    assert.strictEqual(result.requested_action, "sandbox.report.generate");
    assert.strictEqual(result.execute_command, "node scripts/run-sandbox-action.js sandbox.report.generate");
    assert(!result.execute_command.includes("cualquier texto extra"));
    return result.execute_command;
  });

  check("callback_report_builds_safe_command", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:report"))[0].json;
    assert.strictEqual(result.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(result.callback_data, "cfdi_sbx:report");
    assert.strictEqual(result.should_execute, true);
    assert.strictEqual(result.requested_action, "sandbox.report.generate");
    assert.strictEqual(result.execute_command, "node scripts/run-sandbox-action.js sandbox.report.generate");
    return result.execute_command;
  });

  check("callback_full_builds_safe_command", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:full"))[0].json;
    assert.strictEqual(result.should_execute, true);
    assert.strictEqual(result.requested_action, "sandbox.full.monthly.package");
    assert.strictEqual(result.execute_command, "node scripts/run-sandbox-action.js sandbox.full.monthly.package");
    return result.requested_action;
  });

  check("callback_smoke_menu_no_execution", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:smoke_menu"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "smoke_menu");
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:smoke_create"));
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:smoke_download"));
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:smoke_cancel"));
    return "submenu";
  });

  check("callback_menu_shows_main_menu", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:menu"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "menu");
    assert.strictEqual(result.execute_command, "");
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:full"));
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:report"));
    return "main menu";
  });

  check("callback_smoke_actions_sandbox_only", () => {
    for (const [callbackData, expectedAction] of [
      ["cfdi_sbx:smoke_create", "sandbox.smoke.create"],
      ["cfdi_sbx:smoke_download", "sandbox.smoke.download"],
      ["cfdi_sbx:smoke_cancel", "sandbox.smoke.cancel"],
    ]) {
      const result = executeCode(normalizeCode, makeCallback(callbackData))[0].json;
      assert.strictEqual(result.should_execute, true, callbackData);
      assert.strictEqual(result.requested_action, expectedAction);
      assert(!/production|api\.factura\.com/i.test(result.execute_command));
    }
    return "smoke sandbox callbacks";
  });

  check("unknown_callback_shows_menu", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:bad"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "help");
    assert(result.reply_text.includes("Callback sandbox no reconocido"));
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:full"));
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:smoke_menu"));
    return "menu";
  });

  check("cancel_callback_never_executes", () => {
    const result = executeCode(normalizeCode, makeCallback("cfdi_sbx:cancel"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "cancelled");
    assert.strictEqual(result.execute_command, "");
    return result.router_status;
  });

  check("sandbox_menu_text_shows_buttons", () => {
    const result = executeCode(normalizeCode, makeMessage("/sandbox_menu"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "menu");
    assert(result.telegram_payload.reply_markup.inline_keyboard.flat().some((button) => button.callback_data === "cfdi_sbx:full"));
    return "menu buttons";
  });

  check("unauthorized_chat_does_not_execute", () => {
    const result = executeCode(normalizeCode, makeMessage("/sandbox_report", "999"))[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "unauthorized");
    assert.strictEqual(result.reply_text, "No autorizado");
    return result.reply_text;
  });

  check("missing_allowed_chat_needs_config", () => {
    const result = executeCode(normalizeCode, makeMessage("/sandbox_report"), { allowedChatId: "" })[0].json;
    assert.strictEqual(result.should_execute, false);
    assert.strictEqual(result.router_status, "needs_config");
    return result.router_status;
  });

  check("summary_parses_execute_command_stdout_only", () => {
    assert(summaryCode.includes("$json.stdout"));
    assert(summaryCode.includes("$json.data"));
    assert(summaryCode.includes("JSON.parse"));
    assert(summaryCode.includes("stdout del Action Layer"));
    assert(!/require\(|readFileSync|latestPath|fs\.|path\./.test(summaryCode));
    return "stdout/data";
  });

  check("workflow_code_nodes_do_not_use_fs_path_or_file_reads", () => {
    assert.strictEqual(disallowedRequires.length, 0, disallowedRequires.join(", "));
    assert(!/require\(\s*["']fs["']\s*\)/.test(allCode));
    assert(!/require\(\s*["']path["']\s*\)/.test(allCode));
    assert(!/readFileSync|writeFileSync|appendFileSync|existsSync/.test(allCode));
    assert(!/action-results-sandbox['"],\s*['"]latest\.json|latestPath/.test(allCode));
    return "no fs/path/readFileSync";
  });

  check("summary_produces_non_empty_webhook_response", () => {
    const routed = executeCode(normalizeCode, makeCallback("cfdi_sbx:full"))[0].json;
    const result = executeCode(
      summaryCode,
      {
        stdout: JSON.stringify({
          schema_version: "sandbox_action_result.v1",
          action: "sandbox.full.monthly.package",
          status: "OK",
          ok: true,
          duration_ms: 123,
          artifacts: [{ key: "latest_path", path: "runtime/action-results-sandbox/latest.json" }],
          warnings: [],
          errors: [],
          sensitive_findings: [],
        }),
      },
      { projectRoot: path.join(root, "runtime", "nonexistent-project-root") },
      { "Normalize Input And Route": { json: routed } },
    )[0].json;
    assert(result.webhook_response);
    assert.strictEqual(result.webhook_response.ok, true);
    assert.strictEqual(result.webhook_response.status, "OK");
    assert.strictEqual(result.webhook_response.action, "sandbox.full.monthly.package");
    assert(result.webhook_response.message.includes("Sandbox action: sandbox.full.monthly.package"));
    assert(Array.isArray(result.webhook_response.warnings));
    assert(Array.isArray(result.webhook_response.errors));
    assert(JSON.stringify(result.webhook_response).length > 20);
    return result.webhook_response.status;
  });

  check("prepared_callback_full_response_is_json_body", () => {
    const routed = executeCode(normalizeCode, makeCallback("cfdi_sbx:full"))[0].json;
    const summary = executeCode(
      summaryCode,
      {
        stdout: JSON.stringify({
          schema_version: "sandbox_action_result.v1",
          action: "sandbox.full.monthly.package",
          status: "OK",
          ok: true,
          duration_ms: 122,
          artifacts: [{ key: "latest_path", path: "runtime/action-results-sandbox/latest.json" }],
          warnings: [],
          errors: [],
          sensitive_findings: [],
        }),
      },
      { projectRoot: path.join(root, "runtime", "nonexistent-project-root") },
      { "Normalize Input And Route": { json: routed } },
    )[0].json;
    const body = executeCode(prepareWebhookCode, summary)[0].json;
    assert.deepStrictEqual(Object.keys(body).sort(), ["action", "callback_data", "errors", "message", "ok", "source_kind", "status", "warnings"].sort());
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.status, "OK");
    assert.strictEqual(body.action, "sandbox.full.monthly.package");
    assert.strictEqual(body.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(body.callback_data, "cfdi_sbx:full");
    assert(Array.isArray(body.warnings));
    assert(Array.isArray(body.errors));
    assert(JSON.stringify(body).length > 20);
    return `${body.status}/${body.action}`;
  });

  check("summary_reports_package_safety_error_body", () => {
    const routed = executeCode(normalizeCode, makeCallback("cfdi_sbx:full"))[0].json;
    const result = executeCode(
      summaryCode,
      {
        stdout: JSON.stringify({
          schema_version: "sandbox_action_result.v1",
          action: "sandbox.full.monthly.package",
          status: "PACKAGE_SAFETY_ERROR",
          ok: false,
          error_classification: "PACKAGE_SAFETY_ERROR",
          needs_runtime: false,
          safety_blocked: true,
          duration_ms: 42,
          artifacts: [],
          warnings: [],
          errors: ["Paquete contador sandbox inseguro: accountant-review-2026-06.xlsx:xl/worksheets/sheet1.xml:DEMO!A1:absolute_path"],
          sensitive_findings: [],
        }),
      },
      { projectRoot: path.join(root, "runtime", "nonexistent-project-root") },
      { "Normalize Input And Route": { json: routed } },
    )[0].json;
    assert.strictEqual(result.webhook_response.ok, false);
    assert.strictEqual(result.webhook_response.status, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(result.webhook_response.action, "sandbox.full.monthly.package");
    assert(result.webhook_response.errors.join(" | ").includes("absolute_path"));
    assert(!/\.xlsx|\.xml|\.pdf|\.zip/i.test(JSON.stringify(result.webhook_response)));
    assert(!result.webhook_response.message.includes("undefined"));
    return result.webhook_response.status;
  });

  check("prepared_package_safety_error_body_not_empty", () => {
    const body = executeCode(prepareWebhookCode, {
      source_kind: "CALLBACK_QUERY",
      callback_data: "cfdi_sbx:full",
      requested_action: "sandbox.full.monthly.package",
      reply_text: "Sandbox action: sandbox.full.monthly.package",
      action_result: {
        action: "sandbox.full.monthly.package",
        status: "PACKAGE_SAFETY_ERROR",
        warnings: [],
        errors: ["Paquete contador sandbox inseguro: accountant-review-2026-06.xlsx:xl/worksheets/sheet1.xml:DEMO!A1:absolute_path"],
      },
      webhook_response: {
        ok: false,
        status: "PACKAGE_SAFETY_ERROR",
        action: "sandbox.full.monthly.package",
        message: "Sandbox action: sandbox.full.monthly.package",
        warnings: [],
        errors: ["Paquete contador sandbox inseguro: accountant-review-2026-06.xlsx:xl/worksheets/sheet1.xml:DEMO!A1:absolute_path"],
      },
    })[0].json;
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.status, "PACKAGE_SAFETY_ERROR");
    assert.strictEqual(body.action, "sandbox.full.monthly.package");
    assert.strictEqual(body.source_kind, "CALLBACK_QUERY");
    assert.strictEqual(body.callback_data, "cfdi_sbx:full");
    assert(body.errors.join(" | ").includes("absolute_path"));
    assert(!/\.xlsx|\.xml|\.pdf|\.zip/i.test(JSON.stringify(body)));
    return body.status;
  });

  check("respond_to_webhook_returns_prepared_first_item", () => {
    assert.strictEqual(respondNode.parameters.respondWith, "firstIncomingItem");
    assert(!/noData|responseBody/i.test(JSON.stringify(respondNode.parameters)));
    const summaryConnections = workflow.connections["Build Safe Action Summary"].main[0].map((item) => item.node);
    const immediateConnections = workflow.connections["Build Immediate Response"].main[0].map((item) => item.node);
    const prepareConnections = workflow.connections["Prepare Webhook JSON Body"].main[0].map((item) => item.node);
    assert(summaryConnections.includes("Prepare Webhook JSON Body"));
    assert(immediateConnections.includes("Prepare Webhook JSON Body"));
    assert(!summaryConnections.includes("Respond to Webhook"));
    assert(!immediateConnections.includes("Respond to Webhook"));
    assert.deepStrictEqual(prepareConnections, ["Respond to Webhook"]);
    return "prepared first item";
  });

  check("summary_hides_sensitive_details", () => {
    assert(summaryCode.includes("sensitive_findings"));
    assert(summaryCode.includes("detalles ocultos"));
    return "sensitive count only";
  });

  check("does_not_send_xml_pdf_files", () => {
    assert(!/sendDocument|sendPhoto|sendMediaGroup|binaryData|binaryProperty|\.xml|\.pdf/i.test(raw));
    return "no file sending";
  });

  check("does_not_send_documents_or_files", () => {
    assert(!/sendDocument|sendPhoto|sendMediaGroup|sendAudio|sendVideo|multipart|binary/i.test(raw));
    assert(!/zip_path|excel_path|accountant-review-.*xlsx|accountant-package-.*zip/i.test(raw));
    return "no attachments";
  });

  check("does_not_mutate_catalog", () => {
    assert(!/concepts\.normalized\.json/i.test(raw));
    assert(!/writeFile|appendFile|rmSync|unlinkSync/i.test(raw));
    return "no catalog mutation";
  });

  check("no_local_js_require", () => {
    assert.strictEqual(disallowedRequires.length, 0, disallowedRequires.join(", "));
    assert(!/require\(\s*["'][.]{1,2}\//.test(allCode));
    assert(!raw.includes("scripts/scoring.js"));
    return "no require";
  });

  check("no_pac_timbrado_csd_env_leak", () => {
    assert(!/timbrad|PAC productivo|CSD|\.env|certificado|llave privada/i.test(raw));
    return "none";
  });
}

console.log("Sandbox action router workflow contract");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

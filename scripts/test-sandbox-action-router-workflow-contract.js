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

function executeCode(code, input, config = {}) {
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

let workflow = null;
let raw = "";
let normalizeCode = "";
let summaryCode = "";

try {
  raw = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(raw);
  normalizeCode = getNode(workflow, "Normalize Input And Route").parameters.jsCode;
  summaryCode = getNode(workflow, "Build Safe Action Summary").parameters.jsCode;
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
  const respondNode = getNode(workflow, "Respond to Webhook");
  const telegramNode = getNode(workflow, "Telegram sendMessage");
  const executeNodes = nodes.filter((node) => node.type === "n8n-nodes-base.executeCommand");
  const httpNodes = nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest");
  const allCode = nodes.map((node) => node.parameters?.jsCode || "").join("\n");
  const disallowedRequires = requireCalls(allCode).filter((item) => !["fs", "path"].includes(item));

  check("uses_webhook_local_test", () => {
    assert.strictEqual(webhookNode.type, "n8n-nodes-base.webhook");
    assert.strictEqual(webhookNode.parameters.path, "cfdi-sandbox-action-router");
    assert.strictEqual(webhookNode.parameters.responseMode, "responseNode");
    return "POST /cfdi-sandbox-action-router";
  });

  check("responds_with_response_node", () => {
    assert.strictEqual(respondNode.type, "n8n-nodes-base.respondToWebhook");
    assert.strictEqual(respondNode.parameters.respondWith, "json");
    return "Respond to Webhook";
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

  check("uses_action_allowlist", () => {
    assert(normalizeCode.includes("ACTION_MAP"));
    assert(normalizeCode.includes("Object.freeze"));
    assert(normalizeCode.includes("requestedAction = ACTION_MAP[commandToken]"));
    return "ACTION_MAP";
  });

  check("execute_command_node_is_single_and_allowlisted", () => {
    assert.strictEqual(executeNodes.length, 1);
    assert.strictEqual(executeNode.type, "n8n-nodes-base.executeCommand");
    assert.strictEqual(executeNode.parameters.command, "={{$json.execute_command}}");
    assert(normalizeCode.includes("node scripts/run-sandbox-action.js ${requestedAction}"));
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

  check("summary_reads_latest_json", () => {
    assert(summaryCode.includes("runtime"));
    assert(summaryCode.includes("action-results-sandbox"));
    assert(summaryCode.includes("latest.json"));
    assert(summaryCode.includes("fs.readFileSync"));
    return "runtime/action-results-sandbox/latest.json";
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

  check("does_not_mutate_catalog", () => {
    assert(!/concepts\.normalized\.json/i.test(raw));
    assert(!/writeFile|appendFile|rmSync|unlinkSync/i.test(raw));
    return "no catalog mutation";
  });

  check("no_local_js_require", () => {
    assert.strictEqual(disallowedRequires.length, 0, disallowedRequires.join(", "));
    assert(!/require\(\s*["'][.]{1,2}\//.test(allCode));
    assert(!raw.includes("scripts/scoring.js"));
    return "builtins only";
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

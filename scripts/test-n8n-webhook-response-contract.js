const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_sandbox_action_router.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
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

function getNode(name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
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

const normalizeCode = getNode("Normalize Input And Route").parameters.jsCode;
const immediateCode = getNode("Build Immediate Response").parameters.jsCode;
const summaryCode = getNode("Build Safe Action Summary").parameters.jsCode;
const prepareCode = getNode("Prepare Webhook JSON Body").parameters.jsCode;
const respondNode = getNode("Respond to Webhook");

function normalize(input, config = {}) {
  return executeCode(normalizeCode, input, config)[0].json;
}

function immediate(input) {
  return executeCode(immediateCode, input)[0].json;
}

function summary(routed, actionResult) {
  return executeCode(
    summaryCode,
    { stdout: JSON.stringify(actionResult) },
    { projectRoot: path.join(root, "runtime", "nonexistent-project-root") },
    { "Normalize Input And Route": { json: routed } },
  )[0].json;
}

function prepare(input) {
  return executeCode(prepareCode, input)[0].json;
}

function assertBody(body, expected = {}) {
  const keys = ["ok", "status", "action", "source_kind", "callback_data", "message", "warnings", "errors"];
  assert.deepStrictEqual(Object.keys(body).sort(), keys.sort());
  assert.strictEqual(typeof body.ok, "boolean");
  assert.strictEqual(typeof body.status, "string");
  assert.strictEqual(typeof body.message, "string");
  assert(body.message.length > 0);
  assert(Array.isArray(body.warnings));
  assert(Array.isArray(body.errors));
  if ("ok" in expected) assert.strictEqual(body.ok, expected.ok);
  if (expected.status) assert.strictEqual(body.status, expected.status);
  if ("action" in expected) assert.strictEqual(body.action, expected.action);
  if (expected.source_kind) assert.strictEqual(body.source_kind, expected.source_kind);
  if ("callback_data" in expected) assert.strictEqual(body.callback_data, expected.callback_data);
  const content = JSON.stringify(body);
  assert(content.length > 2);
  const parsed = JSON.parse(content);
  assert.strictEqual(parsed.status, body.status);
  assert(!/sendDocument|sendPhoto|sendMediaGroup|multipart|binary/i.test(content));
  assert(!/\.xml|\.pdf|\.zip|\.xlsx|accountant-package|accountant-review/i.test(content));
  assert(!/FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN|TELEGRAM_BOT_TOKEN/i.test(content));
  assert(!/https:\/\/api\.factura\.com|CSD|certificado|llave privada/i.test(content));
  return content.length;
}

function okAction(action) {
  return {
    schema_version: "sandbox_action_result.v1",
    action,
    status: "OK",
    ok: true,
    duration_ms: 122,
    artifacts: [{ key: "latest_path", path: "runtime/action-results-sandbox/latest.json" }],
    warnings: [],
    errors: [],
    sensitive_findings: [],
  };
}

check("respond_to_webhook_returns_first_incoming_item", () => {
  assert.strictEqual(respondNode.type, "n8n-nodes-base.respondToWebhook");
  assert.strictEqual(respondNode.parameters.respondWith, "firstIncomingItem");
  assert.strictEqual(respondNode.parameters.options.responseCode, 200);
  assert(!("responseBody" in respondNode.parameters));
  return "firstIncomingItem";
});

check("sandbox_menu_body_json_no_vacio", () => {
  const body = prepare(immediate(normalize(makeMessage("/sandbox_menu"))));
  return assertBody(body, { ok: true, status: "menu", action: null, source_kind: "MESSAGE", callback_data: null });
});

check("callback_full_body_json_no_vacio", () => {
  const routed = normalize(makeCallback("cfdi_sbx:full"));
  const body = prepare(summary(routed, okAction("sandbox.full.monthly.package")));
  return assertBody(body, { ok: true, status: "OK", action: "sandbox.full.monthly.package", source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:full" });
});

check("callback_report_body_json_no_vacio", () => {
  const routed = normalize(makeCallback("cfdi_sbx:report"));
  const body = prepare(summary(routed, okAction("sandbox.report.generate")));
  return assertBody(body, { ok: true, status: "OK", action: "sandbox.report.generate", source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:report" });
});

check("callback_desconocido_body_json_no_vacio", () => {
  const body = prepare(immediate(normalize(makeCallback("cfdi_sbx:desconocido"))));
  return assertBody(body, { ok: true, status: "help", action: null, source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:desconocido" });
});

check("chat_no_autorizado_body_json_no_vacio", () => {
  const body = prepare(immediate(normalize(makeCallback("cfdi_sbx:full", "999"))));
  return assertBody(body, { ok: true, status: "unauthorized", action: "sandbox.full.monthly.package", source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:full" });
});

check("accion_error_controlado_body_json_no_vacio", () => {
  const routed = normalize(makeCallback("cfdi_sbx:full"));
  const body = prepare(summary(routed, {
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.full.monthly.package",
    status: "PACKAGE_SAFETY_ERROR",
    ok: false,
    duration_ms: 42,
    artifacts: [],
    warnings: [],
    errors: ["Paquete contador sandbox inseguro: accountant-review-2026-06.xlsx:xl/worksheets/sheet1.xml:DEMO!A1:absolute_path"],
    sensitive_findings: [],
  }));
  const length = assertBody(body, { ok: false, status: "PACKAGE_SAFETY_ERROR", action: "sandbox.full.monthly.package", source_kind: "CALLBACK_QUERY", callback_data: "cfdi_sbx:full" });
  assert(body.errors.join(" | ").includes("absolute_path"));
  assert(!/\.xlsx|\.xml|\.pdf|\.zip/i.test(JSON.stringify(body)));
  return length;
});

check("rutas_hacia_respond_pasan_por_prepare", () => {
  const safeTargets = workflow.connections["Build Safe Action Summary"].main[0].map((item) => item.node);
  const immediateTargets = workflow.connections["Build Immediate Response"].main[0].map((item) => item.node);
  const prepareTargets = workflow.connections["Prepare Webhook JSON Body"].main[0].map((item) => item.node);
  assert(safeTargets.includes("Prepare Webhook JSON Body"));
  assert(immediateTargets.includes("Prepare Webhook JSON Body"));
  assert(!safeTargets.includes("Respond to Webhook"));
  assert(!immediateTargets.includes("Respond to Webhook"));
  assert.deepStrictEqual(prepareTargets, ["Respond to Webhook"]);
  return "prepare -> respond";
});

console.log("n8n webhook response contract");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

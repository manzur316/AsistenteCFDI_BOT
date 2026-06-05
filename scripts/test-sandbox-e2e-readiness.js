const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_sandbox_action_router.n8n.json");
const setupDocPath = path.join(root, "workflow", "CFDI_SANDBOX_ACTION_ROUTER_SETUP.md");
const buttonsDocPath = path.join(root, "workflow", "CFDI_SANDBOX_TELEGRAM_BUTTONS.md");
const e2eDocPath = path.join(root, "workflow", "CFDI_SANDBOX_E2E_TEST_PLAN.md");
const actionRunnerPath = path.join(root, "scripts", "run-sandbox-action.js");
const latestPath = path.join(root, "runtime", "action-results-sandbox", "latest.json");

const expectedCallbacks = [
  "cfdi_sbx:menu",
  "cfdi_sbx:report",
  "cfdi_sbx:package",
  "cfdi_sbx:excel",
  "cfdi_sbx:checklist",
  "cfdi_sbx:full",
  "cfdi_sbx:preflight",
  "cfdi_sbx:smoke_menu",
  "cfdi_sbx:smoke_create",
  "cfdi_sbx:smoke_download",
  "cfdi_sbx:smoke_cancel",
  "cfdi_sbx:cancel",
];

const expectedCommands = [
  "/sandbox_menu",
  "/sandbox_preflight",
  "/sandbox_report",
  "/sandbox_package",
  "/sandbox_excel",
  "/sandbox_checklist",
  "/sandbox_full_package",
  "/sandbox_smoke_create",
  "/sandbox_smoke_download",
  "/sandbox_smoke_cancel",
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

function readRequired(filePath) {
  assert(fs.existsSync(filePath), path.relative(root, filePath).replace(/\\/g, "/"));
  return fs.readFileSync(filePath, "utf8");
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  assert(node, `No encontre nodo ${name}`);
  return node;
}

function callbackValues(text) {
  const matches = [...text.matchAll(/callback_data:\s*'([^']+)'/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

function commandValues(text) {
  return expectedCommands.filter((command) => text.includes(command));
}

function sensitivePatterns() {
  return [
    /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/,
    /F-Api-Key\s*:\s*[A-Za-z0-9_-]{12,}/i,
    /F-Secret-Key\s*:\s*[A-Za-z0-9_-]{12,}/i,
    /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/i,
    /FACTURACOM_(?:API|SECRET)_KEY\s*=\s*[^\s"']+/i,
    /TELEGRAM_BOT_TOKEN\s*=\s*\d{6,}:[A-Za-z0-9_-]{20,}/i,
  ];
}

let workflowRaw = "";
let workflow = null;
let docsText = "";

check("workflow_exists", () => {
  workflowRaw = readRequired(workflowPath);
  workflow = JSON.parse(workflowRaw);
  return "workflow/cfdi_sandbox_action_router.n8n.json";
});

check("setup_doc_exists", () => {
  docsText += readRequired(setupDocPath);
  return "workflow/CFDI_SANDBOX_ACTION_ROUTER_SETUP.md";
});

check("buttons_doc_exists", () => {
  docsText += readRequired(buttonsDocPath);
  return "workflow/CFDI_SANDBOX_TELEGRAM_BUTTONS.md";
});

check("e2e_plan_exists", () => {
  const text = readRequired(e2eDocPath);
  docsText += text;
  assert(text.includes("/sandbox_menu"));
  assert(text.includes("cfdi_sbx:full"));
  assert(text.includes("No enviar XML/PDF"));
  return "workflow/CFDI_SANDBOX_E2E_TEST_PLAN.md";
});

check("action_runner_exists", () => {
  readRequired(actionRunnerPath);
  return "scripts/run-sandbox-action.js";
});

check("latest_json_ready_or_needs_runtime", () => {
  if (!fs.existsSync(latestPath)) return "NEEDS_RUNTIME";
  const parsed = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  assert.strictEqual(parsed.schema_version, "sandbox_action_result.v1");
  assert(["OK", "ERROR", "SKIPPED", "NEEDS_RUNTIME", "NEEDS_CONFIG"].includes(parsed.status), parsed.status);
  assert(Array.isArray(parsed.sensitive_findings), "sensitive_findings debe ser arreglo");
  return `${parsed.action}:${parsed.status}`;
});

check("env_local_not_printed_or_dumped", () => {
  const ownSource = fs.readFileSync(__filename, "utf8");
  assert(!/console\.(?:log|error)\(\s*process\.env/i.test(ownSource));
  assert(!/Object\.entries\(\s*process\.env/i.test(ownSource));
  assert(!/JSON\.stringify\(\s*process\.env/i.test(ownSource));
  assert(!/process\.env\[[^\]]+\]/.test(workflowRaw), "workflow no debe indexar env arbitrario");
  return "no env dump";
});

check("no_sensitive_values_in_docs_or_workflow", () => {
  const combined = `${workflowRaw}\n${docsText}`;
  for (const pattern of sensitivePatterns()) assert(!pattern.test(combined), pattern);
  return "clean";
});

check("no_production_url_in_workflow", () => {
  assert(!/https:\/\/api\.factura\.com/i.test(workflowRaw));
  assert(!/FACTURACOM_PRODUCTION|stampProduction|produccion real/i.test(workflowRaw));
  return "sandbox only";
});

check("callback_allowlist_present", () => {
  const values = callbackValues(workflowRaw);
  for (const callbackData of expectedCallbacks) assert(values.includes(callbackData), callbackData);
  for (const value of values) {
    assert(value.length <= 32, value);
    assert(/^cfdi_sbx:[a-z_]+$/.test(value), value);
    assert(!/RFC|UUID|UID|MXN|IVA|runtime|xml|pdf|zip|xlsx|key|secret|token|factura/i.test(value), value);
  }
  return `${values.length} callbacks`;
});

check("command_allowlist_present", () => {
  const values = commandValues(workflowRaw);
  assert.deepStrictEqual(values.sort(), expectedCommands.slice().sort());
  assert(workflowRaw.includes("ACTION_MAP"));
  assert(workflowRaw.includes("CALLBACK_ACTION_MAP"));
  assert(workflowRaw.includes("'node scripts/run-sandbox-action.js ' + requestedAction"));
  return `${values.length} commands`;
});

check("webhook_and_response_nodes_present", () => {
  assert(workflow, "workflow no cargado");
  const webhook = getNode(workflow, "Webhook Sandbox Action Router");
  const response = getNode(workflow, "Respond to Webhook");
  assert.strictEqual(webhook.type, "n8n-nodes-base.webhook");
  assert.strictEqual(webhook.parameters.path, "cfdi-sandbox-action-router");
  assert.strictEqual(response.type, "n8n-nodes-base.respondToWebhook");
  return "webhook + response";
});

check("no_file_send_nodes", () => {
  assert(!/sendDocument|sendPhoto|sendMediaGroup|binaryData|binaryProperty|multipart/i.test(workflowRaw));
  return "no attachments";
});

check("docs_include_manual_e2e_order", () => {
  assert(docsText.includes("Orden Recomendado Para Cerrar 6A"));
  assert(docsText.includes("callback desconocido") || docsText.includes("Callback desconocido"));
  assert(docsText.includes("chat no autorizado") || docsText.includes("Chat no autorizado"));
  return "manual checklist";
});

console.log("Sandbox E2E readiness");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

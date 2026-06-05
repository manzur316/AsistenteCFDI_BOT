const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ROLES,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-PAC-SBX-${role}`,
    telegram_chat_id: "CHAT-PAC-SBX",
    telegram_user_id: "TGUSER-PAC-SBX",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 7801,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 7801,
    chat_id: "CHAT-PAC-SBX",
    telegram_user_id: "TGUSER-PAC-SBX",
    message_id: String((extra.update_id || 7801) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-PAC-SBX",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => String(button.callback_data || ""))
    .filter(Boolean);
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert(!/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(text), "telegram token");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url");
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "provider header");
  assert(!/\.env|CSD|PRIVATE KEY|password|secret/i.test(text), "secret");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF-/i.test(text), "document content");
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(text), "file send");
}

function sandboxStdout(action, status = "OK", overrides = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action,
    status,
    ok: status === "OK",
    duration_ms: 123,
    artifacts: overrides.artifacts || [],
    warnings: overrides.warnings || [],
    errors: overrides.errors || [],
    sensitive_findings: overrides.sensitive_findings || [],
    output: overrides.output || {},
  });
}

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const buildSummaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("pac_sandbox_visible_solo_owner", () => {
  const owner = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.OWNER));
  const assistant = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.ASSISTANT_OPERATOR, { update_id: 7802 }));
  assert(callbacks(owner).includes("cfdi_nav:pac_sbx"));
  assert.strictEqual(assistant.action, "ACCESS_DENIED");
  return "owner_only";
});

check("pac_sandbox_console_muestra_proveedor_y_modo", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:pac_sbx", ROLES.OWNER, { update_id: 7803 }));
  const cb = callbacks(result);
  assert.strictEqual(result.action, "PRODUCT_PAC_SANDBOX_CONSOLE");
  assert(result.telegram_message.includes("Proveedor actual: Factura.com Sandbox"));
  assert(result.telegram_message.includes("Modo: usa Estado / preflight sandbox"));
  assert(result.telegram_message.includes("Factura.com Sandbox: CFDI de prueba. No es produccion fiscal real."));
  for (const required of ["cfdi_sbx:preflight", "cfdi_sbx:smoke_create", "cfdi_sbx:smoke_download", "cfdi_sbx:smoke_cancel", "cfdi_sbx:latest", "cfdi_sbx:audit", "cfdi_nav:admin"]) {
    assert(cb.includes(required), required);
  }
  return cb.join(",");
});

check("callbacks_pac_sandbox_seguros", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:pac_sbx", ROLES.OWNER, { update_id: 7804 }));
  for (const callbackData of callbacks(result)) {
    const validation = validateTelegramCallbackData(callbackData);
    assert(validation.ok, `${callbackData}: ${validation.errors.join(",")}`);
    assert(callbackData.length <= 32, callbackData);
  }
  return "safe";
});

check("usuario_normal_no_ejecuta_callback_manual", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:preflight", ROLES.ASSISTANT_OPERATOR, { update_id: 7805 }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.telegram_message, "Acceso no autorizado.");
  return result.action;
});

check("botones_mapean_action_layer_allowlisted", () => {
  const cases = {
    "cfdi_sbx:preflight": "sandbox.preflight",
    "cfdi_sbx:smoke_create": "sandbox.smoke.create",
    "cfdi_sbx:smoke_download": "sandbox.smoke.download",
    "cfdi_sbx:smoke_cancel": "sandbox.smoke.cancel",
    "cfdi_sbx:latest": "sandbox.latest.result",
    "cfdi_sbx:audit": "sandbox.audit.summary",
  };
  for (const [callbackData, expectedAction] of Object.entries(cases)) {
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.OWNER, { update_id: 7810 + Object.keys(cases).indexOf(callbackData) }));
    assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_REQUESTED", callbackData);
    assert.strictEqual(result.requested_sandbox_action, expectedAction);
    assert.strictEqual(result.should_execute_sandbox_action, true);
    assert(result.sandbox_execute_command.startsWith(`node scripts/run-sandbox-action.js ${expectedAction}`));
    assert(!/[;&|`$<>]/.test(result.sandbox_execute_command), result.sandbox_execute_command);
  }
  return "allowlisted";
});

check("workflow_tiene_execute_command_controlado", () => {
  const executeNode = getNode(workflow, "Execute PAC Sandbox Action");
  const ifNode = getNode(workflow, "Should Execute PAC Sandbox Action");
  assert.strictEqual(executeNode.type, "n8n-nodes-base.executeCommand");
  assert.strictEqual(executeNode.continueOnFail, true);
  assert.strictEqual(executeNode.parameters.command, "={{$json.sandbox_execute_command}}");
  assert.strictEqual(ifNode.type, "n8n-nodes-base.if");
  assert(workflow.connections["Should Execute PAC Sandbox Action"]);
  return "executeCommand";
});

check("resumen_stdout_ok_seguro", () => {
  const source = executeCode(handleCode, baseInput("cfdi_sbx:smoke_download", ROLES.OWNER, { update_id: 7820 }));
  const result = executeCode(
    buildSummaryCode,
    { stdout: sandboxStdout("sandbox.smoke.download", "OK", { artifacts: [{ key: "xml_path", path: "runtime/hidden/demo.xml" }, { key: "pdf_path", path: "runtime/hidden/demo.pdf" }] }) },
    () => [{ json: source }],
  );
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
  assert(result.telegram_message.includes("Modo: Sandbox habilitado"));
  assert(result.telegram_message.includes("XML/PDF sandbox: disponibles localmente"));
  assert(result.telegram_message.includes("Factura.com Sandbox: CFDI de prueba. No es produccion fiscal real."));
  assert(result.persistence_sql.includes("passthrough_b64"));
  assertNoSecrets(result);
  return result.sandbox_action_status;
});

check("resumen_stdout_needs_config_muestra_deshabilitado", () => {
  const source = executeCode(handleCode, baseInput("cfdi_sbx:preflight", ROLES.OWNER, { update_id: 7821 }));
  const result = executeCode(
    buildSummaryCode,
    { stdout: sandboxStdout("sandbox.preflight", "NEEDS_CONFIG", { warnings: ["FACTURACOM_SANDBOX_LIVE distinto de 1"] }) },
    () => [{ json: source }],
  );
  assert(result.telegram_message.includes("Modo: Sandbox deshabilitado o necesita configuracion local"));
  assertNoSecrets(result);
  return result.sandbox_action_status;
});

check("resumen_stdout_invalido_no_rompe", () => {
  const source = executeCode(handleCode, baseInput("cfdi_sbx:latest", ROLES.OWNER, { update_id: 7822 }));
  const result = executeCode(buildSummaryCode, { stdout: "not json" }, () => [{ json: source }]);
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
  assert.strictEqual(result.sandbox_action_status, "ERROR");
  assert(result.telegram_message.includes("No se pudo parsear JSON estable"));
  assertNoSecrets(result);
  return result.sandbox_action_status;
});

check("workflow_no_direct_provider_or_file_send", () => {
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|sendDocument|sendMediaGroup|sendPhoto|%PDF-|<\?xml/i.test(workflowText));
  assert(workflowText.includes("node scripts/run-sandbox-action.js"));
  assert(workflowText.includes("Factura.com Sandbox"));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

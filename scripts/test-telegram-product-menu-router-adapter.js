const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ROLES,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  renderTelegramMainMenu,
  renderTelegramSubmenu,
} = require("./lib/telegram-product-menu-renderer");

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

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-DEMO-${role}`,
    telegram_chat_id: "CHAT-DEMO-MENU",
    telegram_user_id: "TGUSER-DEMO-MENU",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function demoDraft(status = "PENDIENTE") {
  return {
    draft_id: `DRAFT-MENU-${status}`,
    chat_id: "CHAT-DEMO-MENU",
    update_id: 7301,
    message_original: "Privada Demo, revise camaras por 800 +IVA",
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: {
      id: "SVC-CCTV-001",
      concepto_factura: "SERVICIO DE DIAGNOSTICO Y REVISION DE SISTEMA CCTV",
      clave_prod_serv: "81111811",
      clave_unidad: "E48",
      unidad: "Unidad de servicio",
      familia: "CCTV",
      tipo: "SERVICIO",
      operacion: "SERVICIO",
    },
    top_3: [],
    telegram_message: "BORRADOR CFDI",
    client_id: "CLI-DEMO",
    client_snapshot: { display_name: "Cliente Demo" },
    amount: 800,
    tax_mode: "MAS_IVA",
    subtotal: 800,
    iva_amount: 128,
    isr_retention_amount: 0,
    iva_retention_amount: 0,
    total: 928,
  };
}

function baseInput(callbackData, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 7301,
    chat_id: "CHAT-DEMO-MENU",
    telegram_user_id: "TGUSER-DEMO-MENU",
    message_id: "7401",
    text: callbackData,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || [],
    tax_rules: [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [demoDraft("PENDIENTE"), demoDraft("APROBADO")],
    bot_state: {},
    today_summary: extra.today_summary || { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-MENU-DEMO",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
  };
}

function flattenCallbacks(payload) {
  return (payload.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => String(button.callback_data || ""))
    .filter(Boolean);
}

function hasUnsafeContent(value) {
  return /(?:rfc|uuid|uid|monto|amount|total|secret|password|api[_-]?key|\.env|csd|cert|xml|pdf|zip|xlsx|excel|runtime|[a-z]:[\\/]|[\\/])/i.test(String(value || ""));
}

function assertSafeCallback(callbackData) {
  const validation = validateTelegramCallbackData(callbackData);
  assert(validation.ok, `${callbackData} no es callback seguro: ${validation.errors.join(",")}`);
  assert(callbackData.length <= 32, `${callbackData} excede 32 caracteres`);
  assert(!hasUnsafeContent(callbackData), `${callbackData} contiene dato sensible`);
}

function assertConcreteResponse(result, callbackData) {
  assert(result.telegram_message && result.telegram_message.trim(), `${callbackData} no produjo mensaje`);
  assert.notStrictEqual(result.action, "CALLBACK_TOKEN_INVALID", `${callbackData} cayo como token invalido`);
  assert.notStrictEqual(result.action, "COMMAND_UNKNOWN", `${callbackData} cayo como comando desconocido`);
  assert.notStrictEqual(result.action, "IDLE_HELP", `${callbackData} cayo como ayuda generica`);
  assert(!/Comandos disponibles/.test(result.telegram_message) || callbackData === "cfdi_nav:help", `${callbackData} respondio ayuda generica`);
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

check("workflow_supports_product_nav_callbacks", () => {
  assert(handleCode.includes("PRODUCT_NAV_PREFIX"));
  assert(handleCode.includes("handleProductMenuCallback"));
  assert(handleCode.includes("cfdi_nav:new"));
  assert(handleCode.includes("cfdi_nav:acctpkg"));
  return "cfdi_nav";
});

check("assistant_visible_buttons_have_destinations", () => {
  const callbacks = flattenCallbacks(renderTelegramMainMenu(ROLES.ASSISTANT_OPERATOR));
  assert(callbacks.length >= 5);
  for (const callbackData of callbacks) {
    assertSafeCallback(callbackData);
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.ASSISTANT_OPERATOR, { update_id: 7310 + callbacks.indexOf(callbackData) }));
    assertConcreteResponse(result, callbackData);
    assert.notStrictEqual(result.action, "ACCESS_DENIED", `${callbackData} visible para assistant pero denegado`);
  }
  return callbacks.join(",");
});

check("owner_visible_buttons_have_destinations", () => {
  const callbacks = flattenCallbacks(renderTelegramMainMenu(ROLES.OWNER, { includeAdmin: true, includeSandbox: true }));
  assert(callbacks.includes("cfdi_nav:admin"));
  for (const callbackData of callbacks) {
    assertSafeCallback(callbackData);
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.OWNER, { update_id: 7320 + callbacks.indexOf(callbackData) }));
    assertConcreteResponse(result, callbackData);
    assert.notStrictEqual(result.action, "ACCESS_DENIED", `${callbackData} visible para owner pero denegado`);
  }
  return callbacks.join(",");
});

check("admin_sandbox_visible_only_for_owner", () => {
  const assistantCallbacks = flattenCallbacks(renderTelegramMainMenu(ROLES.ASSISTANT_OPERATOR, { includeAdmin: true, includeSandbox: true }));
  const ownerCallbacks = flattenCallbacks(renderTelegramMainMenu(ROLES.OWNER, { includeAdmin: true, includeSandbox: true }));
  assert(!assistantCallbacks.includes("cfdi_nav:admin"));
  assert(ownerCallbacks.includes("cfdi_nav:admin"));
  const result = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.ASSISTANT_OPERATOR, { update_id: 7330 }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  return "owner_only";
});

check("admin_sandbox_submenu_callbacks_are_explicit", () => {
  const callbacks = flattenCallbacks(renderTelegramSubmenu("admin_sandbox", ROLES.OWNER, { includeSandbox: true }));
  assert(callbacks.includes("cfdi_nav:pac_sbx"));
  assert(callbacks.includes("cfdi_nav:sbx_drafts"));
  assert(callbacks.includes("cfdi_sbx:full"));
  assert(callbacks.includes("cfdi_sbx:preflight"));
  assert(callbacks.includes("cfdi_sbx:smoke_create"));
  assert(callbacks.includes("cfdi_sbx:smoke_download"));
  assert(callbacks.includes("cfdi_sbx:smoke_cancel"));
  assert(callbacks.includes("cfdi_sbx:latest"));
  assert(callbacks.includes("cfdi_sbx:audit"));
  for (const callbackData of callbacks) {
    assertSafeCallback(callbackData);
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.OWNER, { update_id: 7340 + callbacks.indexOf(callbackData) }));
    assertConcreteResponse(result, callbackData);
    assert(!/CALLBACK_TOKEN_INVALID|COMMAND_UNKNOWN|IDLE_HELP/.test(result.action));
  }
  return callbacks.join(",");
});

check("minimum_required_routes_match_existing_actions", () => {
  const cases = [
    ["cfdi_nav:new", "INVOICE_WIZARD"],
    ["cfdi_nav:clients", "COMMAND_CLIENTES"],
    ["cfdi_nav:drafts", "COMMAND_PENDIENTES"],
    ["cfdi_nav:report", "COMMAND_RESUMEN"],
    ["cfdi_nav:status", "PRODUCT_STATUS"],
    ["cfdi_nav:help", "PRODUCT_HELP"],
  ];
  cases.forEach(([callbackData, expectedAction], index) => {
    const result = executeCode(handleCode, baseInput(callbackData, ROLES.OWNER, { update_id: 7350 + index }));
    assert.strictEqual(result.action, expectedAction, `${callbackData} => ${result.action}`);
  });
  return "routes_ok";
});

check("pending_actions_answer_explicitly", () => {
  const accountant = executeCode(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.OWNER, { update_id: 7360 }));
  const sandbox = executeCode(handleCode, baseInput("cfdi_sbx:full", ROLES.OWNER, { update_id: 7361 }));
  assert.strictEqual(accountant.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert.strictEqual(sandbox.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert(accountant.telegram_message.includes("Generando paquete contador sandbox."));
  assert.strictEqual(accountant.requested_sandbox_action, "sandbox.full.monthly.package");
  assert.strictEqual(accountant.should_execute_sandbox_action, true);
  assert(sandbox.telegram_message.includes("Factura.com Sandbox: CFDI de prueba. No es produccion fiscal real."));
  assert.strictEqual(sandbox.requested_sandbox_action, "sandbox.full.monthly.package");
  assert.strictEqual(sandbox.should_execute_sandbox_action, true);
  assert(accountant.sandbox_execute_command.includes("node scripts/run-sandbox-action.js sandbox.full.monthly.package"));
  assert(sandbox.sandbox_execute_command.includes("node scripts/run-sandbox-action.js sandbox.full.monthly.package"));
  return "accountant_package_and_sandbox_action";
});

check("accountant_package_owner_only", () => {
  const accountantReadonly = executeCode(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.ACCOUNTANT_READONLY, { update_id: 7362 }));
  const assistant = executeCode(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.ASSISTANT_OPERATOR, { update_id: 7363 }));
  assert.strictEqual(accountantReadonly.action, "ACCESS_DENIED");
  assert.strictEqual(assistant.action, "ACCESS_DENIED");
  assert.strictEqual(accountantReadonly.should_execute_sandbox_action, undefined);
  assert.strictEqual(assistant.should_execute_sandbox_action, undefined);
  return "owner_only";
});

check("unknown_product_callback_does_not_break", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:unknown", ROLES.OWNER, { update_id: 7370 }));
  assert.strictEqual(result.action, "PRODUCT_MENU_PENDING");
  assert(result.telegram_message.includes("Esta opcion todavia esta en preparacion."));
  return result.action;
});

check("callbacks_do_not_send_files_or_call_pac", () => {
  const forbidden = [
    "sendDocument",
    "sendMediaGroup",
    "sendPhoto",
    "downloadXml",
    "downloadPdf",
    "stampProduction",
    "stampProduction futuro",
    "production.factura",
    "https://api.factura.com",
    "F-Api-Key",
    "F-Secret-Key",
    "F-PLUGIN",
  ];
  for (const value of forbidden) {
    assert(!workflowText.includes(value), `workflow contiene ${value}`);
  }
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

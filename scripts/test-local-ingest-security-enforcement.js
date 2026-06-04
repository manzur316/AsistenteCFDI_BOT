const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const seedPath = path.join(root, "sql", "006_seed_authorized_user.example.sql");
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

function executeCode(code, input, config = {}) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath,
        runnerSecret: "TEST_SECRET",
        ...config,
      },
    },
  };
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeContext, () => [], 0);
}

function executeHandler(code, input) {
  return executeCode(code, input)[0].json;
}

function makeWebhookInput(update, secret = "TEST_SECRET") {
  return { headers: { "x-cfdi-runner-secret": secret }, body: update };
}

function authorizedUser(role, overrides = {}) {
  return {
    user_id: `USER-DEMO-${role}`,
    telegram_chat_id: "CHAT-DEMO-SECURITY",
    telegram_user_id: "TGUSER-DEMO-SECURITY",
    display_name: "Usuario Demo",
    role,
    enabled: true,
    ...overrides,
  };
}

function concept() {
  return {
    id: "SVC-CCTV-001",
    concepto_factura: "SERVICIO DE DIAGNOSTICO Y REVISION DE SISTEMA DE VIDEOVIGILANCIA CCTV",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    familia: "CCTV",
    tipo: "SERVICIO",
    operacion: "SERVICIO",
  };
}

function previewState(blockers = []) {
  const selectedConcept = concept();
  const ctx = {
    draft_id: "DRAFT-SECURITY-DEMO",
    original_text: "Privada Demo, revise camaras por 800 +IVA",
    client: {
      client_id: "CLI-DEMO-SECURITY",
      display_name: "Cliente Demo",
      rfc: "XAXX010101000",
      tipo_persona: "MORAL",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "00000",
      tax_profile: "PM_GENERAL",
      validated_by_human: true,
    },
    client_query: "Cliente Demo",
    client_confirmed: true,
    work_text: "revise camaras",
    amount: 800,
    tax_mode: "MAS_IVA",
    concept: selectedConcept,
    top_3: [],
    calc: { subtotal: 800, iva_amount: 128, isr_retention_amount: 0, iva_retention_amount: 0, total: 928 },
    tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
    line_items: [],
    blockers,
    preview_draft: {
      draft_id: "DRAFT-SECURITY-DEMO",
      chat_id: "CHAT-DEMO-SECURITY",
      update_id: 6201,
      message_original: "Privada Demo, revise camaras por 800 +IVA",
      status: "PENDIENTE",
      action: "SUGERIR",
      ready_to_copy: true,
      requires_human_review: true,
      concept: selectedConcept,
      top_3: [],
      telegram_message: "BORRADOR CFDI",
    },
  };
  return {
    state: "PREVIEW_READY",
    original_text: ctx.original_text,
    context: { pending_invoice_context: ctx },
  };
}

function baseInput(text, extra = {}) {
  const user = Object.prototype.hasOwnProperty.call(extra, "authorized_user")
    ? extra.authorized_user
    : authorizedUser("OWNER");
  const securityAllowed = Object.prototype.hasOwnProperty.call(extra, "security_allowed")
    ? extra.security_allowed
    : Boolean(user && user.enabled === true);
  return {
    update_id: extra.update_id || 6201,
    chat_id: extra.chat_id || "CHAT-DEMO-SECURITY",
    telegram_user_id: extra.telegram_user_id || "TGUSER-DEMO-SECURITY",
    message_id: String((extra.update_id || 6201) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || [],
    tax_rules: extra.tax_rules || [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: user,
    security_user_id: user?.user_id || "",
    security_role: user?.role || "",
    security_allowed: securityAllowed,
    security_enforcement: true,
  };
}

function callbackInput(extra = {}) {
  return baseInput("cfdi:TOKENDEMO1234", {
    update_id: extra.update_id || 6301,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-DEMO",
    callback_message_id: "99",
    chat_state: previewState(),
    authorized_user: extra.authorized_user,
    security_allowed: extra.security_allowed,
    action_token: extra.action_token ?? null,
  });
}

function assertDenied(result) {
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.telegram_message, "Acceso no autorizado.");
  assert.strictEqual(result.should_send_telegram, true);
  assert(result.persistence_sql.includes("INSERT INTO cfdi_security_events"));
  assert(!result.persistence_sql.includes("INSERT INTO cfdi_drafts"));
  assert(!result.persistence_sql.includes("INSERT INTO cfdi_action_tokens"));
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
const extractCode = getNode(workflow, "Extract Local Ingest Update").parameters.jsCode;
const buildLoadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const seedSql = fs.readFileSync(seedPath, "utf8");

check("extract_message_captures_telegram_user_id", () => {
  const result = executeCode(extractCode, makeWebhookInput({
    update_id: 6101,
    message: {
      message_id: 11,
      from: { id: "TGUSER-DEMO-SECURITY" },
      chat: { id: "CHAT-DEMO-SECURITY" },
      text: "/factura",
    },
  }))[0].json;
  assert.strictEqual(result.telegram_user_id, "TGUSER-DEMO-SECURITY");
  assert(result.insert_update_sql.includes("telegram_user_id"));
  return result.telegram_user_id;
});

check("extract_callback_captures_telegram_user_id", () => {
  const result = executeCode(extractCode, makeWebhookInput({
    update_id: 6102,
    callback_query: {
      id: "CALLBACK-DEMO",
      from: { id: "TGUSER-DEMO-SECURITY" },
      data: "cfdi:TOKENDEMO1234",
      message: { message_id: 12, chat: { id: "CHAT-DEMO-SECURITY" } },
    },
  }))[0].json;
  assert.strictEqual(result.telegram_user_id, "TGUSER-DEMO-SECURITY");
  assert.strictEqual(result.source_kind, "CALLBACK_QUERY");
  return result.source_kind;
});

check("build_load_context_loads_authorized_user", () => {
  const result = executeCode(buildLoadCode, baseInput("/factura"))[0].json;
  const sql = result.load_context_sql;
  assert(sql.includes("cfdi_authorized_users"));
  assert(sql.includes("authorized_user"));
  assert(sql.includes("security_allowed"));
  assert(sql.includes("security_enforcement"));
  assert(sql.includes("telegram_user_id"));
  assert(sql.includes("au.enabled = true"));
  assert(sql.includes("au.telegram_chat_id"));
  assert(sql.includes("au.telegram_user_id"));
  return "authorized_user/security_allowed";
});

check("build_load_context_does_not_load_action_token_when_unauthorized", () => {
  const result = executeCode(buildLoadCode, baseInput("cfdi:TOKENDEMO1234", {
    source_kind: "CALLBACK_QUERY",
    authorized_user: null,
    security_allowed: false,
  }))[0].json;
  assert(result.load_context_sql.includes("cfdi_action_tokens"));
  assert(result.load_context_sql.includes("EXISTS (SELECT 1 FROM cfdi_authorized_users"));
  return "action token guarded";
});

check("mensaje_usuario_no_autorizado_access_denied", () => {
  const result = executeHandler(handleCode, baseInput("revisé cámaras hikvision sin imagen", {
    authorized_user: null,
    security_allowed: false,
  }));
  assertDenied(result);
  assert.strictEqual(result.text, "");
  return result.action;
});

check("callback_usuario_no_autorizado_access_denied", () => {
  const result = executeHandler(handleCode, callbackInput({
    authorized_user: null,
    security_allowed: false,
    action_token: {
      token: "TOKENDEMO1234",
      chat_id: "CHAT-DEMO-SECURITY",
      action: "CONFIRM",
      expires_at: "2099-01-01T00:00:00.000Z",
      used_at: null,
      payload: {},
    },
  }));
  assertDenied(result);
  assert(!result.persistence_sql.includes("UPDATE cfdi_action_tokens SET used_at"));
  return result.action;
});

check("usuario_disabled_access_denied", () => {
  const result = executeHandler(handleCode, baseInput("/factura", {
    authorized_user: authorizedUser("OWNER", { enabled: false }),
    security_allowed: true,
  }));
  assertDenied(result);
  assert.strictEqual(result.json_debug.security_reason, "usuario deshabilitado");
  return result.json_debug.security_reason;
});

check("owner_puede_factura", () => {
  const result = executeHandler(handleCode, baseInput("/factura", { authorized_user: authorizedUser("OWNER") }));
  assert.strictEqual(result.action, "INVOICE_WIZARD");
  assert(!result.persistence_sql.includes("cfdi_security_events"));
  return result.action;
});

check("owner_puede_confirmar", () => {
  const result = executeHandler(handleCode, baseInput("confirmar", {
    authorized_user: authorizedUser("OWNER"),
    chat_state: previewState(),
  }));
  assert.strictEqual(result.action, "DRAFT_CONFIRMED");
  assert(result.persistence_sql.includes("INSERT INTO cfdi_drafts"));
  return result.action;
});

check("assistant_operator_puede_crear_confirmar_cancelar", () => {
  const user = authorizedUser("ASSISTANT_OPERATOR");
  const create = executeHandler(handleCode, baseInput("/factura", { authorized_user: user }));
  const confirm = executeHandler(handleCode, baseInput("confirmar", { update_id: 6202, authorized_user: user, chat_state: previewState() }));
  const cancel = executeHandler(handleCode, baseInput("cancelar", { update_id: 6203, authorized_user: user, chat_state: previewState() }));
  assert.strictEqual(create.action, "INVOICE_WIZARD");
  assert.strictEqual(confirm.action, "DRAFT_CONFIRMED");
  assert(["CANCELLED", "COMMAND_CANCELAR"].includes(cancel.action));
  return [create.action, confirm.action, cancel.action].join("/");
});

check("assistant_operator_no_puede_configure_pac", () => {
  const result = executeHandler(handleCode, baseInput("/configurarpac", {
    authorized_user: authorizedUser("ASSISTANT_OPERATOR"),
  }));
  assertDenied(result);
  assert.strictEqual(result.json_debug.security_reason, "rol_sin_permiso");
  assert.strictEqual(result.json_debug.security_action, "CONFIGURE_PAC");
  return result.json_debug.security_action;
});

check("assistant_operator_no_puede_view_bank_statements", () => {
  const result = executeHandler(handleCode, baseInput("/bancos", {
    authorized_user: authorizedUser("ASSISTANT_OPERATOR"),
  }));
  assertDenied(result);
  assert.strictEqual(result.json_debug.security_action, "VIEW_BANK_STATEMENTS");
  return result.json_debug.security_action;
});

check("accountant_readonly_no_puede_crear_confirmar_cancelar", () => {
  const user = authorizedUser("ACCOUNTANT_READONLY");
  const create = executeHandler(handleCode, baseInput("/factura", { authorized_user: user }));
  const confirm = executeHandler(handleCode, baseInput("confirmar", { update_id: 6204, authorized_user: user, chat_state: previewState() }));
  const cancel = executeHandler(handleCode, baseInput("cancelar", { update_id: 6205, authorized_user: user, chat_state: previewState() }));
  [create, confirm, cancel].forEach(assertDenied);
  assert.strictEqual(create.json_debug.security_action, "CREATE_DRAFT");
  assert.strictEqual(confirm.json_debug.security_action, "CONFIRM_DRAFT");
  assert.strictEqual(cancel.json_debug.security_action, "CANCEL_DRAFT");
  return "blocked";
});

check("accountant_readonly_puede_view_reports", () => {
  const result = executeHandler(handleCode, baseInput("/pendientes", {
    authorized_user: authorizedUser("ACCOUNTANT_READONLY"),
  }));
  assert.strictEqual(result.action, "COMMAND_PENDIENTES");
  return result.action;
});

check("stamp_production_bloqueado_para_todos", () => {
  for (const role of ["OWNER", "ASSISTANT_OPERATOR", "ACCOUNTANT_READONLY", "ADMIN_FUTURE"]) {
    const result = executeHandler(handleCode, baseInput("/timbrarproduccion", {
      update_id: 6400 + role.length,
      authorized_user: authorizedUser(role),
      security_allowed: true,
    }));
    assertDenied(result);
    assert.strictEqual(result.json_debug.security_reason, "produccion_bloqueada_por_ahora", role);
  }
  return "blocked";
});

check("access_denied_no_crea_drafts_tokens_scoring", () => {
  const result = executeHandler(handleCode, baseInput("Privada Demo AAA010101AAA, revise camaras por 800 +IVA", {
    authorized_user: null,
    security_allowed: false,
  }));
  assertDenied(result);
  assert(!result.persistence_sql.includes("runManualScoring"));
  assert(!result.persistence_sql.includes("SVC-CCTV-001"));
  return "no draft/token";
});

check("callback_denegado_no_marca_token_used_at", () => {
  const result = executeHandler(handleCode, callbackInput({
    authorized_user: null,
    security_allowed: false,
    action_token: null,
  }));
  assertDenied(result);
  assert(!result.persistence_sql.includes("used_at"));
  return "no used_at";
});

check("security_event_sanitizado", () => {
  const result = executeHandler(handleCode, baseInput("/configurarpac AAA010101AAA token=123456:ABCDEFabcdefABCDEFabcdef", {
    authorized_user: null,
    security_allowed: false,
  }));
  assertDenied(result);
  assert(!result.persistence_sql.includes("AAA010101AAA"));
  assert(!result.persistence_sql.includes("123456:ABCDEF"));
  assert(result.persistence_sql.includes("ACCESS_DENIED"));
  return "sanitized";
});

check("callback_data_sigue_sin_datos_fiscales", () => {
  assert(!/DRAFT|CLI-|AAA010101AAA|81111811|Privada|Rivera|concept|clave|monto|total/i.test("cfdi:TOKENDEMO1234"));
  assert(workflowText.includes("ACTION_TOKEN_CALLBACK_PREFIX = 'cfdi:'"));
  return "cfdi:<token>";
});

check("seed_example_only_placeholders", () => {
  assert(seedSql.includes("REEMPLAZAR_USER_ID"));
  assert(seedSql.includes("REEMPLAZAR_TELEGRAM_CHAT_ID"));
  assert(seedSql.includes("REEMPLAZAR_TELEGRAM_USER_ID"));
  assert(!/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(seedSql));
  assert(!/\b-?\d{8,}\b/.test(seedSql.replace(/00000/g, "")));
  return "placeholders";
});

console.log("Local ingest security enforcement");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const passed = checks.filter((item) => item.pass).length;
console.log(`PASS TOTAL: ${passed}/${checks.length}`);
if (passed !== checks.length) process.exit(1);

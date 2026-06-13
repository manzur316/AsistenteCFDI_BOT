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

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-7-10B-${role}`,
    telegram_chat_id: "CHAT-7-10B",
    telegram_user_id: "TGUSER-7-10B",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 10101,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 10101,
    chat_id: "CHAT-7-10B",
    telegram_user_id: "TGUSER-7-10B",
    message_id: String((extra.update_id || 10101) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-7-10B-${extra.update_id || 10101}`,
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

function draft(status, draftId, clientName, total = 1160) {
  return {
    draft_id: draftId,
    status,
    chat_id: "CHAT-7-10B",
    total,
    ready_to_copy: true,
    requires_human_review: true,
    blockers: [],
    client_snapshot: {
      client_id: `CLIENT-${draftId}`,
      display_name: clientName,
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA CCTV",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
    },
  };
}

function actionToken(token, draftId) {
  return {
    token,
    chat_id: "CHAT-7-10B",
    draft_id: draftId,
    action: "STAMP_DRAFT_SANDBOX",
    payload: { draft_id: draftId, state: "PAC_SANDBOX_DRAFT_SELECTION" },
    used_at: null,
    expires_at: "2099-01-01T00:00:00.000Z",
  };
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => ({ text: String(button.text || ""), callback_data: String(button.callback_data || "") }))
    .filter((button) => button.callback_data);
}

function callbackDataList(result) {
  return callbacks(result).map((button) => button.callback_data);
}

function stampCallbacks(result) {
  return callbacks(result).filter((button) => button.text.includes("Timbrar sandbox"));
}

function assertSafeCallbacks(result) {
  for (const button of callbacks(result)) {
    const validation = validateTelegramCallbackData(button.callback_data);
    assert(validation.ok, `${button.callback_data}: ${validation.errors.join(",")}`);
    assert(button.callback_data.length <= 32, `${button.text}: ${button.callback_data}`);
    assert(!/DRAFT-|CLIENT-|RFC|UUID|UID|TOTAL|MONTO|\d+\.\d{2}|[A-Za-z]:[\\/]|runtime/i.test(button.callback_data), button.callback_data);
  }
}

function assertNoSensitiveWorkflowText(text) {
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production url");
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "provider header");
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(text), "file send");
  assert(!/%PDF-|<\?xml|<cfdi:Comprobante/i.test(text), "document content");
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

check("workflow_json_valido", () => {
  assert(workflow.nodes.length > 0);
  new Function("require", "$json", "$node", "$items", "$itemIndex", handleCode);
  return `${workflow.nodes.length} nodes`;
});

check("clientes_menu_sin_ver_clientes_redundante", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:clients", ROLES.OWNER, { update_id: 10110 }));
  const data = callbackDataList(result);
  const labels = callbacks(result).map((button) => button.text);
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(!labels.includes("Ver clientes"), labels.join(","));
  assert(!data.includes("cfdi_nav:clients"), data.join(","));
  assert(data.includes("cfdi_nav:client_find"));
  assert(data.includes("cfdi_nav:client_new"));
  assert(data.includes("cfdi_nav:menu"));
  assert(!data.includes("cfdi_nav:client_ledger"));
  assert(!data.includes("cfdi_nav:pay_paid"));
  assert(!data.includes("cfdi_nav:pay_cancel"));
  assertSafeCallbacks(result);
  return data.join(",");
});

check("pac_sandbox_separa_smoke_y_borradores", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:pac_sbx", ROLES.OWNER, { update_id: 10120 }));
  const text = result.telegram_message;
  const data = callbackDataList(result);
  assert.strictEqual(result.action, "PRODUCT_PAC_SANDBOX_CONSOLE");
  assert(text.includes("Proveedor / pruebas tecnicas"));
  assert(text.includes("Borradores listos para timbrado sandbox"));
  assert(text.includes("Smoke tecnico no usa borradores reales"));
  assert(!text.includes("Timbrar CFDI sandbox"));
  assert(data.includes("cfdi_nav:sbx_drafts"));
  assert(data.includes("cfdi_sbx:smoke_menu"));
  assert(callbacks(result).some((button) => button.text === "Smoke tests"));
  assertSafeCallbacks(result);
  return data.join(",");
});

check("usuario_normal_no_ve_ni_ejecuta_pac_sandbox", () => {
  const admin = executeCode(handleCode, baseInput("cfdi_nav:admin", ROLES.ASSISTANT_OPERATOR, { update_id: 10130 }));
  const drafts = executeCode(handleCode, baseInput("cfdi_nav:sbx_drafts", ROLES.ASSISTANT_OPERATOR, { update_id: 10131 }));
  assert.strictEqual(admin.action, "ACCESS_DENIED");
  assert.strictEqual(drafts.action, "ACCESS_DENIED");
  return "owner_only";
});

check("lista_vacia_de_aprobados_responde_explicito", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:sbx_drafts", ROLES.OWNER, { update_id: 10140, recent_drafts: [] }));
  assert.strictEqual(result.action, "PAC_SANDBOX_DRAFT_SELECTION_EMPTY");
  assert(result.telegram_message.includes("No hay borradores listos para timbrado sandbox."));
  assertSafeCallbacks(result);
  return result.action;
});

check("lista_solo_borradores_aprobado_para_timbrar", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:sbx_drafts", ROLES.OWNER, {
    update_id: 10150,
    recent_drafts: [
      draft("APROBADO", "DRAFT-READY-1", "Cliente Seguro", 1160),
      draft("PENDIENTE", "DRAFT-PENDING-1", "Cliente Pendiente", 580),
      draft("BORRADOR", "DRAFT-BORRADOR-1", "Cliente Borrador", 700),
      draft("SANDBOX_TIMBRADO", "DRAFT-STAMPED-1", "Cliente Timbrado", 100),
      draft("SANDBOX_CANCELADO", "DRAFT-CANCELLED-1", "Cliente Cancelado", 200),
    ],
  }));
  assert.strictEqual(result.action, "PAC_SANDBOX_DRAFT_SELECTION");
  assert(result.telegram_message.includes("Cliente Seguro"));
  assert(result.telegram_message.includes("1160.00"));
  assert(result.telegram_message.includes("APROBADO"));
  assert(!result.telegram_message.includes("Cliente Pendiente"));
  assert(!result.telegram_message.includes("Cliente Borrador"));
  assert(!result.telegram_message.includes("Cliente Timbrado"));
  assert(!result.telegram_message.includes("Cliente Cancelado"));
  const stamps = stampCallbacks(result);
  assert.strictEqual(stamps.length, 1);
  assert(stamps[0].callback_data.startsWith("cfdi:"), stamps[0].callback_data);
  assert(result.persistence_sql.includes("'STAMP_DRAFT_SANDBOX'"));
  assert(!stamps[0].callback_data.includes("DRAFT-READY-1"));
  assertSafeCallbacks(result);
  return stamps[0].callback_data;
});

check("smoke_create_queda_etiquetado_como_fixture", () => {
  const result = executeCode(handleCode, baseInput("cfdi_sbx:smoke_create", ROLES.OWNER, { update_id: 10160 }));
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.smoke.create");
  assert(result.telegram_message.includes("Tipo: Smoke tecnico / fixture del proveedor"));
  assert(!result.telegram_message.includes("borrador aprobado real"));
  return result.requested_sandbox_action;
});

check("callback_real_de_timbrado_usa_sandbox_draft_stamp", () => {
  const token = "TOKEN710BSTAMP";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 10170,
    action_token: actionToken(token, "DRAFT-READY-1"),
    recent_drafts: [draft("APROBADO", "DRAFT-READY-1", "Cliente Seguro", 1160)],
  }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.stamp");
  assert(result.sandbox_execute_command.startsWith("node scripts/run-sandbox-action.js sandbox.draft.stamp"));
  assert(!result.sandbox_execute_command.includes("sandbox.smoke.create"));
  assert.strictEqual(result.callback_ack_text, "Procesando timbrado sandbox...");
  assert(result.telegram_message.includes("Ejecutando timbrado sandbox para borrador aprobado."));
  return result.requested_sandbox_action;
});

check("callback_en_proceso_responde_minimo", () => {
  const token = "TOKEN710BINPROG";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 10180,
    action_token: actionToken(token, "DRAFT-READY-1"),
    recent_drafts: [draft("SANDBOX_TIMBRANDO", "DRAFT-READY-1", "Cliente Seguro", 1160)],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya en proceso.");
  assert(result.telegram_message.includes("Esta accion ya esta en proceso."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  assert(result.reply_markup);
  assert(Array.isArray(result.reply_markup.inline_keyboard));
  return result.telegram_message.replace(/\n/g, " ");
});

check("callback_ya_procesado_responde_minimo", () => {
  const token = "TOKEN710BDONE";
  const result = executeCode(handleCode, baseInput(`cfdi:${token}`, ROLES.OWNER, {
    update_id: 10190,
    action_token: actionToken(token, "DRAFT-READY-1"),
    recent_drafts: [draft("SANDBOX_TIMBRADO", "DRAFT-READY-1", "Cliente Seguro", 1160)],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya ejecutada.");
  assert(result.telegram_message.includes("Esta accion ya fue procesada."));
  assert(result.telegram_message.includes("No se ejecuto de nuevo."));
  assert(result.reply_markup);
  assert(Array.isArray(result.reply_markup.inline_keyboard));
  return result.telegram_message.replace(/\n/g, " ");
});

check("workflow_sin_pac_productivo_ni_archivos_por_telegram", () => {
  assertNoSensitiveWorkflowText(workflowText);
  assert(workflowText.includes("sandbox.draft.stamp"));
  assert(workflowText.includes("sandbox.smoke.create"));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

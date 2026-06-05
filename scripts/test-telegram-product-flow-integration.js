const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const chatId = "CHAT-DEMO-FLOW";

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

function authorizedUser(role = "OWNER") {
  return {
    user_id: `USER-DEMO-${role}`,
    telegram_chat_id: chatId,
    telegram_user_id: "TGUSER-DEMO-FLOW",
    display_name: "Usuario Demo",
    role,
    enabled: true,
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

function draft(status = "PENDIENTE") {
  return {
    draft_id: `DRAFT-FLOW-${status}`,
    chat_id: chatId,
    update_id: 7601,
    message_original: "Privada Demo, revise camaras por 800 +IVA",
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: concept(),
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
    tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
    tax_review_required: true,
  };
}

function previewState(blockers = []) {
  const ctx = {
    draft_id: "DRAFT-FLOW-PREVIEW",
    original_text: "Privada Demo, revise camaras por 800 +IVA",
    client: {
      client_id: "CLI-DEMO",
      display_name: "Cliente Demo",
      tipo_persona: "MORAL",
      tax_profile: "PM_GENERAL",
      validated_by_human: true,
    },
    client_query: "Cliente Demo",
    client_confirmed: true,
    work_text: "revise camaras",
    amount: 800,
    tax_mode: "MAS_IVA",
    concept: concept(),
    top_3: [],
    calc: {
      subtotal: 800,
      iva_amount: 128,
      isr_retention_amount: 0,
      iva_retention_amount: 0,
      total: 928,
    },
    tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
    line_items: [],
    blockers,
    preview_draft: draft("PENDIENTE"),
  };
  ctx.preview_draft.draft_id = "DRAFT-FLOW-PREVIEW";
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
  return {
    update_id: extra.update_id || 7601,
    chat_id: chatId,
    telegram_user_id: "TGUSER-DEMO-FLOW",
    message_id: String((extra.update_id || 7601) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || [],
    tax_rules: [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [draft("PENDIENTE"), draft("APROBADO")],
    bot_state: {},
    today_summary: extra.today_summary || { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: user,
    security_user_id: user?.user_id || "",
    security_role: user?.role || "",
    security_allowed: user?.enabled === true,
    security_enforcement: true,
  };
}

function callbackInput(callbackData, role = "OWNER", extra = {}) {
  return baseInput(callbackData, {
    ...extra,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-FLOW",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: authorizedUser(role),
  });
}

function actionTokenInput(token, action, extra = {}) {
  return callbackInput(`cfdi:${token}`, "OWNER", {
    ...extra,
    action_token: {
      token,
      chat_id: chatId,
      action,
      draft_id: extra.draft_id || null,
      payload: extra.payload || {},
      expires_at: "2999-01-01T00:00:00.000Z",
      used_at: null,
    },
  });
}

function flattenButtons(result) {
  return result.reply_markup?.inline_keyboard?.flat() || [];
}

function callbackDataList(result) {
  return flattenButtons(result).map((button) => String(button.callback_data || ""));
}

function assertNoSensitiveText(text) {
  assert(!/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/.test(text), "contiene token");
  assert(!/[A-Z]:[\\/]/i.test(text), "contiene ruta absoluta");
  assert(!/\.env|csd|secret|password|api[_-]?key/i.test(text), "contiene secreto");
  assert(!/\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b/i.test(text), "contiene RFC");
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

check("start_muestra_menu_producto", () => {
  const result = executeCode(handleCode, baseInput("/start"));
  const callbacks = callbackDataList(result);
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
  assert(callbacks.includes("cfdi_nav:new"));
  assert(callbacks.includes("cfdi_nav:clients"));
  assert(callbacks.includes("cfdi_nav:drafts"));
  assert(callbacks.includes("cfdi_nav:status"));
  return callbacks.join(",");
});

check("help_muestra_ayuda_contextual_producto", () => {
  const result = executeCode(handleCode, baseInput("/help", { update_id: 7602 }));
  assert.strictEqual(result.action, "PRODUCT_HELP");
  assert(result.telegram_message.includes("Los botones son el camino recomendado."));
  assert(!result.telegram_message.includes("Comandos disponibles:"));
  return result.action;
});

check("menu_principal_navega_a_secciones", () => {
  const cases = {
    "cfdi_nav:new": "INVOICE_WIZARD",
    "cfdi_nav:clients": "COMMAND_CLIENTES",
    "cfdi_nav:drafts": "COMMAND_PENDIENTES",
    "cfdi_nav:report": "COMMAND_RESUMEN",
    "cfdi_nav:status": "PRODUCT_STATUS",
    "cfdi_nav:help": "PRODUCT_HELP",
  };
  for (const [callbackData, expectedAction] of Object.entries(cases)) {
    const result = executeCode(handleCode, callbackInput(callbackData, "OWNER", { update_id: 7610 + Object.keys(cases).indexOf(callbackData) }));
    assert.strictEqual(result.action, expectedAction, `${callbackData} => ${result.action}`);
    assert(result.telegram_message && result.telegram_message.trim());
  }
  return "routes_ok";
});

check("clientes_muestra_opciones_claras", () => {
  const result = executeCode(handleCode, callbackInput("cfdi_nav:clients", "OWNER", { update_id: 7620 }));
  const callbacks = callbackDataList(result);
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(callbacks.includes("cfdi_nav:clients"));
  assert(callbacks.includes("cfdi_nav:client_find"));
  assert(callbacks.includes("cfdi_nav:client_new"));
  assert(callbacks.includes("cfdi_nav:client_validate"));
  assert(callbacks.includes("cfdi_nav:menu"));
  return callbacks.join(",");
});

check("usuario_normal_no_ve_ni_ejecuta_admin_sandbox", () => {
  const start = executeCode(handleCode, baseInput("/start", {
    update_id: 7630,
    authorized_user: authorizedUser("ASSISTANT_OPERATOR"),
  }));
  const callbacks = callbackDataList(start);
  assert(!callbacks.includes("cfdi_nav:admin"));
  assert(!callbacks.some((value) => value.startsWith("cfdi_sbx:")));
  const denied = executeCode(handleCode, callbackInput("cfdi_nav:admin", "ASSISTANT_OPERATOR", { update_id: 7631 }));
  assert.strictEqual(denied.action, "ACCESS_DENIED");
  return "blocked";
});

check("owner_ve_admin_sandbox_y_aclara_no_produccion", () => {
  const result = executeCode(handleCode, callbackInput("cfdi_nav:admin", "OWNER", { update_id: 7640 }));
  const callbacks = callbackDataList(result);
  assert.strictEqual(result.action, "PRODUCT_ADMIN_SANDBOX");
  assert(callbacks.includes("cfdi_nav:pac_sbx"));
  assert(callbacks.includes("cfdi_sbx:full"));
  assert(result.telegram_message.includes("Factura.com Sandbox: CFDI de prueba. No es produccion fiscal real."));
  return callbacks.join(",");
});

check("confirmar_borrador_responde_con_feedback_y_menu", () => {
  const result = executeCode(handleCode, actionTokenInput("TOKENCONFIRM74", "CONFIRM", {
    update_id: 7650,
    chat_state: previewState(),
  }));
  const callbacks = callbackDataList(result);
  assert.strictEqual(result.action, "DRAFT_CONFIRMED");
  assert(result.telegram_message.includes("Borrador guardado"));
  assert(result.telegram_message.includes("Estado actual:"));
  assert(callbacks.some((value) => value.startsWith("cfdi:")));
  return result.action;
});

check("regresar_aprobado_a_borrador_responde_con_feedback", () => {
  const approved = draft("APROBADO");
  const result = executeCode(handleCode, actionTokenInput("TOKENRESTORE74", "RESTORE_DRAFT", {
    update_id: 7660,
    draft_id: approved.draft_id,
    payload: { draft_id: approved.draft_id },
    recent_drafts: [approved],
  }));
  assert.strictEqual(result.action, "COMMAND_REGRESAR_BORRADOR");
  assert(result.telegram_message.includes("Borrador regresado a borrador"));
  assert(result.persistence_sql.includes("UPDATE cfdi_drafts SET status = 'PENDIENTE'"));
  return result.action;
});

check("resumen_sin_datos_responde_explicito", () => {
  const result = executeCode(handleCode, callbackInput("cfdi_nav:report", "OWNER", {
    update_id: 7670,
    recent_drafts: [],
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  }));
  assert.strictEqual(result.action, "COMMAND_RESUMEN");
  assert(result.telegram_message.includes("No hay datos suficientes para mostrar resumen mensual."));
  return result.action;
});

check("estado_sistema_seguro_sin_secretos", () => {
  const result = executeCode(handleCode, callbackInput("cfdi_nav:status", "OWNER", { update_id: 7680 }));
  assert.strictEqual(result.action, "PRODUCT_STATUS");
  assert(result.telegram_message.includes("bot: activo"));
  assert(result.telegram_message.includes("base: conectada"));
  assert(result.telegram_message.includes("usuario_autorizado: si"));
  assert(result.telegram_message.includes("modo: local/sandbox"));
  assert(result.telegram_message.includes("produccion: bloqueada"));
  assertNoSensitiveText(result.telegram_message);
  return "safe";
});

check("ningun_boton_visible_queda_sin_respuesta", () => {
  const start = executeCode(handleCode, baseInput("/start", { update_id: 7690 }));
  const callbacks = callbackDataList(start);
  for (const callbackData of callbacks) {
    const result = executeCode(handleCode, callbackInput(callbackData, "OWNER", { update_id: 7691 + callbacks.indexOf(callbackData) }));
    assert(result.telegram_message && result.telegram_message.trim(), `${callbackData} sin mensaje`);
    assert.notStrictEqual(result.action, "CALLBACK_TOKEN_INVALID", callbackData);
    assert.notStrictEqual(result.action, "IDLE_HELP", callbackData);
  }
  return callbacks.length;
});

check("workflow_no_documentos_ni_produccion_por_telegram", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto|sendVideo|sendAudio/i.test(workflowText));
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|timbre_fiscal|WhatsApp|whatsapp/i.test(workflowText));
  return "safe";
});

check("runtime_tmp_no_versionado", () => {
  const tracked = require("child_process")
    .execFileSync("git", ["ls-files", "runtime/.tmp-handle-local-ingest.js"], { cwd: root, encoding: "utf8" })
    .trim();
  assert.strictEqual(tracked, "");
  return "not_tracked";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

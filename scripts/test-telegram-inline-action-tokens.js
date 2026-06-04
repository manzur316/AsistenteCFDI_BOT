const fs = require("fs");
const path = require("path");
const {
  CALLBACK_DATA_LIMIT,
  buildCallbackData,
  generateActionToken,
  parseCallbackData,
  validateActionTokenRecord,
} = require("./lib/telegram-action-token-utils");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const sqlPath = path.join(root, "sql", "004_action_tokens.sql");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const workflowVersion = "CFDI_LOCAL_INGEST_V1";
const chatId = "chat-inline-test";

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

function demoClient() {
  return {
    client_id: "CLI-DEMO-RIVERA",
    display_name: "Privada Rivera",
    razon_social: "Privada Rivera Demo",
    rfc: "AAA010101AAA",
    tipo_persona: "MORAL_SIN_FINES_LUCRO",
    regimen_fiscal: "603",
    codigo_postal_fiscal: "00000",
    tax_profile: "PM_NO_LUCRATIVA",
    validated_by_human: true,
    enabled: true,
    aliases: [{ alias: "privada rivera", normalized_alias: "privada rivera", weight: 100 }],
  };
}

const taxRules = [
  {
    rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR",
    receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO",
    receiver_tax_profile: "PM_NO_LUCRATIVA",
    operation_type: "SERVICIO",
    iva_rate: 0.16,
    isr_retention_rate: 0.0125,
    iva_retention_rate: 0.106667,
    applies: true,
    requires_human_review: true,
  },
];

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

function previewContext({ blockers = [] } = {}) {
  const selectedConcept = concept();
  return {
    draft_id: "DRAFT-INLINE",
    original_text: "Privada Rivera, revise camaras por 800 +IVA",
    client: demoClient(),
    client_query: "Privada Rivera",
    client_confirmed: true,
    work_text: "revise camaras",
    amount: 800,
    tax_mode: "MAS_IVA",
    concept: selectedConcept,
    top_3: [],
    calc: {
      subtotal: 800,
      iva_amount: 128,
      isr_retention_amount: 10,
      iva_retention_amount: 85.33,
      total: 832.67,
    },
    tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
    line_items: [],
    blockers,
    preview_draft: {
      draft_id: "DRAFT-INLINE",
      chat_id: chatId,
      update_id: 7001,
      message_original: "Privada Rivera, revise camaras por 800 +IVA",
      status: "PENDIENTE",
      action: "SUGERIR",
      ready_to_copy: true,
      requires_human_review: true,
      concept: selectedConcept,
      top_3: [],
      telegram_message: "BORRADOR CFDI",
      client_id: "CLI-DEMO-RIVERA",
      client_snapshot: demoClient(),
      amount: 800,
      tax_mode: "MAS_IVA",
      subtotal: 800,
      iva_amount: 128,
      isr_retention_amount: 10,
      iva_retention_amount: 85.33,
      total: 832.67,
      tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
      tax_review_required: true,
    },
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 7001,
    chat_id: extra.chat_id || chatId,
    message_id: extra.message_id || String((extra.update_id || 7001) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: workflowVersion,
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
  };
}

function previewState(blockers = []) {
  const ctx = previewContext({ blockers });
  return {
    state: "PREVIEW_READY",
    original_text: ctx.original_text,
    context: { pending_invoice_context: ctx },
  };
}

function callbackInput(action, tokenOverrides = {}, state = previewState()) {
  const token = tokenOverrides.token || "abcDEF123456";
  return baseInput(`cfdi:${token}`, {
    update_id: tokenOverrides.update_id || 8001,
    message_id: "cb-message",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-inline",
    callback_message_id: "99",
    chat_state: state,
    clients: [],
    tax_rules: [],
    action_token: {
      token,
      chat_id: tokenOverrides.chat_id || chatId,
      action,
      expires_at: tokenOverrides.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: tokenOverrides.used_at || null,
      payload: { draft_id: "DRAFT-INLINE" },
    },
  });
}

const checks = [];
let workflow = null;
let workflowText = "";
let handleCode = "";
let buildLoadContextCode = "";

try {
  workflowText = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(workflowText);
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  buildLoadContextCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

let sqlText = "";
try {
  sqlText = fs.readFileSync(sqlPath, "utf8");
  checks.push({ name: "action_token_sql_exists", pass: true, value: "sql/004_action_tokens.sql" });
} catch (error) {
  checks.push({ name: "action_token_sql_exists", pass: false, value: error.message });
}

const generated = Array.from({ length: 100 }, () => generateActionToken());
const callbacks = generated.map(buildCallbackData);
checks.push({ name: "genera_tokens_unicos", pass: new Set(generated).size === generated.length, value: `${new Set(generated).size}/${generated.length}` });
checks.push({ name: "callback_data_corto", pass: callbacks.every((value) => value.length <= CALLBACK_DATA_LIMIT), value: String(Math.max(...callbacks.map((value) => value.length))) });
checks.push({ name: "parse_callback_data", pass: callbacks.every((value, index) => parseCallbackData(value) === generated[index]), value: "cfdi:<token>" });
checks.push({
  name: "callback_no_filtra_datos_sensibles",
  pass: callbacks.every((value) => !/DRAFT|CLI-|RFC|81111811|E48|Privada|concept/i.test(value)),
  value: callbacks[0],
});

checks.push({
  name: "token_expirado_no_funciona",
  pass: validateActionTokenRecord({ token: generated[0], chat_id: chatId, action: "CONFIRM", expires_at: "2020-01-01T00:00:00.000Z" }, { chatId }).reason === "token_expirado",
  value: "token_expirado",
});
checks.push({
  name: "token_otro_chat_no_funciona",
  pass: validateActionTokenRecord({ token: generated[1], chat_id: "otro-chat", action: "CONFIRM", expires_at: "2099-01-01T00:00:00.000Z" }, { chatId }).reason === "chat_invalido",
  value: "chat_invalido",
});
checks.push({
  name: "token_confirm_usado_no_reutiliza",
  pass: validateActionTokenRecord({ token: generated[2], chat_id: chatId, action: "CONFIRM", expires_at: "2099-01-01T00:00:00.000Z", used_at: "2026-06-04T00:00:00.000Z" }, { chatId }).reason === "token_usado",
  value: "token_usado",
});

if (workflow) {
  const sendNode = getNode(workflow, "Telegram sendMessage");
  checks.push({ name: "workflow_usa_answerCallbackQuery", pass: workflowText.includes("answerCallbackQuery"), value: "answerCallbackQuery" });
  checks.push({ name: "sendMessage_incluye_reply_markup", pass: String(sendNode.parameters.jsonBody || "").includes("reply_markup"), value: "reply_markup" });
  checks.push({ name: "workflow_carga_action_token", pass: buildLoadContextCode.includes("AS action_token") && buildLoadContextCode.includes("cfdi_action_tokens"), value: "action_token" });
  checks.push({ name: "workflow_no_token_real", pass: !/\bbot?\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText), value: "no token real" });
  checks.push({ name: "workflow_no_pac_timbrado_xml_pdf_whatsapp", pass: !/\bPAC\b|timbrad|XML|PDF|WhatsApp|whatsapp/i.test(workflowText), value: "none" });
}

checks.push({
  name: "sql_schema_campos_requeridos",
  pass: [
    "CREATE TABLE IF NOT EXISTS cfdi_action_tokens",
    "token text PRIMARY KEY",
    "chat_id text NOT NULL",
    "draft_id text",
    "action text NOT NULL",
    "expires_at timestamptz NOT NULL",
    "used_at timestamptz",
    "payload jsonb",
  ].every((needle) => sqlText.includes(needle)),
  value: "cfdi_action_tokens",
});

let behavior = {};
if (handleCode) {
  try {
    behavior.preview = executeCode(handleCode, baseInput("Privada Rivera, revise camaras por 800 +IVA"));
    const buttons = behavior.preview.reply_markup?.inline_keyboard?.flat() || [];
    behavior.buttons = buttons;
    behavior.buttonTokens = buttons.map((button) => parseCallbackData(button.callback_data));
    checks.push({ name: "preview_genera_inline_keyboard", pass: buttons.length === 4 && buttons.some((button) => button.text === "Confirmar") && buttons.some((button) => button.text === "Editar") && buttons.some((button) => button.text === "Cancelar") && buttons.some((button) => button.text === "Ver detalle"), value: `${buttons.length} botones` });
    checks.push({ name: "preview_persiste_action_tokens", pass: behavior.preview.persistence_sql.includes("INSERT INTO cfdi_action_tokens") && !behavior.preview.persistence_sql.includes("INSERT INTO cfdi_drafts"), value: "tokens no draft final" });
    checks.push({ name: "preview_tokens_unicos", pass: new Set(behavior.buttonTokens).size === 4 && behavior.buttonTokens.every(Boolean), value: behavior.buttonTokens.join(",") });
    checks.push({ name: "preview_callback_data_limite_telegram", pass: buttons.every((button) => String(button.callback_data).length <= CALLBACK_DATA_LIMIT), value: String(Math.max(...buttons.map((button) => String(button.callback_data).length))) });
    checks.push({ name: "preview_callback_data_sin_datos_fiscales", pass: buttons.every((button) => !/DRAFT|CLI-|RFC|81111811|E48|Privada|concept/i.test(button.callback_data)), value: "solo token" });
  } catch (error) {
    checks.push({ name: "preview_genera_inline_keyboard", pass: false, value: error.message });
  }

  try {
    behavior.callbackConfirm = executeCode(handleCode, callbackInput("CONFIRM"));
    checks.push({ name: "callback_confirm_sin_blockers_confirma", pass: behavior.callbackConfirm.action === "DRAFT_CONFIRMED" && behavior.callbackConfirm.persistence_sql.includes("INSERT INTO cfdi_drafts"), value: behavior.callbackConfirm.action });
    checks.push({ name: "callback_confirm_marca_token_usado", pass: behavior.callbackConfirm.persistence_sql.includes("UPDATE cfdi_action_tokens SET used_at"), value: "used_at" });
  } catch (error) {
    checks.push({ name: "callback_confirm_sin_blockers_confirma", pass: false, value: error.message });
  }

  try {
    behavior.callbackBlocked = executeCode(handleCode, callbackInput("CONFIRM", { update_id: 8002 }, previewState([{ type: "cliente_no_confirmado" }])));
    checks.push({ name: "callback_confirm_con_blockers_no_crea_draft", pass: behavior.callbackBlocked.action === "NEEDS_CONFIRM_DRAFT" && !behavior.callbackBlocked.persistence_sql.includes("INSERT INTO cfdi_drafts"), value: behavior.callbackBlocked.action });
  } catch (error) {
    checks.push({ name: "callback_confirm_con_blockers_no_crea_draft", pass: false, value: error.message });
  }

  try {
    behavior.callbackExpired = executeCode(handleCode, callbackInput("CONFIRM", { update_id: 8003, expires_at: "2020-01-01T00:00:00.000Z" }));
    checks.push({ name: "callback_expirado_rechazado", pass: behavior.callbackExpired.action === "CALLBACK_TOKEN_INVALID" && !behavior.callbackExpired.persistence_sql.includes("INSERT INTO cfdi_drafts"), value: behavior.callbackExpired.json_debug?.callback_reason || "N/A" });
  } catch (error) {
    checks.push({ name: "callback_expirado_rechazado", pass: false, value: error.message });
  }

  try {
    behavior.callbackOtherChat = executeCode(handleCode, callbackInput("CONFIRM", { update_id: 8004, chat_id: "otro-chat" }));
    checks.push({ name: "callback_otro_chat_rechazado", pass: behavior.callbackOtherChat.action === "CALLBACK_TOKEN_INVALID" && behavior.callbackOtherChat.json_debug?.callback_reason === "chat_invalido", value: behavior.callbackOtherChat.json_debug?.callback_reason || "N/A" });
  } catch (error) {
    checks.push({ name: "callback_otro_chat_rechazado", pass: false, value: error.message });
  }

  try {
    behavior.callbackUsed = executeCode(handleCode, callbackInput("CONFIRM", { update_id: 8005, used_at: "2026-06-04T00:00:00.000Z" }));
    checks.push({ name: "callback_confirm_usado_rechazado", pass: behavior.callbackUsed.action === "CALLBACK_TOKEN_INVALID" && behavior.callbackUsed.json_debug?.callback_reason === "token_usado", value: behavior.callbackUsed.json_debug?.callback_reason || "N/A" });
  } catch (error) {
    checks.push({ name: "callback_confirm_usado_rechazado", pass: false, value: error.message });
  }

  try {
    behavior.callbackEdit = executeCode(handleCode, callbackInput("EDIT", { update_id: 8006 }));
    behavior.callbackCancel = executeCode(handleCode, callbackInput("CANCEL", { update_id: 8007 }));
    behavior.callbackView = executeCode(handleCode, callbackInput("VIEW", { update_id: 8008 }));
    checks.push({ name: "callback_edit_entra_modo_edicion", pass: behavior.callbackEdit.action === "EDITING_PREVIEW" && behavior.callbackEdit.persistence_sql.includes("EDITING_PREVIEW"), value: behavior.callbackEdit.action });
    checks.push({ name: "callback_cancel_limpia_estado", pass: behavior.callbackCancel.action === "CANCELLED" && behavior.callbackCancel.persistence_sql.includes("DELETE FROM chat_states"), value: behavior.callbackCancel.action });
    checks.push({ name: "callback_view_muestra_detalle", pass: behavior.callbackView.action === "PREVIEW_READY" && /Estado actual|Trabajo|Monto/.test(behavior.callbackView.telegram_message), value: behavior.callbackView.action });
  } catch (error) {
    checks.push({ name: "callback_edit_cancel_view", pass: false, value: error.message });
  }

  try {
    behavior.textConfirm = executeCode(handleCode, baseInput("confirmar", { update_id: 8010, chat_state: previewState(), clients: [], tax_rules: [] }));
    behavior.textEdit = executeCode(handleCode, baseInput("editar", { update_id: 8011, chat_state: previewState(), clients: [], tax_rules: [] }));
    behavior.textCancel = executeCode(handleCode, baseInput("cancelar", { update_id: 8012, chat_state: previewState(), clients: [], tax_rules: [] }));
    behavior.textVer = executeCode(handleCode, baseInput("/ver", { update_id: 8013, chat_state: previewState(), clients: [], tax_rules: [] }));
    checks.push({ name: "texto_confirmar_sigue_funcionando", pass: behavior.textConfirm.action === "DRAFT_CONFIRMED" && behavior.textConfirm.persistence_sql.includes("INSERT INTO cfdi_drafts"), value: behavior.textConfirm.action });
    checks.push({ name: "texto_editar_sigue_funcionando", pass: behavior.textEdit.action === "EDITING_PREVIEW", value: behavior.textEdit.action });
    checks.push({ name: "texto_cancelar_sigue_funcionando", pass: behavior.textCancel.action === "CANCELLED", value: behavior.textCancel.action });
    checks.push({ name: "texto_ver_sigue_funcionando", pass: behavior.textVer.action === "COMMAND_VER" || behavior.textVer.action === "PREVIEW_READY", value: behavior.textVer.action });
  } catch (error) {
    checks.push({ name: "botones_no_rompen_comandos_texto", pass: false, value: error.message });
  }
}

console.log("Telegram inline action token contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

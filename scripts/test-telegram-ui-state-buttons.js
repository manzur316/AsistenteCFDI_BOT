const fs = require("fs");
const path = require("path");
const {
  ACTIONS,
  CALLBACK_DATA_LIMIT,
  buildCallbackData,
  generateActionToken,
  parseCallbackData,
  validateActionTokenRecord,
} = require("./lib/telegram-action-token-utils");
const { validateTelegramCallbackData } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const workflowVersion = "CFDI_LOCAL_INGEST_V1";
const chatId = "chat-ui-state-test";

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

function flattenButtons(result) {
  return result.reply_markup?.inline_keyboard?.flat() || [];
}

function buttonTexts(result) {
  return flattenButtons(result).map((button) => button.text);
}

function hasButtons(result, expected) {
  const texts = buttonTexts(result);
  return expected.every((text) => texts.includes(text));
}

function callbacksSafe(result) {
  return flattenButtons(result).every((button) => {
      const callbackData = String(button.callback_data || "");
    const parsed = callbackData.startsWith("cfdi_nav:") || callbackData.startsWith("cfdi_sbx:")
      ? validateTelegramCallbackData(callbackData).ok
      : Boolean(parseCallbackData(callbackData));
    return callbackData.length <= CALLBACK_DATA_LIMIT
      && parsed
      && !/DRAFT-|CLI-|AAA010101AAA|81111811|Privada|Rivera|concept|clave|monto|total/i.test(callbackData);
  });
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
    draft_id: "DRAFT-UI-PREVIEW",
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
    preview_draft: draft("DRAFT-UI-PREVIEW", "PENDIENTE"),
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

function editingState() {
  const ctx = previewContext();
  return {
    state: "EDITING_PREVIEW",
    original_text: ctx.original_text,
    context: { pending_invoice_context: ctx },
  };
}

function clientDecisionState() {
  const ctx = previewContext({ blockers: [{ type: "cliente_no_confirmado" }] });
  ctx.client = null;
  ctx.client_confirmed = false;
  ctx.client_query = "Cliente Nuevo";
  return {
    state: "NEEDS_CLIENT_DECISION",
    original_text: ctx.original_text,
    context: { client_query: "Cliente Nuevo", candidate_clients: [], pending_invoice_context: ctx },
  };
}

function draft(draftId, status = "PENDIENTE") {
  return {
    draft_id: draftId,
    chat_id: chatId,
    update_id: 9001,
    message_original: "Privada Rivera, revise camaras por 800 +IVA",
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: concept(),
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
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 9100,
    chat_id: extra.chat_id || chatId,
    message_id: extra.message_id || String((extra.update_id || 9100) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: workflowVersion,
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: {},
    today_summary: extra.today_summary || { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
  };
}

function callbackInput(action, payload = {}, extra = {}) {
  const token = extra.token || "uiSTATE123456";
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 9200,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-ui-state",
    callback_message_id: "99",
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    today_summary: extra.today_summary,
    action_token: {
      token,
      chat_id: extra.chat_id || chatId,
      action,
      expires_at: extra.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: extra.used_at || null,
      payload,
    },
  });
}

const checks = [];
let workflow;
let handleCode = "";
let workflowText = "";

try {
  workflowText = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(workflowText);
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

const requiredActions = [
  "MENU",
  "NEW_INVOICE",
  "LIST_PENDING",
  "LIST_APPROVED",
  "LIST_CLIENTS",
  "VIEW_DRAFT",
  "APPROVE_DRAFT",
  "DISCARD_DRAFT",
  "RESTORE_DRAFT",
  "BACK_PENDING",
  "HELP",
  "CANCEL_EDIT",
  "CANCEL_DRAFT",
  "VIEW_SUMMARY",
  "EDIT_CLIENT",
  "EDIT_DESCRIPTION",
  "EDIT_AMOUNT",
  "EDIT_TAX_MODE",
  "ADD_LINE",
  "EDIT_LINE",
  "REMOVE_LINE",
  "BACK_TO_DRAFT",
  "CREATE_BASIC_CLIENT",
  "CONTINUE_UNVALIDATED_CLIENT",
  "STAMP_DRAFT_SANDBOX",
  "REQUEST_CANCEL_SANDBOX",
  "CONFIRM_CANCEL_SANDBOX",
];

checks.push({
  name: "token_utils_expone_acciones_ui",
  pass: requiredActions.every((action) => ACTIONS[action] === action),
  value: requiredActions.join(","),
});

const token = generateActionToken();
const callbackData = buildCallbackData(token);
checks.push({
  name: "callback_data_corto_y_parseable",
  pass: callbackData.length <= CALLBACK_DATA_LIMIT && parseCallbackData(callbackData) === token,
  value: callbackData,
});
checks.push({
  name: "approve_descartar_cancel_restore_son_one_time",
  pass: ["APPROVE_DRAFT", "DISCARD_DRAFT", "CANCEL_DRAFT", "RESTORE_DRAFT", "STAMP_DRAFT_SANDBOX", "REQUEST_CANCEL_SANDBOX", "CONFIRM_CANCEL_SANDBOX"].every((action) =>
    validateActionTokenRecord({ token, chat_id: chatId, action, expires_at: "2099-01-01T00:00:00.000Z", used_at: "2026-06-04T00:00:00.000Z" }, { chatId }).reason === "token_usado"
  ),
  value: "one-time",
});

if (handleCode) {
  const pending = draft("DRAFT-PEND-1", "PENDIENTE");
  const pending2 = draft("DRAFT-PEND-2", "PENDIENTE");
  const approved = draft("DRAFT-APROB-1", "APROBADO");

  const cases = [
    {
      name: "preview_principal_4_botones",
      run: () => executeCode(handleCode, baseInput("Privada Rivera, revise camaras por 800 +IVA", { update_id: 9301 })),
      expect: (result) => result.action === "NEEDS_CONFIRM_DRAFT" && hasButtons(result, ["Confirmar", "Editar", "Cancelar", "Ver detalle"]) && callbacksSafe(result),
    },
    {
      name: "editing_state_botones",
      run: () => executeCode(handleCode, baseInput("ver", { update_id: 9302, chat_state: editingState(), clients: [], tax_rules: [] })),
      expect: (result) => result.action === "EDITING_PREVIEW" && hasButtons(result, ["Cliente", "Concepto / descripcion", "Monto", "IVA", "Agregar linea", "Editar linea", "Eliminar linea", "Regresar"]) && callbacksSafe(result),
    },
    {
      name: "preview_sin_comandos_legacy_visibles",
      run: () => executeCode(handleCode, baseInput("Privada Rivera, revise camaras por 800 +IVA", { update_id: 93023 })),
      expect: (result) => result.action === "NEEDS_CONFIRM_DRAFT" && result.parse_mode === "HTML" && /<b>Cliente:<\/b>/.test(String(result.telegram_message || "")) && /<b>Total:<\/b>/.test(String(result.telegram_message || "")) && /<b>Estado:<\/b>/.test(String(result.telegram_message || "")) && /<b>Advertencias:<\/b>/.test(String(result.telegram_message || "")) && !/Responder:|confirmar\neditar\ncancelar|\/editlinea/i.test(String(result.telegram_message || "")) && String(result.telegram_message || "").includes("Usa los botones de abajo"),
    },
    {
      name: "pendientes_tiene_acciones_por_draft",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 9303, recent_drafts: [pending, pending2, approved] })),
      expect: (result) => result.action === "COMMAND_PENDIENTES" && hasButtons(result, ["Ver 1", "Aprobar 1", "Descartar 1", "Aprobadas", "Menu"]) && callbacksSafe(result),
    },
    {
      name: "detalle_pendiente_aprobar_descartar_back",
      run: () => executeCode(handleCode, baseInput("/detalle DRAFT-PEND-1", { update_id: 9304, recent_drafts: [pending, approved] })),
      expect: (result) => result.action === "COMMAND_DETALLE" && hasButtons(result, ["Aprobar", "Descartar", "Volver a pendientes", "Ver resumen"]) && callbacksSafe(result),
    },
    {
      name: "aprobadas_tiene_ver_detalle_y_nav",
      run: () => executeCode(handleCode, baseInput("/aprobadas", { update_id: 9305, recent_drafts: [pending, approved] })),
      expect: (result) => result.action === "COMMAND_APROBADAS" && hasButtons(result, ["Ver 1", "Pendientes", "Menu"]) && callbacksSafe(result),
    },
    {
      name: "token_expirado_tiene_recuperacion",
      run: () => executeCode(handleCode, callbackInput("CONFIRM", { draft_id: "DRAFT-PEND-1" }, { update_id: 9306, expires_at: "2020-01-01T00:00:00.000Z", chat_state: previewState(), recent_drafts: [pending] })),
      expect: (result) => result.action === "CALLBACK_TOKEN_INVALID" && hasButtons(result, ["Ver pendientes", "Crear nuevo borrador", "Ayuda"]) && callbacksSafe(result),
    },
    {
      name: "help_menu_start_ayuda_unknown",
      run: () => [
        executeCode(handleCode, baseInput("/start", { update_id: 9307 })),
        executeCode(handleCode, baseInput("/ayuda", { update_id: 9308 })),
        executeCode(handleCode, baseInput("/noexiste", { update_id: 9309 })),
      ],
      expect: (results) => results[0].action === "PRODUCT_MENU_MAIN"
        && results[1].action === "PRODUCT_HELP"
        && results[2].action === "COMMAND_UNKNOWN"
        && results.every((result) => hasButtons(result, ["Nueva factura", "Clientes", "Pendientes", "Estado", "Ayuda"]) && callbacksSafe(result)),
    },
    {
      name: "cancelado_tiene_menu_post_cancel",
      run: () => executeCode(handleCode, baseInput("cancelar", { update_id: 9310, chat_state: previewState(), clients: [], tax_rules: [] })),
      expect: (result) => result.action === "CANCELLED" && hasButtons(result, ["Nueva factura", "Pendientes", "Menu"]) && callbacksSafe(result),
    },
    {
      name: "confirmado_tiene_detalle_pendientes_nueva",
      run: () => executeCode(handleCode, baseInput("confirmar", { update_id: 9311, chat_state: previewState(), clients: [], tax_rules: [] })),
      expect: (result) => result.action === "DRAFT_CONFIRMED" && hasButtons(result, ["Ver borrador", "Pendientes", "Nueva factura"]) && /Estado actual:<\/b> BORRADOR|Estado actual: BORRADOR/.test(String(result.telegram_message || "")) && result.parse_mode === "HTML" && callbacksSafe(result),
    },
    {
      name: "cliente_no_validado_tiene_botones_seguro",
      run: () => executeCode(handleCode, baseInput("?", { update_id: 9312, chat_state: clientDecisionState(), clients: [], tax_rules: [] })),
      expect: (result) => result.action === "NEEDS_CLIENT_DECISION" && hasButtons(result, ["Continuar como borrador no validado", "Crear cliente basico", "Cancelar", "Ver ayuda cliente"]) && callbacksSafe(result),
    },
    {
      name: "approve_button_actualiza_pendiente_y_usa_token",
      run: () => executeCode(handleCode, callbackInput("APPROVE_DRAFT", { draft_id: "DRAFT-PEND-1" }, { update_id: 9313, recent_drafts: [pending] })),
      expect: (result) => result.action === "COMMAND_APROBAR" && String(result.telegram_message || "").includes("Borrador aprobado") && hasButtons(result, ["Ver borrador", "Regresar a borrador", "Menu principal"]) && result.persistence_sql.includes("UPDATE cfdi_action_tokens SET used_at") && result.persistence_sql.includes("status = 'APROBADO'") && !result.persistence_sql.includes("INSERT INTO cfdi_drafts") && callbacksSafe(result),
    },
    {
      name: "restore_button_regresa_aprobado_a_borrador",
      run: () => executeCode(handleCode, callbackInput("RESTORE_DRAFT", { draft_id: "DRAFT-APROB-1" }, { update_id: 93131, recent_drafts: [approved] })),
      expect: (result) => result.action === "COMMAND_REGRESAR_BORRADOR" && /Estado actual:<\/b> BORRADOR|Estado actual: BORRADOR/.test(String(result.telegram_message || "")) && result.parse_mode === "HTML" && result.persistence_sql.includes("UPDATE cfdi_action_tokens SET used_at") && result.persistence_sql.includes("status = 'PENDIENTE'") && hasButtons(result, ["Aprobar", "Descartar", "Volver a pendientes", "Ver resumen"]) && callbacksSafe(result),
    },
    {
      name: "view_summary_no_abre_menu_silencioso",
      run: () => executeCode(handleCode, callbackInput("VIEW_SUMMARY", {}, { update_id: 93132, recent_drafts: [], clients: [], tax_rules: [], today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 } })),
      expect: (result) => result.action === "COMMAND_RESUMEN" && String(result.telegram_message || "").includes("No hay datos suficientes para mostrar resumen mensual.") && !String(result.telegram_message || "").includes("Comandos disponibles") && hasButtons(result, ["Nueva factura", "Clientes", "Pendientes", "Estado", "Ayuda"]) && callbacksSafe(result),
    },
    {
      name: "discard_button_actualiza_pendiente_y_usa_token",
      run: () => executeCode(handleCode, callbackInput("DISCARD_DRAFT", { draft_id: "DRAFT-PEND-1" }, { update_id: 9314, recent_drafts: [pending] })),
      expect: (result) => result.action === "COMMAND_DESCARTAR" && result.persistence_sql.includes("UPDATE cfdi_action_tokens SET used_at") && result.persistence_sql.includes("status = 'DESCARTADO'") && !result.persistence_sql.includes("INSERT INTO cfdi_drafts") && callbacksSafe(result),
    },
    {
      name: "approve_invalid_no_actualiza_status",
      run: () => executeCode(handleCode, callbackInput("APPROVE_DRAFT", { draft_id: "DRAFT-NOPE" }, { update_id: 9315, recent_drafts: [pending] })),
      expect: (result) => result.action === "COMMAND_APROBAR_INVALID" && !result.persistence_sql.includes("status = 'APROBADO'") && callbacksSafe(result),
    },
    {
      name: "discard_invalid_no_actualiza_status",
      run: () => executeCode(handleCode, callbackInput("DISCARD_DRAFT", { draft_id: "DRAFT-NOPE" }, { update_id: 9316, recent_drafts: [pending] })),
      expect: (result) => result.action === "COMMAND_DESCARTAR_INVALID" && !result.persistence_sql.includes("status = 'DESCARTADO'") && callbacksSafe(result),
    },
    {
      name: "confirm_blockers_no_crea_draft",
      run: () => executeCode(handleCode, callbackInput("CONFIRM", { draft_id: "DRAFT-UI-PREVIEW" }, { update_id: 9317, chat_state: previewState([{ type: "cliente_no_confirmado" }]) })),
      expect: (result) => result.action === "NEEDS_CONFIRM_DRAFT" && !result.persistence_sql.includes("INSERT INTO cfdi_drafts") && callbacksSafe(result),
    },
    {
      name: "text_commands_siguen_funcionando",
      run: () => [
        executeCode(handleCode, baseInput("/pendientes", { update_id: 9318, recent_drafts: [pending] })),
        executeCode(handleCode, baseInput("/detalle DRAFT-PEND-1", { update_id: 9319, recent_drafts: [pending] })),
        executeCode(handleCode, baseInput("/aprobar DRAFT-PEND-1", { update_id: 9320, recent_drafts: [pending] })),
        executeCode(handleCode, baseInput("/descartar DRAFT-PEND-1", { update_id: 9321, recent_drafts: [pending] })),
        executeCode(handleCode, baseInput("/clientes", { update_id: 9322, clients: [demoClient()] })),
      ],
      expect: (results) => ["COMMAND_PENDIENTES", "COMMAND_DETALLE", "COMMAND_APROBAR", "COMMAND_DESCARTAR", "COMMAND_CLIENTES"].every((action, index) => results[index].action === action),
    },
  ];

  for (const item of cases) {
    try {
      const result = item.run();
      checks.push({ name: item.name, pass: item.expect(result), value: Array.isArray(result) ? result.map((entry) => entry.action).join(",") : result.action });
    } catch (error) {
      checks.push({ name: item.name, pass: false, value: error.message });
    }
  }
}

checks.push({
  name: "workflow_no_token_real",
  pass: !/\bbot?\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText),
  value: "no token real",
});
checks.push({
  name: "workflow_sendmessage_parse_mode_opt_in",
  pass: workflowText.includes("$json.parse_mode") && workflowText.includes("body.parse_mode = $json.parse_mode"),
  value: "parse_mode opt-in",
});
checks.push({
  name: "workflow_no_pac_production_or_file_send",
  pass: !/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|timbre_fiscal|WhatsApp|whatsapp|sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText),
  value: "sandbox console only",
});

console.log("Telegram UI state buttons contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const {
  CALLBACK_DATA_LIMIT,
  parseCallbackData,
} = require("./lib/telegram-action-token-utils");
const { validateTelegramCallbackData } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = path.join(root, "data", "concepts.normalized.json");
const workflowVersion = "CFDI_LOCAL_INGEST_V1";
const chatId = "chat-list-nav-test";
const telegramUserId = "user-list-nav-test";

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

function lacksButtons(result, forbidden) {
  const texts = buttonTexts(result);
  return forbidden.every((text) => !texts.includes(text));
}

function callbacksSafe(result) {
  return flattenButtons(result).every((button) => {
    const callbackData = String(button.callback_data || "");
    const parsed = callbackData.startsWith("cfdi_nav:") || callbackData.startsWith("cfdi_sbx:")
      ? validateTelegramCallbackData(callbackData).ok
      : Boolean(parseCallbackData(callbackData));
    return callbackData.length <= CALLBACK_DATA_LIMIT && parsed;
  });
}

function demoClient() {
  return {
    client_id: "CLI-LIST-NAV",
    display_name: "Privada Rivera",
    razon_social: "Privada Rivera Demo",
    rfc: "AAA010101AAA",
    tipo_persona: "MORAL_SIN_FINES_LUCRO",
    regimen_fiscal: "603",
    codigo_postal_fiscal: "00000",
    tax_profile: "PM_NO_LUCRATIVA",
    validated_by_human: true,
    enabled: true,
    aliases: [],
  };
}

function concept() {
  return {
    id: "SVC-CCTV-LIST",
    concepto_factura: "SERVICIO DE DIAGNOSTICO CCTV",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    familia: "CCTV",
    tipo: "SERVICIO",
    operacion: "SERVICIO",
  };
}

function draft(draftId, status = "PENDIENTE", overrides = {}) {
  return {
    draft_id: draftId,
    chat_id: chatId,
    update_id: 99001,
    message_original: `Privada Rivera, revision ${draftId}`,
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: concept(),
    top_3: [],
    telegram_message: "BORRADOR CFDI",
    client_id: "CLI-LIST-NAV",
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
    ...overrides,
  };
}

function drafts(prefix, status, count, extra = {}) {
  return Array.from({ length: count }, (_item, index) => {
    const n = String(index + 1).padStart(2, "0");
    return draft(`${prefix}-${n}`, status, extra);
  });
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99010,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 99010,
    chat_id: extra.chat_id || chatId,
    telegram_user_id: extra.telegram_user_id || telegramUserId,
    message_id: extra.message_id || String((extra.update_id || 99010) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: workflowVersion,
    workflowVersion,
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: [],
    client_invoice_summary: [],
    recent_callback_events: [],
    bot_state: {},
    today_summary: { pendientes: 10, aprobados: 10, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER-LIST-NAV",
      telegram_chat_id: extra.chat_id || chatId,
      telegram_user_id: extra.telegram_user_id || telegramUserId,
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-LIST-NAV",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: false,
    ...extra,
  };
}

function callbackInput(action, payload = {}, extra = {}) {
  const token = extra.token || "listNAV123456";
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 99100,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-list-nav",
    callback_message_id: "99",
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
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

function listState(kind, listDrafts, page = 1, options = {}) {
  const expiresAt = options.expires_at || "2099-01-01T00:00:00.000Z";
  return {
    state: options.state || "LIST_NAVIGATION",
    expires_at: options.state_expires_at || expiresAt,
    context: {
      ...(options.context || {}),
      list_context: {
        schema_version: "telegram_list_context.v1",
        context_id: `TEST-${kind}-${page}`,
        chat_id: options.chat_id || chatId,
        telegram_user_id: options.telegram_user_id || telegramUserId,
        kind,
        page,
        page_size: 5,
        total_items: listDrafts.length,
        sort: "updated_at_desc",
        filter: { status: kind === "DRAFTS_PENDING" ? "PENDIENTE" : "APROBADO" },
        created_at: "2026-06-11T00:00:00.000Z",
        expires_at: expiresAt,
        items: listDrafts.map((item, index) => ({
          visibleIndex: index + 1,
          entityType: "DRAFT",
          entityId: item.draft_id,
          draft_id: item.draft_id,
          status: item.status,
          amount: item.total,
          displayLabel: item.draft_id,
        })),
      },
    },
  };
}

const checks = [];
let handleCode = "";
let loadCode = "";

try {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  loadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  new Function("require", "$json", "$node", "$items", "$itemIndex", loadCode);
  new Function("require", "$json", "$node", "$items", "$itemIndex", handleCode);
  checks.push({ name: "workflow_valid_json_and_js", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json_and_js", pass: false, value: error.message });
}

if (loadCode) {
  checks.push({
    name: "load_context_recent_drafts_limite_operativo_50",
    pass: loadCode.includes("ORDER BY rd.updated_at DESC LIMIT 50")
      && loadCode.includes("ORDER BY updated_at DESC LIMIT 51"),
    value: "50+callback",
  });
}

if (handleCode) {
  const pending5 = drafts("DRAFT-PEND-5", "PENDIENTE", 5);
  const pending6 = drafts("DRAFT-PEND-6", "PENDIENTE", 6);
  const pending = drafts("DRAFT-PEND-LIST", "PENDIENTE", 10);
  const pending11 = drafts("DRAFT-PEND-11", "PENDIENTE", 11);
  const pending15 = drafts("DRAFT-PEND-15", "PENDIENTE", 15);
  const pending20 = drafts("DRAFT-PEND-20", "PENDIENTE", 20);
  const pending51 = drafts("DRAFT-PEND-LIMIT", "PENDIENTE", 51);
  const approved = drafts("DRAFT-APROB-LIST", "APROBADO", 10);
  const approved20 = drafts("DRAFT-APROB-20", "APROBADO", 20);
  const approvedMixedWithStamped = [
    ...drafts("DRAFT-APROB-MIX", "APROBADO", 6),
    draft("DRAFT-STAMPED-STATUS-01", "SANDBOX_TIMBRADO"),
    draft("DRAFT-STAMPED-INVOICE-01", "APROBADO", { invoice_status: "SANDBOX_TIMBRADO" }),
  ];
  const stampedOnly = [draft("DRAFT-STAMPED-ONLY-01", "SANDBOX_TIMBRADO")];
  const changed = pending.map((item, index) => index === 9 ? { ...item, status: "APROBADO" } : item);

  const cases = [
    {
      name: "pendientes_5_no_muestra_navegacion",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 99219, recent_drafts: pending5 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 1", "Aprobar 5", "Descartar 5"])
        && lacksButtons(result, ["Mas antiguas 6-10", "Mas recientes 1-5", "Timbrar sandbox 1"])
        && String(result.telegram_message || "").includes("Pendientes (1-5 de 5)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_6_muestra_mas_antiguas_6_6",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 99220, recent_drafts: pending6 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 1", "Aprobar 5", "Descartar 5", "Mas antiguas 6-6"])
        && lacksButtons(result, ["Ver 6", "Mas recientes 1-5"])
        && String(result.telegram_message || "").includes("Pendientes (1-5 de 6)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_10_muestra_siguiente_6_10",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 99201, recent_drafts: pending })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 1", "Aprobar 5", "Descartar 5", "Mas antiguas 6-10"])
        && lacksButtons(result, ["Ver 6", "Mas recientes 1-5"])
        && String(result.telegram_message || "").includes("Pendientes (1-5 de 10)")
        && String(result.persistence_sql || "").includes("DRAFTS_PENDING")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_pagina_2_muestra_indices_6_10",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 2 }, { update_id: 99202, recent_drafts: pending })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 6", "Aprobar 10", "Descartar 10", "Mas recientes 1-5"])
        && lacksButtons(result, ["Ver 1", "Mas antiguas 11-15"])
        && String(result.telegram_message || "").includes("10. DRAFT-PEND-LIST-10")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_11_pagina_2_muestra_navegacion_hacia_11",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 2 }, { update_id: 99221, recent_drafts: pending11 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 6", "Aprobar 10", "Descartar 10", "Mas recientes 1-5", "Mas antiguas 11-11"])
        && lacksButtons(result, ["Ver 11", "Mas antiguas 16-20"])
        && String(result.telegram_message || "").includes("Pendientes (6-10 de 11)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_15_pagina_2_intermedia_muestra_ambas_navegaciones",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 2 }, { update_id: 99222, recent_drafts: pending15 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 6", "Aprobar 10", "Descartar 10", "Mas recientes 1-5", "Mas antiguas 11-15"])
        && lacksButtons(result, ["Ver 11"])
        && String(result.telegram_message || "").includes("Pendientes (6-10 de 15)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_15_pagina_3_muestra_indices_11_15",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 3 }, { update_id: 99223, recent_drafts: pending15 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 11", "Aprobar 15", "Descartar 15", "Mas recientes 6-10"])
        && lacksButtons(result, ["Ver 6", "Mas antiguas 16-20"])
        && String(result.telegram_message || "").includes("Pendientes (11-15 de 15)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_20_pagina_4_muestra_indices_16_20",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 4 }, { update_id: 99224, recent_drafts: pending20 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 16", "Aprobar 20", "Descartar 20", "Mas recientes 11-15"])
        && lacksButtons(result, ["Mas antiguas 21-25", "Ver 11"])
        && String(result.telegram_message || "").includes("Pendientes (16-20 de 20)")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_limite_50_muestra_aviso_historial",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 99225, recent_drafts: pending51 })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Mas antiguas 6-10"])
        && String(result.telegram_message || "").includes("Pendientes (1-5 de 50)")
        && String(result.telegram_message || "").includes("Mostrando los 50 mas recientes")
        && !String(result.telegram_message || "").includes("DRAFT-PEND-LIMIT-51")
        && callbacksSafe(result),
    },
    {
      name: "aprobadas_pagina_2_muestra_indices_6_10_sin_texto_viejo",
      run: () => executeCode(handleCode, callbackInput("LIST_APPROVED", { page: 2 }, { update_id: 99213, recent_drafts: approved })),
      expect: (result) => result.action === "COMMAND_APROBADAS"
        && hasButtons(result, ["Ver 6", "Ver 10", "Timbrar sandbox 10", "Mas recientes 1-5"])
        && lacksButtons(result, ["Ver 1", "Ver 5", "Mas antiguas 11-15", "Cancelar sandbox 10"])
        && String(result.telegram_message || "").includes("Aprobadas (6-10 de 10)")
        && !String(result.telegram_message || "").includes("Acciones rapidas disponibles")
        && callbacksSafe(result),
    },
    {
      name: "aprobadas_20_pagina_4_muestra_indices_16_20",
      run: () => executeCode(handleCode, callbackInput("LIST_APPROVED", { page: 4 }, { update_id: 99226, recent_drafts: approved20 })),
      expect: (result) => result.action === "COMMAND_APROBADAS"
        && hasButtons(result, ["Ver 16", "Ver 20", "Timbrar sandbox 20", "Mas recientes 11-15"])
        && lacksButtons(result, ["Mas antiguas 21-25", "Cancelar sandbox 20", "Ver 11"])
        && String(result.telegram_message || "").includes("Aprobadas (16-20 de 20)")
        && callbacksSafe(result),
    },
    {
      name: "aprobadas_excluye_sandbox_timbrado_y_no_muestra_cancelar",
      run: () => executeCode(handleCode, baseInput("/aprobadas", { update_id: 99227, recent_drafts: approvedMixedWithStamped })),
      expect: (result) => result.action === "COMMAND_APROBADAS"
        && hasButtons(result, ["Ver 1", "Timbrar sandbox 5", "Mas antiguas 6-6"])
        && lacksButtons(result, ["Cancelar sandbox 1", "Ver 7", "Timbrar sandbox 7"])
        && String(result.telegram_message || "").includes("Aprobadas (1-5 de 6)")
        && !String(result.telegram_message || "").includes("DRAFT-STAMPED-STATUS-01")
        && !String(result.telegram_message || "").includes("DRAFT-STAMPED-INVOICE-01")
        && callbacksSafe(result),
    },
    {
      name: "detalle_10_resuelve_draft_correcto",
      run: () => executeCode(handleCode, baseInput("detalle 10", { update_id: 99203, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-PEND-LIST-10"
        && String(result.telegram_message || "").includes("DRAFT-PEND-LIST-10")
        && callbacksSafe(result),
    },
    {
      name: "detalle_15_resuelve_draft_correcto",
      run: () => executeCode(handleCode, baseInput("detalle 15", { update_id: 99228, recent_drafts: pending15, chat_state: listState("DRAFTS_PENDING", pending15, 3) })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-PEND-15-15"
        && String(result.telegram_message || "").includes("DRAFT-PEND-15-15")
        && callbacksSafe(result),
    },
    {
      name: "ver_15_resuelve_draft_correcto",
      run: () => executeCode(handleCode, baseInput("ver 15", { update_id: 99229, recent_drafts: pending15, chat_state: listState("DRAFTS_PENDING", pending15, 3) })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-PEND-15-15"
        && String(result.telegram_message || "").includes("DRAFT-PEND-15-15")
        && callbacksSafe(result),
    },
    {
      name: "slash_detalle_10_resuelve_aprobado_desde_list_context",
      run: () => executeCode(handleCode, baseInput("/detalle 10", { update_id: 99214, recent_drafts: approved, chat_state: listState("DRAFTS_APPROVED", approved, 2) })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-APROB-LIST-10"
        && String(result.telegram_message || "").includes("DRAFT-APROB-LIST-10")
        && callbacksSafe(result),
    },
    {
      name: "slash_ver_10_no_cae_en_client_list_selection",
      run: () => executeCode(handleCode, baseInput("/ver 10", {
        update_id: 99215,
        recent_drafts: approved,
        chat_state: listState("DRAFTS_APPROVED", approved, 2, {
          state: "CLIENT_LIST_SELECTION",
          context: { clients: [{ visibleIndex: 2, client_id: "CLI-OTHER" }] },
        }),
      })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-APROB-LIST-10"
        && String(result.telegram_message || "").includes("DRAFT-APROB-LIST-10")
        && !String(result.telegram_message || "").includes("Estado actual: CLIENT_LIST_SELECTION")
        && callbacksSafe(result),
    },
    {
      name: "slash_ver_15_no_cae_en_client_list_selection",
      run: () => executeCode(handleCode, baseInput("/ver 15", {
        update_id: 99230,
        recent_drafts: pending15,
        chat_state: listState("DRAFTS_PENDING", pending15, 3, {
          state: "CLIENT_LIST_SELECTION",
          context: { clients: [{ visibleIndex: 2, client_id: "CLI-OTHER" }] },
        }),
      })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-PEND-15-15"
        && !String(result.telegram_message || "").includes("Estado actual: CLIENT_LIST_SELECTION")
        && callbacksSafe(result),
    },
    {
      name: "slash_detalle_10_usa_contexto_draft_aunque_estado_sea_clientes",
      run: () => executeCode(handleCode, baseInput("/detalle 10", {
        update_id: 99216,
        recent_drafts: approved,
        chat_state: listState("DRAFTS_APPROVED", approved, 2, {
          state: "CLIENT_LIST_SELECTION",
          context: { clients: [{ visibleIndex: 2, client_id: "CLI-OTHER" }] },
        }),
      })),
      expect: (result) => result.action === "COMMAND_DETALLE"
        && result.json_debug?.draft_id === "DRAFT-APROB-LIST-10"
        && !String(result.telegram_message || "").includes("Estado actual: CLIENT_LIST_SELECTION")
        && callbacksSafe(result),
    },
    {
      name: "slash_detalle_10_sin_list_context_falla_seguro",
      run: () => executeCode(handleCode, baseInput("/detalle 10", {
        update_id: 99217,
        recent_drafts: approved,
        chat_state: {
          state: "CLIENT_LIST_SELECTION",
          expires_at: "2099-01-01T00:00:00.000Z",
          context: { clients: [{ visibleIndex: 2, client_id: "CLI-OTHER" }] },
        },
      })),
      expect: (result) => result.action === "LIST_NAV_CONTEXT_MISSING"
        && !String(result.telegram_message || "").includes("Estado actual: CLIENT_LIST_SELECTION")
        && callbacksSafe(result),
    },
    {
      name: "slash_cliente_2_no_rompe_contexto_drafts",
      run: () => executeCode(handleCode, baseInput("/cliente 2", {
        update_id: 99218,
        recent_drafts: approved,
        chat_state: listState("DRAFTS_APPROVED", approved, 2, { state: "CLIENT_LIST_SELECTION" }),
      })),
      expect: (result) => result.action !== "COMMAND_DETALLE"
        && !String(result.persistence_sql || "").includes("DELETE FROM chat_states")
        && !String(result.persistence_sql || "").includes("status = 'APROBADO'")
        && !String(result.persistence_sql || "").includes("status = 'DESCARTADO'")
        && callbacksSafe(result),
    },
    {
      name: "resumen_10_resuelve_draft_correcto",
      run: () => executeCode(handleCode, baseInput("resumen 10", { update_id: 99204, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "COMMAND_RESUMEN"
        && result.json_debug?.draft_id === "DRAFT-PEND-LIST-10"
        && String(result.telegram_message || "").includes("Resumen de borrador")
        && String(result.telegram_message || "").includes("DRAFT-PEND-LIST-10")
        && callbacksSafe(result),
    },
    {
      name: "aprobar_10_solo_pendientes_actualiza_draft",
      run: () => executeCode(handleCode, baseInput("aprobar 10", { update_id: 99205, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "COMMAND_APROBAR"
        && result.json_debug?.draft_id === "DRAFT-PEND-LIST-10"
        && String(result.persistence_sql || "").includes("DRAFT-PEND-LIST-10")
        && String(result.persistence_sql || "").includes("status = 'APROBADO'")
        && callbacksSafe(result),
    },
    {
      name: "aprobar_10_en_aprobadas_falla_seguro",
      run: () => executeCode(handleCode, baseInput("aprobar 10", { update_id: 99206, recent_drafts: approved, chat_state: listState("DRAFTS_APPROVED", approved, 2) })),
      expect: (result) => result.action === "LIST_NAV_ACTION_INCOMPATIBLE"
        && !String(result.persistence_sql || "").includes("status = 'APROBADO'")
        && callbacksSafe(result),
    },
    {
      name: "timbrar_10_aprobadas_prepara_boton_seguro",
      run: () => executeCode(handleCode, baseInput("timbrar 10", { update_id: 99207, recent_drafts: approved, chat_state: listState("DRAFTS_APPROVED", approved, 2) })),
      expect: (result) => result.action === "DRAFT_SANDBOX_STAMP_READY"
        && result.json_debug?.draft_id === "DRAFT-APROB-LIST-10"
        && result.should_execute_sandbox_action !== true
        && hasButtons(result, ["Timbrar sandbox 10", "Volver a aprobadas", "Menu principal"])
        && callbacksSafe(result),
    },
    {
      name: "timbrar_10_en_pendientes_falla_seguro",
      run: () => executeCode(handleCode, baseInput("timbrar 10", { update_id: 99208, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "LIST_NAV_ACTION_INCOMPATIBLE"
        && result.should_execute_sandbox_action !== true
        && callbacksSafe(result),
    },
    {
      name: "timbrar_sandbox_timbrado_no_aparece_como_aprobado",
      run: () => executeCode(handleCode, baseInput("timbrar 1", { update_id: 99231, recent_drafts: stampedOnly, chat_state: listState("DRAFTS_APPROVED", stampedOnly, 1) })),
      expect: (result) => result.action === "LIST_NAV_ITEM_CHANGED"
        && result.should_execute_sandbox_action !== true
        && callbacksSafe(result),
    },
    {
      name: "indice_inexistente_responde_error_seguro",
      run: () => executeCode(handleCode, baseInput("detalle 11", { update_id: 99209, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "LIST_NAV_INDEX_NOT_FOUND"
        && String(result.telegram_message || "").includes("No encontre el numero 11")
        && callbacksSafe(result),
    },
    {
      name: "contexto_expirado_responde_error_seguro",
      run: () => executeCode(handleCode, baseInput("detalle 10", { update_id: 99210, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2, { expires_at: "2020-01-01T00:00:00.000Z" }) })),
      expect: (result) => result.action === "LIST_NAV_CONTEXT_EXPIRED"
        && String(result.telegram_message || "").includes("lista ya expiro")
        && callbacksSafe(result),
    },
    {
      name: "item_cambio_estado_bloquea_accion_sensible",
      run: () => executeCode(handleCode, baseInput("aprobar 10", { update_id: 99211, recent_drafts: changed, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "LIST_NAV_ITEM_CHANGED"
        && !String(result.persistence_sql || "").includes("status = 'APROBADO'")
        && callbacksSafe(result),
    },
    {
      name: "descartar_10_queda_diferido_sin_mutacion",
      run: () => executeCode(handleCode, baseInput("descartar 10", { update_id: 99212, recent_drafts: pending, chat_state: listState("DRAFTS_PENDING", pending, 2) })),
      expect: (result) => result.action === "DEFERRED_CONFIRM_DISCARD"
        && !String(result.persistence_sql || "").includes("status = 'DESCARTADO'")
        && callbacksSafe(result),
    },
  ];

  for (const item of cases) {
    try {
      const result = item.run();
      checks.push({ name: item.name, pass: item.expect(result), value: result.action });
    } catch (error) {
      checks.push({ name: item.name, pass: false, value: error.message });
    }
  }
}

console.log("Telegram List Navigation Context contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

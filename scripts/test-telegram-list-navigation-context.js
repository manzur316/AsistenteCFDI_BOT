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
    state: "LIST_NAVIGATION",
    expires_at: options.state_expires_at || expiresAt,
    context: {
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
        filter: { status: kind === "DRAFTS_PENDING" ? "PENDIENTE" : "APROBADO_OR_SANDBOX_TIMBRADO" },
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

try {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  new Function("require", "$json", "$node", "$items", "$itemIndex", handleCode);
  checks.push({ name: "workflow_valid_json_and_js", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json_and_js", pass: false, value: error.message });
}

if (handleCode) {
  const pending = drafts("DRAFT-PEND-LIST", "PENDIENTE", 10);
  const approved = drafts("DRAFT-APROB-LIST", "APROBADO", 10);
  const changed = pending.map((item, index) => index === 9 ? { ...item, status: "APROBADO" } : item);

  const cases = [
    {
      name: "pendientes_10_muestra_siguiente_6_10",
      run: () => executeCode(handleCode, baseInput("/pendientes", { update_id: 99201, recent_drafts: pending })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 1", "Aprobar 5", "Descartar 5", "Siguiente 6-10"])
        && lacksButtons(result, ["Ver 6", "Anterior 1-5"])
        && String(result.telegram_message || "").includes("Pendientes (1-5 de 10)")
        && String(result.persistence_sql || "").includes("DRAFTS_PENDING")
        && callbacksSafe(result),
    },
    {
      name: "pendientes_pagina_2_muestra_indices_6_10",
      run: () => executeCode(handleCode, callbackInput("LIST_PENDING", { page: 2 }, { update_id: 99202, recent_drafts: pending })),
      expect: (result) => result.action === "COMMAND_PENDIENTES"
        && hasButtons(result, ["Ver 6", "Aprobar 10", "Descartar 10", "Anterior 1-5"])
        && lacksButtons(result, ["Ver 1", "Siguiente 11-15"])
        && String(result.telegram_message || "").includes("10. DRAFT-PEND-LIST-10")
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

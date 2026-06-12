#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = path.join(root, "data", "concepts.normalized.json");
const chatId = "chat-draft-presentation-test";
const telegramUserId = "user-draft-presentation-test";
const workflowVersion = "CFDI_LOCAL_INGEST_V1";

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function message(result) {
  return String(result.telegram_message || "");
}

function buttons(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text);
}

function assertNoTechnicalDraftId(result) {
  assert(!/\bDRAFT-[A-Za-z0-9_-]+\b/.test(message(result)), message(result));
}

function assertHumanDraftId(result, expected = "BOR-3171") {
  assert(message(result).includes(expected), message(result));
}

function assertCleanDraftList(result) {
  const text = message(result);
  assertNoTechnicalDraftId(result);
  assertHumanDraftId(result);
  assert(!text.includes("[PENDIENTE]"), text);
  assert(!text.includes("[APROBADO]"), text);
  assert(text.includes("Total: <b>$11,020.00</b>"), text);
  assert(text.includes("Orden: mas recientes primero"), text);
  assert.strictEqual(result.parse_mode, "HTML");
}

function assertNoRawHtmlRisk(result) {
  const text = message(result);
  if (/<\/?(?:b|i|u|code|pre)\b/i.test(text)) {
    assert.strictEqual(result.parse_mode, "HTML", text);
  }
}

function demoClient() {
  return {
    client_id: "CLI-PRESENTATION",
    display_name: "Real Bilbao",
    razon_social: "Real Bilbao Demo",
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
    id: "SVC-CCTV-PRESENTATION",
    concepto_factura: "SERVICIO DE INSTALACION Y CONFIGURACION DE SISTEMA DE VIDEOVIGILANCIA CCTV",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    familia: "CCTV",
    tipo: "SERVICIO",
    operacion: "SERVICIO",
  };
}

function draft(draftId, status, index = 0, extra = {}) {
  return {
    draft_id: draftId,
    chat_id: chatId,
    update_id: 99600 + index,
    message_original: "Instalacion de camaras CCTV en Real Bilbao",
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: concept(),
    top_3: [],
    telegram_message: "BORRADOR CFDI",
    client_id: "CLI-PRESENTATION",
    client_snapshot: demoClient(),
    display_title: "Instalacion de 3 camaras CCTV",
    amount: 9500,
    tax_mode: "MAS_IVA",
    subtotal: 9500,
    iva_amount: 1520,
    isr_retention_amount: 0,
    iva_retention_amount: 0,
    total: 11020,
    tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
    tax_review_required: true,
    updated_at: new Date(Date.parse("2026-06-11T12:00:00.000Z") - index * 60000).toISOString(),
    ...extra,
  };
}

function executeDispatchPlan(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  const node = { "Set Config": { json: { telegramBotToken: "123456:TEST_TOKEN_VALUE_abcdefghijklmnopqrstuvwxyz" } } };
  return fn(require, input, node, () => [], 0)[0].json;
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99600,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 99600,
    chat_id: extra.chat_id || chatId,
    telegram_user_id: extra.telegram_user_id || telegramUserId,
    message_id: extra.message_id || String((extra.update_id || 99600) + 100),
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
    today_summary: { pendientes: 1, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER-PRESENTATION",
      telegram_chat_id: extra.chat_id || chatId,
      telegram_user_id: extra.telegram_user_id || telegramUserId,
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-PRESENTATION",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: false,
    ...extra,
  };
}

function listState(kind, listDrafts, page = 1) {
  return {
    state: "LIST_NAVIGATION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        schema_version: "telegram_list_context.v1",
        context_id: `PRESENTATION-${kind}-${page}`,
        chat_id: chatId,
        telegram_user_id: telegramUserId,
        kind,
        page,
        page_size: 5,
        total_items: listDrafts.length,
        sort: "updated_at_desc",
        filter: { status: kind === "DRAFTS_PENDING" ? "PENDIENTE" : "APROBADO" },
        created_at: "2026-06-11T00:00:00.000Z",
        expires_at: "2099-01-01T00:00:00.000Z",
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

function callbackInput(action, payload = {}, extra = {}) {
  const token = extra.token || "draftPRESENT01";
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 99700,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-draft-presentation",
    callback_message_id: "99",
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    action_token: {
      token,
      chat_id: chatId,
      action,
      expires_at: extra.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: extra.used_at || null,
      payload,
    },
  });
}

function run() {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  const dispatchCode = getNode(workflow, "Build Telegram Dispatch Plan").parameters.jsCode;
  new Function("require", "$json", "$node", "$items", "$itemIndex", handleCode);
  new Function("require", "$json", "$node", "$items", "$itemIndex", dispatchCode);

  const pending = draft("DRAFT-20260611-062403-1736943171", "PENDIENTE");
  const approved = draft("DRAFT-20260611-062403-1736943171", "APROBADO");
  const escaped = draft("DRAFT-20260611-062403-1736944429", "APROBADO", 0, {
    client_snapshot: {
      ...demoClient(),
      display_name: "Real <Bilbao> & Asociados",
    },
    display_title: "Diagnóstico y revisión de CCTV CCTV",
    concept: {
      ...concept(),
      concepto_factura: "SERVICIO DE DIAGNÓSTICO <CCTV> & REVISIÓN DE CCTV CCTV",
    },
  });
  const approvedSeven = Array.from({ length: 7 }, (_item, index) => draft(
    index === 6 ? "DRAFT-20260611-062403-1736943171" : `DRAFT-20260611-062403-17369430${index}`,
    "APROBADO",
    index,
  ));

  const checks = [
    {
      name: "pendientes_lista_limpia",
      run: () => executeCode(handleCode, baseInput("/pendientes", { recent_drafts: [pending] })),
      expect: (result) => {
        assert.strictEqual(result.action, "COMMAND_PENDIENTES");
        assertCleanDraftList(result);
        assertNoRawHtmlRisk(result);
        assert(buttons(result).includes("Ver 1"));
      },
    },
    {
      name: "aprobadas_lista_limpia",
      run: () => executeCode(handleCode, baseInput("/aprobadas", { recent_drafts: [approved] })),
      expect: (result) => {
        assert.strictEqual(result.action, "COMMAND_APROBADAS");
        assertCleanDraftList(result);
        assertNoRawHtmlRisk(result);
        assert(buttons(result).includes("Timbrar sandbox 1"));
      },
    },
    {
      name: "aprobadas_paginacion_conserva_presentacion",
      run: () => executeCode(handleCode, callbackInput("LIST_APPROVED", { page: 2 }, { recent_drafts: approvedSeven })),
      expect: (result) => {
        const text = message(result);
        assert.strictEqual(result.action, "COMMAND_APROBADAS");
        assert(text.includes("Mostrando 6-7 de 7"), text);
        assert(text.includes("7. <b>BOR-3171</b>"), text);
        assert(buttons(result).includes("Mas recientes 1-5"), JSON.stringify(buttons(result)));
        assertNoRawHtmlRisk(result);
        assertNoTechnicalDraftId(result);
      },
    },
    {
      name: "detalle_muestra_bor_y_concepto_completo",
      run: () => executeCode(handleCode, baseInput("detalle 7", {
        recent_drafts: approvedSeven,
        chat_state: listState("DRAFTS_APPROVED", approvedSeven, 2),
      })),
      expect: (result) => {
        const text = message(result);
        assert.strictEqual(result.action, "COMMAND_DETALLE");
        assertHumanDraftId(result);
        assertNoTechnicalDraftId(result);
        assert(text.includes("Concepto fiscal:"), text);
        assert(text.includes("SERVICIO DE INSTALACION Y CONFIGURACION DE SISTEMA DE VIDEOVIGILANCIA CCTV"), text);
        assert(text.includes("Total:</b> $11,020.00") || text.includes("Total: <b>$11,020.00</b>"), text);
        assertNoRawHtmlRisk(result);
        assert(buttons(result).includes("Volver a aprobadas"), JSON.stringify(buttons(result)));
      },
    },
    {
      name: "resumen_conserva_importe_y_presentacion_limpia",
      run: () => executeCode(handleCode, baseInput("resumen 7", {
        recent_drafts: approvedSeven,
        chat_state: listState("DRAFTS_APPROVED", approvedSeven, 2),
      })),
      expect: (result) => {
        const text = message(result);
        assert.strictEqual(result.action, "COMMAND_RESUMEN");
        assertHumanDraftId(result);
        assertNoTechnicalDraftId(result);
        assert(text.includes("$11,020.00"), text);
        assert.strictEqual(result.parse_mode, "HTML");
        assertNoRawHtmlRisk(result);
      },
    },
    {
      name: "callback_view_draft_conserva_parse_mode_html",
      run: () => executeCode(handleCode, callbackInput("VIEW_DRAFT", { draft_id: approved.draft_id }, { recent_drafts: [approved] })),
      expect: (result) => {
        assert.strictEqual(result.action, "COMMAND_DETALLE");
        assert.strictEqual(result.parse_mode, "HTML");
        assertHumanDraftId(result);
        assertNoTechnicalDraftId(result);
      },
    },
    {
      name: "dispatch_plan_auto_parse_mode_para_html",
      run: () => executeDispatchPlan(dispatchCode, {
        chat_id: chatId,
        source_kind: "MESSAGE",
        telegram_message: "<b>Borrador aprobado</b>",
      }),
      expect: (result) => {
        assert.strictEqual(result.parse_mode, "HTML");
        assert.strictEqual(result.telegram_dispatch_method, "sendMessage");
      },
    },
    {
      name: "dispatch_plan_preserva_parse_mode_edit_y_fallback",
      run: () => executeDispatchPlan(dispatchCode, {
        chat_id: chatId,
        source_kind: "CALLBACK_QUERY",
        callback_query_id: "cb-presentation",
        callback_message_id: "77",
        telegram_message: "<b>Borrador aprobado</b>",
        parse_mode: "HTML",
      }),
      expect: (result) => {
        assert.strictEqual(result.parse_mode, "HTML");
        assert.strictEqual(result.telegram_dispatch_method, "editMessageText");
        assert.strictEqual(result.telegram_dispatch_can_edit, true);
      },
    },
    {
      name: "texto_dinamico_html_escapado_y_titulo_humano",
      run: () => executeCode(handleCode, baseInput("/aprobadas", { recent_drafts: [escaped] })),
      expect: (result) => {
        const text = message(result);
        assert.strictEqual(result.action, "COMMAND_APROBADAS");
        assert(text.includes("Real &lt;Bilbao&gt; &amp; Asociados"), text);
        assert(!text.includes("CCTV CCTV"), text);
        assert(!text.includes("DiagnóStico"), text);
        assert(!text.includes("Diagnóstico Y Revisión"), text);
        assert(!text.includes("Revisión De"), text);
        assert(text.includes("Diagnóstico y revisión de CCTV"), text);
        assert.strictEqual(result.parse_mode, "HTML");
      },
    },
  ];

  let failed = 0;
  console.log("Telegram Draft Presentation Contract");
  for (const check of checks) {
    try {
      const result = check.run();
      check.expect(result);
      console.log(` - ${check.name}: PASS (${result.action})`);
    } catch (error) {
      failed += 1;
      console.error(` - ${check.name}: FAIL (${error.message})`);
    }
  }
  if (failed) {
    console.error(`Resumen: ${checks.length - failed}/${checks.length} PASS`);
    process.exit(1);
  }
  console.log(`Resumen: ${checks.length}/${checks.length} PASS`);
}

run();

#!/usr/bin/env node
const assert = require("assert");
const path = require("path");

const {
  CALLBACK_DATA_LIMIT,
  parseCallbackData,
} = require("../lib/telegram-action-token-utils");
const { validateTelegramCallbackData } = require("../lib/telegram-product-menu-contract");
const {
  allCallbackData,
  baseSource,
  callbackInput: deliveryCallbackInput,
  executeCode,
  getNodeCode,
  prepareStdout,
  runSummary,
  sandboxStampedDraft,
} = require("../lib/test-telegram-delivery-workflow-harness");

const root = path.resolve(__dirname, "../..");
const catalogPath = path.join(root, "data", "concepts.normalized.json");
const workflowVersion = "CFDI_LOCAL_INGEST_V1";
const chatId = "chat-ui-button-audit";

function demoClient() {
  return {
    client_id: "CLI-AUDIT-RIVERA",
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
    id: "SVC-CCTV-AUDIT",
    concepto_factura: "SERVICIO DE DIAGNOSTICO Y REVISION DE SISTEMA CCTV",
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
    update_id: 88001,
    message_original: "Privada Rivera, revise camaras por 800 +IVA",
    status,
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    concept: concept(),
    top_3: [],
    telegram_message: "BORRADOR CFDI",
    client_id: "CLI-AUDIT-RIVERA",
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

function previewState(blockers = []) {
  const selectedConcept = concept();
  const ctx = {
    draft_id: "DRAFT-AUDIT-PREVIEW",
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
    preview_draft: draft("DRAFT-AUDIT-PREVIEW", "PENDIENTE"),
  };
  return {
    state: "PREVIEW_READY",
    original_text: ctx.original_text,
    context: { pending_invoice_context: ctx },
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 88010,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 88010,
    chat_id: extra.chat_id || chatId,
    telegram_user_id: extra.telegram_user_id || chatId,
    message_id: extra.message_id || String((extra.update_id || 88010) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: workflowVersion,
    workflowVersion,
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    client_invoice_summary: extra.client_invoice_summary || [],
    recent_callback_events: extra.recent_callback_events || [],
    bot_state: {},
    today_summary: extra.today_summary || {
      pendientes: 1,
      aprobados: 1,
      descartados: 0,
      bloqueados: 0,
    },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER-AUDIT",
      telegram_chat_id: extra.chat_id || chatId,
      telegram_user_id: extra.telegram_user_id || chatId,
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-AUDIT",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbackInput(action, payload = {}, extra = {}) {
  const token = extra.token || `AUDIT${String(extra.update_id || 88020).padStart(8, "0")}`;
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 88020,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-AUDIT-${extra.update_id || 88020}`,
    callback_message_id: "880",
    source_message_id: "",
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    client_invoice_summary: extra.client_invoice_summary || [],
    action_token: {
      token,
      chat_id: extra.chat_id || chatId,
      draft_id: payload.draft_id || extra.draft_id || null,
      action,
      expires_at: extra.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: extra.used_at || null,
      payload,
    },
    ...extra,
  });
}

function sandboxDownloadedDraft(draftId = "DRAFT-AUDIT-DOWNLOADED") {
  return draft(draftId, "APROBADO", {
    invoice_status: "SANDBOX_TIMBRADO",
    sandbox_status: "APROBADO",
    payment_status: "PENDIENTE",
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
    },
  });
}

function sandboxDownloadReadyDraft(draftId = "DRAFT-AUDIT-DOWNLOAD-READY") {
  return draft(draftId, "APROBADO", {
    invoice_status: "SANDBOX_TIMBRADO",
    sandbox_status: "APROBADO",
    payment_status: "PENDIENTE",
    sandbox_pac_summary: {
      artifact_status: "DOWNLOAD_READY",
      xml_downloaded: false,
      pdf_downloaded: false,
      xml_content_valid: false,
      pdf_content_valid: false,
    },
  });
}

function validStampedCancelDraft() {
  return {
    ...sandboxDownloadedDraft("DRAFT-AUDIT-CANCEL"),
    status: "SANDBOX_TIMBRADO",
    emitter_id: "EMITTER-DEMO",
    pac_invoice_id: "FACTURA-COM-MOCK-CFDI-AUDIT",
    uuid: "00000000-0000-4000-8000-000000000777",
    cfdi_uid: "FACTURA-COM-MOCK-CFDI-AUDIT",
    sandbox_identity: {
      pac_invoice_id: "FACTURA-COM-MOCK-CFDI-AUDIT",
      uuid: "00000000-0000-4000-8000-000000000777",
    },
  };
}

function sandboxCancelStdout(status = "OK") {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.cancel",
    status,
    ok: status === "OK",
    duration_ms: 83,
    artifacts: [{ key: "output.manifest_path", path: "runtime/storage-sandbox/draft-cancellations/audit/sandbox-cancel-response.json" }],
    warnings: [],
    errors: status === "OK" ? [] : ["PAC_CANCEL_ERROR"],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-AUDIT-CANCEL",
      provider: "Factura.com Sandbox",
      invoice_status: status === "OK" ? "SANDBOX_CANCELADO" : "SANDBOX_CANCEL_ERROR",
      artifacts_count: 1,
      original_artifacts_deleted: false,
    },
  });
}

function visibleButtons(result) {
  return (result?.reply_markup?.inline_keyboard || result?.sandbox_reply_markup?.inline_keyboard || [])
    .flat()
    .filter((button) => button && button.text);
}

function buttonTexts(result) {
  return visibleButtons(result).map((button) => String(button.text || ""));
}

function assertHasButtons(result, labels) {
  const texts = buttonTexts(result);
  for (const label of labels) assert(texts.includes(label), `missing button: ${label}; got ${texts.join(", ")}`);
}

function assertNoButtons(result, labels) {
  const texts = buttonTexts(result);
  for (const label of labels) assert(!texts.includes(label), `forbidden button visible: ${label}`);
}

function assertDispatch(result) {
  if (!visibleButtons(result).length) return;
  assert.strictEqual(result.should_send_telegram, true, `${result.action} visible buttons without dispatch`);
  assert(String(result.telegram_message || result.send_text || "").trim().length > 0, `${result.action} missing telegram_message`);
}

function assertCallbackDataSafe(result) {
  for (const button of visibleButtons(result)) {
    const callbackData = String(button.callback_data || "");
    assert(callbackData.length > 0, `${button.text}: callback_data missing`);
    assert(callbackData.length <= CALLBACK_DATA_LIMIT, `${button.text}: callback_data too long: ${callbackData}`);
    if (callbackData.startsWith("cfdi_nav:") || callbackData.startsWith("cfdi_sbx:")) {
      assert(validateTelegramCallbackData(callbackData).ok, `${button.text}: invalid product callback ${callbackData}`);
      assert(!/[A-Z&]{3,4}\d{6}[A-Z0-9]{3}/i.test(callbackData), `${button.text}: RFC in callback`);
      assert(!/DRAFT-|CLI-|Privada|Rivera|81111811|concept|clave|monto|total/i.test(callbackData), `${button.text}: domain data in callback`);
    } else {
      assert(parseCallbackData(callbackData), `${button.text}: invalid token callback ${callbackData}`);
    }
  }
}

function assertVisibleContract(result, options = {}) {
  assertDispatch(result);
  assertCallbackDataSafe(result);
  if (options.allow) assertHasButtons(result, options.allow);
  if (options.forbid) assertNoButtons(result, options.forbid);
  if (options.sqlIncludes) {
    const sql = String(result.persistence_sql || result.callback_processing_sql || "");
    for (const item of options.sqlIncludes) assert(sql.includes(item), `SQL missing ${item}`);
  }
  if (options.sqlExcludes) {
    const sql = String(result.persistence_sql || result.callback_processing_sql || "");
    for (const item of options.sqlExcludes) assert(!sql.includes(item), `SQL includes forbidden ${item}`);
  }
}

function assertFreshNoStale(result, staleCallbacks = []) {
  const callbacks = allCallbackData(result.reply_markup || result.sandbox_reply_markup || {});
  for (const stale of staleCallbacks) assert(!callbacks.includes(stale), `stale callback reused: ${stale}`);
  const tokens = callbacks.filter((value) => String(value).startsWith("cfdi:"));
  assert.strictEqual(new Set(tokens).size, tokens.length, "duplicate token callback_data in visible menu");
}

function auditCase(cases, name, fn) {
  cases.push({ name, fn });
}

function deliverySendStdout(channel = "TELEGRAM_DOCUMENT_CHANNEL") {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.documents.delivery.send",
    status: "OK",
    ok: true,
    duration_ms: 120,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-AUDIT-DELIVERY-SEND",
      client_id: "CLI-REAL-BILBAO",
      channel,
      status: "SENT",
      delivery_ledger: {
        delivery_id: "DELIV-AUDIT-DELIVERY-SEND",
        delivery_status: "SENT",
        channel,
        recipient_redacted: channel === "PROVIDER_EMAIL" ? "r***@example.com" : "[REDACTED_CHAT_ID len=9]",
        sent_at: "2026-06-11T12:00:00.000Z",
      },
    },
  });
}

function runAudit() {
  const handleCode = getNodeCode("Handle Commands And Scoring");
  const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
  const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");

  const pending = draft("DRAFT-AUDIT-PENDING", "PENDIENTE");
  const approved = draft("DRAFT-AUDIT-APPROVED", "APROBADO");
  const discarded = draft("DRAFT-AUDIT-DISCARDED", "DESCARTADO");
  const downloadReady = sandboxDownloadReadyDraft();
  const downloaded = sandboxDownloadedDraft();
  const cases = [];

  auditCase(cases, "UI_PREVIEW_INITIAL", () => {
    const result = executeCode(handleCode, baseInput("Privada Rivera, revise camaras por 800 +IVA", { update_id: 88101 }));
    assert.strictEqual(result.action, "NEEDS_CONFIRM_DRAFT");
    assertVisibleContract(result, {
      allow: ["Confirmar", "Editar", "Cancelar", "Ver detalle"],
      forbid: ["Timbrar sandbox", "Descargar XML/PDF sandbox"],
    });
    assertFreshNoStale(result);
  });

  auditCase(cases, "NEEDS_CONFIRM_DRAFT", () => {
    const result = executeCode(handleCode, baseInput("ver", { update_id: 88102, chat_state: previewState() }));
    assert(["PREVIEW_READY", "NEEDS_CONFIRM_DRAFT"].includes(result.action), result.action);
    assertVisibleContract(result, {
      allow: ["Confirmar", "Editar", "Cancelar", "Ver detalle"],
      forbid: ["Timbrar sandbox"],
    });
  });

  auditCase(cases, "DRAFT_CONFIRMED", () => {
    const result = executeCode(handleCode, baseInput("confirmar", { update_id: 88103, chat_state: previewState() }));
    assert.strictEqual(result.action, "DRAFT_CONFIRMED");
    assertVisibleContract(result, {
      allow: ["Ver borrador", "Pendientes", "Nueva factura"],
      forbid: ["Timbrar sandbox", "Aprobar", "Descartar"],
      sqlIncludes: ["INSERT INTO cfdi_drafts"],
    });
  });

  auditCase(cases, "DRAFT_DETAIL_PENDING", () => {
    const result = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-PENDING", { update_id: 88104, recent_drafts: [pending, approved] }));
    assert.strictEqual(result.action, "COMMAND_DETALLE");
    assertVisibleContract(result, {
      allow: ["Aprobar", "Descartar", "Volver a pendientes", "Ver resumen"],
      forbid: ["Timbrar sandbox", "Descargar XML/PDF sandbox"],
    });
  });

  auditCase(cases, "BORRADOR_APROBADO_DETAIL", () => {
    const pendingResult = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-PENDING", { update_id: 88105, recent_drafts: [pending] }));
    const approvedResult = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-APPROVED", { update_id: 88106, recent_drafts: [approved] }));
    assertVisibleContract(pendingResult, { allow: ["Aprobar", "Descartar"], forbid: ["Timbrar sandbox"] });
    assertVisibleContract(approvedResult, { allow: ["Timbrar sandbox", "Regresar a borrador", "Volver a aprobadas", "Ver resumen"], forbid: ["Aprobar", "Descartar"] });
  });

  auditCase(cases, "DRAFT_APPROVED_POST_ACTION", () => {
    const result = executeCode(handleCode, callbackInput("APPROVE_DRAFT", { draft_id: pending.draft_id }, { update_id: 88107, recent_drafts: [pending] }));
    assert.strictEqual(result.action, "COMMAND_APROBAR");
    assertVisibleContract(result, {
      allow: ["Ver borrador", "Timbrar sandbox", "Regresar a borrador", "Menu principal"],
      forbid: ["Aprobar", "Descartar"],
      sqlIncludes: ["UPDATE cfdi_action_tokens SET used_at", "status = 'APROBADO'"],
    });
  });

  auditCase(cases, "DISCARDED_POST_ACTION", () => {
    const result = executeCode(handleCode, callbackInput("DISCARD_DRAFT", { draft_id: pending.draft_id }, { update_id: 88108, recent_drafts: [pending] }));
    assert.strictEqual(result.action, "COMMAND_DESCARTAR");
    assertVisibleContract(result, {
      allow: ["Ver pendientes", "Crear nuevo borrador", "Menu principal", "Ayuda"],
      forbid: ["Ver resumen", "Aprobar", "Descartar", "Timbrar sandbox", "Regresar a borrador"],
      sqlIncludes: ["UPDATE cfdi_action_tokens SET used_at", "status = 'DESCARTADO'"],
    });
  });

  auditCase(cases, "DISCARDED_DETAIL_SAFE_NAV", () => {
    const result = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-DISCARDED", { update_id: 88109, recent_drafts: [discarded] }));
    assert.strictEqual(result.action, "COMMAND_DETALLE");
    assertVisibleContract(result, {
      allow: ["Ver pendientes", "Crear nuevo borrador", "Menu principal", "Ayuda"],
      forbid: ["Ver resumen", "Aprobar", "Descartar", "Timbrar sandbox", "Regresar a borrador"],
    });
  });

  auditCase(cases, "RESTORED_BACK_TO_BORRADOR", () => {
    const result = executeCode(handleCode, callbackInput("RESTORE_DRAFT", { draft_id: approved.draft_id }, { update_id: 88110, recent_drafts: [approved] }));
    assert.strictEqual(result.action, "COMMAND_REGRESAR_BORRADOR");
    assertVisibleContract(result, {
      allow: ["Aprobar", "Descartar", "Volver a pendientes", "Ver resumen"],
      forbid: ["Timbrar sandbox", "Regresar a borrador"],
      sqlIncludes: ["UPDATE cfdi_action_tokens SET used_at", "status = 'PENDIENTE'"],
    });
  });

  auditCase(cases, "SANDBOX_TIMBRADO_DOWNLOAD_READY", () => {
    const result = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-DOWNLOAD-READY", { update_id: 88111, recent_drafts: [downloadReady] }));
    assert.strictEqual(result.action, "COMMAND_DETALLE");
    assertVisibleContract(result, {
      allow: ["Descargar XML/PDF sandbox"],
      forbid: ["Timbrar sandbox"],
    });
  });

  auditCase(cases, "SANDBOX_TIMBRADO_DOWNLOADED", () => {
    const result = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-DOWNLOADED", { update_id: 88112, recent_drafts: [downloaded] }));
    assert.strictEqual(result.action, "COMMAND_DETALLE");
    assertVisibleContract(result, {
      allow: ["Descargar XML/PDF sandbox", "Ver estado documental", "Enviar por correo", "Enviar a canal documentos"],
      forbid: ["Timbrar sandbox"],
    });
  });

  auditCase(cases, "LEGACY_LEDGER_DOWNLOAD_READY_DEPRECATED", () => {
    const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger", {
      update_id: 88131,
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "CALLBACK-AUDIT-LEDGER-DOWNLOAD-READY",
      callback_message_id: "881",
      client_invoice_ledger: [downloadReady],
    }));
    assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER_DEPRECATED");
    assertVisibleContract(result, {
      allow: ["Facturas", "Clientes", "Cobranza", "Menu principal"],
      forbid: ["Timbrar sandbox", "Descargar XML/PDF sandbox", "Ver factura", "Marcar pagada"],
      sqlExcludes: ["DOWNLOAD_SANDBOX_ARTIFACTS", "VIEW_DRAFT", "MARK_PAYMENT_PAID", "MARK_PAYMENT_PARTIAL", "MARK_PAYMENT_OVERDUE"],
    });
  });

  auditCase(cases, "LEGACY_LEDGER_DOWNLOADED_DEPRECATED", () => {
    const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger", {
      update_id: 88132,
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "CALLBACK-AUDIT-LEDGER-DOWNLOADED",
      callback_message_id: "881",
      client_invoice_ledger: [downloaded],
    }));
    assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER_DEPRECATED");
    assertVisibleContract(result, {
      allow: ["Facturas", "Clientes", "Cobranza", "Menu principal"],
      forbid: ["Timbrar sandbox", "Ver estado documental", "Enviar por correo", "Enviar a canal documentos", "Ver factura", "Marcar pagada"],
      sqlExcludes: ["DELIVERY_STATUS", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", "DELIVERY_PREPARE_PROVIDER_EMAIL", "MARK_PAYMENT_PAID", "MARK_PAYMENT_PARTIAL", "MARK_PAYMENT_OVERDUE"],
    });
  });

  auditCase(cases, "STAMP_POST_ACTION_DOWNLOAD_READY", () => {
    const stdout = JSON.stringify({
      schema_version: "sandbox_action_result.v1",
      action: "sandbox.draft.stamp",
      status: "OK",
      ok: true,
      duration_ms: 80,
      artifacts: [],
      warnings: [],
      errors: [],
      sensitive_findings: [],
      output: {
        draft_id: "DRAFT-AUDIT-STAMP",
        client_display_name: "Real Bilbao",
        invoice_status: "SANDBOX_TIMBRADO",
        payment_status: "PENDIENTE",
        total: 928,
        pac_result: {
          live_mode: true,
          mode: "live",
          uuid_present: true,
          pac_invoice_id_present: true,
          artifact_status: "DOWNLOAD_READY",
          xml_provider_available: true,
          pdf_provider_available: true,
        },
      },
    });
    const result = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({ draft_id: "DRAFT-AUDIT-STAMP" }) }]);
    assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
    assertVisibleContract(result, {
      allow: ["Descargar XML/PDF sandbox", "Ver factura", "Menu principal"],
      forbid: ["Timbrar sandbox"],
      sqlIncludes: ["DOWNLOAD_SANDBOX_ARTIFACTS"],
    });
  });

  auditCase(cases, "DOWNLOAD_POST_ACTION_DELIVERY_READY", () => {
    const stdout = JSON.stringify({
      schema_version: "sandbox_action_result.v1",
      action: "sandbox.draft.download-artifacts",
      status: "OK",
      ok: true,
      duration_ms: 90,
      artifacts: [],
      warnings: [],
      errors: [],
      sensitive_findings: [],
      output: {
        draft_id: "DRAFT-AUDIT-DOWNLOAD-ACTION",
        client_display_name: "Real Bilbao",
        invoice_status: "SANDBOX_TIMBRADO",
        payment_status: "PENDIENTE",
        artifact_status: "DOWNLOADED",
        xml_downloaded: true,
        pdf_downloaded: true,
        xml_content_valid: true,
        pdf_content_valid: true,
        storage_updated: true,
        persistence_status: "UPDATED",
      },
    });
    const result = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({ draft_id: "DRAFT-AUDIT-DOWNLOAD-ACTION" }) }]);
    assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
    assertVisibleContract(result, {
      allow: ["Ver estado documental", "Enviar por correo", "Enviar a canal documentos", "Ver factura", "Menu principal"],
      forbid: ["Timbrar sandbox"],
      sqlIncludes: ["DELIVERY_PREPARE_PROVIDER_EMAIL", "DELIVERY_PREPARE_TELEGRAM_CHANNEL"],
    });
  });

  auditCase(cases, "DELIVERY_PREPARED_CONFIRM_REQUIRED", () => {
    const result = runSummary(prepareStdout("TELEGRAM_DOCUMENT_CHANNEL"), baseSource({
      draft_id: "DRAFT-AUDIT-DELIVERY-PREPARE",
      sandbox_delivery_channel: "TELEGRAM_DOCUMENT_CHANNEL",
    }));
    assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
    assertVisibleContract(result, {
      allow: ["Confirmar envio canal", "Ver estado documental", "Cancelar"],
      forbid: ["Enviar a canal documentos", "Enviar por correo"],
      sqlIncludes: ["DELIVERY_CONFIRM_TELEGRAM_CHANNEL"],
      sqlExcludes: ["sandbox.documents.delivery.send"],
    });
  });

  auditCase(cases, "DELIVERY_SENT_REGENERATES_DOCUMENT_MENU", () => {
    const stale = "cfdi:STALEDELIVERYTOKEN001";
    const staleMarkup = { inline_keyboard: [[{ text: "Enviar a canal documentos", callback_data: stale }]] };
    const result = executeCode(summaryCode, { stdout: deliverySendStdout("TELEGRAM_DOCUMENT_CHANNEL") }, () => [{ json: baseSource({
      draft_id: "DRAFT-AUDIT-DELIVERY-SEND",
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "CALLBACK-AUDIT-DELIVERY-SEND",
      callback_message_id: "881",
      sandbox_delivery_channel: "TELEGRAM_DOCUMENT_CHANNEL",
      sandbox_reply_markup: staleMarkup,
      reply_markup: staleMarkup,
    }) }]);
    assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
    assertVisibleContract(result, {
      allow: ["Ver estado documental", "Enviar a canal documentos", "Enviar por correo", "Ver factura", "Menu principal"],
      forbid: ["Confirmar envio canal"],
      sqlIncludes: ["DELIVERY_STATUS", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", "DELIVERY_PREPARE_PROVIDER_EMAIL"],
    });
    assertFreshNoStale(result, [stale]);
  });

  auditCase(cases, "CANCEL_REQUESTED_CONFIRMATION_ONLY", () => {
    const cancelDraft = validStampedCancelDraft();
    const result = executeCode(handleCode, callbackInput("REQUEST_CANCEL_SANDBOX", { draft_id: cancelDraft.draft_id }, {
      token: "CANCELAUDITREQ1",
      update_id: 88113,
      recent_drafts: [cancelDraft],
    }));
    assert.strictEqual(result.action, "DRAFT_SANDBOX_CANCEL_CONFIRMATION_SHOWN");
    assert.strictEqual(result.should_execute_sandbox_action, undefined);
    assertVisibleContract(result, {
      allow: ["Si, cancelar sandbox", "No, volver"],
      sqlIncludes: ["DRAFT_SANDBOX_CANCEL_CONFIRMATION_SHOWN", "CONFIRM_CANCEL_SANDBOX"],
      sqlExcludes: ["SANDBOX_CANCELANDO"],
    });
  });

  auditCase(cases, "CANCELLED_SUMMARY_SAFE_RESPONSE", () => {
    const cancelDraft = validStampedCancelDraft();
    const source = executeCode(handleCode, callbackInput("CONFIRM_CANCEL_SANDBOX", { draft_id: cancelDraft.draft_id }, {
      token: "CANCELAUDITOK01",
      update_id: 88114,
      recent_drafts: [cancelDraft],
    }));
    assert.strictEqual(source.action, "DRAFT_SANDBOX_CANCEL_IN_PROGRESS");
    const result = executeCode(summaryCode, { stdout: sandboxCancelStdout("OK") }, () => [{ json: source }]);
    assert.strictEqual(result.sandbox_draft_status, "SANDBOX_CANCELADO");
    assertVisibleContract(result, {
      allow: ["Ver ultimo resultado sandbox", "Menu principal"],
      forbid: ["Timbrar sandbox", "Confirmar envio canal", "Confirmar envio correo"],
      sqlIncludes: ["DRAFT_SANDBOX_CANCEL_RESULT", "SANDBOX_CANCELADO"],
    });
  });

  auditCase(cases, "TOKEN_EXPIRED_CONTEXT_RECOVERED", () => {
    const result = executeCode(handleCode, callbackInput("APPROVE_DRAFT", { draft_id: pending.draft_id }, {
      update_id: 88115,
      recent_drafts: [pending],
      expires_at: "2020-01-01T00:00:00.000Z",
    }));
    assert(["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action), result.action);
    assertVisibleContract(result, {
      allow: ["Aprobar", "Descartar", "Volver a pendientes", "Ver resumen"],
      sqlExcludes: ["status = 'APROBADO'", "status = 'DESCARTADO'"],
    });
  });

  auditCase(cases, "TOKEN_USED_CONTEXT_RECOVERED", () => {
    const result = executeCode(handleCode, callbackInput("RESTORE_DRAFT", { draft_id: approved.draft_id }, {
      update_id: 88116,
      recent_drafts: [approved],
      used_at: "2026-06-11T10:00:00.000Z",
    }));
    assert(["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action), result.action);
    assertVisibleContract(result, {
      allow: ["Timbrar sandbox", "Regresar a borrador", "Volver a aprobadas", "Ver resumen"],
      forbid: ["Aprobar", "Descartar"],
      sqlExcludes: ["status = 'PENDIENTE'"],
    });
  });

  auditCase(cases, "DELIVERY_TOKEN_USED_RECOVERY_HAS_STATUS", () => {
    const result = executeCode(handleCode, callbackInput("DELIVERY_PREPARE_PROVIDER_EMAIL", { draft_id: downloaded.draft_id, channel: "PROVIDER_EMAIL" }, {
      update_id: 88133,
      recent_drafts: [downloaded],
      used_at: "2026-06-11T10:00:00.000Z",
    }));
    assert(["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action), result.action);
    assertVisibleContract(result, {
      allow: ["Ver estado documental", "Enviar por correo", "Enviar a canal documentos", "Ver borrador"],
      forbid: ["Timbrar sandbox"],
      sqlExcludes: ["sandbox.documents.delivery.send"],
    });
  });

  auditCase(cases, "CALLBACK_TOKEN_INVALID_RECOVERY", () => {
    const result = executeCode(handleCode, baseInput("cfdi:bad", {
      update_id: 88117,
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "CALLBACK-AUDIT-BAD",
      callback_message_id: "882",
      action_token: null,
      recent_drafts: [],
    }));
    assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
    assertVisibleContract(result, {
      allow: ["Ver pendientes", "Crear nuevo borrador", "Menu principal", "Ayuda"],
      forbid: ["Aprobar", "Descartar", "Timbrar sandbox"],
    });
  });

  auditCase(cases, "CALLBACK_TOKEN_CONTEXT_RECOVERED_SAME_CHAT", () => {
    const result = executeCode(handleCode, callbackInput("VIEW_DRAFT", { draft_id: downloaded.draft_id }, {
      update_id: 88118,
      recent_drafts: [downloaded],
      expires_at: "2020-01-01T00:00:00.000Z",
    }));
    assert.strictEqual(result.action, "CALLBACK_TOKEN_CONTEXT_RECOVERED");
    assertVisibleContract(result, {
      allow: ["Descargar XML/PDF sandbox", "Ver estado documental", "Enviar por correo", "Enviar a canal documentos"],
      forbid: ["Timbrar sandbox"],
    });
  });

  auditCase(cases, "VISIBLE_BUTTONS_DISPATCH_PLAN", () => {
    const source = executeCode(handleCode, baseInput("/detalle DRAFT-AUDIT-PENDING", { update_id: 88119, recent_drafts: [pending] }));
    assertVisibleContract(source, { allow: ["Aprobar", "Descartar"] });
    const planned = executeCode(dispatchPlanCode, { ...source, telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT" });
    assert.strictEqual(planned.telegram_dispatch_payload_built, true);
    assert.strictEqual(planned.should_send_telegram, true);
    assert(["sendMessage", "editMessageText"].includes(planned.telegram_dispatch_method), planned.telegram_dispatch_method);
  });

  auditCase(cases, "VIEW_SUMMARY_SQL_DOLLAR_SAFE", () => {
    const result = executeCode(handleCode, callbackInput("VIEW_SUMMARY", {}, {
      update_id: 88120,
      recent_drafts: [],
      client_invoice_ledger: [{
        client_id: "CLI-AUDIT-RIVERA",
        client_display: "Privada Rivera",
        invoice_status: "SANDBOX_TIMBRADO",
        payment_status: "PENDIENTE",
        total: 101410.68,
        created_at: "2026-06-11T10:20:00.000Z",
      }],
    }));
    assert.strictEqual(result.action, "COMMAND_RESUMEN");
    assertVisibleContract(result, { allow: ["Menu principal"] });
    assert(String(result.telegram_message || "").includes("$101410.68"), "telegram summary missing currency");
    assert(!String(result.persistence_sql || "").includes("$101410"), "persistence SQL still contains n8n placeholder-like dollar amount");
    assert(String(result.persistence_sql || "").includes("chr(36)"), "persistence SQL missing safe dollar literal evidence");
  });

  const results = [];
  for (const item of cases) {
    try {
      item.fn();
      results.push({ name: item.name, pass: true, value: "" });
    } catch (error) {
      results.push({ name: item.name, pass: false, value: error.message });
    }
  }
  return results;
}

function printResults(results) {
  console.log("Telegram UI Button State Audit");
  for (const item of results) {
    const suffix = item.value ? ` (${item.value})` : "";
    console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${suffix}`);
  }
  const failed = results.filter((item) => !item.pass);
  console.log(`Resumen: ${results.length - failed.length}/${results.length} PASS`);
  return failed;
}

if (require.main === module) {
  const failed = printResults(runAudit());
  if (failed.length) process.exitCode = 1;
}

module.exports = {
  runAudit,
};

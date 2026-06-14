const assert = require("assert");
const { spawnSync } = require("child_process");

const {
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const { detectStateButtonFailures } = require("./qa/telegram-ui-session-watch");

const handleCode = getNodeCode("Handle Commands And Scoring");
const checks = [];
const plannedSandboxActions = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-RS-72",
    draft_id: overrides.draft_id || "DRAFT-RESEND-72",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-72" : overrides.provider_folio,
    provider_serie: "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174072" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-RS-72" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PAC-RS-72" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: 928,
    updated_at: "2026-06-14T10:00:00.000Z",
    sandbox_pac_summary: {},
  };
}

const pending = providerLink();
const sent = providerLink({ draft_id: "DRAFT-RESEND-SENT" });
const downloadReady = providerLink({ draft_id: "DRAFT-RESEND-READY", artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloadError = providerLink({ draft_id: "DRAFT-RESEND-DLERR", artifact_status: "DOWNLOAD_ERROR", xml_downloaded: false, pdf_downloaded: false });
const sandboxError = providerLink({ draft_id: "DRAFT-RESEND-SBXERR", invoice_status: "SANDBOX_ERROR", artifact_status: "N/A", xml_downloaded: false, pdf_downloaded: false });

function deliveryRow(link, overrides = {}) {
  return {
    delivery_id: overrides.delivery_id || `DELIV-${link.draft_id}`,
    draft_id: link.draft_id,
    client_id: link.client_id,
    provider: "factura_com",
    environment: "SANDBOX",
    channel: overrides.channel || "PROVIDER_EMAIL",
    delivery_status: overrides.delivery_status || "SENT",
    delivery_action: overrides.delivery_action || "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    recipient_present: true,
    recipient_redacted: overrides.recipient_redacted || "r***@example.test",
    normalized_errors: [],
    normalized_warnings: [],
    sent_at: overrides.sent_at || "2026-06-14T11:00:00.000Z",
    updated_at: overrides.updated_at || "2026-06-14T11:00:00.000Z",
  };
}

const sentLedger = [
  deliveryRow(sent, { channel: "PROVIDER_EMAIL", sent_at: "2026-06-14T11:00:00.000Z" }),
  deliveryRow(sent, { delivery_id: "DELIV-RS-CHANNEL", channel: "TELEGRAM_DOCUMENT_CHANNEL", sent_at: "2026-06-14T11:05:00.000Z", recipient_redacted: "canal documental" }),
];

function draftForLink(link, ledger = []) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DOC-RESEND";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.invoice_status = link.invoice_status;
  draft.payment_status = link.payment_status;
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: link.artifact_status,
    uuid: link.provider_uuid || "",
    cfdi_uid: link.provider_invoice_uid || "",
    pac_invoice_id: link.provider_invoice_id || "",
    folio: link.provider_folio || "",
    xml_downloaded: link.xml_downloaded === true,
    pdf_downloaded: link.pdf_downloaded === true,
    xml_content_valid: link.xml_downloaded === true,
    pdf_content_valid: link.pdf_downloaded === true,
  };
  draft.document_delivery_ledger = ledger;
  return draft;
}

function listState(rows, kind = "DOCUMENTS_RECENT", entityType = "DOCUMENT") {
  return {
    state: `${kind}_LIST`,
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind,
        chat_id: "CHAT-DOC-RESEND",
        telegram_user_id: "USER-DOC-RESEND",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        source_module: entityType === "INVOICE" ? "FACTURAS" : "DOCUMENTS",
        return_to: entityType === "INVOICE" ? "INVOICES_MENU" : "DOCUMENTS_MENU",
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType,
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
          display_id: row.provider_folio || `F-${index + 1}`,
        })),
      },
    },
  };
}

function documentState(row) {
  return {
    state: "DOCUMENT_DETAIL",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      screen_id: "DOCUMENT_DETAIL",
      source_module: "DOCUMENTS",
      selected_document: {
        draft_id: row.draft_id,
        provider_invoice_link_id: row.provider_invoice_link_id,
        display_id: row.provider_folio || "F-72",
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const row = extra.row || pending;
  const rows = extra.rows || [row];
  const ledger = extra.ledger || [];
  return {
    update_id: extra.update_id || 180001,
    max_seen_update_id: extra.update_id || 180001,
    chat_id: "CHAT-DOC-RESEND",
    telegram_user_id: "USER-DOC-RESEND",
    message_id: String(extra.update_id || 180001),
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] }],
    tax_rules: [],
    recent_drafts: rows.map((item) => draftForLink(item, item.draft_id === sent.draft_id ? sentLedger : ledger)),
    provider_invoice_links: rows,
    document_delivery_ledger: ledger,
    client_invoice_ledger: [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: rows.length, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "CALLBACK_QUERY",
    callback_query_id: extra.callback_query_id || `CB-${extra.update_id || 180001}`,
    callback_message_id: "42",
    source_message_id: "",
    authorized_user: { user_id: "OWNER-DOC-RESEND", role: "OWNER", enabled: true, telegram_chat_id: "CHAT-DOC-RESEND", telegram_user_id: "USER-DOC-RESEND" },
    security_user_id: "OWNER-DOC-RESEND",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
  };
}

function runCallback(callbackData, extra = {}) {
  return executeCode(handleCode, baseInput(callbackData, { ...extra, source_kind: "CALLBACK_QUERY" }));
}

function documentDetail(row, ledger = []) {
  return executeCode(handleCode, baseInput("cfdi_doc:view:1", {
    row,
    rows: [row],
    ledger,
    chat_state: listState([row], "DOCUMENTS_RECENT", "DOCUMENT"),
    update_id: 180100,
  }));
}

function invoiceDetail(row, ledger = []) {
  return executeCode(handleCode, baseInput("ver 1", {
    row,
    rows: [row],
    ledger,
    source_kind: "MESSAGE",
    chat_state: listState([row], "INVOICES_RECENT", "INVOICE"),
    update_id: 180101,
  }));
}

function statusDetail(row, ledger = []) {
  return runCallback("cfdi_doc:status", { row, rows: [row], ledger, chat_state: documentState(row), update_id: 180102 });
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.text || "")).filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertHas(result, label) {
  assert(buttonTexts(result).includes(label), `${label} missing in ${buttonTexts(result).join(",")}`);
}

function assertNotHas(result, pattern) {
  const labels = buttonTexts(result).join(",");
  assert(!pattern.test(labels), labels);
}

function extractToken(result, action) {
  const sql = String(result.persistence_sql || "");
  assert(sql.includes(action), `${action} missing`);
  const callback = callbackDataList(result).find((value) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(value));
  assert(callback, "missing cfdi token callback");
  const token = callback.slice("cfdi:".length);
  const marker = `'${action}', now() + interval '30 minutes', NULL, '`;
  const start = sql.indexOf(marker);
  assert(start >= 0, "token payload missing");
  const jsonStart = start + marker.length;
  const jsonEnd = sql.indexOf("'::jsonb", jsonStart);
  const payload = JSON.parse(sql.slice(jsonStart, jsonEnd).replace(/''/g, "'"));
  return { token, payload };
}

function confirmToken(action, link, tokenInfo, overrides = {}) {
  const ledger = overrides.ledger || sentLedger;
  const draft = overrides.draft || draftForLink(link, ledger);
  const input = callbackInput(tokenInfo.token, action, {
    draft,
    chat_id: "CHAT-DOC-RESEND",
    telegram_user_id: "USER-DOC-RESEND",
    update_id: overrides.update_id || 180500,
    recent_drafts: [draft],
    provider_invoice_links: [link],
    document_delivery_ledger: ledger,
    action_token: {
      token: tokenInfo.token,
      chat_id: "CHAT-DOC-RESEND",
      action,
      used_at: overrides.used_at ?? null,
      expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload: { ...tokenInfo.payload, ...(overrides.payload || {}) },
    },
  });
  const result = executeCode(handleCode, input);
  if (result.should_execute_sandbox_action === true) plannedSandboxActions.push(result.requested_sandbox_action);
  return result;
}

function directToken(action, link, overrides = {}) {
  const channel = action.includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL";
  return {
    token: overrides.token || `${action.replace(/[^A-Z0-9]/g, "").slice(0, 16)}X1`,
    payload: {
      action,
      draft_id: link.draft_id,
      provider_invoice_link_id: link.provider_invoice_link_id,
      display_id: link.provider_folio || "F-72",
      source_module: "DOCUMENTS",
      source_capability: "DOCUMENT_DELIVERY",
      state: "DOCUMENT_DELIVERY_CONFIRM",
      screen_id: "DOCUMENT_DELIVERY_CONFIRM",
      return_to: "DOCUMENT_DETAIL",
      channel,
      requested_channel: channel,
      confirmation_required: true,
      resend: true,
      force: true,
      delivery_intent: "RESEND",
      ...(overrides.payload || {}),
    },
  };
}

function messageText(result) {
  return String(result.telegram_message || result.send_text || "");
}

function assertNoUnsafeUx(result) {
  const text = messageText(result);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/DRAFT-/i.test(text), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/<[a-z][\s\S]*>/i.test(text), text);
  assert(!text.includes("\\n"), text);
}

function assertNoButtonsWithoutHandler(result) {
  for (const callbackData of callbackDataList(result)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:|^cfdi_doc:/.test(callbackData), callbackData);
  }
}

const pendingDetail = () => documentDetail(pending, []);
const sentDetail = () => documentDetail(sent, sentLedger);
const sentStatus = () => statusDetail(sent, sentLedger);
const sentInvoice = () => invoiceDetail(sent, sentLedger);

check("1_document_detail_downloaded_pending_muestra_enviar_correo", () => assertHas(pendingDetail(), "Enviar por correo"));
check("2_document_detail_downloaded_pending_muestra_enviar_canal", () => assertHas(pendingDetail(), "Enviar a canal"));
check("3_document_detail_downloaded_pending_muestra_descargar_xml_pdf", () => assertHas(pendingDetail(), "Descargar XML/PDF"));
check("4_document_detail_downloaded_pending_muestra_historial", () => assertHas(pendingDetail(), "Ver historial de envios"));
check("5_document_detail_sent_muestra_reenviar_correo", () => assertHas(sentDetail(), "Reenviar por correo"));
check("6_document_detail_sent_muestra_reenviar_canal", () => assertHas(sentDetail(), "Reenviar a canal"));
check("7_document_detail_sent_no_muestra_enviar_duplicado", () => assertNotHas(sentDetail(), /(^|,)Enviar por correo|(^|,)Enviar a canal/));
check("8_reenviar_correo_abre_confirmacion_reenvio_correo", () => assert(/Confirmar reenvio por correo/.test(messageText(runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180108 })))));
check("9_reenviar_canal_abre_confirmacion_reenvio_canal", () => assert(/Confirmar reenvio a canal/.test(messageText(runCallback("cfdi_doc:resend_channel", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180109 })))));
check("10_confirmacion_reenvio_correo_no_menciona_canal", () => assert(!/canal/i.test(messageText(runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180110 })))));
check("11_confirmacion_reenvio_canal_no_menciona_correo", () => assert(!/correo/i.test(messageText(runCallback("cfdi_doc:resend_channel", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180111 })))));
check("12_preparacion_reenvio_no_dice_no_se_pudo_enviar", () => assert(!/No se pudo enviar/i.test(messageText(runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180112 })))));
check("13_preparacion_reenvio_no_muestra_motivo_ready", () => assert(!/Motivo:\\s*READY/i.test(messageText(runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180113 })))));
check("14_reenvio_no_envia_directo", () => assert.notStrictEqual(runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180114 }).should_execute_sandbox_action, true));
check("15_confirmacion_reenvio_requiere_token_vigente", () => {
  const prep = runCallback("cfdi_doc:resend_email", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180115 });
  const token = extractToken(prep, "DELIVERY_FORCE_PROVIDER_EMAIL");
  assert.strictEqual(confirmToken("DELIVERY_FORCE_PROVIDER_EMAIL", sent, token).should_execute_sandbox_action, true);
  assert.notStrictEqual(confirmToken("DELIVERY_FORCE_PROVIDER_EMAIL", sent, token, { expires_at: "2000-01-01T00:00:00.000Z", update_id: 180116 }).should_execute_sandbox_action, true);
});
check("16_confirmacion_reenvio_requiere_xml_pdf_descargados", () => assert.strictEqual(confirmToken("DELIVERY_FORCE_PROVIDER_EMAIL", downloadReady, directToken("DELIVERY_FORCE_PROVIDER_EMAIL", downloadReady), { ledger: [], update_id: 180117 }).action, "DOCUMENT_ACTION_BLOCKED"));
check("17_confirmacion_reenvio_bloquea_sandbox_error", () => assert.strictEqual(confirmToken("DELIVERY_FORCE_PROVIDER_EMAIL", sandboxError, directToken("DELIVERY_FORCE_PROVIDER_EMAIL", sandboxError), { ledger: [], update_id: 180118 }).action, "DOCUMENT_ACTION_BLOCKED"));
check("18_confirmacion_reenvio_bloquea_download_error", () => assert.strictEqual(confirmToken("DELIVERY_FORCE_PROVIDER_EMAIL", downloadError, directToken("DELIVERY_FORCE_PROVIDER_EMAIL", downloadError), { ledger: [], update_id: 180119 }).action, "DOCUMENT_ACTION_BLOCKED"));
check("19_document_status_detail_sent_muestra_reenvio", () => { assertHas(sentStatus(), "Reenviar por correo"); assertHas(sentStatus(), "Reenviar a canal"); });
check("20_invoice_detail_sent_muestra_reenvio_o_documentos_operativo", () => { const result = sentInvoice(); assert(buttonTexts(result).includes("Reenviar por correo") || buttonTexts(result).includes("Documentos"), buttonTexts(result).join(",")); });
check("21_download_ready_muestra_descarga_no_envio", () => { const result = documentDetail(downloadReady, []); assertHas(result, "Descargar XML/PDF sandbox"); assertNotHas(result, /Enviar|Reenviar/); });
check("22_download_error_muestra_reintentar_no_envio", () => { const result = documentDetail(downloadError, []); assertHas(result, "Reintentar descarga XML/PDF sandbox"); assertNotHas(result, /Enviar|Reenviar/); });
check("23_sandbox_error_no_muestra_descarga_envio_reenvio", () => assertNotHas(statusDetail(sandboxError, []), /Descargar|Enviar|Reenviar/));
check("24_historial_muestra_filas_sanitizadas", () => assert(/\bCorreo - Enviado\b/.test(messageText(runCallback("cfdi_doc:history", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180124 })))));
check("25_historial_sin_registros_mensaje_humano", () => assert(/No hay envios registrados/.test(messageText(runCallback("cfdi_doc:history", { row: pending, ledger: [], chat_state: documentState(pending), update_id: 180125 })))));
check("26_historial_no_imprime_emails_completos", () => assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/i.test(messageText(runCallback("cfdi_doc:history", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180126 })))));
check("27_historial_no_imprime_uuid_completo", () => assertNoUnsafeUx(runCallback("cfdi_doc:history", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180127 })));
check("28_historial_no_imprime_rutas", () => assertNoUnsafeUx(runCallback("cfdi_doc:history", { row: sent, ledger: sentLedger, chat_state: documentState(sent), update_id: 180128 })));
check("29_watcher_sent_document_hides_resend", () => assert(detectStateButtonFailures({ state: { draft_id: sent.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED", delivery_status: "SENT" }, buttons: [{ text: "Ver estado documental" }, { text: "Descargar XML/PDF" }], context: { action: "DOCUMENT_DETAIL" } }).map((item) => item.code).includes("SENT_DOCUMENT_HIDES_RESEND")));
check("30_watcher_downloaded_missing_artifact_access", () => assert(detectStateButtonFailures({ state: { draft_id: pending.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ text: "Enviar por correo" }, { text: "Enviar a canal" }], context: { action: "DOCUMENT_DETAIL" } }).map((item) => item.code).includes("DOWNLOADED_DOCUMENT_MISSING_ARTIFACT_ACCESS")));
check("31_watcher_resend_prepare_shows_error", () => assert(detectStateButtonFailures({ state: {}, buttons: [{ text: "Confirmar reenvio por correo" }], context: { action: "DOCUMENT_DELIVERY_CONFIRM", delivery_intent: "RESEND", telegram_message: "No se pudo enviar\\nMotivo: READY" } }).map((item) => item.code).includes("RESEND_PREPARE_SHOWS_SEND_ERROR")));
check("32_watcher_resend_channel_mismatch", () => assert(detectStateButtonFailures({ state: {}, buttons: [{ action: "DELIVERY_FORCE_TELEGRAM_CHANNEL", text: "Confirmar reenvio a canal" }], context: { action: "DOCUMENT_DELIVERY_CONFIRM", telegram_message: "Confirmar reenvio por correo\\nDestino: correo" } }).map((item) => item.code).includes("RESEND_CHANNEL_MISMATCH")));
check("33_watcher_no_marca_listas_con_ver_n", () => assert(!detectStateButtonFailures({ state: { draft_id: sent.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED", delivery_status: "SENT" }, buttons: [{ text: "Ver 1", callback_data: "cfdi_doc:view:1" }], context: { action: "DOCUMENTS_SENT_LIST" } }).map((item) => item.code).some((code) => ["SENT_DOCUMENT_HIDES_RESEND", "DOWNLOADED_DOCUMENT_MISSING_ARTIFACT_ACCESS"].includes(code))));
check("34_no_hay_envio_real_en_tests", () => assert(plannedSandboxActions.every((action) => action === "sandbox.documents.delivery.send")));
check("35_no_hay_correo_real", () => assert(!process.env.SATBOT_SEND_REAL_EMAIL));
check("36_no_hay_canal_real", () => assert(!process.env.SATBOT_SEND_REAL_TELEGRAM));
check("37_no_hay_xml_pdf_reales", () => assert(!plannedSandboxActions.includes("sandbox.draft.download-artifacts")));
check("38_no_hay_pagos_reales", () => assert(!JSON.stringify([pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].map((item) => item.reply_markup || {})).includes("MARK_PAYMENT")));
check("39_no_hay_cancelacion", () => assert(!/CANCEL|Cancelar|cancelacion/i.test(JSON.stringify([pendingDetail(), sentDetail(), sentStatus(), sentInvoice()]))));
check("40_no_hay_eliminacion", () => assert(!/Eliminar|purga|delete/i.test(JSON.stringify([pendingDetail(), sentDetail(), sentStatus(), sentInvoice()]))));
check("41_no_hay_uuid_completo", () => [pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].forEach(assertNoUnsafeUx));
check("42_no_hay_draft_visible_normal", () => [pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].forEach(assertNoUnsafeUx));
check("43_no_hay_html_crudo", () => [pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].forEach(assertNoUnsafeUx));
check("44_no_hay_newline_literal", () => [pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].forEach(assertNoUnsafeUx));
check("45_no_hay_botones_sin_handler", () => [pendingDetail(), sentDetail(), sentStatus(), sentInvoice()].forEach(assertNoButtonsWithoutHandler));
check("46_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Document Resend And Artifact Access Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

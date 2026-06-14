const assert = require("assert");

const {
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const { detectStateButtonFailures } = require("./qa/telegram-ui-session-watch");

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
const checks = [];

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

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F70",
    draft_id: overrides.draft_id || "DRAFT-20260613-DELIVERY-CTA",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-70" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174070" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-F70-001" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PACINV-F70-001" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-13T10:00:00.000Z",
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
  };
}

function deliveryRow(overrides = {}) {
  return {
    delivery_id: overrides.delivery_id || "DELIV-F70",
    draft_id: overrides.draft_id || "DRAFT-20260613-DELIVERY-CTA",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    provider: "factura_com",
    environment: "SANDBOX",
    channel: overrides.channel || "PROVIDER_EMAIL",
    delivery_status: overrides.delivery_status || "SENT",
    delivery_action: overrides.delivery_action || "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    recipient_present: true,
    recipient_redacted: "r***@example.test",
    normalized_errors: [],
    normalized_warnings: [],
    sent_at: "2026-06-13T11:00:00.000Z",
    updated_at: "2026-06-13T11:00:00.000Z",
  };
}

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? [providerLink()] : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 100101,
    chat_id: "CHAT-DOWNLOADED-CTA",
    telegram_user_id: "USER-DOWNLOADED-CTA",
    message_id: String(extra.update_id || 100101),
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] }],
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: [],
    provider_invoice_links: rows,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "MESSAGE",
    callback_query_id: "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-DOWNLOADED-CTA",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-DOWNLOADED-CTA",
      telegram_user_id: "USER-DOWNLOADED-CTA",
    },
    security_user_id: "OWNER-DOWNLOADED-CTA",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? documentListState(rows),
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function documentListState(rows) {
  return {
    state: "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "DOCUMENTS_RECENT",
        chat_id: "CHAT-DOWNLOADED-CTA",
        telegram_user_id: "USER-DOWNLOADED-CTA",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        source_module: "DOCUMENTS",
        return_to: "DOCUMENTS_MENU",
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType: "DOCUMENT",
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
          display_id: row.provider_folio || "FAC-SBX-CTA",
        })),
      },
    },
  };
}

function draftForLink(link, options = {}) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DOWNLOADED-CTA";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    ...(draft.sandbox_pac_summary || {}),
    artifact_status: options.artifact_status || link.artifact_status,
    uuid: link.provider_uuid || "",
    cfdi_uid: link.provider_invoice_uid || "",
    pac_invoice_id: link.provider_invoice_id || "",
    xml_downloaded: link.xml_downloaded === true,
    pdf_downloaded: link.pdf_downloaded === true,
    xml_content_valid: link.xml_downloaded === true,
    pdf_content_valid: link.pdf_downloaded === true,
  };
  draft.document_delivery_ledger = options.document_delivery_ledger || [];
  return draft;
}

function documentCallbackInput(token, action, link, options = {}) {
  const draft = options.draft || draftForLink(link, options);
  const payload = {
    state: options.state || "DOCUMENT_DETAIL",
    screen_id: options.screen_id || options.state || "DOCUMENT_DETAIL",
    action,
    draft_id: link.draft_id,
    provider_invoice_link_id: link.provider_invoice_link_id,
    display_id: link.provider_folio || "F-70",
    source_module: "DOCUMENTS",
    return_to: "DOCUMENT_DETAIL",
    channel: options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    confirmation_required: options.confirmation_required === undefined ? false : options.confirmation_required,
    ...(options.payload || {}),
  };
  return callbackInput(token, action, {
    draft,
    chat_id: "CHAT-DOWNLOADED-CTA",
    telegram_user_id: "USER-DOWNLOADED-CTA",
    update_id: options.update_id || 100201,
    action_token: {
      token,
      chat_id: "CHAT-DOWNLOADED-CTA",
      action,
      used_at: options.used_at ?? null,
      expires_at: options.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload,
    },
  });
}

function runSummaryFromSource(source, stdout) {
  return executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context" || nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
}

function downloadResultSource(link) {
  return executeCode(handleCode, documentCallbackInput("dlcta00100000", "DOWNLOAD_SANDBOX_ARTIFACTS", {
    ...link,
    artifact_status: "DOWNLOAD_READY",
    xml_downloaded: false,
    pdf_downloaded: false,
  }, {
    state: "DOCUMENT_DOWNLOAD_CONFIRM",
    screen_id: "DOCUMENT_DOWNLOAD_CONFIRM",
    confirmation_required: true,
    artifact_status: "DOWNLOAD_READY",
  }));
}

function downloadedStdout(link, overrides = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: "OK",
    ok: true,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: link.draft_id,
      client_display_name: link.client_display,
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      storage_updated: true,
      persistence_status: "UPDATED",
      ...(overrides.output || {}),
    },
  });
}

function assertNoUnsafeUx(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174070"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/raw_|payload|provider_raw/i.test(text), text);
  assert(!text.includes("\\n"), text);
}

function assertNoForbiddenDeliverySurface(result) {
  const labels = buttonTexts(result).join(",");
  for (const forbidden of ["Marcar pagada", "Marcar parcial", "Marcar vencida", "Cancelar CFDI sandbox", "Ver ledger cliente", "Resumen cobranza"]) {
    assert(!labels.includes(forbidden), labels);
  }
}

const downloaded = providerLink();
const downloadReady = providerLink({ artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloadError = providerLink({ artifact_status: "DOWNLOAD_ERROR", xml_downloaded: false, pdf_downloaded: false });

check("document_download_result_descargado_muestra_enviar_por_correo", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  assert(buttonTexts(result).includes("Enviar por correo"), buttonTexts(result).join(","));
});

check("document_download_result_descargado_muestra_enviar_a_canal", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  assert(buttonTexts(result).includes("Enviar a canal"), buttonTexts(result).join(","));
});

check("document_download_result_descargado_muestra_estado_documental_documentos_menu", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  const labels = buttonTexts(result);
  assert(labels.includes("Ver estado documental"), labels.join(","));
  assert(labels.includes("Documentos"), labels.join(","));
  assert(labels.includes("Menu principal"), labels.join(","));
});

check("document_download_result_descargado_no_muestra_descarga_duplicada_pago_cancelacion_ledger", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  const labels = buttonTexts(result).join(",");
  assert(!labels.includes("Descargar XML/PDF sandbox"), labels);
  assertNoForbiddenDeliverySurface(result);
  assertNoUnsafeUx(result);
});

check("post_descarga_prepara_entrega_no_confirma_envio_directo", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  assert(result.persistence_sql.includes("DELIVERY_PREPARE_PROVIDER_EMAIL"), "provider prepare token missing");
  assert(result.persistence_sql.includes("DELIVERY_PREPARE_TELEGRAM_CHANNEL"), "channel prepare token missing");
  assert(result.persistence_sql.includes("DELIVERY_STATUS"), "delivery status token missing");
  assert(!result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "provider confirm token must wait");
  assert(!result.persistence_sql.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"), "channel confirm token must wait");
  assert(callbackDataList(result).some((item) => item.startsWith("cfdi:")), "tokenized callbacks missing");
});

check("boton_enviar_por_correo_desde_detalle_abre_confirmacion", () => {
  const result = executeCode(handleCode, documentCallbackInput("prepemailcta1", "DOCUMENT_DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, {
    state: "DOCUMENT_DETAIL",
    payload: { source_list_kind: "DOCUMENTS_RECENT", page: 1, channel: "PROVIDER_EMAIL" },
  }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
  assert(!result.should_execute_sandbox_action);
});

check("boton_enviar_a_canal_desde_detalle_abre_confirmacion", () => {
  const result = executeCode(handleCode, documentCallbackInput("prepchancta1", "DOCUMENT_DELIVERY_PREPARE_TELEGRAM_CHANNEL", downloaded, {
    state: "DOCUMENT_DETAIL",
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    payload: { source_list_kind: "DOCUMENTS_RECENT", page: 1, channel: "TELEGRAM_DOCUMENT_CHANNEL" },
  }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"));
  assert(!result.should_execute_sandbox_action);
});

check("document_detail_descargado_pendiente_muestra_acciones_envio", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloaded], update_id: 100301 }));
  const labels = buttonTexts(result);
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(labels.includes("Enviar por correo"), labels.join(","));
  assert(labels.includes("Enviar a canal"), labels.join(","));
  assert(labels.includes("Ver estado documental"), labels.join(","));
  assert(labels.includes("Volver a Documentos"), labels.join(","));
  assert(labels.includes("Menu principal"), labels.join(","));
});

check("document_detail_download_ready_muestra_descargar_no_enviar", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloadReady], update_id: 100302 }));
  const labels = buttonTexts(result);
  assert(labels.includes("Descargar XML/PDF sandbox"), labels.join(","));
  assert(!labels.includes("Enviar por correo"), labels.join(","));
  assert(!labels.includes("Enviar a canal"), labels.join(","));
});

check("document_detail_download_error_no_muestra_envio_listo", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloadError], update_id: 100303 }));
  const labels = buttonTexts(result);
  assert(!labels.includes("Enviar por correo"), labels.join(","));
  assert(!labels.includes("Enviar a canal"), labels.join(","));
});

check("document_detail_sent_no_muestra_envio_duplicado", () => {
  const result = executeCode(handleCode, baseInput("ver 1", {
    provider_invoice_links: [downloaded],
    document_delivery_ledger: [deliveryRow({ draft_id: downloaded.draft_id })],
    update_id: 100304,
  }));
  const labels = buttonTexts(result);
  assert(labels.includes("Ver estado documental"), labels.join(","));
  assert(!labels.includes("Enviar por correo"), labels.join(","));
  assert(!labels.includes("Enviar a canal"), labels.join(","));
});

check("documents_recent_list_puede_mantener_ver_sin_envio_directo", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [downloaded], update_id: 100305, chat_state: null }));
  const labels = buttonTexts(result);
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(labels.some((label) => /^Ver 1$/.test(label)), labels.join(","));
  assert(!labels.includes("Enviar por correo"), labels.join(","));
});

check("watcher_no_dispara_delivery_button_en_documents_recent_list", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "VIEW_DOCUMENT_DETAIL" }],
    context: { action: "DOCUMENTS_RECENT_LIST" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
});

check("watcher_no_dispara_delivery_button_en_callback_recovery", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ text: "Documentos" }, { text: "Menu principal" }],
    context: { action: "CALLBACK_TOKEN_CONTEXT_RECOVERED" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
});

check("watcher_no_dispara_delivery_button_en_cobranza", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "MARK_PAYMENT_PAID" }],
    context: { action: "PAYMENT_ACTION_CONFIRMATION_REQUIRED" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
});

check("watcher_dispara_en_download_result_descargado_sin_envio", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_STATUS" }],
    context: { action: "DOCUMENT_DOWNLOAD_RESULT" },
  }).map((item) => item.code);
  assert(codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
});

check("watcher_no_exige_envio_si_delivery_sent", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED", delivery_status: "SENT" },
    buttons: [{ action: "DELIVERY_STATUS" }],
    context: { action: "DOCUMENT_DETAIL" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
});

check("regresiones_basicas_siguen_funcionando_y_sin_html_crudo", () => {
  for (const [text, expected] of [["/facturas", "INVOICES_RECENT_LIST"], ["/documentos", "DOCUMENTS_RECENT_LIST"], ["/start", "PRODUCT_MENU_MAIN"], ["/menu", "PRODUCT_MENU_MAIN"]]) {
    const result = executeCode(handleCode, baseInput(text, { provider_invoice_links: [downloaded], update_id: 100400 + text.length, chat_state: null }));
    assert.strictEqual(result.action, expected, `${text}: ${result.action}`);
    assert(!String(result.telegram_message || "").includes("<b>"), result.telegram_message);
    assert(!String(result.telegram_message || "").includes("\\n"), result.telegram_message);
  }
});

check("no_hay_botones_sin_handler_obvios_en_post_descarga", () => {
  const result = runSummaryFromSource(downloadResultSource(downloaded), downloadedStdout(downloaded));
  for (const callbackData of callbackDataList(result)) {
    assert(callbackData === "cfdi_nav:docs" || callbackData === "cfdi_nav:menu" || callbackData === "cfdi_nav:invoices" || callbackData === "cfdi_nav:help" || callbackData.startsWith("cfdi:") || callbackData.startsWith("cfdi_doc:"), callbackData);
  }
});

console.log("Telegram Downloaded Delivery CTA Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");
const { spawnSync } = require("child_process");

const {
  callbackInput,
  executeCode,
  getNodeCode,
  prepareStdout,
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
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text || "").filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F72",
    draft_id: overrides.draft_id || "DRAFT-20260614-DOC-CAP",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-72" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174072" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-F72-001" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PACINV-F72-001" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-14T10:00:00.000Z",
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
  };
}

function deliveryRow(overrides = {}) {
  return {
    delivery_id: overrides.delivery_id || "DELIV-F72",
    draft_id: overrides.draft_id || "DRAFT-20260614-DOC-CAP",
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
    sent_at: "2026-06-14T11:00:00.000Z",
    updated_at: "2026-06-14T11:00:00.000Z",
  };
}

const downloaded = providerLink();
const downloadReady = providerLink({ artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloadError = providerLink({ artifact_status: "DOWNLOAD_ERROR", xml_downloaded: false, pdf_downloaded: false });
const sandboxError = providerLink({ invoice_status: "SANDBOX_ERROR", artifact_status: "N/A", xml_downloaded: false, pdf_downloaded: false });

function draftForLink(link, overrides = {}) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DOC-CAP";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.invoice_status = overrides.invoice_status || link.invoice_status;
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
  draft.document_delivery_ledger = overrides.document_delivery_ledger || [];
  return draft;
}

function documentListState(rows) {
  return {
    state: "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "DOCUMENTS_RECENT",
        chat_id: "CHAT-DOC-CAP",
        telegram_user_id: "USER-DOC-CAP",
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
          display_id: row.provider_folio || "FAC-SBX-000072",
        })),
      },
    },
  };
}

function invoiceListState(rows) {
  return {
    state: "INVOICES_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "INVOICES_RECENT",
        chat_id: "CHAT-DOC-CAP",
        telegram_user_id: "USER-DOC-CAP",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        source_module: "FACTURAS",
        return_to: "INVOICES_MENU",
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType: "INVOICE",
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
          display_id: row.provider_folio || "FAC-SBX-000072",
        })),
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? [downloaded] : extra.provider_invoice_links;
  const drafts = rows.map((row) => draftForLink(row, {
    document_delivery_ledger: extra.document_delivery_ledger || [],
  }));
  return {
    update_id: extra.update_id || 120001,
    max_seen_update_id: extra.update_id || 120001,
    chat_id: "CHAT-DOC-CAP",
    telegram_user_id: "USER-DOC-CAP",
    message_id: String(extra.update_id || 120001),
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] }],
    tax_rules: [],
    recent_drafts: extra.recent_drafts || drafts,
    provider_invoice_links: rows,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_ledger: [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-DOC-CAP",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-DOC-CAP",
      telegram_user_id: "USER-DOC-CAP",
    },
    security_user_id: "OWNER-DOC-CAP",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function callbackFor(action, link, options = {}) {
  const token = options.token || `${String(action).replace(/[^A-Z0-9]/g, "").slice(0, 10)}${String(options.update_id || 120200)}`.slice(0, 22).padEnd(12, "0");
  const draft = options.draft || draftForLink(link);
  const payload = {
    action,
    draft_id: options.omit_draft_id ? undefined : link.draft_id,
    provider_invoice_link_id: options.provider_invoice_link_id === undefined ? link.provider_invoice_link_id : options.provider_invoice_link_id,
    display_id: options.display_id || link.provider_folio || "F-72",
    source_module: options.source_module || "DOCUMENTS",
    source_capability: options.source_capability || (String(action).includes("DOWNLOAD") ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_DELIVERY"),
    state: options.state || options.screen_id || (String(action).includes("DOWNLOAD") ? "DOCUMENT_DOWNLOAD_CONFIRM" : "DOCUMENT_DELIVERY_CONFIRM"),
    screen_id: options.screen_id || options.state || (String(action).includes("DOWNLOAD") ? "DOCUMENT_DOWNLOAD_CONFIRM" : "DOCUMENT_DELIVERY_CONFIRM"),
    return_to: options.return_to || "DOCUMENT_DETAIL",
    channel: options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    requested_channel: options.requested_channel || options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    confirmation_required: options.confirmation_required === undefined ? true : options.confirmation_required,
    ...(options.payload || {}),
  };
  return callbackInput(token, action, {
    draft,
    chat_id: "CHAT-DOC-CAP",
    telegram_user_id: "USER-DOC-CAP",
    update_id: options.update_id || 120200,
    recent_drafts: [draft],
    provider_invoice_links: [link],
    document_delivery_ledger: options.document_delivery_ledger || [],
    action_token: {
      token,
      chat_id: "CHAT-DOC-CAP",
      action,
      used_at: options.used_at ?? null,
      expires_at: options.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: options.omit_draft_id ? null : link.draft_id,
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

function stampStdout(link = downloadReady, status = "OK") {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status,
    ok: status === "OK",
    duration_ms: 75,
    artifacts: [],
    warnings: [],
    errors: status === "OK" ? [] : ["SANDBOX_STAMP_ERROR"],
    sensitive_findings: [],
    output: {
      draft_id: link.draft_id,
      client_display_name: link.client_display,
      invoice_status: status === "OK" ? link.invoice_status : "SANDBOX_ERROR",
      payment_status: "PENDIENTE",
      serie: "F",
      folio: "72",
      uuid: link.provider_uuid,
      cfdi_uid: link.provider_invoice_uid,
      pac_invoice_id: link.provider_invoice_id,
      pac_result: {
        live_mode: true,
        mode: "live",
        uuid_present: true,
        pac_invoice_id_present: true,
        cfdi_uid_present: true,
        artifact_status: link.artifact_status,
        xml_provider_available: true,
        pdf_provider_available: true,
      },
      artifact_status: link.artifact_status,
      xml_downloaded: link.xml_downloaded,
      pdf_downloaded: link.pdf_downloaded,
    },
  });
}

function downloadStdout(link = downloaded, overrides = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: overrides.status || "OK",
    ok: overrides.status ? overrides.status === "OK" : true,
    duration_ms: 82,
    artifacts: [],
    warnings: overrides.warnings || [],
    errors: overrides.errors || [],
    sensitive_findings: [],
    output: {
      draft_id: link.draft_id,
      client_display_name: link.client_display,
      invoice_status: link.invoice_status,
      payment_status: "PENDIENTE",
      artifact_status: overrides.artifact_status || "DOWNLOADED",
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
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/<[a-z][\s\S]*>/i.test(text), text);
  assert(!text.includes("\\n"), text);
}

function assertNoButtonsWithoutHandler(result) {
  for (const callbackData of callbackDataList(result)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:|^cfdi_doc:/.test(callbackData), callbackData);
  }
}

const postStamp = () => executeCode(summaryCode, { stdout: stampStdout(downloadReady) }, () => [{ json: baseInput("stamp-source", { provider_invoice_links: [downloadReady], sandbox_draft_id: downloadReady.draft_id }) }]);
const postDownloadSource = () => executeCode(handleCode, callbackFor("DOWNLOAD_SANDBOX_ARTIFACTS", downloadReady, { token: "downconfirm001" }));
const postDownload = () => runSummaryFromSource(postDownloadSource(), downloadStdout(downloaded));
const invoiceDetail = (row = downloaded, extra = {}) => executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [row], chat_state: invoiceListState([row]), update_id: extra.update_id || 120301, document_delivery_ledger: extra.document_delivery_ledger || [] }));
const documentDetail = (row = downloaded, extra = {}) => executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [row], chat_state: documentListState([row]), update_id: extra.update_id || 120401, document_delivery_ledger: extra.document_delivery_ledger || [] }));

check("1_post_stamp_download_ready_muestra_descarga", () => assert(buttonTexts(postStamp()).includes("Descargar XML/PDF sandbox")));
check("2_invoice_detail_download_ready_muestra_descarga", () => assert(buttonTexts(invoiceDetail(downloadReady)).includes("Descargar XML/PDF sandbox")));
check("3_document_detail_download_ready_muestra_descarga", () => assert(buttonTexts(documentDetail(downloadReady)).includes("Descargar XML/PDF sandbox")));
check("4_descarga_no_ejecuta_directo_abre_confirmacion", () => {
  const result = executeCode(handleCode, callbackFor("DOWNLOAD_SANDBOX_ARTIFACTS", downloadReady, { state: "POST_STAMP_DOWNLOAD_READY", screen_id: "POST_STAMP_DOWNLOAD_READY", confirmation_required: false, token: "postdownprep001" }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert.notStrictEqual(result.should_execute_sandbox_action, true);
});
check("5_post_download_muestra_enviar_por_correo", () => assert(buttonTexts(postDownload()).includes("Enviar por correo")));
check("6_post_download_muestra_enviar_a_canal", () => assert(buttonTexts(postDownload()).includes("Enviar a canal")));
check("7_post_download_muestra_estado_documental", () => assert(buttonTexts(postDownload()).includes("Ver estado documental")));
check("8_invoice_detail_downloaded_muestra_envio_correo_canal", () => {
  const labels = buttonTexts(invoiceDetail(downloaded));
  assert(labels.includes("Enviar por correo") && labels.includes("Enviar a canal"), labels.join(","));
});
check("9_document_detail_downloaded_muestra_envio_correo_canal", () => {
  const labels = buttonTexts(documentDetail(downloaded));
  assert(labels.includes("Enviar por correo") && labels.includes("Enviar a canal"), labels.join(","));
});
check("10_enviar_a_canal_abre_confirmacion_de_canal", () => {
  const source = executeCode(handleCode, callbackFor("DELIVERY_PREPARE_TELEGRAM_CHANNEL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "TELEGRAM_DOCUMENT_CHANNEL", token: "prepchannel001" }));
  const result = runSummaryFromSource(source, prepareStdout("TELEGRAM_DOCUMENT_CHANNEL", { draft_id: downloaded.draft_id }));
  assert(result.telegram_message.includes("Confirmar envio a canal"), result.telegram_message);
  assert(result.telegram_message.includes("Destino: canal de Telegram"), result.telegram_message);
});
check("11_confirmacion_canal_no_menciona_correo", () => assert(!/correo/i.test(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_TELEGRAM_CHANNEL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "TELEGRAM_DOCUMENT_CHANNEL", token: "prepchannel002" })), prepareStdout("TELEGRAM_DOCUMENT_CHANNEL", { draft_id: downloaded.draft_id })).telegram_message)));
check("12_confirmacion_canal_usa_confirm_channel", () => assert(String(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_TELEGRAM_CHANNEL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "TELEGRAM_DOCUMENT_CHANNEL", token: "prepchannel003" })), prepareStdout("TELEGRAM_DOCUMENT_CHANNEL", { draft_id: downloaded.draft_id })).persistence_sql).includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL")));
check("13_enviar_por_correo_abre_confirmacion_correo", () => {
  const source = executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0001" }));
  const result = runSummaryFromSource(source, prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id }));
  assert(result.telegram_message.includes("Confirmar envio por correo"), result.telegram_message);
  assert(result.telegram_message.includes("Destino: correo del cliente/proveedor configurado"), result.telegram_message);
});
check("14_confirmacion_correo_no_menciona_canal", () => assert(!/canal de Telegram|Confirmar envio a canal/i.test(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0002" })), prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id })).telegram_message)));
check("15_confirmacion_correo_usa_confirm_email", () => assert(String(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0003" })), prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id })).persistence_sql).includes("DELIVERY_CONFIRM_PROVIDER_EMAIL")));
check("16_preparacion_no_dice_no_se_pudo_enviar", () => assert(!/No se pudo enviar/i.test(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0004" })), prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id })).telegram_message)));
check("17_preparacion_no_muestra_motivo_ready", () => assert(!/Motivo:\s*READY/i.test(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0005" })), prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id })).telegram_message)));
check("18_preparacion_no_muestra_estados_tecnicos", () => assert(!/TOKEN_VALID|GUARD_OK|Motivo:\s*PENDING/i.test(runSummaryFromSource(executeCode(handleCode, callbackFor("DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, { state: "POST_DOWNLOAD_DELIVERY_READY", screen_id: "POST_DOWNLOAD_DELIVERY_READY", source_capability: "DOCUMENT_DELIVERY", channel: "PROVIDER_EMAIL", token: "prepemail0006" })), prepareStdout("PROVIDER_EMAIL", { draft_id: downloaded.draft_id })).telegram_message)));
check("19_confirmar_envio_requiere_token_vigente", () => assert(!executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { expires_at: "2000-01-01T00:00:00.000Z", token: "expiredconfirm1" })).should_execute_sandbox_action));
check("20_confirmar_envio_desde_post_download_valido", () => assert.strictEqual(executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { state: "DOCUMENT_DELIVERY_CONFIRM", screen_id: "DOCUMENT_DELIVERY_CONFIRM", return_to: "POST_DOWNLOAD_DELIVERY_READY", token: "confirmpost001" })).should_execute_sandbox_action, true));
check("21_confirmar_envio_desde_invoice_detail_valido", () => assert.strictEqual(executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { source_module: "INVOICES", state: "DOCUMENT_DELIVERY_CONFIRM", screen_id: "DOCUMENT_DELIVERY_CONFIRM", return_to: "INVOICE_DETAIL", token: "confirminv001" })).should_execute_sandbox_action, true));
check("22_confirmar_envio_desde_document_detail_valido", () => assert.strictEqual(executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { state: "DOCUMENT_DELIVERY_CONFIRM", screen_id: "DOCUMENT_DELIVERY_CONFIRM", return_to: "DOCUMENT_DETAIL", token: "confirmdoc001" })).should_execute_sandbox_action, true));
check("23_confirmar_envio_sin_xml_pdf_bloquea", () => assert.strictEqual(executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadReady, { token: "confirmnodocs1" })).action, "DOCUMENT_ACTION_BLOCKED"));
check("24_confirmar_envio_en_sandbox_error_bloquea", () => assert.strictEqual(executeCode(handleCode, callbackFor("DELIVERY_CONFIRM_PROVIDER_EMAIL", sandboxError, { draft: draftForLink(sandboxError), token: "confirmerr001" })).action, "DOCUMENT_ACTION_BLOCKED"));
check("25_boton_documentos_recien_emitido_valido", () => assert.strictEqual(executeCode(handleCode, baseInput("cfdi_nav:docs", { source_kind: "CALLBACK_QUERY", callback_query_id: "CB-DOCS", callback_message_id: "1", provider_invoice_links: [downloaded] })).action, "DOCUMENTS_RECENT_LIST"));
check("26_boton_facturas_recien_emitido_valido", () => assert.strictEqual(executeCode(handleCode, baseInput("cfdi_nav:invoices", { source_kind: "CALLBACK_QUERY", callback_query_id: "CB-INVOICES", callback_message_id: "1", provider_invoice_links: [downloaded] })).action, "INVOICES_RECENT_LIST"));
check("27_boton_menu_recien_emitido_valido", () => assert.strictEqual(executeCode(handleCode, baseInput("cfdi_nav:menu", { source_kind: "CALLBACK_QUERY", callback_query_id: "CB-MENU", callback_message_id: "1", provider_invoice_links: [downloaded] })).action, "PRODUCT_MENU_MAIN"));
check("28_texto_obsoleto_telegram_no_aparece", () => assert(!/No se env[ií]an documentos por Telegram en esta fase/i.test([postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].map((item) => item.telegram_message).join("\n"))));
check("29_sandbox_error_no_muestra_descarga_envio", () => {
  const labels = buttonTexts(invoiceDetail(sandboxError)).join(",");
  assert(!/Descargar|Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("30_download_error_no_muestra_envio_listo", () => {
  const labels = buttonTexts(documentDetail(downloadError)).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("31_sent_protected_no_muestra_envio_duplicado", () => {
  const labels = buttonTexts(documentDetail(downloaded, { document_delivery_ledger: [deliveryRow({ draft_id: downloaded.draft_id })] })).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("32_watcher_no_exige_delivery_en_lista_documentos", () => assert(!detectStateButtonFailures({ state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ action: "VIEW_DOCUMENT_DETAIL" }], context: { action: "DOCUMENTS_RECENT_LIST" } }).map((item) => item.code).includes("DOWNLOADED_MISSING_DELIVERY_BUTTON")));
check("33_watcher_exige_delivery_en_document_detail", () => assert(detectStateButtonFailures({ state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ action: "DELIVERY_STATUS" }], context: { action: "DOCUMENT_DETAIL" } }).map((item) => item.code).includes("DOWNLOADED_MISSING_DELIVERY_BUTTON")));
check("34_watcher_exige_delivery_en_invoice_detail", () => assert(detectStateButtonFailures({ state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ action: "DELIVERY_STATUS" }], context: { action: "INVOICE_DETAIL" } }).map((item) => item.code).includes("DOWNLOADED_MISSING_DELIVERY_BUTTON")));
check("35_watcher_detecta_mismatch_canal_correo", () => assert(detectStateButtonFailures({ state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", text: "Confirmar envio a canal" }], context: { action: "DOCUMENT_DELIVERY_CONFIRM", telegram_message: "Confirmar envio por correo\nDestino: correo configurado" } }).map((item) => item.code).includes("DELIVERY_CHANNEL_MISMATCH")));
check("36_watcher_detecta_preparacion_no_se_pudo_enviar", () => assert(detectStateButtonFailures({ state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" }, buttons: [{ action: "DELIVERY_CONFIRM_PROVIDER_EMAIL" }], context: { route: "sandbox.documents.delivery.prepare", action: "DELIVERY_PREPARE_PROVIDER_EMAIL", telegram_message: "No se pudo enviar\nMotivo: READY" } }).map((item) => item.code).includes("DELIVERY_PREPARE_SHOWS_RESULT_ERROR")));
check("37_no_hay_envio_real_en_tests", () => assert(!/sandbox-document-delivery-action|sendDocument|nodemailer|smtp/i.test(__filename)));
check("38_no_hay_correo_real", () => assert(!process.env.SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED || process.env.SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED !== "true"));
check("39_no_hay_canal_real", () => assert(!process.env.SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED || process.env.SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED !== "true"));
check("40_no_hay_xml_pdf_reales", () => assert(!/runtime[\\/]|\.xml\b|\.pdf\b/i.test(JSON.stringify([postStamp().telegram_message, postDownload().telegram_message]))));
check("41_no_hay_pagos_reales", () => assert(!/MARK_PAYMENT|Marcar pagada|Cobranza/.test([postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].map((item) => JSON.stringify(item.reply_markup || {})).join("\n"))));
check("42_no_hay_uuid_completo", () => [postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].forEach(assertNoUnsafeUx));
check("43_no_hay_draft_visible_ux_normal", () => [postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].forEach(assertNoUnsafeUx));
check("44_no_hay_html_crudo", () => [postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].forEach(assertNoUnsafeUx));
check("45_no_hay_newline_literal", () => [postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].forEach(assertNoUnsafeUx));
check("46_no_hay_botones_sin_handler", () => [postStamp(), postDownload(), invoiceDetail(downloaded), documentDetail(downloaded)].forEach(assertNoButtonsWithoutHandler));
check("47_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Document Capability Surfaces And Delivery Confirmation Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

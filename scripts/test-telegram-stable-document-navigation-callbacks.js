const assert = require("assert");
const { spawnSync } = require("child_process");

const {
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const { classifyExecution, detectStateButtonFailures } = require("./qa/telegram-ui-session-watch");

const handleCode = getNodeCode("Handle Commands And Scoring");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
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
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.text || "")).filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || "")).filter(Boolean);
}

function buttonCallback(result, label) {
  const button = (result.reply_markup?.inline_keyboard || []).flat().find((item) => String(item.text || "") === label);
  assert(button, `button not found: ${label}`);
  return String(button.callback_data || "");
}

function providerLink(index, overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || `PIL-STABLE-${index}`,
    draft_id: overrides.draft_id || `DRAFT-STABLE-${String(index).padStart(2, "0")}`,
    client_id: overrides.client_id || `CLI-STABLE-${index}`,
    client_display: overrides.client_display || `Cliente ${index}`,
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? `F-${index}` : overrides.provider_folio,
    provider_serie: "",
    provider_uuid: "",
    provider_invoice_uid: overrides.provider_invoice_uid || `UID-STABLE-${index}`,
    provider_invoice_id: overrides.provider_invoice_id || `PAC-STABLE-${index}`,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 900 + index : overrides.total,
    updated_at: `2026-06-14T10:0${index % 10}:00.000Z`,
    sandbox_pac_summary: {},
  };
}

const downloadedRows = Array.from({ length: 7 }, (_item, index) => providerLink(index + 1));
const downloadReady = providerLink(20, { artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloadError = providerLink(21, { artifact_status: "DOWNLOAD_ERROR", xml_downloaded: false, pdf_downloaded: false });

function draftForLink(link) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DOC-STABLE";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.invoice_status = link.invoice_status;
  draft.payment_status = link.payment_status;
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: link.artifact_status,
    uuid: "",
    cfdi_uid: link.provider_invoice_uid,
    pac_invoice_id: link.provider_invoice_id,
    folio: link.provider_folio,
    xml_downloaded: link.xml_downloaded === true,
    pdf_downloaded: link.pdf_downloaded === true,
    xml_content_valid: link.xml_downloaded === true,
    pdf_content_valid: link.pdf_downloaded === true,
  };
  return draft;
}

function deliveryRow(link, status = "SENT") {
  return {
    delivery_id: `DELIV-${link.draft_id}`,
    draft_id: link.draft_id,
    client_id: link.client_id,
    provider: "factura_com",
    environment: "SANDBOX",
    channel: "PROVIDER_EMAIL",
    delivery_status: status,
    delivery_action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    recipient_present: true,
    recipient_redacted: "r***@example.test",
    normalized_errors: [],
    normalized_warnings: [],
    sent_at: "2026-06-14T11:00:00.000Z",
    updated_at: "2026-06-14T11:00:00.000Z",
  };
}

function documentListState(rows = downloadedRows, kind = "DOCUMENTS_RECENT", page = 1) {
  return {
    state: `${kind === "DOCUMENTS_RECENT" ? "DOCUMENTS_RECENT" : kind.replace("DOCUMENTS_", "DOCUMENTS_")}_LIST`,
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        schema_version: "telegram_list_context.v1",
        kind,
        chat_id: "CHAT-DOC-STABLE",
        telegram_user_id: "USER-DOC-STABLE",
        page,
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
          display_id: row.provider_folio || `F-${index + 1}`,
        })),
      },
    },
  };
}

function documentDetailState(row, rows = downloadedRows) {
  return {
    state: "DOCUMENT_DETAIL",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: documentListState(rows).context.list_context,
      selected_document: {
        draft_id: row.draft_id,
        provider_invoice_link_id: row.provider_invoice_link_id,
        client_id: row.client_id,
        display_id: row.provider_folio || "F",
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? downloadedRows : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 160001,
    max_seen_update_id: extra.update_id || 160001,
    chat_id: "CHAT-DOC-STABLE",
    telegram_user_id: "USER-DOC-STABLE",
    message_id: String(extra.update_id || 160001),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: ["privada bilbao"] }],
    tax_rules: [],
    recent_drafts: rows.map(draftForLink),
    provider_invoice_links: rows,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_ledger: [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: rows.length, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-DOC-STABLE",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-DOC-STABLE",
      telegram_user_id: "USER-DOC-STABLE",
    },
    security_user_id: "OWNER-DOC-STABLE",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function runMessage(text, extra = {}) {
  return executeCode(handleCode, baseInput(text, extra));
}

function runCallback(callbackData, extra = {}) {
  return executeCode(handleCode, baseInput(callbackData, {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: extra.callback_query_id || `CB-${String(extra.update_id || 160100)}`,
    callback_message_id: "42",
    ...extra,
  }));
}

function classify(sample) {
  return classifyExecution(sample, {
    db: null,
    args: {},
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
}

function execution({ id, handle = {}, plan = {} }) {
  return {
    id,
    workflowId: "workflow-test",
    finished: true,
    status: "success",
    data: {
      resultData: {
        runData: {
          "Handle Commands And Scoring": [{ data: { main: [[{ json: handle }]] } }],
          "Build Telegram Dispatch Plan": [{ data: { main: [[{ json: plan }]] } }],
        },
      },
    },
  };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

function assertStableCallback(value, prefix = "cfdi_doc:") {
  assert(String(value || "").startsWith(prefix), value);
  assert(!String(value || "").startsWith("cfdi:"), value);
}

function assertNoNormalDocumentNavTokens(result) {
  const buttons = (result.reply_markup?.inline_keyboard || []).flat();
  for (const button of buttons) {
    const text = String(button.text || "");
    const callbackData = String(button.callback_data || "");
    const normalNav = /^Ver \d+$/.test(text)
      || ["Recientes", "Pendientes/listos", "Descargados", "Enviados", "Errores", "Volver a Documentos", "Documentos"].includes(text)
      || text.startsWith("Mas documentos");
    if (normalNav) assert(!callbackData.startsWith("cfdi:"), `${text}:${callbackData}`);
  }
}

function assertNoUnsafeUx(result) {
  const text = String(result.telegram_message || "");
  assert(!/DRAFT-/i.test(text), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!text.includes("\\n"), text);
  if (/<[a-z][\s\S]*>/i.test(text)) assert.strictEqual(String(result.parse_mode || "").toUpperCase(), "HTML", text);
}

function assertNoButtonsWithoutHandler(result) {
  for (const callbackData of callbackDataList(result)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:|^cfdi_doc:/.test(callbackData), callbackData);
  }
}

const documentsList = () => runMessage("/documentos", { update_id: 160001 });
const listState = () => documentListState(downloadedRows);
const detailDownloaded = () => runCallback("cfdi_doc:view:1", { chat_state: listState(), update_id: 160010 });
const detailReady = () => runCallback("cfdi_doc:view:1", { chat_state: documentListState([downloadReady]), provider_invoice_links: [downloadReady], update_id: 160011 });
const detailDownloadError = () => runCallback("cfdi_doc:view:1", { chat_state: documentListState([downloadError]), provider_invoice_links: [downloadError], update_id: 160012 });

check("1_documentos_abre_lista", () => assert.strictEqual(documentsList().action, "DOCUMENTS_RECENT_LIST"));
check("2_ver_1_usa_callback_estable", () => assertStableCallback(buttonCallback(documentsList(), "Ver 1")));
check("3_callback_ver_1_abre_document_detail", () => assert.strictEqual(detailDownloaded().action, "DOCUMENT_DETAIL"));
check("4_ver_1_recien_emitido_no_token_invalid", () => assert.notStrictEqual(detailDownloaded().action, "CALLBACK_TOKEN_INVALID"));
check("5_ver_1_recien_emitido_no_context_recovered", () => assert.notStrictEqual(detailDownloaded().action, "CALLBACK_TOKEN_CONTEXT_RECOVERED"));
check("6_filtro_recientes_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Recientes"), "cfdi_doc:filter:recent"));
check("7_filtro_pendientes_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Pendientes/listos"), "cfdi_doc:filter:ready"));
check("8_filtro_descargados_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Descargados"), "cfdi_doc:filter:downloaded"));
check("9_filtro_enviados_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Enviados"), "cfdi_doc:filter:sent"));
check("10_filtro_errores_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Errores"), "cfdi_doc:filter:error"));
check("11_filtros_abren_lista_y_guardan_contexto", () => {
  for (const [callbackData, expected] of [
    ["cfdi_doc:filter:recent", "DOCUMENTS_RECENT_LIST"],
    ["cfdi_doc:filter:ready", "DOCUMENTS_PENDING_LIST"],
    ["cfdi_doc:filter:downloaded", "DOCUMENTS_DOWNLOADED_LIST"],
    ["cfdi_doc:filter:sent", "DOCUMENTS_SENT_LIST"],
    ["cfdi_doc:filter:error", "DOCUMENTS_ERROR_LIST"],
  ]) {
    const result = runCallback(callbackData, { chat_state: listState(), update_id: 160020 });
    assert.strictEqual(result.action, expected, callbackData);
    assert(String(result.persistence_sql || "").includes('"list_context"'), callbackData);
  }
});
check("12_paginacion_usa_callback_estable", () => {
  const next = callbackDataList(documentsList()).find((item) => item.startsWith("cfdi_doc:page:"));
  assert.strictEqual(next, "cfdi_doc:page:2");
});
check("13_paginacion_abre_siguiente_pagina", () => {
  const result = runCallback("cfdi_doc:page:2", { chat_state: listState(), update_id: 160030 });
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(buttonTexts(result).includes("Ver 6"), buttonTexts(result).join(","));
});
check("14_volver_a_documentos_usa_callback_estable", () => assert.strictEqual(buttonCallback(detailDownloaded(), "Volver a Documentos"), "cfdi_doc:list"));
check("15_documentos_usa_callback_estable", () => assert.strictEqual(buttonCallback(runCallback("cfdi_doc:download", { chat_state: documentDetailState(downloadReady, [downloadReady]), provider_invoice_links: [downloadReady], update_id: 160040 }), "Volver a documento"), "cfdi_doc:status"));
check("16_facturas_usa_callback_estable", () => assert.strictEqual(buttonCallback(detailDownloaded(), "Facturas"), "cfdi_nav:invoices"));
check("17_menu_principal_usa_callback_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Menu principal"), "cfdi_nav:menu"));
check("18_ayuda_usa_callback_estable", () => assert.strictEqual(buttonCallback(documentsList(), "Ayuda"), "cfdi_nav:help"));
check("19_document_detail_download_ready_muestra_descarga", () => assert(buttonTexts(detailReady()).includes("Descargar XML/PDF sandbox")));
check("20_document_detail_downloaded_muestra_correo", () => assert(buttonTexts(detailDownloaded()).includes("Enviar por correo")));
check("21_document_detail_downloaded_muestra_canal", () => assert(buttonTexts(detailDownloaded()).includes("Enviar a canal")));
check("22_document_detail_sent_no_muestra_envio_duplicado", () => {
  const result = runCallback("cfdi_doc:view:1", {
    chat_state: listState(),
    document_delivery_ledger: [deliveryRow(downloadedRows[0])],
    update_id: 160050,
  });
  const labels = buttonTexts(result).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("23_document_detail_download_error_no_muestra_envio_listo", () => {
  const labels = buttonTexts(detailDownloadError()).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("24_nav_documental_no_usa_cfdi_token", () => [documentsList(), detailDownloaded()].forEach(assertNoNormalDocumentNavTokens));
check("25_confirmar_descarga_sigue_tokenizado", () => {
  const result = runCallback("cfdi_doc:download", { chat_state: documentDetailState(downloadReady, [downloadReady]), provider_invoice_links: [downloadReady], update_id: 160060 });
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert(callbackDataList(result).some((item) => item.startsWith("cfdi:")), callbackDataList(result).join(","));
  assert(String(result.persistence_sql || "").includes("DOWNLOAD_SANDBOX_ARTIFACTS"));
});
check("26_confirmar_correo_sigue_tokenizado", () => {
  const result = runCallback("cfdi_doc:email", { chat_state: documentDetailState(downloadedRows[0]), update_id: 160061 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(callbackDataList(result).some((item) => item.startsWith("cfdi:")), callbackDataList(result).join(","));
  assert(String(result.persistence_sql || "").includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
});
check("27_confirmar_canal_sigue_tokenizado", () => {
  const result = runCallback("cfdi_doc:channel", { chat_state: documentDetailState(downloadedRows[0]), update_id: 160062 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(callbackDataList(result).some((item) => item.startsWith("cfdi:")), callbackDataList(result).join(","));
  assert(String(result.persistence_sql || "").includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"));
});
check("28_callback_viejo_real_recupera_seguro", () => {
  const result = runCallback("cfdi:OLDDOWNLOADTOKEN01", {
    update_id: 160063,
    action_token: {
      token: "OLDDOWNLOADTOKEN01",
      chat_id: "CHAT-DOC-STABLE",
      draft_id: downloadReady.draft_id,
      action: "DOWNLOAD_SANDBOX_ARTIFACTS",
      used_at: null,
      expires_at: "2000-01-01T00:00:00.000Z",
      payload: {
        action: "DOWNLOAD_SANDBOX_ARTIFACTS",
        draft_id: downloadReady.draft_id,
        provider_invoice_link_id: downloadReady.provider_invoice_link_id,
        source_module: "DOCUMENTS",
        source_capability: "DOCUMENT_DOWNLOAD",
        screen_id: "DOCUMENT_DOWNLOAD_CONFIRM",
      },
    },
    provider_invoice_links: [downloadReady],
  });
  assert(["CALLBACK_TOKEN_INVALID", "DOCUMENT_ACTION_BLOCKED", "CALLBACK_TOKEN_CONTEXT_RECOVERED"].includes(result.action), result.action);
  assert.notStrictEqual(result.action, "NEEDS_CONFIRM_DRAFT");
});
check("29_message_libre_desde_documentos_abre_wizard", () => {
  const result = runMessage("Privada Bilbao, revise camaras Hikvision por 800 + IVA", { chat_state: listState(), update_id: 160064 });
  assert.strictEqual(result.action, "NEEDS_CONFIRM_DRAFT");
});
check("30_texto_ver_1_desde_documentos_funciona", () => assert.strictEqual(runMessage("ver 1", { chat_state: listState(), update_id: 160065 }).action, "DOCUMENT_DETAIL"));
check("31_texto_descargar_1_desde_documentos_funciona", () => assert.strictEqual(runMessage("descargar 1", { chat_state: documentListState([downloadReady]), provider_invoice_links: [downloadReady], update_id: 160066 }).action, "DOCUMENT_DOWNLOAD_CONFIRM"));
check("32_texto_enviar_1_desde_documentos_funciona", () => assert.strictEqual(runMessage("enviar 1", { chat_state: listState(), update_id: 160067 }).action, "DOCUMENT_DELIVERY_CONFIRM"));
check("33_watcher_doc_nav_callback_invalid", () => {
  const result = classify(execution({
    id: "exec-doc-nav-invalid",
    handle: {
      source_kind: "CALLBACK_QUERY",
      text: "cfdi_doc:view:1",
      action: "CALLBACK_TOKEN_INVALID",
      telegram_message: "No pude usar este boton.",
    },
  }));
  assert(failureCodes(result).includes("DOC_NAV_CALLBACK_INVALID"));
});
check("34_watcher_document_nav_uses_ephemeral_token", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloadedRows[0].draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ text: "Ver 1", callback_data: "cfdi:EPHEMERALDOCNAV01", callback_data_present: true, action: "VIEW_DOCUMENT_DETAIL" }],
    context: { action: "DOCUMENTS_RECENT_LIST", screen_id: "DOCUMENTS_RECENT_LIST" },
  }).map((item) => item.code);
  assert(codes.includes("DOCUMENT_NAV_USES_EPHEMERAL_TOKEN"), codes.join(","));
});
check("35_watcher_no_marca_token_confirmacion_expirado", () => {
  const result = classify(execution({
    id: "exec-confirm-expired",
    handle: {
      source_kind: "CALLBACK_QUERY",
      text: "cfdi:oldconfirm",
      action: "CALLBACK_TOKEN_INVALID",
      action_token: {
        action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
        payload: {
          action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
          source_module: "DOCUMENTS",
          source_capability: "DOCUMENT_DELIVERY",
          screen_id: "DOCUMENT_DELIVERY_CONFIRM",
        },
      },
      telegram_message: "No pude usar este boton.",
    },
  }));
  const codes = failureCodes(result);
  assert(!codes.includes("DOC_NAV_CALLBACK_INVALID"), codes.join(","));
});
check("36_no_hay_html_crudo", () => [documentsList(), detailDownloaded(), detailReady()].forEach(assertNoUnsafeUx));
check("37_no_hay_newline_literal", () => [documentsList(), detailDownloaded(), detailReady()].forEach(assertNoUnsafeUx));
check("38_no_hay_botones_sin_handler", () => [documentsList(), detailDownloaded(), detailReady()].forEach(assertNoButtonsWithoutHandler));
check("39_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Stable Document Navigation Callback Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

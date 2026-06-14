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

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-STATUS-72",
    draft_id: overrides.draft_id || "DRAFT-STATUS-72",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-72" : overrides.provider_folio,
    provider_serie: "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174072" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-STATUS-72" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PAC-STATUS-72" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-14T10:00:00.000Z",
    sandbox_pac_summary: {},
  };
}

const downloaded = providerLink();
const downloadReady = providerLink({ draft_id: "DRAFT-STATUS-READY", artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloadError = providerLink({ draft_id: "DRAFT-STATUS-DLERR", artifact_status: "DOWNLOAD_ERROR", xml_downloaded: false, pdf_downloaded: false });
const sandboxError = providerLink({ draft_id: "DRAFT-STATUS-SBXERR", invoice_status: "SANDBOX_ERROR", artifact_status: "N/A", xml_downloaded: false, pdf_downloaded: false });

function draftForLink(link) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DOC-STATUS";
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
  return draft;
}

function deliveryRow(link, status = "SENT") {
  return {
    delivery_id: `DELIV-${link.draft_id}-${status}`,
    draft_id: link.draft_id,
    client_id: link.client_id,
    provider: "factura_com",
    environment: "SANDBOX",
    channel: "PROVIDER_EMAIL",
    delivery_status: status,
    delivery_action: status === "PROTECTED" ? "DELIVERY_CONFIRM_PROVIDER_EMAIL" : "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    recipient_present: true,
    recipient_redacted: "r***@example.test",
    normalized_errors: [],
    normalized_warnings: [],
    sent_at: "2026-06-14T11:00:00.000Z",
    updated_at: "2026-06-14T11:00:00.000Z",
  };
}

function documentListState(rows = [downloaded], kind = "DOCUMENTS_RECENT") {
  return {
    state: `${kind}_LIST`,
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind,
        chat_id: "CHAT-DOC-STATUS",
        telegram_user_id: "USER-DOC-STATUS",
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
          display_id: row.provider_folio || `F-${index + 1}`,
        })),
      },
    },
  };
}

function documentDetailState(row, rows = [row]) {
  return {
    state: "DOCUMENT_DETAIL",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      state: "DOCUMENT_DETAIL",
      screen_id: "DOCUMENT_DETAIL",
      source_module: "DOCUMENTS",
      source_capability: "DOCUMENT_STATUS",
      list_context: documentListState(rows).context.list_context,
      selected_document: {
        draft_id: row.draft_id,
        provider_invoice_link_id: row.provider_invoice_link_id,
        client_id: row.client_id,
        display_id: row.provider_folio || "F-72",
      },
    },
  };
}

function invoiceDetailState(row) {
  return {
    state: "INVOICE_DETAIL",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      state: "INVOICE_DETAIL",
      screen_id: "INVOICE_DETAIL",
      source_module: "INVOICES",
      source_capability: "DOCUMENT_STATUS",
      selected_document: {
        draft_id: row.draft_id,
        provider_invoice_link_id: row.provider_invoice_link_id,
        client_id: row.client_id,
        display_id: row.provider_folio || "F-72",
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? [downloaded] : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 170001,
    max_seen_update_id: extra.update_id || 170001,
    chat_id: "CHAT-DOC-STATUS",
    telegram_user_id: "USER-DOC-STATUS",
    message_id: String(extra.update_id || 170001),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] }],
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
      user_id: "OWNER-DOC-STATUS",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-DOC-STATUS",
      telegram_user_id: "USER-DOC-STATUS",
    },
    security_user_id: "OWNER-DOC-STATUS",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function runCallback(callbackData, extra = {}) {
  return executeCode(handleCode, baseInput(callbackData, {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: extra.callback_query_id || `CB-${String(extra.update_id || 170100)}`,
    callback_message_id: "42",
    ...extra,
  }));
}

function statusFrom(row, extra = {}) {
  return runCallback("cfdi_doc:status", {
    chat_state: extra.chat_state || documentDetailState(row),
    provider_invoice_links: [row],
    document_delivery_ledger: extra.document_delivery_ledger || [],
    update_id: extra.update_id || 170100,
  });
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

function assertNoUnsafeUx(result) {
  const text = String(result.telegram_message || "");
  assert(!/<[a-z][\s\S]*>/i.test(text), text);
  assert(!text.includes("\\n"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/raw_|payload|provider_raw/i.test(text), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/DRAFT-/i.test(text), text);
}

function assertNoButtonsWithoutHandler(result) {
  for (const callbackData of callbackDataList(result)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:|^cfdi_doc:/.test(callbackData), callbackData);
  }
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

function execution({ id, handle = {}, plan = {}, edit = null, fallback = null }) {
  const runData = {
    "Handle Commands And Scoring": [{ data: { main: [[{ json: handle }]] } }],
    "Build Telegram Dispatch Plan": [{ data: { main: [[{ json: plan }]] } }],
  };
  if (edit) runData["Telegram editMessageText"] = [{ data: { main: [[{ json: edit }]] } }];
  if (fallback) runData["Telegram fallback sendMessage"] = [{ data: { main: [[{ json: fallback }]] } }];
  return { id, workflowId: "workflow-test", finished: true, status: "success", data: { resultData: { runData } } };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

check("1_status_desde_document_detail_abre_status_accionable", () => assert.strictEqual(statusFrom(downloaded).action, "DOCUMENT_STATUS_DETAIL"));
check("2_status_no_abre_documents_recent_list", () => assert.notStrictEqual(statusFrom(downloaded).action, "DOCUMENTS_RECENT_LIST"));
check("3_status_no_dispara_document_list_item_changed", () => assert.notStrictEqual(statusFrom(downloaded).action, "DOCUMENT_LIST_ITEM_CHANGED"));
check("4_status_conserva_draft_id", () => assert.strictEqual(statusFrom(downloaded).draft_id, downloaded.draft_id));
check("5_status_desde_invoice_detail_mismo_documento", () => {
  const result = runCallback("cfdi_doc:status", { chat_state: invoiceDetailState(downloaded), provider_invoice_links: [downloaded], update_id: 170105 });
  assert.strictEqual(result.action, "DOCUMENT_STATUS_DETAIL");
  assert.strictEqual(result.draft_id, downloaded.draft_id);
});
check("6_download_ready_muestra_descarga", () => assert(buttonTexts(statusFrom(downloadReady)).includes("Descargar XML/PDF sandbox")));
check("7_download_ready_no_muestra_enviar", () => assert(!/Enviar por correo|Enviar a canal/.test(buttonTexts(statusFrom(downloadReady)).join(","))));
check("8_downloaded_pendiente_muestra_correo", () => assert(buttonTexts(statusFrom(downloaded)).includes("Enviar por correo")));
check("9_downloaded_pendiente_muestra_canal", () => assert(buttonTexts(statusFrom(downloaded)).includes("Enviar a canal")));
check("10_downloaded_pendiente_muestra_status_refresh", () => assert(buttonTexts(statusFrom(downloaded)).some((text) => /estado/i.test(text))));
check("11_sent_no_muestra_envio_duplicado", () => {
  const labels = buttonTexts(statusFrom(downloaded, { document_delivery_ledger: [deliveryRow(downloaded, "SENT")] })).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("12_protected_no_muestra_envio_duplicado", () => {
  const labels = buttonTexts(statusFrom(downloaded, { document_delivery_ledger: [deliveryRow(downloaded, "PROTECTED")] })).join(",");
  assert(!/Enviar por correo|Enviar a canal/.test(labels), labels);
});
check("13_download_error_muestra_error_humano", () => assert(/Error de descarga|ultimo error|reintentar/i.test(statusFrom(downloadError).telegram_message)));
check("14_download_error_muestra_reintentar_o_ultimo_resultado", () => {
  const labels = buttonTexts(statusFrom(downloadError)).join(",");
  assert(/Reintentar descarga XML\/PDF sandbox|Ver ultimo resultado sandbox/.test(labels), labels);
});
check("15_download_error_no_muestra_envio_listo", () => assert(!/Enviar por correo|Enviar a canal/.test(buttonTexts(statusFrom(downloadError)).join(","))));
check("16_sandbox_error_muestra_no_hay_documento_valido", () => assert(/No hay documento fiscal valido/i.test(statusFrom(sandboxError).telegram_message)));
check("17_sandbox_error_no_muestra_descarga", () => assert(!/Descargar|Reintentar/.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("18_sandbox_error_no_muestra_envio", () => assert(!/Enviar por correo|Enviar a canal/.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("19_sandbox_error_no_muestra_cancelacion", () => assert(!/cancel/i.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("20_sandbox_error_no_muestra_eliminar", () => assert(!/eliminar|purga/i.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("21_sandbox_error_no_muestra_pago_cobranza", () => assert(!/pago|cobranza/i.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("22_sandbox_error_no_muestra_ledger", () => assert(!/ledger/i.test(buttonTexts(statusFrom(sandboxError)).join(","))));
check("23_status_no_imprime_uuid_completo", () => [statusFrom(downloaded), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("24_status_no_imprime_draft_visible", () => [statusFrom(downloaded), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("25_status_no_imprime_rutas", () => [statusFrom(downloaded), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("26_status_no_imprime_payloads", () => [statusFrom(downloaded), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("27_reintentar_descarga_abre_confirmacion", () => {
  const result = runCallback("cfdi_doc:download", { chat_state: documentDetailState(downloadError), provider_invoice_links: [downloadError], update_id: 170127 });
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert.notStrictEqual(result.should_execute_sandbox_action, true);
});
check("28_enviar_correo_abre_confirmacion", () => {
  const result = runCallback("cfdi_doc:email", { chat_state: documentDetailState(downloaded), provider_invoice_links: [downloaded], update_id: 170128 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert.notStrictEqual(result.should_execute_sandbox_action, true);
});
check("29_enviar_canal_abre_confirmacion", () => {
  const result = runCallback("cfdi_doc:channel", { chat_state: documentDetailState(downloaded), provider_invoice_links: [downloaded], update_id: 170129 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert.notStrictEqual(result.should_execute_sandbox_action, true);
});
check("30_volver_a_documentos_funciona", () => assert.strictEqual(runCallback("cfdi_doc:list", { chat_state: documentDetailState(downloaded), provider_invoice_links: [downloaded], update_id: 170130 }).action, "DOCUMENTS_RECENT_LIST"));
check("31_menu_principal_funciona", () => assert.strictEqual(runCallback("cfdi_nav:menu", { provider_invoice_links: [downloaded], update_id: 170131 }).action, "PRODUCT_MENU_MAIN"));
check("32_watcher_detecta_status_vuelve_a_lista", () => {
  const result = classify(execution({ id: "exec-status-list", handle: { source_kind: "CALLBACK_QUERY", text: "cfdi_doc:status", action: "DOCUMENTS_RECENT_LIST", telegram_message: "Documentos recientes" } }));
  assert(failureCodes(result).includes("DOCUMENT_STATUS_RETURNS_TO_LIST"));
});
check("33_watcher_detecta_status_pierde_item", () => {
  const result = classify(execution({ id: "exec-status-lost", handle: { source_kind: "CALLBACK_QUERY", text: "cfdi_doc:status", action: "DOCUMENT_STATUS_DETAIL", previous_draft_id: "DRAFT-A", draft_id: "DRAFT-B", telegram_message: "Estado documental" } }));
  assert(failureCodes(result).includes("DOCUMENT_STATUS_LOST_CURRENT_ITEM"));
});
check("34_watcher_detecta_acciones_faltantes", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ text: "Ver estado documental", callback_data_present: true }],
    context: { action: "DOCUMENT_STATUS_DETAIL", screen_id: "DOCUMENT_STATUS_DETAIL" },
  }).map((item) => item.code);
  assert(codes.includes("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS"), codes.join(","));
});
check("35_edit_message_failed_recuperado_no_rompe", () => {
  const result = classify(execution({
    id: "exec-edit-recovered",
    handle: { source_kind: "CALLBACK_QUERY", text: "cfdi_doc:status", action: "DOCUMENT_STATUS_DETAIL", draft_id: downloaded.draft_id, telegram_message: "Estado documental" },
    plan: { action: "DOCUMENT_STATUS_DETAIL", telegram_message: "Estado documental", should_send_telegram: true },
    edit: { ok: false, error: "message is not modified" },
    fallback: { ok: true, result: { message_id: 99 } },
  }));
  const failures = result.event.failures || [];
  assert(failures.some((item) => item.code === "TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED"), failureCodes(result).join(","));
  assert(!failures.some((item) => item.code === "TELEGRAM_EDIT_MESSAGE_TEXT_FAILED" && item.severity === "FAIL"), JSON.stringify(failures));
});
check("36_no_hay_html_crudo", () => [statusFrom(downloaded), statusFrom(downloadReady), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("37_no_hay_newline_literal", () => [statusFrom(downloaded), statusFrom(downloadReady), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoUnsafeUx));
check("38_no_hay_botones_sin_handler", () => [statusFrom(downloaded), statusFrom(downloadReady), statusFrom(downloadError), statusFrom(sandboxError)].forEach(assertNoButtonsWithoutHandler));
check("39_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Document Status Action Surface Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

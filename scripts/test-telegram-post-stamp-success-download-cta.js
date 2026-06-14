const assert = require("assert");

const {
  allCallbackData,
  baseSource,
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const { detectStateButtonFailures } = require("./qa/telegram-ui-session-watch");

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

function buttonTexts(markup) {
  return (markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function assertNoUnsafeUx(result) {
  const text = [result.telegram_message || "", JSON.stringify(result.reply_markup || {})].join("\n");
  assert(!/DRAFT-\d|SANDBOX-INV-DRAFT-/i.test(text), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/<[^>]+>/.test(result.telegram_message || ""), result.telegram_message || "");
  assert(!String(result.telegram_message || "").includes("\\n"), result.telegram_message || "");
}

const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
const handleCode = getNodeCode("Handle Commands And Scoring");

function stampStdout(output = {}, status = "OK") {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status,
    ok: status === "OK",
    duration_ms: 91,
    artifacts: [],
    warnings: [],
    errors: status === "OK" ? [] : ["SANDBOX_STAMP_ERROR"],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-POST-STAMP-CTA-001",
      client_display_name: "Real Bilbao",
      total: 928,
      invoice_status: status === "OK" ? "SANDBOX_TIMBRADO" : "SANDBOX_ERROR",
      payment_status: "PENDIENTE",
      serie: "F",
      folio: "68",
      uuid: "12345678-1234-1234-1234-123456789abc",
      cfdi_uid: "CFDI-UID-68",
      pac_invoice_id: "PAC-INV-68",
      pac_result: {
        live_mode: true,
        mode: "live",
        uuid_present: true,
        pac_invoice_id_present: true,
        cfdi_uid_present: true,
        artifact_status: "DOWNLOAD_READY",
        xml_provider_available: true,
        pdf_provider_available: true,
      },
      ...(output || {}),
    },
  });
}

function runStamp(output = {}, status = "OK") {
  return executeCode(summaryCode, { stdout: stampStdout(output, status) }, () => [{ json: baseSource({
    draft_id: "DRAFT-POST-STAMP-CTA-001",
    sandbox_draft_id: "DRAFT-POST-STAMP-CTA-001",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-POST-STAMP-CTA",
    callback_message_id: "887",
  }) }]);
}

function postStampTokenInput(overrides = {}) {
  const draftId = "DRAFT-POST-STAMP-CTA-001";
  const draft = {
    ...sandboxStampedDraft(draftId),
    artifact_status: "DOWNLOAD_READY",
    xml_downloaded: false,
    pdf_downloaded: false,
    sandbox_pac_summary: {
      artifact_status: "DOWNLOAD_READY",
      uuid: "12345678-1234-1234-1234-123456789abc",
      cfdi_uid: "CFDI-UID-68",
      pac_invoice_id: "PAC-INV-68",
      folio: "68",
      serie: "F",
      xml_downloaded: false,
      pdf_downloaded: false,
    },
  };
  return callbackInput("poststampdowncta01", "DOWNLOAD_SANDBOX_ARTIFACTS", {
    draft,
    update_id: 919101,
    action_token: {
      token: "poststampdowncta01",
      chat_id: "6573879494",
      action: "DOWNLOAD_SANDBOX_ARTIFACTS",
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
      draft_id: draftId,
      payload: {
        action: "DOWNLOAD_SANDBOX_ARTIFACTS",
        state: "POST_STAMP_DOWNLOAD_READY",
        screen_id: "POST_STAMP_DOWNLOAD_READY",
        source_module: "DOCUMENTS",
        draft_id: draftId,
        provider_invoice_link_id: "PIL-F68",
        display_id: "F-68",
        provider_uuid: "12345678-1234-1234-1234-123456789abc",
        provider_invoice_uid: "CFDI-UID-68",
        provider_invoice_id: "PAC-INV-68",
        return_to: "DOCUMENT_DETAIL",
        confirmation_required: false,
        ...(overrides.payload || {}),
      },
    },
    ...(overrides.input || {}),
  });
}

check("download_ready_shows_download_cta", () => {
  const result = runStamp();
  const labels = buttonTexts(result.reply_markup);
  assert(labels.includes("Descargar XML/PDF sandbox"), labels.join(","));
  assert(result.telegram_message.includes("Documentos:") === false);
  assert(result.telegram_message.includes("Siguiente paso: Descargar XML/PDF sandbox."));
  assertNoUnsafeUx(result);
});

check("download_ready_creates_download_action_token", () => {
  const result = runStamp();
  assert(result.persistence_sql.includes("'DOWNLOAD_SANDBOX_ARTIFACTS'"), result.persistence_sql);
  assert(allCallbackData(result.reply_markup).some((item) => item.startsWith("cfdi:")));
});

check("download_payload_includes_draft_id", () => {
  const result = runStamp();
  assert(result.persistence_sql.includes('"draft_id":"DRAFT-POST-STAMP-CTA-001"'), result.persistence_sql);
});

check("download_payload_includes_display_id", () => {
  const result = runStamp();
  assert(result.persistence_sql.includes('"display_id":"F-68"'), result.persistence_sql);
});

check("download_payload_includes_context_source", () => {
  const result = runStamp();
  assert(result.persistence_sql.includes('"source_module":"DOCUMENTS"'), result.persistence_sql);
  assert(result.persistence_sql.includes('"screen_id":"POST_STAMP_DOWNLOAD_READY"'), result.persistence_sql);
});

check("post_stamp_cta_does_not_download_directly", () => {
  const result = executeCode(handleCode, postStampTokenInput());
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert.notStrictEqual(result.should_execute_sandbox_action, true);
  assert(result.telegram_message.includes("Confirmar descarga"));
  assert(result.telegram_message.includes("F-68"));
  assert(result.persistence_sql.includes("'DOWNLOAD_SANDBOX_ARTIFACTS'"));
});

check("post_stamp_confirmation_has_confirm_and_navigation", () => {
  const result = executeCode(handleCode, postStampTokenInput());
  const labels = buttonTexts(result.reply_markup);
  assert(labels.includes("Confirmar descarga"), labels.join(","));
  assert(labels.includes("Volver a documento"), labels.join(","));
  assert(labels.includes("Menu principal"), labels.join(","));
});

check("post_stamp_confirmation_safe_ux", () => {
  const result = executeCode(handleCode, postStampTokenInput());
  assertNoUnsafeUx(result);
});

check("sandbox_error_no_download_cta", () => {
  const result = runStamp({ artifact_status: "N/A", pac_result: { artifact_status: "N/A" } }, "ERROR");
  const labels = buttonTexts(result.reply_markup);
  assert(!labels.includes("Descargar XML/PDF sandbox"), labels.join(","));
});

check("sandbox_error_no_document_status_primary", () => {
  const result = runStamp({ artifact_status: "N/A", pac_result: { artifact_status: "N/A" } }, "ERROR");
  const labels = buttonTexts(result.reply_markup);
  assert(!labels.includes("Ver estado documental"), labels.join(","));
});

check("sandbox_error_shows_latest_result", () => {
  const result = runStamp({ artifact_status: "N/A", pac_result: { artifact_status: "N/A" } }, "ERROR");
  assert(buttonTexts(result.reply_markup).includes("Ver ultimo resultado sandbox"));
});

check("sandbox_error_shows_back_to_ready", () => {
  const result = runStamp({ artifact_status: "N/A", pac_result: { artifact_status: "N/A" } }, "ERROR");
  assert(buttonTexts(result.reply_markup).includes("Volver a listos para facturar"));
});

check("downloaded_no_primary_download", () => {
  const result = runStamp({
    artifact_status: "DOWNLOADED",
    xml_downloaded: true,
    pdf_downloaded: true,
    pac_result: { live_mode: true, mode: "live", artifact_status: "DOWNLOADED", uuid_present: true, pac_invoice_id_present: true },
  });
  const labels = buttonTexts(result.reply_markup);
  assert(!labels.includes("Descargar XML/PDF sandbox"), labels.join(","));
});

check("downloaded_shows_documents_status", () => {
  const result = runStamp({
    artifact_status: "DOWNLOADED",
    xml_downloaded: true,
    pdf_downloaded: true,
    pac_result: { live_mode: true, mode: "live", artifact_status: "DOWNLOADED", uuid_present: true, pac_invoice_id_present: true },
  });
  const labels = buttonTexts(result.reply_markup);
  assert(labels.includes("Documentos"), labels.join(","));
  assert(labels.includes("Ver estado documental"), labels.join(","));
});

check("download_error_no_ready_download", () => {
  const result = runStamp({
    artifact_status: "DOWNLOAD_ERROR",
    pac_result: { live_mode: true, mode: "live", artifact_status: "DOWNLOAD_ERROR", uuid_present: true, pac_invoice_id_present: true },
  });
  assert(!buttonTexts(result.reply_markup).includes("Descargar XML/PDF sandbox"));
});

check("download_error_human_safe_next_step", () => {
  const result = runStamp({
    artifact_status: "DOWNLOAD_ERROR",
    pac_result: { live_mode: true, mode: "live", artifact_status: "DOWNLOAD_ERROR", uuid_present: true, pac_invoice_id_present: true },
  });
  assert(result.telegram_message.includes("Siguiente paso: Revisar Documentos o Admin/QA."));
  assertNoUnsafeUx(result);
});

check("watcher_allows_visible_download_text", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-CTA", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOAD_READY" },
    buttons: [{ text: "Descargar XML/PDF sandbox", callback_data_present: true }],
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"), codes.join(","));
});

check("watcher_breaks_without_download_for_ready", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-CTA-MISSING", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOAD_READY" },
    buttons: [{ text: "Documentos", action: null }],
  }).map((item) => item.code);
  assert(codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"), codes.join(","));
});

check("watcher_ignores_sandbox_error", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-ERROR", invoice_status: "SANDBOX_ERROR", artifact_status: "N/A" },
    buttons: [{ text: "Ver ultimo resultado sandbox" }],
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"), codes.join(","));
});

check("watcher_ignores_downloaded_primary_download", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-DOWNLOADED", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ text: "Documentos" }, { text: "Ver estado documental" }],
    context: { action: "DOCUMENT_DETAIL" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"), codes.join(","));
});

check("facturas_still_routes", () => {
  const result = executeCode(handleCode, { chat_id: "6573879494", text: "/facturas", update_id: 919102, recent_drafts: [], provider_invoice_links: [], document_delivery_ledger: [], clients: [], tax_rules: [], source_kind: "MESSAGE", authorized_user: { enabled: true, role: "OWNER", telegram_chat_id: "6573879494" }, security_allowed: true });
  assert(result.action === "INVOICES_RECENT_LIST" || result.action === "INVOICES_MENU");
});

check("documentos_still_routes", () => {
  const result = executeCode(handleCode, { chat_id: "6573879494", text: "/documentos", update_id: 919103, recent_drafts: [], provider_invoice_links: [], document_delivery_ledger: [], clients: [], tax_rules: [], source_kind: "MESSAGE", authorized_user: { enabled: true, role: "OWNER", telegram_chat_id: "6573879494" }, security_allowed: true });
  assert(result.action === "DOCUMENTS_RECENT_LIST" || result.action === "DOCUMENTS_MENU");
});

check("borradores_routes_still_work", () => {
  for (const text of ["/borradores", "/pendientes", "/aprobadas"]) {
    const result = executeCode(handleCode, { chat_id: "6573879494", text, update_id: 919104, recent_drafts: [], provider_invoice_links: [], document_delivery_ledger: [], clients: [], tax_rules: [], source_kind: "MESSAGE", authorized_user: { enabled: true, role: "OWNER", telegram_chat_id: "6573879494" }, security_allowed: true });
    assert(result.telegram_message, text);
  }
});

check("start_menu_still_work", () => {
  for (const text of ["/start", "/menu"]) {
    const result = executeCode(handleCode, { chat_id: "6573879494", text, update_id: 919105, recent_drafts: [], provider_invoice_links: [], document_delivery_ledger: [], clients: [], tax_rules: [], source_kind: "MESSAGE", authorized_user: { enabled: true, role: "OWNER", telegram_chat_id: "6573879494" }, security_allowed: true });
    assert.strictEqual(result.screen_id, "MAIN_MENU");
  }
});

check("no_buttons_without_handler_in_stamp_summary", () => {
  const result = runStamp();
  for (const callback of allCallbackData(result.reply_markup)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:/.test(callback), callback);
  }
});

check("repo_safety_surface", () => {
  assert(summaryCode.includes("POST_STAMP_DOWNLOAD_READY"));
  assert(handleCode.includes("postStampDocumentRowFromDraft"));
});

console.log("Telegram Post-Stamp Success Download CTA Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

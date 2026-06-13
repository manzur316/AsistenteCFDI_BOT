const assert = require("assert");

const {
  allCallbackData,
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");

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

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");

function downloadReadyDraft(draftId) {
  const draft = sandboxStampedDraft(draftId);
  draft.artifact_status = "DOWNLOAD_READY";
  draft.sandbox_pac_summary = {
    ...(draft.sandbox_pac_summary || {}),
    artifact_status: "DOWNLOAD_READY",
    uuid: "123e4567-e89b-12d3-a456-426614174000",
    cfdi_uid: "UID-DOWNLOAD-LIFECYCLE",
    pac_invoice_id: "PAC-DOWNLOAD-LIFECYCLE",
    xml_downloaded: false,
    pdf_downloaded: false,
    xml_content_valid: false,
    pdf_content_valid: false,
  };
  return draft;
}

function documentDownloadCallbackInput(token, draftId, updateId) {
  const draft = downloadReadyDraft(draftId);
  const input = callbackInput(token, "DOWNLOAD_SANDBOX_ARTIFACTS", {
    draft,
    update_id: updateId,
  });
  input.action_token.payload = {
    ...(input.action_token.payload || {}),
    state: "DOCUMENT_DOWNLOAD_CONFIRM",
    screen_id: "DOCUMENT_DOWNLOAD_CONFIRM",
    source_module: "DOCUMENTS",
    draft_id: draftId,
    provider_invoice_link_id: `PIL-${draftId}`,
    display_id: "F-DOWN",
    return_to: "DOCUMENT_DETAIL",
    confirmation_required: true,
  };
  return input;
}

check("download_callback_request_defers_delivery_buttons_until_persisted_result", () => {
  const source = executeCode(handleCode, documentDownloadCallbackInput("downcycle001", "DRAFT-DOWNLOAD-LIFECYCLE-001", 7173101));
  assert.strictEqual(source.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert.strictEqual(source.should_execute_sandbox_action, true);
  assert.strictEqual(source.requested_sandbox_action, "sandbox.draft.download-artifacts");
  assert(source.callback_processing_sql.includes("UPDATE cfdi_action_tokens SET used_at"), "download token must be marked used");
  assert(source.callback_processing_sql.includes("DRAFT_SANDBOX_DOWNLOAD_IN_PROGRESS"), "download in-progress event missing");
  assert(!source.callback_processing_sql.includes("DELIVERY_PREPARE_PROVIDER_EMAIL"), "provider delivery token must wait for persisted download");
  assert(!source.callback_processing_sql.includes("DELIVERY_PREPARE_TELEGRAM_CHANNEL"), "telegram delivery token must wait for persisted download");
  const labels = buttonTexts(source.sandbox_reply_markup || source.reply_markup);
  assert(labels.includes("Volver a Documentos"), "documents recovery button missing");
  assert(labels.includes("Menu principal"), "menu recovery button missing");
  assert(!labels.includes("Enviar por correo"), "download request must not show delivery button");
  return labels.length;
});

check("download_action_summary_builds_visible_response_and_delivery_buttons", () => {
  const source = executeCode(handleCode, documentDownloadCallbackInput("downcycle002", "DRAFT-DOWNLOAD-LIFECYCLE-001", 7173102));
  const restoreSource = {
    ...source,
    chat_id: "",
    sandbox_draft_context: {
      ...(source.sandbox_draft_context || {}),
    },
  };
  delete restoreSource.sandbox_draft_context.chat_id;
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: "OK",
    ok: true,
    duration_ms: 70,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-DOWNLOAD-LIFECYCLE-001",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      pdf_source: "PROVIDER",
      storage_updated: true,
      persistence_status: "UPDATED",
    },
  });
  const result = executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context") return [{ json: restoreSource }];
    if (nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
  assert.strictEqual(result.should_send_telegram, true);
  assert(/XML\/PDF descargados/.test(result.telegram_message));
  assert(/Factura: F-DOWN/.test(result.telegram_message));
  assert(/Documentos: Descargados/.test(result.telegram_message));
  assert(/Envio: Pendiente/.test(result.telegram_message));
  assert(/Elige como entregar los documentos/.test(result.telegram_message));
  assert(!/token_usado|Boton invalido/.test(result.telegram_message));
  assert.strictEqual(result.json_debug.callback_lifecycle.action_executed, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.response_built, true);
  const labels = buttonTexts(result.reply_markup);
  assert(labels.includes("Enviar por correo"), "provider email button missing after download");
  assert(labels.includes("Enviar a canal"), "telegram channel button missing after download");
  assert(labels.includes("Ver estado documental"), "document status button missing after download");
  assert(labels.includes("Documentos"), "documents button missing after download");
  assert(labels.includes("Menu principal"), "menu button missing after download");
  assert(result.persistence_sql.includes("DELIVERY_PREPARE_PROVIDER_EMAIL"), "provider delivery prepare token missing");
  assert(result.persistence_sql.includes("DELIVERY_PREPARE_TELEGRAM_CHANNEL"), "telegram delivery prepare token missing");
  assert(result.persistence_sql.includes("DELIVERY_STATUS"), "delivery status token missing");
  assert(!result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "provider send confirmation token must wait for prepare step");
  assert(!result.persistence_sql.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"), "telegram send confirmation token must wait for prepare step");
  return result.sandbox_action_status;
});

check("download_action_summary_does_not_enable_delivery_without_persistence", () => {
  const source = executeCode(handleCode, documentDownloadCallbackInput("downcycle003", "DRAFT-DOWNLOAD-LIFECYCLE-003", 7173103));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: "OK",
    ok: true,
    duration_ms: 70,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-DOWNLOAD-LIFECYCLE-003",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      storage_updated: true,
      persistence_status: "FAILED",
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert(/Ver estado documental/.test(result.telegram_message));
  const labels = buttonTexts(result.reply_markup);
  assert(!labels.includes("Enviar por correo"), "provider email button must not be enabled when persistence failed");
  assert(!labels.includes("Enviar a canal documentos"), "telegram delivery button must not be enabled when persistence failed");
  assert(!result.persistence_sql.includes("DELIVERY_PREPARE_PROVIDER_EMAIL"), "provider delivery token SQL must not be created when persistence failed");
  assert(!result.persistence_sql.includes("DELIVERY_PREPARE_TELEGRAM_CHANNEL"), "telegram delivery token SQL must not be created when persistence failed");
  return "blocked";
});

console.log("Telegram Callback Lifecycle Download Response Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

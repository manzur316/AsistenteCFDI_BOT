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

check("download_callback_request_has_delivery_recovery_buttons", () => {
  const source = executeCode(handleCode, callbackInput("downcycle001", "DOWNLOAD_SANDBOX_ARTIFACTS", {
    draft: sandboxStampedDraft("DRAFT-DOWNLOAD-LIFECYCLE-001"),
    update_id: 7173101,
  }));
  assert.strictEqual(source.action, "DRAFT_SANDBOX_DOWNLOAD_REQUESTED");
  assert.strictEqual(source.should_execute_sandbox_action, true);
  assert.strictEqual(source.requested_sandbox_action, "sandbox.draft.download-artifacts");
  assert(source.callback_processing_sql.includes("UPDATE cfdi_action_tokens SET used_at"), "download token must be marked used");
  assert(source.callback_processing_sql.includes("DRAFT_SANDBOX_DOWNLOAD_IN_PROGRESS"), "download in-progress event missing");
  const labels = buttonTexts(source.sandbox_reply_markup || source.reply_markup);
  assert(labels.includes("Ver estado documental"), "delivery status button missing");
  assert(labels.includes("Enviar por correo"), "provider email button missing");
  assert(labels.includes("Enviar a canal documentos"), "telegram channel button missing");
  assert(labels.includes("Ver ultimo resultado sandbox"), "latest button missing");
  assert(labels.includes("Menu principal"), "menu button missing");
  return labels.length;
});

check("download_action_summary_builds_visible_response_and_delivery_buttons", () => {
  const source = executeCode(handleCode, callbackInput("downcycle002", "DOWNLOAD_SANDBOX_ARTIFACTS", {
    draft: sandboxStampedDraft("DRAFT-DOWNLOAD-LIFECYCLE-001"),
    update_id: 7173102,
  }));
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
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert.strictEqual(result.should_send_telegram, true);
  assert(/Descarga sandbox completada/.test(result.telegram_message));
  assert(/XML descargado: si/.test(result.telegram_message));
  assert(/PDF descargado: si/.test(result.telegram_message));
  assert(/Storage local: actualizado/.test(result.telegram_message));
  assert(!/token_usado|Boton invalido/.test(result.telegram_message));
  assert.strictEqual(result.json_debug.callback_lifecycle.action_executed, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.response_built, true);
  const labels = buttonTexts(result.reply_markup);
  assert(labels.includes("Ver estado documental"), "status button missing after download");
  assert(labels.includes("Enviar por correo"), "provider email button missing after download");
  assert(labels.includes("Enviar a canal documentos"), "telegram channel button missing after download");
  assert(labels.includes("Ver ultimo resultado sandbox"), "latest button missing after download");
  return result.sandbox_action_status;
});

console.log("Telegram Callback Lifecycle Download Response Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");

const {
  allCallbackData,
  baseSource,
  executeCode,
  getNodeCode,
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

const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");

check("download_ok_builds_visible_post_action_message", () => {
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
      draft_id: "DRAFT-POST-DOWNLOAD-001",
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
  const result = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({
    draft_id: "DRAFT-POST-DOWNLOAD-001",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-DOWNLOAD-321",
    callback_message_id: "321",
  }) }]);
  assert(/Descarga sandbox completada/.test(result.telegram_message));
  assert(/Estado documental: DOWNLOADED/.test(result.telegram_message));
  assert(/Persistencia local: UPDATED/.test(result.telegram_message));
  assert(/Los documentos ya estan listos para envio/.test(result.telegram_message));
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Enviar a canal documentos"), "telegram delivery button missing");
  assert(labels.includes("Enviar por correo"), "provider email button missing");
  assert(labels.includes("Ver estado documental"), "delivery status button missing");
  assert(allCallbackData(result.reply_markup).every((value) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(value)), "invalid callback_data token");
  return labels.length;
});

check("download_dispatch_plan_targets_visible_telegram_edit", () => {
  const stdout = JSON.stringify({
    action: "sandbox.draft.download-artifacts",
    status: "OK",
    ok: true,
    output: {
      draft_id: "DRAFT-POST-DOWNLOAD-002",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      storage_updated: true,
      persistence_status: "UPDATED",
    },
  });
  const summary = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({
    draft_id: "DRAFT-POST-DOWNLOAD-002",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-DOWNLOAD-322",
    callback_message_id: "322",
  }) }]);
  const planned = executeCode(dispatchPlanCode, { ...summary, telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT" });
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.should_send_telegram, true);
  assert.strictEqual(planned.telegram_dispatch_method, "editMessageText");
  assert.strictEqual(planned.json_debug.callback_lifecycle.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.json_debug.callback_lifecycle.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.json_debug.callback_lifecycle.reply_markup_built, true);
  assert.strictEqual(planned.json_debug.callback_lifecycle.chat_id_present, true);
  return planned.telegram_dispatch_method;
});

console.log("Telegram Post-Action Dispatch Download Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

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

function approvedDraft() {
  return {
    ...sandboxStampedDraft("DRAFT-STAMP-LIFECYCLE-001"),
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    sandbox_pac_summary: {},
  };
}

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");

check("stamp_callback_request_has_post_action_recovery_buttons", () => {
  const source = executeCode(handleCode, callbackInput("stampcycle001", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7173001,
  }));
  assert.strictEqual(source.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert.strictEqual(source.should_execute_sandbox_action, true);
  assert.strictEqual(source.requested_sandbox_action, "sandbox.draft.stamp");
  assert(source.callback_processing_sql.includes("UPDATE cfdi_action_tokens SET used_at"), "stamp token must be marked used");
  assert(source.callback_processing_sql.includes("DRAFT_SANDBOX_STAMP_IN_PROGRESS"), "in-progress event missing");
  const labels = buttonTexts(source.sandbox_reply_markup || source.reply_markup);
  assert(labels.includes("Descargar XML/PDF sandbox"), "download button missing after stamp");
  assert(labels.includes("Ver estado documental"), "delivery status button missing after stamp");
  assert(labels.includes("Ver ultimo resultado sandbox"), "latest sandbox button missing after stamp");
  assert(labels.includes("Menu principal"), "menu button missing after stamp");
  return labels.length;
});

check("stamp_action_summary_builds_visible_response_and_buttons", () => {
  const source = executeCode(handleCode, callbackInput("stampcycle002", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7173002,
  }));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "OK",
    ok: true,
    duration_ms: 91,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-STAMP-LIFECYCLE-001",
      client_display_name: "Real Bilbao",
      total: 928,
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      serie: "F",
      folio: "17",
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
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert.strictEqual(result.should_send_telegram, true);
  assert(/Timbrado sandbox completado/.test(result.telegram_message));
  assert(/Siguiente paso: Descargar XML\/PDF sandbox/.test(result.telegram_message));
  assert(/Resultado PAC: live sandbox/.test(result.telegram_message));
  assert.strictEqual(result.json_debug.callback_lifecycle.action_executed, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.response_built, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.token_used, true);
  const callbacks = allCallbackData(result.reply_markup);
  assert(callbacks.some((item) => item.startsWith("cfdi:")), "fresh action tokens missing");
  assert(callbacks.includes("cfdi_sbx:latest"), "latest callback missing");
  assert(callbacks.includes("cfdi_nav:menu"), "menu callback missing");
  assert(result.persistence_sql.includes("'DOWNLOAD_SANDBOX_ARTIFACTS'"), "fresh download token insert missing");
  assert(!result.persistence_sql.includes("'STAMP_DRAFT_SANDBOX'"), "post-stamp summary must not create stamp token");
  return result.sandbox_draft_status;
});

console.log("Telegram Callback Lifecycle Stamp Response Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

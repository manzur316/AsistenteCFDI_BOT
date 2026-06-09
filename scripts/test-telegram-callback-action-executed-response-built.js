const assert = require("assert");

const {
  baseSource,
  executeCode,
  getNodeCode,
  prepareStdout,
  runSummary,
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

function assertResponseBuilt(result, expectedAction) {
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
  assert.strictEqual(result.should_send_telegram, true);
  assert(result.telegram_message && result.telegram_message.length > 20, "telegram_message missing");
  assert(result.persistence_sql.includes("passthrough_b64"), "passthrough response missing");
  assert(result.persistence_sql.includes("INSERT INTO bot_events"), "audit event missing");
  assert(result.persistence_sql.includes("UPDATE telegram_updates SET status = 'PROCESSED'"), "update processed SQL missing");
  assert.strictEqual(result.json_debug.callback_lifecycle.action_executed, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.response_built, true);
  assert.strictEqual(result.json_debug.callback_lifecycle.token_used, true);
  assert.strictEqual(result.requested_sandbox_action, expectedAction);
}

const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");

check("stamp_action_executed_builds_visible_response", () => {
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "OK",
    ok: true,
    duration_ms: 80,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-ACTION-BUILT-STAMP",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 928,
      pac_result: { live_mode: true, mode: "live", uuid_present: true, pac_invoice_id_present: true },
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({ draft_id: "DRAFT-ACTION-BUILT-STAMP" }) }]);
  assertResponseBuilt(result, "sandbox.draft.stamp");
  assert(/Timbrado sandbox completado/.test(result.telegram_message));
  return result.sandbox_draft_status;
});

check("download_action_executed_builds_visible_response", () => {
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
      draft_id: "DRAFT-ACTION-BUILT-DOWNLOAD",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      storage_updated: true,
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({ draft_id: "DRAFT-ACTION-BUILT-DOWNLOAD" }) }]);
  assertResponseBuilt(result, "sandbox.draft.download-artifacts");
  assert(/Descarga sandbox completada/.test(result.telegram_message));
  return result.sandbox_action_status;
});

check("delivery_prepare_action_executed_creates_confirm_token_and_response", () => {
  const result = runSummary(prepareStdout("PROVIDER_EMAIL"), baseSource({
    draft_id: "DRAFT-ACTION-BUILT-DELIVERY",
    sandbox_delivery_channel: "PROVIDER_EMAIL",
  }));
  assertResponseBuilt(result, "sandbox.documents.delivery.prepare");
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "confirm token insert missing");
  assert(/Confirmar envio por correo/.test(result.telegram_message));
  assert(result.reply_markup?.inline_keyboard?.flat().some((button) => /Confirmar envio correo/.test(button.text)), "confirm button missing");
  return result.sandbox_action_status;
});

console.log("Telegram Callback Action Executed Response Built Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

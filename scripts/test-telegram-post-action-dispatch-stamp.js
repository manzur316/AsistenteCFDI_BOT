const assert = require("assert");

const {
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

check("stamp_ok_builds_visible_post_action_message_and_download_button", () => {
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "OK",
    ok: true,
    duration_ms: 120,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-POST-STAMP-001",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1136.8,
      pac_result: { live_mode: true, mode: "live", uuid_present: true, pac_invoice_id_present: true },
    },
  });
  const source = baseSource({
    draft_id: "DRAFT-POST-STAMP-001",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-STAMP-411",
    callback_message_id: "411",
    sandbox_reply_markup: {
      inline_keyboard: [
        [{ text: "Descargar XML/PDF sandbox", callback_data: "cfdi:DOWNLOADPOST717F" }],
        [{ text: "Ver estado documental", callback_data: "cfdi:STATUSPOST717F" }],
        [{ text: "Ver factura", callback_data: "cfdi:VIEWPOST717F" }],
        [{ text: "Menu principal", callback_data: "cfdi:MENUPOST717F" }],
      ],
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert(/Timbrado sandbox completado/.test(result.telegram_message));
  assert(/Estado: SANDBOX_TIMBRADO/.test(result.telegram_message));
  assert(/Siguiente paso: Descargar XML\/PDF sandbox/.test(result.telegram_message));
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Descargar XML/PDF sandbox"), "download button missing");
  assert(labels.includes("Ver estado documental"), "document status button missing");
  return labels.length;
});

check("stamp_dispatch_plan_marks_callback_visible_dispatch", () => {
  const stdout = JSON.stringify({
    action: "sandbox.draft.stamp",
    status: "OK",
    ok: true,
    output: {
      draft_id: "DRAFT-POST-STAMP-002",
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1136.8,
      pac_result: { live_mode: true, mode: "live" },
    },
  });
  const summary = executeCode(summaryCode, { stdout }, () => [{ json: baseSource({
    draft_id: "DRAFT-POST-STAMP-002",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-STAMP-412",
    callback_message_id: "412",
  }) }]);
  const planned = executeCode(dispatchPlanCode, { ...summary, telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT" });
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.should_send_telegram, true);
  assert.strictEqual(planned.telegram_dispatch_method, "editMessageText");
  assert.strictEqual(planned.json_debug.callback_lifecycle.action_executed, true);
  assert.strictEqual(planned.json_debug.callback_lifecycle.response_built, true);
  return planned.telegram_dispatch_method;
});

console.log("Telegram Post-Action Dispatch Stamp Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

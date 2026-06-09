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

const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");

check("delivery_prepare_channel_builds_confirmation_message", () => {
  const result = runSummary(prepareStdout("TELEGRAM_DOCUMENT_CHANNEL"), baseSource({
    draft_id: "DRAFT-PREPARE-CHANNEL-001",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-PREPARE-CHANNEL-511",
    callback_message_id: "511",
    sandbox_delivery_channel: "TELEGRAM_DOCUMENT_CHANNEL",
  }));
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.prepare");
  assert(/Confirmar envio a canal documentos/.test(result.telegram_message));
  assert(/Canal: TELEGRAM_DOCUMENT_CHANNEL/.test(result.telegram_message));
  assert(/XML\/PDF: listos/.test(result.telegram_message));
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"), "confirm token insert missing");
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Confirmar envio canal"), "confirm channel button missing");
  assert(labels.includes("Ver estado documental"), "status button missing");
  return labels.length;
});

check("delivery_prepare_channel_dispatch_plan_is_visible", () => {
  const result = runSummary(prepareStdout("TELEGRAM_DOCUMENT_CHANNEL"), baseSource({
    draft_id: "DRAFT-PREPARE-CHANNEL-002",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-PREPARE-CHANNEL-512",
    callback_message_id: "512",
    sandbox_delivery_channel: "TELEGRAM_DOCUMENT_CHANNEL",
  }));
  const planned = executeCode(dispatchPlanCode, { ...result, telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT" });
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.should_send_telegram, true);
  assert.strictEqual(planned.telegram_dispatch_method, "editMessageText");
  assert.strictEqual(planned.json_debug.callback_lifecycle.reply_markup_built, true);
  return planned.telegram_dispatch_method;
});

console.log("Telegram Post-Action Dispatch Delivery Prepare Channel Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

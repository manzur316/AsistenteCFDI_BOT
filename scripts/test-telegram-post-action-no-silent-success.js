const assert = require("assert");

const {
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

const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");

check("post_action_message_without_dispatch_context_is_handled_error", () => {
  const planned = executeCode(dispatchPlanCode, {
    telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT",
    telegram_message: "Descarga sandbox completada",
    json_debug: {
      callback_lifecycle: {
        action_executed: true,
        response_built: true,
        reply_markup_built: true,
      },
    },
    webhook_message: "Sandbox action handled and Telegram response prepared",
  });
  assert.strictEqual(planned.should_send_telegram, false);
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, false);
  assert.strictEqual(planned.telegram_dispatch_blocked_reason, "missing_chat_id");
  assert.strictEqual(planned.webhook_status, "handled_error");
  assert(!/Sandbox action handled and Telegram response prepared/.test(planned.webhook_message), "silent success message leaked");
  return planned.telegram_dispatch_blocked_reason;
});

check("post_action_message_with_context_and_token_is_not_silent", () => {
  const planned = executeCode(dispatchPlanCode, {
    telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT",
    chat_id: "6573879494",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-NO-SILENT",
    callback_message_id: "789",
    telegram_message: "Descarga sandbox completada",
    reply_markup: { inline_keyboard: [[{ text: "Enviar por correo", callback_data: "cfdi:PREPAREEMAIL717G" }]] },
    should_send_telegram: false,
    json_debug: {
      callback_lifecycle: {
        action_executed: true,
        response_built: true,
        reply_markup_built: true,
      },
    },
  });
  assert.strictEqual(planned.should_send_telegram, true);
  assert.strictEqual(planned.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_can_edit, true);
  assert.strictEqual(planned.webhook_status || "", "");
  return planned.telegram_dispatch_method;
});

console.log("Telegram Post-Action No Silent Success Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

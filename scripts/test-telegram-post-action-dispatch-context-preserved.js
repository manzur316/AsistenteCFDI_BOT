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

const restoredContext = {
  chat_id: "6573879494",
  telegram_user_id: "6573879494",
  source_kind: "CALLBACK_QUERY",
  callback_query_id: "CALLBACK-2351",
  callback_message_id: "1234",
  source_message_id: "",
  update_id: 2351,
  max_seen_update_id: 2351,
  message_id: "1234",
  workflow_version: "CFDI_LOCAL_INGEST_V1",
  latency_trace: { route: "sandbox.documents.delivery.prepare" },
};

function itemsProvider(name) {
  if (name === "Restore Processing Lock Context") return [{ json: restoredContext }];
  return [];
}

check("post_action_dispatch_plan_restores_callback_context", () => {
  const planned = executeCode(dispatchPlanCode, {
    telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT",
    telegram_message: "Confirmar envio por correo.\nCanal: PROVIDER_EMAIL\nXML/PDF: listos",
    send_text: "Confirmar envio por correo.\nCanal: PROVIDER_EMAIL\nXML/PDF: listos",
    should_send_telegram: false,
    reply_markup: { inline_keyboard: [[{ text: "Confirmar envio por correo", callback_data: "cfdi:CONFIRMEMAIL717G" }]] },
    json_debug: {
      callback_lifecycle: {
        action_executed: true,
        response_built: true,
        reply_markup_built: true,
      },
    },
  }, itemsProvider);

  assert.strictEqual(planned.chat_id, restoredContext.chat_id);
  assert.strictEqual(planned.source_kind, "CALLBACK_QUERY");
  assert.strictEqual(planned.callback_query_id, "CALLBACK-2351");
  assert.strictEqual(planned.callback_message_id, "1234");
  assert.strictEqual(planned.update_id, 2351);
  assert.strictEqual(planned.should_send_telegram, true);
  assert.strictEqual(planned.telegram_dispatch_payload_built, true);
  assert.strictEqual(planned.telegram_dispatch_can_edit, true);
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.json_debug.callback_lifecycle.chat_id_present, true);
  return planned.telegram_dispatch_method;
});

check("skip_send_still_blocks_dispatch", () => {
  const planned = executeCode(dispatchPlanCode, {
    ...restoredContext,
    telegramBotToken: "TEST_TELEGRAM_BOT_TOKEN_PRESENT",
    skip_send: true,
    telegram_message: "Duplicate ignored",
    json_debug: { callback_lifecycle: { action_executed: false, response_built: true } },
  });
  assert.strictEqual(planned.should_send_telegram, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, false);
  assert.strictEqual(planned.telegram_dispatch_blocked_reason, "skip_send");
  return planned.telegram_dispatch_blocked_reason;
});

console.log("Telegram Post-Action Dispatch Context Preserved Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");
const {
  assertDispatchContextPresent,
  assertNoSilentSuccess,
  assertReplyMarkupReferencesToken,
  assertTelegramDispatchAttempted,
  assertTelegramDispatchOkOrExplained,
} = require("./qa/qa-assertions");

function executionWith(runData) {
  return { data: { resultData: { runData } } };
}

const editExecution = executionWith({
  "Build Telegram Dispatch Plan": [{ data: { main: [[{ json: {
    chat_id: "6573879494",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "qa-callback",
    callback_message_id: "1219",
    telegram_message: "Visible",
    should_send_telegram: true,
    reply_markup: { inline_keyboard: [[{ text: "Confirmar", callback_data: "cfdi:CONFIRMTOKEN123" }]] }
  } }]] } }],
  "Telegram editMessageText": [{ data: { main: [[{ json: { ok: true } }]] } }]
});

assert.doesNotThrow(() => assertDispatchContextPresent(editExecution));
assert.doesNotThrow(() => assertTelegramDispatchAttempted(editExecution));
assert.doesNotThrow(() => assertTelegramDispatchOkOrExplained(editExecution));
assert.doesNotThrow(() => assertReplyMarkupReferencesToken({ execution: editExecution, token: "CONFIRMTOKEN123" }));

const fallbackExecution = executionWith({
  "Build Telegram Dispatch Plan": editExecution.data.resultData.runData["Build Telegram Dispatch Plan"],
  "Telegram editMessageText": [{ data: { main: [[{ json: { ok: false, description: "not editable" } }]] } }],
  "Telegram fallback sendMessage": [{ data: { main: [[{ json: { ok: true } }]] } }]
});
assert.doesNotThrow(() => assertTelegramDispatchAttempted(fallbackExecution));

const silentExecution = executionWith({
  "Execute PAC Sandbox Action": [{ data: { main: [[{ json: { stdout: "{}" } }]] } }],
  "Build PAC Sandbox Action Summary": [{ data: { main: [[{ json: {
    telegram_message: "Visible",
    json_debug: { callback_lifecycle: { action_executed: true, response_built: true } }
  } }]] } }]
});
assert.throws(() => assertNoSilentSuccess(silentExecution), /Silent success/);
assert.throws(() => assertReplyMarkupReferencesToken({ execution: editExecution, token: "MISSINGTOKEN12" }), /reply_markup/);

console.log("QA Dispatch Assertions Tests");
console.log(" - edit_dispatch_assertions_pass: PASS");
console.log(" - fallback_dispatch_assertions_pass: PASS");
console.log(" - silent_success_detected: PASS");
console.log(" - missing_confirm_token_reference_detected: PASS");
console.log("\nPASS total: 4/4");

const assert = require("assert");
const {
  buildTelegramCallbackUpdate,
  buildTelegramMessageUpdate,
  simulateTelegramCallback,
} = require("./qa/telegram-webhook-simulator");

const message = buildTelegramMessageUpdate({ chatId: "6573879494", userId: "6573879494", text: "/start", updateId: 1, messageId: 2 });
assert.strictEqual(message.update_id, 1);
assert.strictEqual(message.message.chat.id, 6573879494);
assert.strictEqual(message.message.text, "/start");

const callback = buildTelegramCallbackUpdate({ chatId: "6573879494", userId: "6573879494", callbackToken: "TOKEN12345678", messageId: 55, updateId: 3 });
assert.strictEqual(callback.callback_query.data, "cfdi:TOKEN12345678");
assert.strictEqual(callback.callback_query.message.message_id, 55);

let captured = null;
simulateTelegramCallback({
  webhookUrl: "http://localhost:5678/webhook/cfdi-local-ingest",
  runnerSecret: "RUNNER_SECRET_TEST",
  chatId: "6573879494",
  userId: "6573879494",
  callbackToken: "TOKEN12345678",
  fetchImpl: async (url, options) => {
    captured = { url: String(url), options };
    return { ok: true, status: 200, text: async () => "{\"ok\":true}" };
  },
}).then(() => {
  assert(captured.url.includes("/webhook/cfdi-local-ingest"));
  assert.strictEqual(captured.options.headers["X-CFDI-Runner-Secret"], "RUNNER_SECRET_TEST");
  assert(JSON.parse(captured.options.body).callback_query.data.startsWith("cfdi:"));
  console.log("QA Telegram Webhook Simulator Tests");
  console.log(" - builds_message_and_callback_payloads: PASS");
  console.log(" - posts_runner_secret_header_without_bot_token: PASS");
  console.log("\nPASS total: 2/2");
}).catch((error) => {
  console.error(error);
  process.exit(1);
});

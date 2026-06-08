const assert = require("assert");

const {
  ACTIONS,
  buildCallbackData,
  generateActionToken,
  parseCallbackData,
  validateActionTokenRecord,
} = require("./lib/telegram-action-token-utils");

const token = generateActionToken();
const callbackData = buildCallbackData(token);
assert(callbackData.startsWith("cfdi:"));
assert(callbackData.length <= 64);
assert.strictEqual(parseCallbackData(callbackData), token);

const baseRecord = {
  token,
  chat_id: "CHAT-1",
  draft_id: "DRAFT-1",
  action: ACTIONS.DELIVERY_CONFIRM_PROVIDER_EMAIL,
  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  used_at: null,
  payload: {
    draft_id: "DRAFT-1",
    channel: "PROVIDER_EMAIL",
    action: ACTIONS.DELIVERY_CONFIRM_PROVIDER_EMAIL,
    confirmation_required: true,
    idempotency_key: "document_delivery:SANDBOX:DRAFT-1:PROVIDER_EMAIL:email:hash:xml:pdf",
  },
};

const valid = validateActionTokenRecord(baseRecord, { chatId: "CHAT-1" });
assert.strictEqual(valid.ok, true);
assert.strictEqual(valid.action, ACTIONS.DELIVERY_CONFIRM_PROVIDER_EMAIL);

const expired = validateActionTokenRecord({
  ...baseRecord,
  expires_at: new Date(Date.now() - 1000).toISOString(),
}, { chatId: "CHAT-1" });
assert.strictEqual(expired.ok, false);
assert.strictEqual(expired.reason, "token_expirado");

const used = validateActionTokenRecord({
  ...baseRecord,
  used_at: new Date().toISOString(),
}, { chatId: "CHAT-1" });
assert.strictEqual(used.ok, false);
assert.strictEqual(used.reason, "token_usado");

const otherChat = validateActionTokenRecord(baseRecord, { chatId: "CHAT-2" });
assert.strictEqual(otherChat.ok, false);
assert.strictEqual(otherChat.reason, "chat_invalido");

const raw = JSON.stringify({ callbackData, payload: baseRecord.payload });
assert(!/cliente@example.com|123456789|AAA010101AAA|[0-9a-f]{8}-[0-9a-f]{4}/i.test(raw));
assert(!/\.(xml|pdf|zip|xlsx)\b|[A-Za-z]:[\\/]/i.test(raw));

console.log("Telegram Delivery Confirmation Tokens Tests");
console.log(" - valid_delivery_token: PASS (DELIVERY_CONFIRM_PROVIDER_EMAIL)");
console.log(" - expired_token_blocks: PASS (token_expirado)");
console.log(" - used_token_blocks: PASS (token_usado)");
console.log(" - other_chat_blocks: PASS (chat_invalido)");
console.log(" - callback_data_safe: PASS (cfdi:<token>)");
console.log("\nPASS total: 5/5");

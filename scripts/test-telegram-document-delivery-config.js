const assert = require("assert");

const { diagnoseDocumentDeliveryConfig } = require("./lib/telegram-document-delivery-channel");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

check("delivery_is_disabled_by_default", () => {
  const result = diagnoseDocumentDeliveryConfig({});
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.ready, false);
  assert.strictEqual(result.delivery_enabled, false);
  assert(result.warnings.includes("TELEGRAM_DOCUMENT_DELIVERY_DISABLED_OR_INCOMPLETE"));
  return result.status;
});

check("delivery_config_ready_only_with_explicit_env", () => {
  const result = diagnoseDocumentDeliveryConfig({
    TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "6573879494",
    TELEGRAM_BOT_TOKEN: "123456:ABCDEF",
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.ready, true);
  assert.strictEqual(result.telegram_token_present, true);
  assert.strictEqual(result.delivery_chat_id_present, true);
  assert.strictEqual(result.delivery_chat_id_redacted, "[REDACTED_CHAT_ID len=10]");
  assert(!JSON.stringify(result).includes("6573879494"), "full chat id leaked");
  assert(!JSON.stringify(result).includes("123456:ABCDEF"), "token leaked");
  return result.status;
});

console.log("Telegram Document Delivery Config Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

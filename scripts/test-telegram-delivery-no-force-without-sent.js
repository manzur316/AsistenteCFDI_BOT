const assert = require("assert");

const {
  baseSource,
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

check("ready_prepare_does_not_show_force_button", () => {
  const result = runSummary(prepareStdout("TELEGRAM_DOCUMENT_CHANNEL"), baseSource());
  const text = String(result.telegram_message || "");
  const sql = String(result.persistence_sql || "");
  const buttons = JSON.stringify(result.reply_markup || {});
  assert(!/Reenviar de todos modos/.test(text), "force copy shown without SENT");
  assert(!/Reenviar de todos modos/.test(buttons), "force button shown without SENT");
  assert(!/DELIVERY_FORCE_/.test(sql), "force token created without SENT duplicate");
  return "ready";
});

check("handle_prepare_keyboard_no_longer_preloads_force", () => {
  const handleCode = getNodeCode("Handle Commands And Scoring");
  const start = handleCode.indexOf("function buildDeliveryPrepareKeyboard");
  const end = handleCode.indexOf("function buildDeliveryStatusKeyboard");
  const snippet = handleCode.slice(start, end);
  assert(snippet.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
  assert(!snippet.includes("DELIVERY_FORCE_PROVIDER_EMAIL"), "force action still preloaded before Action Layer result");
  assert(!snippet.includes("DELIVERY_FORCE_TELEGRAM_CHANNEL"), "force channel still preloaded before Action Layer result");
  return "no_preload";
});

console.log("Telegram Delivery No Force Without SENT Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

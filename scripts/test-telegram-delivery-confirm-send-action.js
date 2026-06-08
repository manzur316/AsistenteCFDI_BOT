const assert = require("assert");

const {
  callbackInput,
  executeCode,
  getNodeCode,
} = require("./lib/test-telegram-delivery-workflow-harness");

const handleCode = getNodeCode("Handle Commands And Scoring");
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

check("confirm_actions_map_to_document_delivery_send", () => {
  assert(handleCode.includes("if (String(action || '').includes('CONFIRM') || String(action || '').includes('FORCE')) return 'sandbox.documents.delivery.send';"));
  return "send";
});

check("provider_confirm_command_has_human_confirmation_flags", () => {
  const result = executeCode(handleCode, callbackInput("confirmprovider002", "DELIVERY_CONFIRM_PROVIDER_EMAIL", { channel: "PROVIDER_EMAIL" }));
  const command = String(result.sandbox_execute_command || "");
  assert(command.includes("sandbox.documents.delivery.send"));
  assert(command.includes("--send-real --confirmed"));
  assert(!command.includes("--dry-run"));
  return "provider";
});

check("telegram_confirm_command_has_human_confirmation_flags", () => {
  const result = executeCode(handleCode, callbackInput("confirmchannel002", "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", { channel: "TELEGRAM_DOCUMENT_CHANNEL" }));
  const command = String(result.sandbox_execute_command || "");
  assert(command.includes("sandbox.documents.delivery.send"));
  assert(command.includes("--send-real --confirmed"));
  assert(!command.includes("--dry-run"));
  return "telegram";
});

console.log("Telegram Delivery Confirm Send Action Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

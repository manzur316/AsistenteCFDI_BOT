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

function assertConfirmRoutes(action, channel) {
  const token = action === "DELIVERY_CONFIRM_PROVIDER_EMAIL" ? "confirmprovider001" : "confirmchannel001";
  const result = executeCode(handleCode, callbackInput(token, action, { channel }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.send");
  assert.strictEqual(result.callback_ack_text, "Enviando documentos...");
  assert(String(result.sandbox_execute_command || "").includes("sandbox.documents.delivery.send"), "send command missing");
  assert(String(result.sandbox_execute_command || "").includes("--channel " + channel), "channel flag missing");
  assert(String(result.sandbox_execute_command || "").includes("--send-real"), "send-real flag missing");
  assert(String(result.sandbox_execute_command || "").includes("--confirmed"), "confirmed flag missing");
  assert(!String(result.sandbox_execute_command || "").includes("--force"), "confirm route must not force");
  assert(String(result.callback_processing_sql || "").includes("UPDATE cfdi_action_tokens SET used_at"), "token not marked used");
  assert(String(result.callback_processing_sql || "").includes(action), "event must record action");
  return channel;
}

check("confirm_provider_email_routes_to_send_real_confirmed", () => {
  return assertConfirmRoutes("DELIVERY_CONFIRM_PROVIDER_EMAIL", "PROVIDER_EMAIL");
});

check("confirm_telegram_channel_routes_to_send_real_confirmed", () => {
  return assertConfirmRoutes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL", "TELEGRAM_DOCUMENT_CHANNEL");
});

check("used_confirm_token_is_not_reused", () => {
  const result = executeCode(handleCode, callbackInput("usedconfirm001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", {
    channel: "PROVIDER_EMAIL",
    used_at: "2026-06-08T01:00:00.000Z",
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(!String(result.sandbox_execute_command || "").includes("sandbox.documents.delivery.send"), "used token must not execute send");
  assert(/confirmacion ya fue usada|accion(?: de Documentos)? ya fue procesada/i.test(result.telegram_message));
  assert(result.reply_markup?.inline_keyboard?.length > 0, "used confirm token must include recovery buttons");
  return result.action;
});

console.log("Telegram Delivery Confirm Token Routing Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

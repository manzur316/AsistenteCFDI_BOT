const assert = require("assert");

const {
  allCallbackData,
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

function assertConfirmToken(channel, action) {
  const result = runSummary(prepareStdout(channel), baseSource());
  const sql = String(result.persistence_sql || "");
  assert(sql.includes("INSERT INTO cfdi_action_tokens"), "confirmation token insert missing");
  assert(sql.includes(action), `${action} missing in persistence SQL`);
  assert(sql.includes("SANDBOX_DOCUMENT_DELIVERY_CONFIRM"), "confirm state missing");
  assert(sql.includes(channel), "channel missing in token payload");
  assert(sql.includes("confirmation_required"), "confirmation flag missing");
  assert(sql.includes("DRAFT-20260608-204158-173694529"), "draft_id missing");
  assert(!sql.includes("r***@example.com"), "redacted destination should not be token payload");
  const callbacks = allCallbackData(result.reply_markup);
  assert(callbacks.some((item) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(item)), "real cfdi token callback missing");
  assert(!callbacks.includes("cfdi:<token>"), "placeholder callback leaked");
  assert(!/DELIVERY_FORCE_/.test(sql), "force token must not be created for READY prepare");
  return action;
}

check("prepare_provider_email_creates_confirm_token", () => {
  return assertConfirmToken("PROVIDER_EMAIL", "DELIVERY_CONFIRM_PROVIDER_EMAIL");
});

check("prepare_telegram_channel_creates_confirm_token", () => {
  return assertConfirmToken("TELEGRAM_DOCUMENT_CHANNEL", "DELIVERY_CONFIRM_TELEGRAM_CHANNEL");
});

check("summary_uses_restore_processing_lock_context_for_chat_scoped_tokens", () => {
  const code = getNodeCode("Build PAC Sandbox Action Summary");
  const source = baseSource({ sandbox_delivery_channel: "PROVIDER_EMAIL" });
  const result = executeCode(code, { stdout: prepareStdout("PROVIDER_EMAIL") }, (nodeName) => (
    nodeName === "Restore Processing Lock Context" ? [{ json: source }] : []
  ));
  const sql = String(result.persistence_sql || "");
  assert(sql.includes("'6573879494'"), "chat_id from restored context missing");
  assert(sql.includes("'DELIVERY_CONFIRM_PROVIDER_EMAIL'"), "confirm token missing");
  assert(sql.includes('"channel":"PROVIDER_EMAIL"'), "channel payload missing");
  assert.strictEqual(result.should_send_telegram, true);
  return "Restore Processing Lock Context";
});

console.log("Telegram Delivery Confirm Token Created Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

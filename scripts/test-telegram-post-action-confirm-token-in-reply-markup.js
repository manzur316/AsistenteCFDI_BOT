const assert = require("assert");

const {
  allCallbackData,
  baseSource,
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

function tokenForAction(sql, action) {
  const pattern = /VALUES \('([^']+)', '[^']*', '[^']*', '([^']+)'/g;
  let match = null;
  while ((match = pattern.exec(sql))) {
    if (match[2] === action) return match[1];
  }
  return "";
}

function assertConfirmTokenReferenced(channel, action) {
  const result = runSummary(prepareStdout(channel), baseSource({
    draft_id: `DRAFT-CONFIRM-MARKUP-${channel}`,
    source_kind: "CALLBACK_QUERY",
    callback_message_id: "711",
    sandbox_delivery_channel: channel,
  }));
  const token = tokenForAction(result.persistence_sql, action);
  assert(token, `${action} token not found in persistence_sql`);
  const callbackData = allCallbackData(result.reply_markup);
  assert(callbackData.includes(`cfdi:${token}`), `${action} token not referenced in reply_markup`);
  assert(callbackData.every((value) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(value)), "invalid callback_data value");
  return action;
}

check("channel_confirm_token_is_referenced_by_reply_markup", () => {
  return assertConfirmTokenReferenced("TELEGRAM_DOCUMENT_CHANNEL", "DELIVERY_CONFIRM_TELEGRAM_CHANNEL");
});

check("email_confirm_token_is_referenced_by_reply_markup", () => {
  return assertConfirmTokenReferenced("PROVIDER_EMAIL", "DELIVERY_CONFIRM_PROVIDER_EMAIL");
});

console.log("Telegram Post-Action Confirm Token In Reply Markup Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

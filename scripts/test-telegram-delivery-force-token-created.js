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

function duplicateStdout(channel) {
  return prepareStdout(channel, {
    status: "BLOCKED_DUPLICATE",
    warnings: ["DELIVERY_ALREADY_SENT"],
    output: {
      duplicate_sent: true,
      duplicate_delivery: {
        delivery_id: "DELIV-SAFE-HIDDEN",
        sent_at: "2026-06-08T02:00:00.000Z",
        recipient_redacted: channel === "PROVIDER_EMAIL" ? "r***@example.com" : "canal documental",
      },
    },
  });
}

function assertForceToken(channel, action) {
  const result = runSummary(duplicateStdout(channel), baseSource());
  const sql = String(result.persistence_sql || "");
  assert(sql.includes("INSERT INTO cfdi_action_tokens"), "force token insert missing");
  assert(sql.includes(action), `${action} missing`);
  assert(sql.includes("SANDBOX_DOCUMENT_DELIVERY_FORCE"), "force state missing");
  assert(sql.includes("force"), "force payload missing");
  assert(!/DELIVERY_CONFIRM_/.test(sql), "confirm token must not be created for duplicate force screen");
  assert(/Reenviar de todos modos/.test(result.telegram_message), "force UX copy missing");
  assert(allCallbackData(result.reply_markup).some((item) => /^cfdi:[A-Za-z0-9_-]{12,40}$/.test(item)), "real force callback missing");
  return action;
}

check("duplicate_provider_email_creates_force_token", () => {
  return assertForceToken("PROVIDER_EMAIL", "DELIVERY_FORCE_PROVIDER_EMAIL");
});

check("duplicate_telegram_channel_creates_force_token", () => {
  return assertForceToken("TELEGRAM_DOCUMENT_CHANNEL", "DELIVERY_FORCE_TELEGRAM_CHANNEL");
});

console.log("Telegram Delivery Force Token Created Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

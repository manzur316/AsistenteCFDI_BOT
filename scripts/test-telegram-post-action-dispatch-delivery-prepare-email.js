const assert = require("assert");

const {
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

const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");

check("delivery_prepare_email_builds_confirmation_message", () => {
  const result = runSummary(prepareStdout("PROVIDER_EMAIL"), baseSource({
    draft_id: "DRAFT-PREPARE-EMAIL-001",
    source_kind: "CALLBACK_QUERY",
    callback_message_id: "611",
    sandbox_delivery_channel: "PROVIDER_EMAIL",
  }));
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.prepare");
  assert(/Confirmar envio por correo/.test(result.telegram_message));
  assert(/Canal: PROVIDER_EMAIL/.test(result.telegram_message));
  assert(/El proveedor enviara la factura al email sincronizado/.test(result.telegram_message));
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "confirm token insert missing");
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Confirmar envio correo"), "confirm email button missing");
  assert(labels.includes("Ver estado documental"), "status button missing");
  return labels.length;
});

check("delivery_prepare_email_dispatch_plan_is_visible", () => {
  const result = runSummary(prepareStdout("PROVIDER_EMAIL"), baseSource({
    draft_id: "DRAFT-PREPARE-EMAIL-002",
    source_kind: "CALLBACK_QUERY",
    callback_message_id: "612",
    sandbox_delivery_channel: "PROVIDER_EMAIL",
  }));
  const planned = executeCode(dispatchPlanCode, result);
  assert.strictEqual(planned.telegram_dispatch_attempted, true);
  assert.strictEqual(planned.telegram_dispatch_method, "editMessageText");
  assert.strictEqual(planned.json_debug.callback_lifecycle.reply_markup_built, true);
  return planned.telegram_dispatch_method;
});

console.log("Telegram Post-Action Dispatch Delivery Prepare Email Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

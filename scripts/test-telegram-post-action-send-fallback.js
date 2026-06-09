const assert = require("assert");

const {
  executeCode,
  getNodeCode,
  loadWorkflow,
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

const workflow = loadWorkflow();

function getNode(name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

check("workflow_has_edit_then_fallback_send_route", () => {
  assert.strictEqual(getNode("Telegram editMessageText").continueOnFail, true);
  assert.strictEqual(getNode("Telegram fallback sendMessage").continueOnFail, true);
  assert.strictEqual(getNode("Telegram sendMessage").continueOnFail, true);
  const editConnection = workflow.connections["Telegram editMessageText"].main[0][0].node;
  const editOkConnection = workflow.connections["Did Telegram Edit Succeed"].main;
  assert.strictEqual(editConnection, "Did Telegram Edit Succeed");
  assert.strictEqual(editOkConnection[0][0].node, "Log Send Result SQL");
  assert.strictEqual(editOkConnection[1][0].node, "Restore Telegram Dispatch Fallback Context");
  assert.strictEqual(workflow.connections["Restore Telegram Dispatch Fallback Context"].main[0][0].node, "Telegram fallback sendMessage");
  return "edit/fallback";
});

check("dispatch_plan_uses_send_when_callback_message_id_missing", () => {
  const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");
  const planned = executeCode(dispatchPlanCode, {
    chat_id: "CHAT-717F",
    source_kind: "CALLBACK_QUERY",
    callback_message_id: "",
    telegram_message: "Mensaje visible",
    json_debug: { callback_lifecycle: { action_executed: true } },
  });
  assert.strictEqual(planned.telegram_dispatch_method, "sendMessage");
  assert.strictEqual(planned.telegram_dispatch_can_edit, false);
  assert.strictEqual(planned.json_debug.callback_lifecycle.telegram_dispatch_attempted, true);
  return planned.telegram_dispatch_method;
});

check("fallback_context_switches_dispatch_method", () => {
  const fallbackCode = getNodeCode("Restore Telegram Dispatch Fallback Context");
  const prior = {
    chat_id: "CHAT-717F",
    source_kind: "CALLBACK_QUERY",
    callback_message_id: "99",
    telegram_message: "Mensaje visible",
    telegram_dispatch_method: "editMessageText",
    json_debug: { callback_lifecycle: { action_executed: true, telegram_dispatch_method: "editMessageText" } },
  };
  const restored = executeCode(fallbackCode, { ok: false, description: "message is not modified" }, (name) => (
    name === "Build Telegram Dispatch Plan" ? [{ json: prior }] : []
  ));
  assert.strictEqual(restored.telegram_dispatch_method, "fallbackSendMessage");
  assert.strictEqual(restored.telegram_dispatch_can_edit, false);
  assert.strictEqual(restored.json_debug.callback_lifecycle.telegram_dispatch_method, "fallbackSendMessage");
  return restored.telegram_dispatch_method;
});

console.log("Telegram Post-Action Send Fallback Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

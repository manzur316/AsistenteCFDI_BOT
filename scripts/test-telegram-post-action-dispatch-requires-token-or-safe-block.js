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

const dispatchPlanCode = getNodeCode("Build Telegram Dispatch Plan");
const workflow = loadWorkflow();

function getNode(name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

check("set_config_loads_telegram_token_from_env_without_hardcoding", () => {
  const tokenField = getNode("Set Config").parameters.values.string.find((item) => item.name === "telegramBotToken");
  assert(tokenField, "telegramBotToken field missing");
  assert(String(tokenField.value).includes("$env.TELEGRAM_BOT_TOKEN"), "TELEGRAM_BOT_TOKEN env not used");
  assert(String(tokenField.value).includes("$env.TELEGRAM_TOKEN"), "TELEGRAM_TOKEN env fallback not used");
  assert(String(tokenField.value).includes("REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N"), "placeholder missing");
  assert(!/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(JSON.stringify(workflow)), "real token leaked");
  return "env-token";
});

check("missing_telegram_token_blocks_dispatch_safely", () => {
  const planned = executeCode(dispatchPlanCode, {
    chat_id: "6573879494",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-MISSING-TOKEN",
    callback_message_id: "456",
    telegram_message: "Confirmar envio por correo.",
    reply_markup: { inline_keyboard: [[{ text: "Confirmar envio por correo", callback_data: "cfdi:CONFIRMEMAIL717G" }]] },
    json_debug: {
      callback_lifecycle: {
        action_executed: true,
        response_built: true,
        reply_markup_built: true,
      },
    },
  });
  assert.strictEqual(planned.should_send_telegram, false);
  assert.strictEqual(planned.telegram_bot_token_present, false);
  assert.strictEqual(planned.telegram_dispatch_attempted, false);
  assert.strictEqual(planned.telegram_dispatch_payload_built, false);
  assert.strictEqual(planned.telegram_dispatch_blocked_reason, "missing_telegram_bot_token");
  assert.strictEqual(planned.webhook_status, "handled_error");
  assert(/missing_telegram_bot_token/.test(planned.webhook_message));
  assert.strictEqual(planned.json_debug.callback_lifecycle.chat_id_present, true);
  assert.strictEqual(planned.json_debug.callback_lifecycle.telegram_message_present, true);
  return planned.telegram_dispatch_blocked_reason;
});

console.log("Telegram Post-Action Dispatch Requires Token Or Safe Block Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

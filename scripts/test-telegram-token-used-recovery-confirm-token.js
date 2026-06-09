const assert = require("assert");

const {
  allCallbackData,
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
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

function recentConfirmToken(token, action, draftId, channel) {
  return {
    token,
    chat_id: "6573879494",
    draft_id: draftId,
    action,
    used_at: null,
    expires_at: "2099-01-01T00:00:00.000Z",
    payload: {
      action,
      draft_id: draftId,
      channel,
      state: "SANDBOX_DOCUMENT_DELIVERY_CONFIRM",
      confirmation_required: true,
    },
    created_at: "2026-06-08T12:10:00.000Z",
  };
}

const handleCode = getNodeCode("Handle Commands And Scoring");

check("used_channel_prepare_recovers_existing_confirm_token", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-PREPARE-CHANNEL-001");
  const confirmToken = "CONFIRMCHAN717F";
  const result = executeCode(handleCode, callbackInput("USEDPREPCHAN1", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", {
    draft,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    used_at: "2026-06-08T12:00:00.000Z",
    update_id: 7173301,
    recent_action_tokens: [recentConfirmToken(confirmToken, "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", draft.draft_id, "TELEGRAM_DOCUMENT_CHANNEL")],
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(/La preparacion ya fue creada/.test(result.telegram_message));
  assert(/Puedes confirmar el envio/.test(result.telegram_message));
  assert(allCallbackData(result.reply_markup).includes(`cfdi:${confirmToken}`), "existing channel confirm token not reused");
  return confirmToken;
});

check("used_email_prepare_recovers_existing_confirm_token", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-PREPARE-EMAIL-001");
  const confirmToken = "CONFIRMEMAIL717F";
  const result = executeCode(handleCode, callbackInput("USEDPREPEMAIL1", "DELIVERY_PREPARE_PROVIDER_EMAIL", {
    draft,
    channel: "PROVIDER_EMAIL",
    used_at: "2026-06-08T12:00:00.000Z",
    update_id: 7173302,
    recent_action_tokens: [recentConfirmToken(confirmToken, "DELIVERY_CONFIRM_PROVIDER_EMAIL", draft.draft_id, "PROVIDER_EMAIL")],
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(/La preparacion ya fue creada/.test(result.telegram_message));
  assert(/Puedes confirmar el envio/.test(result.telegram_message));
  assert(allCallbackData(result.reply_markup).includes(`cfdi:${confirmToken}`), "existing email confirm token not reused");
  return confirmToken;
});

console.log("Telegram Token Used Recovery Confirm Token Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

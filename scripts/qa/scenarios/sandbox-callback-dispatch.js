const { createN8nApiClient } = require("../n8n-api-client");
const { createPostgresQaClient } = require("../postgres-qa-client");
const { analyzeExecution } = require("../qa-assertions");
const { simulateTelegramCallback } = require("../telegram-webhook-simulator");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBlockedRealSendAction(action) {
  const value = String(action || "").toUpperCase();
  return value.startsWith("DELIVERY_CONFIRM_") || value.startsWith("DELIVERY_FORCE_") || value.includes("PRODUCTION");
}

async function runCallbackTokenScenario(options = {}) {
  const token = String(options.token || "").trim();
  if (!token) throw new Error("NEEDS_INPUT: --token requerido.");
  const db = options.dbClient || createPostgresQaClient(options);
  const n8n = options.n8nClient || createN8nApiClient(options);
  const tokenRecord = await Promise.resolve(db.getActionToken(token));
  if (!tokenRecord) throw new Error("NOT_FOUND: token no encontrado en cfdi_action_tokens.");
  if (isBlockedRealSendAction(tokenRecord.action) && options.confirmRealSend !== true) {
    throw new Error("SAFE_BLOCK: confirm/force delivery requiere --confirm-real-send.");
  }
  const chatId = options.chatId || tokenRecord.chat_id || "";
  const callbackMessageId = options.callbackMessageId || options.messageId || 1219;
  const webhook = await simulateTelegramCallback({
    ...options,
    chatId,
    userId: options.telegramUserId || chatId,
    callbackToken: token,
    callbackMessageId,
  });
  await sleep(Number(options.waitMs || 1500));
  const executions = await n8n.listExecutions({ limit: 1 });
  const latest = Array.isArray(executions?.data) ? executions.data[0] : Array.isArray(executions) ? executions[0] : executions?.results?.[0];
  const executionId = latest?.id || latest?.executionId || options.executionId;
  const execution = executionId ? await n8n.getExecution({ executionId, includeData: true }) : null;
  const analysis = execution ? analyzeExecution(execution) : { pass: false, failures: ["No execution returned from n8n API"] };
  const afterToken = await Promise.resolve(db.getActionToken(token));
  return {
    pass: analysis.pass === true,
    scenario: "callback-token",
    token,
    token_action: tokenRecord.action,
    draft_id: tokenRecord.draft_id || tokenRecord.payload?.draft_id || null,
    webhook_response: webhook.response,
    execution_id: executionId || null,
    execution,
    analysis,
    db_snapshot: {
      action_token_before: tokenRecord,
      action_token_after: afterToken,
      summary: `used_at_before=${Boolean(tokenRecord.used_at)} used_at_after=${Boolean(afterToken?.used_at)}`,
    },
  };
}

module.exports = {
  runCallbackTokenScenario,
};

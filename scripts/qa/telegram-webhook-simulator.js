function uniqueUpdateId(prefix = 1736900000) {
  return Number(prefix) + Math.floor(Date.now() % 1000000) + Math.floor(Math.random() * 1000);
}

function buildTelegramMessageUpdate({ chatId, userId, text, updateId, messageId } = {}) {
  const safeChatId = chatId || userId;
  return {
    update_id: updateId || uniqueUpdateId(),
    message: {
      message_id: Number(messageId || Math.floor(Date.now() % 100000)) || 1,
      from: {
        id: Number(userId || safeChatId),
        is_bot: false,
        first_name: "QA",
      },
      chat: {
        id: Number(safeChatId),
        type: "private",
      },
      date: Math.floor(Date.now() / 1000),
      text: String(text || "/start"),
    },
  };
}

function buildTelegramCallbackUpdate({ chatId, userId, callbackToken, callbackData, messageId, updateId, callbackQueryId } = {}) {
  const safeChatId = chatId || userId;
  const tokenData = callbackData || `cfdi:${String(callbackToken || "").trim()}`;
  return {
    update_id: updateId || uniqueUpdateId(),
    callback_query: {
      id: callbackQueryId || `qa-callback-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      from: {
        id: Number(userId || safeChatId),
        is_bot: false,
        first_name: "QA",
      },
      message: {
        message_id: Number(messageId || 1219),
        chat: {
          id: Number(safeChatId),
          type: "private",
        },
      },
      data: tokenData,
    },
  };
}

async function postWebhook({ webhookUrl, payload, runnerSecret, fetchImpl = globalThis.fetch } = {}) {
  if (!webhookUrl) throw new Error("NEEDS_CONFIG: N8N_WEBHOOK_URL no configurado.");
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible en este runtime Node.");
  const headers = { "Content-Type": "application/json" };
  if (runnerSecret) headers["X-CFDI-Runner-Secret"] = runnerSecret;
  const response = await fetchImpl(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  let body = bodyText;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {}
  return { status: response.status, ok: response.ok, body };
}

function simulatorConfig(env = process.env) {
  return {
    webhookUrl: env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/cfdi-local-ingest",
    runnerSecret: env.RUNNER_SECRET || env.CFDI_RUNNER_SECRET || env.N8N_RUNNER_SECRET || "",
    defaultChatId: env.QA_DEFAULT_CHAT_ID || "",
    defaultTelegramUserId: env.QA_DEFAULT_TELEGRAM_USER_ID || env.QA_DEFAULT_CHAT_ID || "",
  };
}

async function simulateTelegramMessage(options = {}) {
  const config = { ...simulatorConfig(options.env || process.env), ...options };
  const payload = buildTelegramMessageUpdate({
    chatId: options.chatId || config.defaultChatId,
    userId: options.userId || options.telegramUserId || config.defaultTelegramUserId || config.defaultChatId,
    text: options.text,
    updateId: options.updateId,
    messageId: options.messageId,
  });
  const response = await postWebhook({ webhookUrl: config.webhookUrl, payload, runnerSecret: config.runnerSecret, fetchImpl: options.fetchImpl });
  return { payload, response };
}

async function simulateTelegramCallback(options = {}) {
  const config = { ...simulatorConfig(options.env || process.env), ...options };
  const payload = buildTelegramCallbackUpdate({
    chatId: options.chatId || config.defaultChatId,
    userId: options.userId || options.telegramUserId || config.defaultTelegramUserId || config.defaultChatId,
    callbackToken: options.callbackToken,
    callbackData: options.callbackData,
    messageId: options.callbackMessageId || options.messageId,
    updateId: options.updateId,
    callbackQueryId: options.callbackQueryId,
  });
  const response = await postWebhook({ webhookUrl: config.webhookUrl, payload, runnerSecret: config.runnerSecret, fetchImpl: options.fetchImpl });
  return { payload, response };
}

module.exports = {
  buildTelegramCallbackUpdate,
  buildTelegramMessageUpdate,
  simulateTelegramCallback,
  simulateTelegramMessage,
  simulatorConfig,
  uniqueUpdateId,
};

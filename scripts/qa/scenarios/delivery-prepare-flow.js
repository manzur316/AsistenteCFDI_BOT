const { runCallbackTokenScenario } = require("./sandbox-callback-dispatch");

function expectedPrepareAction(channel) {
  return String(channel || "").toUpperCase() === "PROVIDER_EMAIL"
    ? "DELIVERY_PREPARE_PROVIDER_EMAIL"
    : "DELIVERY_PREPARE_TELEGRAM_CHANNEL";
}

async function runDeliveryPrepareScenario(options = {}) {
  const draftId = String(options.draftId || "").trim();
  const channel = String(options.channel || "").trim().toUpperCase();
  if (!draftId) throw new Error("NEEDS_INPUT: --draft-id requerido.");
  if (!["TELEGRAM_DOCUMENT_CHANNEL", "PROVIDER_EMAIL"].includes(channel)) {
    throw new Error("NEEDS_INPUT: --channel invalido.");
  }
  const db = options.dbClient;
  const tokens = await Promise.resolve(db.getActionTokensByDraft(draftId));
  const action = expectedPrepareAction(channel);
  const tokenRecord = (tokens || []).find((item) => String(item.action || "").toUpperCase() === action && !item.used_at);
  if (!tokenRecord) {
    return {
      pass: false,
      scenario: "delivery-prepare",
      draft_id: draftId,
      channel,
      failures: [
        `NO_PREPARE_TOKEN_AVAILABLE: no unused ${action} token found. Abre el estado documental o el draft detail en Telegram para generar botones frescos.`,
      ],
      db_snapshot: { tokens, summary: "prepare token missing" },
    };
  }
  return runCallbackTokenScenario({ ...options, token: tokenRecord.token, channel, draftId });
}

module.exports = {
  runDeliveryPrepareScenario,
  expectedPrepareAction,
};

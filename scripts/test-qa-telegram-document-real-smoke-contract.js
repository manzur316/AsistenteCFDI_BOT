const assert = require("assert");
const { runDeliveryRealSmokeScenario } = require("./qa/satbot-e2e-harness");

function makeExecutionForChannel() {
  return {
    data: {
      resultData: {
        runData: {
          "Build Telegram Dispatch Plan": [{
            data: {
              main: [[{
                json: {
                  chat_id: "6573879494",
                  source_kind: "CALLBACK_QUERY",
                  callback_query_id: "qa-callback-telegram",
                  callback_message_id: "1219",
                  telegram_message: "confirmar",
                  should_send_telegram: true,
                  telegram_dispatch_payload_built: true,
                  telegram_dispatch_method: "editMessageText",
                },
              }]],
            },
          }],
          "Telegram editMessageText": [{ data: { main: [[{ json: { ok: true } }]] } }],
        },
      },
    },
  };
}

function createDbClient() {
  const state = {
    draftId: "DRAFT-REAL-TELEGRAM",
    sent: false,
  };
  const tokens = [
    { token: "TELEGRAM_PREPARE", action: "DELIVERY_PREPARE_TELEGRAM_CHANNEL", used_at: null, draft_id: state.draftId, provider: "factura_com", environment: "SANDBOX" },
    { token: "TELEGRAM_CONFIRM", action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", used_at: null, draft_id: state.draftId, provider: "factura_com", environment: "SANDBOX" },
  ];
  return {
    getDraft: async () => ({
      draft_id: state.draftId,
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOADED",
      documents_valid: true,
      production_blocked: null,
    }),
    getDeliveryLedger: async () => ({ draft_id: state.draftId, document_delivery_ledger: "[]", sandbox_pac_summary: {} }),
    getDeliveryLedgerRows: async () => [
      { channel: "TELEGRAM_DOCUMENT_CHANNEL", delivery_status: state.sent ? "SENT" : "READY", delivery_action: state.sent ? "SENT" : "PREPARE", provider: "factura_com", environment: "SANDBOX" },
    ],
    getDocumentDeliverySummaryFromDraft: async () => ({
      draft_id: state.draftId,
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOADED",
      documents_valid: true,
      telegram_document_channel: {
        ready: true,
        last_status: state.sent ? "SENT" : "READY",
      },
      provider_email: { ready: true, email_confirmed: true, provider_email_sync_status: "SYNCED" },
    }),
    getActionTokensByDraft: async () => tokens,
    getActionToken: async (token) => {
      if (token === "TELEGRAM_CONFIRM") state.sent = true;
      return tokens.find((item) => item.token === token) || null;
    },
  };
}

function createN8nClient() {
  return {
    listWorkflows: async () => [{
      name: "cfdi_telegram_local_ingest",
      active: true,
      nodes: [
        { name: "Build Telegram Dispatch Plan", type: "n8n-nodes-base.function" },
        { name: "Should Send Telegram", type: "n8n-nodes-base.function" },
        { name: "Telegram editMessageText", type: "n8n-nodes-base.function" },
        { name: "Telegram sendMessage", type: "n8n-nodes-base.function" },
        { name: "Telegram fallback sendMessage", type: "n8n-nodes-base.function" },
        { name: "Log Send Result SQL", type: "n8n-nodes-base.function" },
      ],
      id: "wf-qa-001",
    }],
    listExecutions: async () => [{ id: "exec-qa-telegram" }],
    getExecution: async () => makeExecutionForChannel(),
  };
}

async function main() {
  process.env.QA_ALLOW_REAL_SEND = "1";
  process.env.FACTURACOM_SANDBOX_MODE = "live";
  process.env.FACTURACOM_SANDBOX_LIVE = "1";

  const args = {
    draftId: "DRAFT-REAL-TELEGRAM",
    sendReal: true,
    confirmRealSend: true,
    allowSandboxReal: true,
    maxRealSends: 1,
  };

  const statefulDbClient = createDbClient();
  const result = await runDeliveryRealSmokeScenario({
    args,
    n8nClient: createN8nClient(),
    dbClient: statefulDbClient,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.scenario, "telegram-document-real-smoke");
  assert.strictEqual(result.send_real_executed, true);
  assert.strictEqual(result.send_real_allowed, true);
  assert.strictEqual(result.channel, "TELEGRAM_DOCUMENT_CHANNEL");

  const blockedByDuplicate = await runDeliveryRealSmokeScenario({
    args: {
      ...args,
      forceRealSend: false,
    },
    n8nClient: createN8nClient(),
    dbClient: statefulDbClient,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(blockedByDuplicate.pass, false);
  assert(blockedByDuplicate.failures.some((item) => item.includes("ya tiene envío SENT")));

  console.log("QA Telegram Document Real Smoke Contract Tests");
  console.log(" - telegram_document_real_smoke_guard_and_execute: PASS");
  console.log(" - telegram_document_real_smoke_blocks_duplicate_without_force: PASS");
  console.log("\nPASS total: 2/2");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

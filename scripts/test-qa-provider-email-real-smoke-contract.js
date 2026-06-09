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
                  callback_query_id: "qa-callback-provider",
                  callback_message_id: "1219",
                  telegram_message: "confirmar",
                  should_send_telegram: false,
                  telegram_dispatch_payload_built: false,
                },
              }]],
            },
          }],
          "Log Send Result SQL": [{ data: { main: [[{ json: { ok: true } }]] } }],
        },
      },
    },
  };
}

function createDbClient() {
  const state = {
    draftId: "DRAFT-REAL-PROVIDER",
    sent: false,
  };
  const tokens = [
    { token: "PROVIDER_PREPARE", action: "DELIVERY_PREPARE_PROVIDER_EMAIL", used_at: null, draft_id: state.draftId, provider: "factura_com", environment: "SANDBOX" },
    { token: "PROVIDER_CONFIRM", action: "DELIVERY_CONFIRM_PROVIDER_EMAIL", used_at: null, draft_id: state.draftId, provider: "factura_com", environment: "SANDBOX" },
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
      { channel: "PROVIDER_EMAIL", delivery_status: state.sent ? "SENT" : "READY", delivery_action: state.sent ? "SENT" : "PREPARE", provider: "factura_com", environment: "SANDBOX" },
    ],
    getDocumentDeliverySummaryFromDraft: async () => ({
      draft_id: state.draftId,
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOADED",
      documents_valid: true,
      telegram_document_channel: { ready: true, last_status: "READY" },
      provider_email: {
        ready: true,
        email_confirmed: true,
        provider_email_sync_status: "SYNCED",
        last_status: state.sent ? "SENT" : "READY",
      },
    }),
    getActionTokensByDraft: async () => tokens,
    getActionToken: async (token) => {
      if (token === "PROVIDER_CONFIRM") state.sent = true;
      return tokens.find((item) => item.token === token) || null;
    },
  };
};

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
    listExecutions: async () => [{ id: "exec-qa-provider" }],
    getExecution: async () => makeExecutionForChannel(),
  };
}

async function main() {
  process.env.QA_ALLOW_REAL_SEND = "1";
  process.env.FACTURACOM_SANDBOX_MODE = "live";
  process.env.FACTURACOM_SANDBOX_LIVE = "1";

  const args = {
    draftId: "DRAFT-REAL-PROVIDER",
    sendReal: true,
    confirmRealSend: true,
    allowSandboxReal: true,
    maxRealSends: 1,
  };
  const dbClient = createDbClient();
  const result = await runDeliveryRealSmokeScenario({
    args,
    n8nClient: createN8nClient(),
    dbClient,
    channel: "PROVIDER_EMAIL",
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.scenario, "provider-email-real-smoke");
  assert.strictEqual(result.send_real_executed, true);
  assert.strictEqual(result.channel, "PROVIDER_EMAIL");

  const blockedByMissingChannelReady = await runDeliveryRealSmokeScenario({
    args,
    n8nClient: createN8nClient(),
    dbClient: createDbClientWithMissingReady(),
    channel: "PROVIDER_EMAIL",
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(blockedByMissingChannelReady.pass, false);
  assert(blockedByMissingChannelReady.failures.some((item) => item.includes("provider_email.ready debe ser true")));

  const blockedByMissingFlags = await runDeliveryRealSmokeScenario({
    args: { ...args, confirmRealSend: false },
    n8nClient: createN8nClient(),
    dbClient: createDbClient(),
    channel: "PROVIDER_EMAIL",
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(blockedByMissingFlags.pass, false);
  assert(blockedByMissingFlags.failures.some((item) => item.includes("falta --confirm-real-send")));

  console.log("QA Provider Email Real Smoke Contract Tests");
  console.log(" - provider_email_real_smoke_guard_and_execute: PASS");
  console.log(" - provider_email_real_smoke_requires_provider_ready: PASS");
  console.log(" - provider_email_real_smoke_requires_confirm_flag: PASS");
  console.log("\nPASS total: 3/3");
}

function createDbClientWithMissingReady() {
  const client = createDbClient();
  const original = client.getDocumentDeliverySummaryFromDraft;
  client.getDocumentDeliverySummaryFromDraft = async () => {
    const summary = await original();
    return { ...summary, provider_email: { ...summary.provider_email, ready: false } };
  };
  return client;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

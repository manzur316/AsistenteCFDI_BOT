const assert = require("assert");
const { runSandboxButtonSmokeSafeScenario } = require("./qa/satbot-e2e-harness");

function buildPlanExecution(confirmTokenTelegram, confirmTokenProvider) {
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
                  callback_query_id: "qa-callback-query",
                  callback_message_id: "1219",
                  telegram_dispatch_payload_built: true,
                  telegram_dispatch_method: "editMessageText",
                  telegram_message: "dispatch preview",
                  reply_markup: {
                    inline_keyboard: [[
                      { text: "Confirmar Telegram", callback_data: `cfdi:${confirmTokenTelegram}` },
                      { text: "Confirmar Email", callback_data: `cfdi:${confirmTokenProvider}` },
                    ]],
                  },
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
    draftId: "DRAFT-SAFE-001",
    draftStatus: "SANDBOX_TIMBRADO",
    artifactStatus: "DOWNLOADED",
    documentsValid: true,
    telegramToken: "TELEGRAM_PREPARE_TOKEN",
    providerToken: "EMAIL_PREPARE_TOKEN",
    telegramConfirmToken: "CONFIRM_TELEGRAM_TOKEN",
    providerConfirmToken: "CONFIRM_PROVIDER_TOKEN",
    used: new Set(),
  };

  const prepareTokens = () => [
    {
      token: state.telegramToken,
      action: "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
      used_at: null,
      draft_id: state.draftId,
      provider: "factura_com",
      environment: "SANDBOX",
    },
    {
      token: state.providerToken,
      action: "DELIVERY_PREPARE_PROVIDER_EMAIL",
      used_at: null,
      draft_id: state.draftId,
      provider: "factura_com",
      environment: "SANDBOX",
    },
    {
      token: state.telegramConfirmToken,
      action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
      used_at: null,
      draft_id: state.draftId,
      provider: "factura_com",
      environment: "SANDBOX",
    },
    {
      token: state.providerConfirmToken,
      action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
      used_at: null,
      draft_id: state.draftId,
      provider: "factura_com",
      environment: "SANDBOX",
    },
  ];

  return {
    getDraft: async () => ({
      draft_id: state.draftId,
      invoice_status: state.draftStatus,
      artifact_status: state.artifactStatus,
      documents_valid: state.documentsValid,
      production_blocked: null,
    }),
    getDeliveryLedger: async () => ({ draft_id: state.draftId, document_delivery_ledger: "[]", sandbox_pac_summary: {} }),
    getDeliveryLedgerRows: async () => [
      { channel: "TELEGRAM_DOCUMENT_CHANNEL", delivery_status: "READY", delivery_action: "PREPARE", provider: "factura_com", environment: "SANDBOX" },
      { channel: "PROVIDER_EMAIL", delivery_status: "READY", delivery_action: "PREPARE", provider: "factura_com", environment: "SANDBOX" },
    ],
    getDocumentDeliverySummaryFromDraft: async () => ({
      draft_id: state.draftId,
      invoice_status: state.draftStatus,
      artifact_status: state.artifactStatus,
      documents_valid: state.documentsValid,
      telegram_document_channel: { ready: true, last_status: "READY" },
      provider_email: { ready: true, email_confirmed: true, provider_email_sync_status: "SYNCED", last_status: "READY" },
    }),
    getActionTokensByDraft: async () => prepareTokens(),
    getActionToken: async (token) => prepareTokens().find((item) => item.token === token) || null,
  };
}

function createN8nClient() {
  const execution = buildPlanExecution("CONFIRM_TELEGRAM_TOKEN", "CONFIRM_PROVIDER_TOKEN");
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
    listExecutions: async () => [{ id: "exec-qa-001" }],
    getExecution: async () => execution,
  };
}

async function main() {
  const args = {
    scenario: "sandbox-button-smoke-safe",
    draftId: "DRAFT-SAFE-001",
    safe: true,
    maxRealSends: 1,
  };

  const result = await runSandboxButtonSmokeSafeScenario({
    args,
    n8nClient: createN8nClient(),
    dbClient: createDbClient(),
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.send_real_executed, false);
  assert.strictEqual(result.confirm_token_created, true);
  assert.strictEqual(result.reply_markup_references_confirm_token, true);
  assert.strictEqual(result.safe_mode, true);
  assert(result.channel === "MIXED");

  const badDbClient = createDbClient();
  badDbClient.getActionTokensByDraft = async () => [
    {
      token: "TELEGRAM_PREPARE_TOKEN",
      action: "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
      used_at: null,
    },
    {
      token: "EMAIL_PREPARE_TOKEN",
      action: "DELIVERY_PREPARE_PROVIDER_EMAIL",
      used_at: null,
    },
  ];

  const missingConfirm = await runSandboxButtonSmokeSafeScenario({
    args,
    n8nClient: createN8nClient(),
    dbClient: badDbClient,
    fetchImpl: async () => ({ status: 200, ok: true, text: async () => JSON.stringify({ ok: true }) }),
  });
  assert.strictEqual(missingConfirm.pass, false);
  assert(missingConfirm.failures.some((item) => item.includes("NO_PREPARE_TOKEN_AVAILABLE")));

  console.log("QA Sandbox Button Smoke Safe Tests");
  console.log(" - sandbox_button_smoke_safe_success: PASS");
  console.log(" - sandbox_button_smoke_safe_missing_confirm_tokens: PASS");
  console.log("\nPASS total: 2/2");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

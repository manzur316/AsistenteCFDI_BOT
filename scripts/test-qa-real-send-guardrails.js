const assert = require("assert");
const { buildRealSendGuardResult } = require("./qa/satbot-e2e-harness");

function buildBaseArgs() {
  return {
    sendReal: true,
    confirmRealSend: true,
    allowSandboxReal: true,
    maxRealSends: 1,
    draftId: "DRAFT-REAL-001",
  };
}

function buildBaseSummary(overrides = {}) {
  return {
    invoice_status: "SANDBOX_TIMBRADO",
    artifact_status: "DOWNLOADED",
    documents_valid: true,
    draft_status: "READY",
    provider: "factura_com",
    environment: "SANDBOX",
    production_blocked: null,
    telegram_document_channel: {
      ready: true,
      last_status: "READY",
    },
    provider_email: {
      ready: true,
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
      last_status: "READY",
    },
    ...overrides,
  };
}

const originalEnv = {
  QA_ALLOW_REAL_SEND: process.env.QA_ALLOW_REAL_SEND,
  FACTURACOM_SANDBOX_MODE: process.env.FACTURACOM_SANDBOX_MODE,
  FACTURACOM_SANDBOX_LIVE: process.env.FACTURACOM_SANDBOX_LIVE,
};

process.env.QA_ALLOW_REAL_SEND = "1";
process.env.FACTURACOM_SANDBOX_MODE = "live";
process.env.FACTURACOM_SANDBOX_LIVE = "1";

const invalidConfig = buildRealSendGuardResult({
  args: { ...buildBaseArgs(), sendReal: false },
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  summary: buildBaseSummary(),
});
assert.strictEqual(invalidConfig.pass, false);
assert(invalidConfig.failures.some((item) => item.includes("falta --send-real")));

process.env.QA_ALLOW_REAL_SEND = "";
const blockedByDefault = buildRealSendGuardResult({
  args: { ...buildBaseArgs(), sendReal: true, confirmRealSend: true, allowSandboxReal: true },
  channel: "PROVIDER_EMAIL",
  summary: buildBaseSummary(),
});
assert.strictEqual(blockedByDefault.pass, false);
assert(blockedByDefault.failures.some((item) => item.includes("falta QA_ALLOW_REAL_SEND=1")));

process.env.QA_ALLOW_REAL_SEND = "1";

const providerMismatch = buildRealSendGuardResult({
  args: buildBaseArgs(),
  channel: "PROVIDER_EMAIL",
  summary: buildBaseSummary({ provider: "another_provider" }),
});
assert.strictEqual(providerMismatch.pass, false);
assert(providerMismatch.failures.some((item) => item.includes("provider mismatch")));

process.env.FACTURACOM_SANDBOX_MODE = "sandbox";
const guardEnvMismatch = buildRealSendGuardResult({
  args: buildBaseArgs(),
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  summary: buildBaseSummary(),
});
assert.strictEqual(guardEnvMismatch.pass, false);
assert(guardEnvMismatch.failures.some((item) => item.includes("FACTURACOM_SANDBOX_MODE")));
process.env.FACTURACOM_SANDBOX_MODE = "live";

const providerChannelValidation = buildRealSendGuardResult({
  args: buildBaseArgs(),
  channel: "PROVIDER_EMAIL",
  summary: buildBaseSummary({ provider_email: { ready: false, email_confirmed: false, provider_email_sync_status: "PENDING" } }),
});
assert.strictEqual(providerChannelValidation.pass, false);
assert(providerChannelValidation.failures.some((item) => item.includes("provider_email.ready debe ser true")));
assert(providerChannelValidation.failures.some((item) => item.includes("provider_email.email_confirmed debe ser true")));

const maxSendsMismatch = buildRealSendGuardResult({
  args: { ...buildBaseArgs(), maxRealSends: 2 },
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  summary: buildBaseSummary(),
});
assert.strictEqual(maxSendsMismatch.pass, false);
assert(maxSendsMismatch.failures.some((item) => item.includes("--max-real-sends debe ser 1")));

const alreadySentBlocked = buildRealSendGuardResult({
  args: buildBaseArgs(),
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  summary: buildBaseSummary(),
  hasSent: true,
});
assert.strictEqual(alreadySentBlocked.pass, false);
assert(alreadySentBlocked.failures.some((item) => item.includes("ya existe delivery_status=SENT")));

const passGuard = buildRealSendGuardResult({
  args: buildBaseArgs(),
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  summary: buildBaseSummary(),
});
assert.strictEqual(passGuard.pass, true);

if (originalEnv.QA_ALLOW_REAL_SEND === undefined) delete process.env.QA_ALLOW_REAL_SEND;
else process.env.QA_ALLOW_REAL_SEND = originalEnv.QA_ALLOW_REAL_SEND;
if (originalEnv.FACTURACOM_SANDBOX_MODE === undefined) delete process.env.FACTURACOM_SANDBOX_MODE;
else process.env.FACTURACOM_SANDBOX_MODE = originalEnv.FACTURACOM_SANDBOX_MODE;
if (originalEnv.FACTURACOM_SANDBOX_LIVE === undefined) delete process.env.FACTURACOM_SANDBOX_LIVE;
else process.env.FACTURACOM_SANDBOX_LIVE = originalEnv.FACTURACOM_SANDBOX_LIVE;

console.log("QA Real Send Guardrails Tests");
console.log(" - send_real_requires_flag_and_env: PASS");
console.log(" - provider_email_guard_requires_ready_and_synced: PASS");
console.log(" - max_real_sends_guard: PASS");
console.log(" - duplicate_send_guard: PASS");
console.log(" - provider_channel_validation: PASS");
console.log(" - real_send_guard_accepts_valid_case: PASS");
console.log("\nPASS total: 6/6");

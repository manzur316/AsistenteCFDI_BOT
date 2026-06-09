const assert = require("assert");
const {
  buildWorkflowUpdatePayload,
  buildWorkflowDiffReport,
} = require("./qa/workflow-sync");

const repoWorkflow = {
  name: "cfdi_telegram_local_ingest",
  nodes: [
    {
      name: "Telegram fallback sendMessage",
      type: "n8n-nodes-base.function",
      parameters: {
        function: "fallbackSendMessage",
        from: "from",
        code: "Buffer.from('https://api.telegram.org', 'utf8');",
      },
    },
    {
      name: "Restore Telegram Dispatch Fallback Context",
      type: "n8n-nodes-base.function",
      parameters: {
        function: "function",
        fallback: true,
      },
    },
  ],
  connections: {
    main: [[]],
  },
  settings: {
    executionOrder: "from",
    legacyMode: false,
  },
  id: "REPO-WF-ID",
  versionId: "v123",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:01.000Z",
  pinData: {
    keep: "secret",
  },
  staticData: {
    provider_client_uid: "cli_ABCDEF123",
    ["N8N_API_KEY"]: "super-secret",
  },
  meta: {
    sensitive: "from true false",
  },
};

const payload = buildWorkflowUpdatePayload(repoWorkflow);
const payloadJson = JSON.stringify(payload);

assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "id"), false, "payload should not include id");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "versionId"), false, "payload should not include versionId");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "createdAt"), false, "payload should not include createdAt");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "updatedAt"), false, "payload should not include updatedAt");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "pinData"), false, "payload should not include pinData");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "staticData"), false, "payload should not include staticData");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "meta"), false, "payload should not include meta");
assert.deepStrictEqual(Object.prototype.hasOwnProperty.call(payload, "active"), false, "payload should not include active");

assert.strictEqual(payload.name, "cfdi_telegram_local_ingest");
assert.strictEqual(Array.isArray(payload.nodes), true);
assert.strictEqual(payload.nodes.length, 2);
assert.strictEqual(typeof payload.settings, "object");

assert.strictEqual(payloadJson.includes("[REDACTED"), false, "payload must not contain redacted markers");
assert.strictEqual(payloadJson.includes("Telegram fallback sendMessage"), true, "payload must preserve node names");
assert.strictEqual(payloadJson.includes("Restore Telegram Dispatch Fallback Context"), true, "payload must preserve context text");
assert.strictEqual(payloadJson.includes("fallbackSendMessage"), true, "payload must preserve fallbackSendMessage");
assert.strictEqual(payloadJson.includes("Buffer.from"), true, "payload must preserve Buffer.from");
assert.strictEqual(payloadJson.includes('"function"'), true, "payload must preserve function");
assert.strictEqual(payloadJson.includes('"from"'), true, "payload must preserve from");
assert.strictEqual(payloadJson.includes("false"), true, "payload must preserve false");
assert.strictEqual(payloadJson.includes("https://api.telegram.org"), true, "payload must preserve telegram endpoint");

const n8nWorkflow = {
  ...repoWorkflow,
  nodes: [
    {
      name: "function",
    },
  ],
};

const report = buildWorkflowDiffReport({
  repoWorkflow,
  n8nWorkflow,
  beforeUpdate: { sync: { repo_hash: "same", n8n_hash: "same", requires_import: false } },
  afterUpdate: { repo_hash: "same", n8n_hash: "same", requires_import: false },
  backup: {
    backup_timestamp: "2026-01-01T00:00:00.000Z",
    backup_type: "workflow_sync_before_update",
    provider_client_uid: "cli_ABCDEF123",
  },
});
const reportJson = JSON.stringify(report);
assert.strictEqual(reportJson.includes("cli_ABCDEF123"), false, "workflow diff report should not expose provider_client_uid");
assert.strictEqual(reportJson.includes("[REDACTED_"), true, "workflow diff report should remain sanitized when secrets are present");

console.log("QA Workflow Sync Payload Not Sanitized Tests");
console.log(" - workflow_update_payload_uses_raw_fields: PASS");
console.log(" - workflow_update_payload_rejects_managed_keys: PASS");
console.log(" - workflow_update_payload_preserves_normal_words_and_code: PASS");
console.log(" - workflow_diff_report_still_sanitized: PASS");
console.log("\nPASS total: 4/4");

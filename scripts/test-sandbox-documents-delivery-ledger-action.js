const assert = require("assert");

const {
  runSandboxDocumentDeliveryLedger,
} = require("./lib/sandbox-document-delivery-action");
const {
  listSandboxActions,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");

const rows = [
  {
    delivery_id: "DELIV-TEST-001",
    draft_id: "DRAFT-LEDGER-717",
    channel: "PROVIDER_EMAIL",
    delivery_status: "SENT",
    delivery_action: "SEND",
    recipient_present: true,
    recipient_redacted: "c***@example.com",
    documents_valid: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    pdf_source: "PROVIDER",
    xml_sha256: "a".repeat(64),
    pdf_sha256: "b".repeat(64),
    sent_at: "2026-06-08T10:00:00.000Z",
    created_at: "2026-06-08T10:00:00.000Z",
    updated_at: "2026-06-08T10:00:00.000Z",
  },
  {
    delivery_id: "DELIV-TEST-002",
    draft_id: "DRAFT-LEDGER-717",
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    delivery_status: "DRY_RUN",
    delivery_action: "SEND",
    recipient_present: true,
    recipient_redacted: "telegram:abcd1234",
    documents_valid: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    pdf_source: "PROVIDER",
    xml_sha256: "a".repeat(64),
    pdf_sha256: "b".repeat(64),
    sent_at: null,
    created_at: "2026-06-08T10:01:00.000Z",
    updated_at: "2026-06-08T10:01:00.000Z",
  },
];

const result = runSandboxDocumentDeliveryLedger({
  draftId: "DRAFT-LEDGER-717",
  execFileSync: () => `${JSON.stringify(rows)}\n`,
});

assert.strictEqual(result.status, "OK");
assert.strictEqual(result.output.draft_id, "DRAFT-LEDGER-717");
assert.strictEqual(result.output.ledger_rows.length, 2);
assert.strictEqual(result.output.ledger_summary.total, 2);
assert.strictEqual(result.output.ledger_summary.by_channel.PROVIDER_EMAIL, 1);
assert.strictEqual(result.output.ledger_summary.by_channel.TELEGRAM_DOCUMENT_CHANNEL, 1);
assert.strictEqual(result.output.ledger_summary.by_status.SENT, 1);
assert.strictEqual(result.output.ledger_summary.by_status.DRY_RUN, 1);

const serialized = JSON.stringify(result);
assert(!serialized.includes("bot123456:SECRET"));
assert(!serialized.includes("cliente@example.com"));
assert(!serialized.includes("C:\\"));
assert(!serialized.includes("<?xml"));
assert(!serialized.includes("%PDF"));

const missingDraft = runSandboxDocumentDeliveryLedger({});
assert.strictEqual(missingDraft.status, "NEEDS_RUNTIME");
assert(missingDraft.errors.includes("DRAFT_ID_REQUIRED"));

(async () => {
  assert(listSandboxActions().includes("sandbox.documents.delivery.ledger"));
  const actionResult = await runSandboxAction("sandbox.documents.delivery.ledger", {
    draftId: "DRAFT-LEDGER-717",
    execFileSync: () => `${JSON.stringify(rows)}\n`,
    writeAudit: false,
    writeResult: false,
  });
  assert.strictEqual(actionResult.status, "OK");
  assert.strictEqual(actionResult.output.ledger_summary.total, 2);

  console.log("Sandbox Documents Delivery Ledger Action Tests");
  console.log(" - ledger_action_returns_safe_summary: PASS (OK)");
  console.log(" - ledger_action_requires_draft_id: PASS (OK)");
  console.log(" - ledger_action_is_allowlisted_and_dispatches: PASS (OK)");
  console.log("\nPASS total: 3/3");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

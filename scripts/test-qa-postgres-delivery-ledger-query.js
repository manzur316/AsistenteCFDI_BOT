const assert = require("assert");
const path = require("path");

const runnerPath = path.resolve(__dirname, "lib/local-db-psql-runner.js");
const runner = require(runnerPath);
const originalRunPsqlJson = runner.runPsqlJson;

const queries = [];
const ledgerDraftId = "DRAFT-20260608-061257-173694503";
const draftedLedger = {
  draft_id: ledgerDraftId,
  sandbox_pac_summary: {
    draft_id: ledgerDraftId,
    invoice_status: "SANDBOX_TIMBRADO",
    artifact_status: "DOWNLOADED",
    documents_valid: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    sandbox_context: {
      invoice_status: "SANDBOX_TIMBRADO",
    },
  },
  document_delivery_ledger: [
    {
      delivery_id: "DLV-EMAIL-001",
      draft_id: ledgerDraftId,
      channel: "PROVIDER_EMAIL",
      delivery_status: "READY",
      delivery_action: "PREPARE",
      provider_email_sync_status: "SYNCED",
      email_confirmed: true,
      recipient_present: true,
      recipient_redacted: "cli+factura@redacted.com",
      documents_valid: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      delivery_id: "DLV-TG-001",
      draft_id: ledgerDraftId,
      channel: "TELEGRAM_DOCUMENT_CHANNEL",
      delivery_status: "SENT",
      delivery_action: "PREPARE",
      telegram_chat_id_present: true,
      recipient_present: true,
      recipient_redacted: "REDACTED",
      documents_valid: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      created_at: "2026-01-01T00:01:00.000Z",
      updated_at: "2026-01-01T00:01:00.000Z",
    },
  ],
};

runner.runPsqlJson = (sql, _options) => {
  queries.push(String(sql || ""));
  if (String(sql || "").includes("jsonb_build_object('draft_id', d.draft_id")) {
    return draftedLedger;
  }
  return {};
};

const { createPostgresQaClient } = require("./qa/postgres-qa-client");

async function runTests() {
  try {
    const client = createPostgresQaClient({ env: { CFDI_DB_EXEC_MODE: "docker", CFDI_DB_DRY_RUN: "1" } });

    const draftRecord = await client.getDeliveryLedger(ledgerDraftId);
    assert.strictEqual(queries.length >= 1, true);
    const getLedgerSql = queries.find((value) => value.includes("jsonb_build_object('draft_id', d.draft_id"));
    assert.strictEqual(typeof getLedgerSql, "string");
    assert.strictEqual(draftRecord.draft_id, ledgerDraftId);
    assert.strictEqual(draftRecord.sandbox_pac_summary.invoice_status, "SANDBOX_TIMBRADO");
    assert.strictEqual(Array.isArray(draftRecord.document_delivery_ledger), true);
    assert.strictEqual(draftRecord.document_delivery_ledger.length, 2);
    assert(!/COALESCE\(document_delivery_ledger/.test(getLedgerSql), "query must not read document_delivery_ledger as cfdi_drafts column");
    assert(/FROM cfdi_drafts d/.test(getLedgerSql), "query must read from cfdi_drafts");
    assert(/document_delivery_ledger/.test(getLedgerSql), "query must use document_delivery_ledger table");

    const summary = await client.getDocumentDeliverySummaryFromDraft(ledgerDraftId);
    assert.strictEqual(summary.draft_id, ledgerDraftId);
    assert.strictEqual(summary.invoice_status, "SANDBOX_TIMBRADO");
    assert.strictEqual(summary.artifact_status, "DOWNLOADED");
    assert.strictEqual(summary.documents_valid, true);
    assert.strictEqual(summary.provider_email?.ready, true);
    assert.strictEqual(summary.provider_email?.email_confirmed, true);
    assert.strictEqual(summary.provider_email?.provider_email_sync_status, "SYNCED");
    assert.strictEqual(summary.provider_email?.last_status, "READY");
    assert.strictEqual(summary.telegram_document_channel?.ready, true);
    assert.strictEqual(summary.telegram_document_channel?.last_status, "SENT");

    console.log("QA Postgres Delivery Ledger Query Tests");
    console.log(" - getDeliveryLedger_uses_document_delivery_ledger_table_subquery: PASS");
    console.log(" - getDeliveryLedger_does_not_reference_cfdi_drafts_column: PASS");
    console.log(" - getDocumentDeliverySummaryFromDraft_falls_back_to_ledger_rows: PASS");
    console.log("\nPASS total: 3/3");
  } finally {
    runner.runPsqlJson = originalRunPsqlJson;
  }
}

runTests().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

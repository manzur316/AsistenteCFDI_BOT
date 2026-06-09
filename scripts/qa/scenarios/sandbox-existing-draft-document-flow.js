function summarizeLedger(ledger) {
  const rows = ledger?.document_delivery_ledger || ledger?.delivery_ledger || [];
  if (!Array.isArray(rows) || !rows.length) return "empty";
  return rows.map((row) => `${row.channel || "channel"}:${row.delivery_status || row.status || "N/A"}`).join(", ");
}

async function runSandboxExistingDraftScenario(options = {}) {
  const draftId = String(options.draftId || "").trim();
  if (!draftId) throw new Error("NEEDS_INPUT: --draft-id requerido.");
  const db = options.dbClient;
  const draft = await Promise.resolve(db.getDraft(draftId));
  const ledger = await Promise.resolve(db.getDeliveryLedger(draftId));
  const artifactStatus = draft?.sandbox_pac_summary?.artifact_status || null;
  const documentsValid = draft?.sandbox_pac_summary?.documents_valid === true
    || (draft?.sandbox_pac_summary?.xml_content_valid === true && draft?.sandbox_pac_summary?.pdf_content_valid === true);
  const pass = Boolean(draft && artifactStatus && (artifactStatus !== "DOWNLOADED" || documentsValid));
  return {
    pass,
    scenario: "sandbox-existing-draft",
    draft_id: draftId,
    artifact_status: artifactStatus,
    documents_valid: documentsValid,
    failures: pass ? [] : ["Draft missing or artifact state inconsistent"],
    db_snapshot: {
      draft,
      ledger,
      summary: `artifact_status=${artifactStatus || "N/A"} documents_valid=${documentsValid}`,
      ledger_state: summarizeLedger(ledger),
    },
  };
}

module.exports = {
  runSandboxExistingDraftScenario,
};

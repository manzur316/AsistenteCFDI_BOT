const assert = require("assert");

const { buildPersistedSummary } = require("./lib/sandbox-draft-stamp-persistence");

const summary = buildPersistedSummary({
  invoiceStatus: "SANDBOX_TIMBRADO",
  paymentStatus: "PENDIENTE",
  artifactStatus: "DOWNLOADED",
  pacResult: {
    ok: true,
    status: "DOWNLOADED",
    operation: "downloadSandboxArtifacts",
  },
  sandboxPacSummary: {
    provider: "Factura.com Sandbox",
    mode: "live",
    uuid: "00000000-0000-4000-8000-000000000719",
    cfdi_uid: "CFDIUID719",
    pac_invoice_id: "PACINV719",
    serie: "F",
    folio: "32",
    uuid_present: true,
    cfdi_uid_present: true,
    pac_invoice_id_present: true,
    serie_present: true,
    folio_present: true,
    xml_downloaded: true,
    pdf_downloaded: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    artifact_status: "DOWNLOADED",
  },
});

assert.strictEqual(summary.artifact_status, "DOWNLOADED");
assert.strictEqual(summary.uuid_present, true);
assert.strictEqual(summary.cfdi_uid_present, true);
assert.strictEqual(summary.pac_invoice_id_present, true);
assert.strictEqual(summary.serie_present, true);
assert.strictEqual(summary.folio_present, true);
assert.strictEqual(summary.uuid, "00000000-0000-4000-8000-000000000719");
assert.strictEqual(summary.cfdi_uid, "CFDIUID719");
assert.strictEqual(summary.pac_invoice_id, "PACINV719");
assert.strictEqual(summary.serie, "F");
assert.strictEqual(summary.folio, "32");

console.log("Sandbox Download Persistence Preserves PAC Identity Tests");
console.log(" - preserves_pac_identity_after_download: PASS (identity present)");
console.log("\nPASS total: 1/1");

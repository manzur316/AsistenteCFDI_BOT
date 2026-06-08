const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDocumentDeliveryPrepare,
} = require("./lib/sandbox-document-delivery-action");
const { runSandboxAction } = require("./lib/sandbox-action-runner");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-delivery-prepare-action");
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000717\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

function writeFiles() {
  const dir = path.join(tempRoot, "exports");
  fs.mkdirSync(dir, { recursive: true });
  const xml = path.join(dir, "Real-Bilbao_2026-06-08_F-26_SANDBOX.xml");
  const pdf = path.join(dir, "Real-Bilbao_2026-06-08_F-26_SANDBOX.pdf");
  fs.writeFileSync(xml, VALID_XML);
  fs.writeFileSync(pdf, VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

function draft(overrides = {}) {
  const files = writeFiles();
  return {
    draft_id: "DRAFT-DELIVERY-PREPARE-717",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    total: 928,
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email: "cliente@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
      ...overrides.client,
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: files.xml,
      human_pdf_path: files.pdf,
      pdf_source: "PROVIDER",
      provider_pdf_content_valid: true,
      ...overrides.summary,
    },
  };
}

function execFileSync(_command, args) {
  const sql = args.join(" ");
  if (sql.includes("delivery_status = 'SENT'")) return "\n";
  return JSON.stringify({
    delivery_id: "DELIV-PREPARE",
    delivery_status: "READY",
    channel: "PROVIDER_EMAIL",
    recipient_redacted: "c***@example.com",
  }) + "\n";
}

const ready = runSandboxDocumentDeliveryPrepare({
  draft: draft(),
  channel: "PROVIDER_EMAIL",
  execFileSync,
});
assert.strictEqual(ready.status, "READY");
assert.strictEqual(ready.output.confirmation_required, true);
assert.strictEqual(ready.output.confirmation_summary.channel, "PROVIDER_EMAIL");
assert.strictEqual(ready.output.confirmation_summary.recipient_redacted, "c***@example.com");
assert(!JSON.stringify(ready).includes("cliente@example.com"));

const noEmail = runSandboxDocumentDeliveryPrepare({
  draft: draft({ client: { email: null, email_confirmed: false } }),
  channel: "PROVIDER_EMAIL",
  execFileSync,
});
assert.strictEqual(noEmail.status, "NEEDS_RECIPIENT");
assert.strictEqual(noEmail.output.confirmation_required, false);

const duplicate = runSandboxDocumentDeliveryPrepare({
  draft: draft(),
  channel: "PROVIDER_EMAIL",
  execFileSync: () => JSON.stringify({
    delivery_id: "DELIV-SENT",
    delivery_status: "SENT",
    sent_at: "2026-06-08T12:00:00.000Z",
    recipient_redacted: "c***@example.com",
  }) + "\n",
});
assert.strictEqual(duplicate.status, "BLOCKED_DUPLICATE");
assert.strictEqual(duplicate.output.duplicate_sent, true);

(async () => {
  const envelope = await runSandboxAction("sandbox.documents.delivery.prepare", {
    draft: draft(),
    channel: "PROVIDER_EMAIL",
    execFileSync,
    writeAudit: false,
    writeResult: false,
  });
  assert.strictEqual(envelope.status, "READY");
  assert.strictEqual(envelope.ok, true);

  console.log("Sandbox Documents Delivery Prepare Action Tests");
  console.log(" - prepare_provider_email_ready: PASS (READY)");
  console.log(" - prepare_missing_email_needs_recipient: PASS (NEEDS_RECIPIENT)");
  console.log(" - prepare_duplicate_blocks: PASS (BLOCKED_DUPLICATE)");
  console.log(" - action_runner_ready_status_is_ok: PASS (READY)");
  console.log("\nPASS total: 4/4");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

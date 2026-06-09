const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxAction } = require("./lib/sandbox-action-runner");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-recover-artifact-state-from-runtime");
const actionResultsRoot = path.join(tempRoot, "action-results");
const exportsDir = path.join(tempRoot, "exports");
fs.mkdirSync(actionResultsRoot, { recursive: true });
fs.mkdirSync(exportsDir, { recursive: true });

const xmlPath = path.join(exportsDir, "cfdi.xml");
const pdfPath = path.join(exportsDir, "cfdi.pdf");
fs.writeFileSync(xmlPath, "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000722\" /></cfdi:Complemento></cfdi:Comprobante>");
fs.writeFileSync(pdfPath, Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]));

fs.writeFileSync(path.join(actionResultsRoot, "2026-06-09T02-02-55-000Z-sandbox.draft.download-artifacts.json"), `${JSON.stringify({
  action: "sandbox.draft.download-artifacts",
  status: "OK",
  ok: true,
  output: {
    draft_id: "DRAFT-RECOVER-ARTIFACT-722",
    artifact_status: "DOWNLOADED",
    xml_content_valid: true,
    pdf_content_valid: true,
    xml_downloaded: true,
    pdf_downloaded: true,
    pdf_source: "PROVIDER",
    human_xml_path: path.relative(root, xmlPath).replace(/\\/g, "/"),
    human_pdf_path: path.relative(root, pdfPath).replace(/\\/g, "/"),
  },
}, null, 2)}\n`);

let capturedSql = "";
(async () => {
  const result = await runSandboxAction("sandbox.draft.recover-artifact-state", {
    draftId: "DRAFT-RECOVER-ARTIFACT-722",
    actionResultsRoot,
    actionAuditRoot: path.join(tempRoot, "audit"),
    draft: {
      draft_id: "DRAFT-RECOVER-ARTIFACT-722",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      sandbox_pac_summary: {
        artifact_status: "NOT_REQUESTED",
        uuid: "00000000-0000-4000-8000-000000000722",
        cfdi_uid: "CFDIUID722",
        pac_invoice_id: "PACINV722",
        serie: "F",
        folio: "33",
        provider_client_uid_source: "provider_client_links",
        provider_client_uid: "UID-PROVIDER-722",
        provider_client_link_status: "FOUND",
      },
    },
    execFileSync: (_command, args) => {
      capturedSql = args[args.length - 1];
      return `${JSON.stringify({
        draft_id: "DRAFT-RECOVER-ARTIFACT-722",
        invoice_status: "SANDBOX_TIMBRADO",
        payment_status: "PENDIENTE",
        sandbox_pac_summary: { artifact_status: "DOWNLOADED" },
      })}\n`;
    },
  });

  assert.strictEqual(result.action, "sandbox.draft.recover-artifact-state");
  assert.strictEqual(result.status, "RECOVERED");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.output.artifact_status, "DOWNLOADED");
  assert(capturedSql.includes('"artifact_status":"DOWNLOADED"'), "recovery did not persist DOWNLOADED");
  assert(capturedSql.includes('"provider_client_uid_source":"provider_client_links"'), "recovery did not preserve provider link source");
  assert(capturedSql.includes('"uuid":"00000000-0000-4000-8000-000000000722"'), "recovery did not preserve uuid");

  console.log("Sandbox Recover Artifact State From Runtime Tests");
  console.log(" - recover_artifact_state_from_runtime: PASS (RECOVERED)");
  console.log("\nPASS total: 1/1");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDocumentDeliverySend } = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-provider-email-blocks-invalid-pdf");

function validXml() {
  return "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
}

function blankPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 1 >>\nstream\n \nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

async function main() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
  const xml = path.join(tempRoot, "cfdi.xml");
  const pdf = path.join(tempRoot, "cfdi.pdf");
  fs.writeFileSync(xml, validXml());
  fs.writeFileSync(pdf, blankPdf());
  const result = await runSandboxDocumentDeliverySend({
    draft: {
      draft_id: "DRAFT-PROVIDER-BLOCK-PDF",
      client_id: "CLI-REAL-BILBAO",
      invoice_status: "SANDBOX_TIMBRADO",
      current_client: {
        email: "cliente.real@example.com",
        email_confirmed: true,
        provider_email_sync_status: "SYNCED",
      },
      sandbox_pac_summary: {
        artifact_status: "DOWNLOADED",
        human_xml_path: path.relative(root, xml).replace(/\\/g, "/"),
        human_pdf_path: path.relative(root, pdf).replace(/\\/g, "/"),
        cfdi_uid: "CFDIUID716",
      },
    },
    channel: "PROVIDER_EMAIL",
    dryRun: true,
  });
  console.log("Provider Email Delivery Blocks Invalid PDF Tests");
  try {
    assert.strictEqual(result.status, "BLOCKED_INVALID_DOCUMENTS");
    assert.strictEqual(result.output.pdf_content_valid, false);
    assert.strictEqual(result.output.pdf_validation_status, "PDF_VISUAL_CONTENT_MISSING");
    console.log(" - provider_email_blocks_invalid_pdf: PASS");
    console.log("\nPASS total: 1/1");
  } catch (error) {
    console.log(` - provider_email_blocks_invalid_pdf: FAIL (${error.message})`);
    console.log("\nPASS total: 0/1");
    process.exit(1);
  }
}

main();

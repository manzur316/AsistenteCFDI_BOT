const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-content-validation");

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function env() {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
  };
}

function draft(id = "DRAFT-CONTENT-VALIDATION") {
  return {
    draft_id: id,
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    total: 1160,
    current_client: { client_id: "CLIENT-DEMO", display_name: "Cliente Demo" },
    sandbox_pac_summary: {
      cfdi_uid: "CFDIUID716",
      uuid: "00000000-0000-4000-8000-000000000716",
      pac_invoice_id: "CFDIUID716",
      artifact_status: "DOWNLOAD_READY",
      xml_provider_available: true,
      pdf_provider_available: true,
    },
  };
}

function validXml() {
  return "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
}

function validPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

async function runWith(xmlBody, pdfBody, id) {
  cleanTemp();
  return runSandboxDraftDownloadArtifacts({
    draft: draft(id),
    env: env(),
    storageRoot: tempRoot,
    adapterContext: {
      requestFn: async (request) => {
        if (request.path.endsWith("/xml")) return { ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: xmlBody };
        return { ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: Buffer.isBuffer(pdfBody) ? pdfBody : Buffer.from(pdfBody) };
      },
    },
  });
}

const checks = [];
function check(name, fn) {
  checks.push(Promise.resolve().then(fn).then((value) => ({ name, pass: true, value: value || "" })).catch((error) => ({ name, pass: false, value: error.message })));
}

check("placeholder_xml_pdf_no_actualiza_storage_cliente", async () => {
  const result = await runWith("CFDI XML", "CFDI PDF", "DRAFT-PLACEHOLDER-CONTENT");
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.output.artifact_status, "DOWNLOAD_ERROR");
  assert.strictEqual(result.output.xml_downloaded, false);
  assert.strictEqual(result.output.pdf_downloaded, false);
  assert.strictEqual(result.output.xml_content_valid, false);
  assert.strictEqual(result.output.pdf_content_valid, false);
  assert.strictEqual(result.output.storage_updated, false);
  assert.strictEqual(result.output.client_storage_manifest_path, null);
  assert.ok(result.errors.includes("FACTURACOM_SANDBOX_XML_CONTENT_INVALID"));
  assert.ok(result.errors.includes("FACTURACOM_SANDBOX_PDF_CONTENT_INVALID"));
  return result.output.artifact_status;
});

check("xml_valido_pdf_invalido_es_parcial", async () => {
  const result = await runWith(validXml(), "CFDI PDF", "DRAFT-PARTIAL-CONTENT");
  assert.strictEqual(result.status, "PARTIAL_DOWNLOAD");
  assert.strictEqual(result.output.artifact_status, "PARTIAL_DOWNLOAD");
  assert.strictEqual(result.output.xml_downloaded, true);
  assert.strictEqual(result.output.pdf_downloaded, false);
  assert.strictEqual(result.output.xml_content_valid, true);
  assert.strictEqual(result.output.pdf_content_valid, false);
  return result.status;
});

check("xml_pdf_validos_actualizan_storage", async () => {
  const result = await runWith(validXml(), validPdf(), "DRAFT-VALID-CONTENT");
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.artifact_status, "DOWNLOADED");
  assert.strictEqual(result.output.xml_content_valid, true);
  assert.strictEqual(result.output.pdf_content_valid, true);
  assert.strictEqual(result.output.pdf_visual_content_present, true);
  assert.ok(result.output.xml_sha256);
  assert.ok(result.output.pdf_sha256);
  assert.ok(result.output.client_storage_manifest_path);
  return result.output.artifact_status;
});

Promise.all(checks).then((results) => {
  for (const item of results) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

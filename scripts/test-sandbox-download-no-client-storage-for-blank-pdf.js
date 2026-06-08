const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-no-blank-pdf");
const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function validXml() {
  return "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
}

function blankPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 1 >>\nstream\n \nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, " "),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

function draft() {
  return {
    draft_id: "DRAFT-BLANK-PDF-716",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLI-REAL-BILBAO",
    total: 1160,
    current_client: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao" },
    sandbox_pac_summary: {
      cfdi_uid: "CFDIUIDBLANK716",
      uuid: "00000000-0000-4000-8000-000000000716",
      serie: "F",
      folio: "24",
      artifact_status: "DOWNLOAD_READY",
    },
  };
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

check("blank_provider_pdf_is_not_copied_and_local_pdf_is_generated", async () => {
  cleanTemp();
  const result = await runSandboxDraftDownloadArtifacts({
    draft: draft(),
    env: env(),
    storageRoot: tempRoot,
    now: new Date("2026-06-08T12:00:00.000Z"),
    adapterContext: {
      requestFn: async (request) => request.path.endsWith("/xml")
        ? { ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: validXml() }
        : { ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: blankPdf() },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.xml_downloaded, true);
  assert.strictEqual(result.output.provider_pdf_content_valid, false);
  assert.strictEqual(result.output.provider_pdf_validation_status, "PDF_VISUAL_CONTENT_MISSING");
  assert.strictEqual(result.output.pdf_downloaded, true);
  assert.strictEqual(result.output.pdf_content_valid, true);
  assert.strictEqual(result.output.pdf_source, "LOCAL_RENDERED_FROM_XML");
  assert.strictEqual(result.output.pdf_visual_content_present, true);
  assert(result.output.human_xml_path, "valid XML should get human alias");
  assert(result.output.human_pdf_path.endsWith("_LOCAL.pdf"));
  const pdfFiles = fs.readdirSync(tempRoot, { recursive: true }).filter((item) => String(item).endsWith("pdf/cfdi.pdf"));
  assert.strictEqual(pdfFiles.length, 0, "blank provider PDF copied into client storage");
  return result.output.artifact_status;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Download No Client Storage For Blank PDF Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

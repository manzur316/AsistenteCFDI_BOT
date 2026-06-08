const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-human-file-names");
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

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

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

check("human_file_aliases_are_safe_and_inside_runtime", async () => {
  cleanTemp();
  const result = await runSandboxDraftDownloadArtifacts({
    draft: {
      draft_id: "DRAFT-HUMAN-FILES-716",
      status: "APROBADO",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLI-REAL-BILBAO",
      total: 1160,
      current_client: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", rfc: "XAXX010101000" },
      sandbox_pac_summary: {
        cfdi_uid: "CFDIUIDHUMAN716",
        uuid: "00000000-0000-4000-8000-000000000716",
        serie: "F",
        folio: "24",
      },
    },
    env: env(),
    storageRoot: tempRoot,
    now: new Date("2026-06-08T12:00:00.000Z"),
    adapterContext: {
      requestFn: async (request) => request.path.endsWith("/xml")
        ? { ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: VALID_XML }
        : { ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: VALID_PDF },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.human_file_base_name, "Real-Bilbao_2026-06-08_F-24_SANDBOX");
  assert(result.output.human_xml_path.endsWith("Real-Bilbao_2026-06-08_F-24_SANDBOX.xml"));
  assert(result.output.human_pdf_path.endsWith("Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf"));
  assert(fs.existsSync(path.join(root, result.output.human_xml_path)));
  assert(fs.existsSync(path.join(root, result.output.human_pdf_path)));
  const raw = JSON.stringify(result.output);
  assert(!/XAXX010101000|00000000-0000-4000-8000-000000000716|CFDIUIDHUMAN716/.test(raw), "RFC/UUID/UID leaked in human filenames");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path leaked");
  return result.output.human_file_base_name;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Download Human File Names Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

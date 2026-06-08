const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-storage-layout");
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

function draft() {
  return {
    draft_id: "DRAFT-STORAGE-LAYOUT-716",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-LAYOUT",
    total: 1160,
    current_client: { client_id: "CLIENT-LAYOUT", display_name: "Cliente Layout" },
    sandbox_pac_summary: {
      cfdi_uid: "CFDIUIDLAYOUT716",
      uuid: "00000000-0000-4000-8000-000000000716",
      pac_invoice_id: "CFDIUIDLAYOUT716",
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

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" SubTotal="1000.00" Total="1160.00">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-4000-8000-000000000716" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

function requestFn(request) {
  if (request.path.endsWith("/xml")) {
    return Promise.resolve({ ok: true, status: 200, statusText: "OK", rawText: VALID_XML, data: VALID_XML });
  }
  return Promise.resolve({ ok: true, status: 200, statusText: "OK", rawBuffer: VALID_PDF });
}

check("client_invoice_storage_layout_is_created", async () => {
  cleanTemp();
  const now = new Date("2026-06-07T12:00:00.000Z");
  const result = await runSandboxDraftDownloadArtifacts({
    draft: draft(),
    env: env(),
    storageRoot: tempRoot,
    now,
    adapterContext: { requestFn },
  });
  assert.strictEqual(result.status, "OK");
  assert(result.output.client_storage_manifest_path, "client storage manifest missing");
  const manifestPath = path.join(root, result.output.client_storage_manifest_path);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert(manifestPath.includes(path.join("emitters", "EMITTER-DEMO", "2026", "06", "clients", "CLIENT-LAYOUT", "invoices")));
  assert.strictEqual(manifest.xml_downloaded, true);
  assert.strictEqual(manifest.pdf_downloaded, true);
  assert.strictEqual(manifest.xml_content_valid, true);
  assert.strictEqual(manifest.pdf_content_valid, true);
  assert.strictEqual(manifest.artifact_status, "DOWNLOADED");
  assert(fs.existsSync(path.join(path.dirname(manifestPath), "xml", "cfdi.xml")));
  assert(fs.existsSync(path.join(path.dirname(manifestPath), "pdf", "cfdi.pdf")));
  const raw = fs.readFileSync(manifestPath, "utf8");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path in manifest");
  assert(!/<cfdi:Comprobante|%PDF/i.test(raw), "document content in manifest");
  return result.output.client_storage_manifest_path;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Download Storage Client Layout Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

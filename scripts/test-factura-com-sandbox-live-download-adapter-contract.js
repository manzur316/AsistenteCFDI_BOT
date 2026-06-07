const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-live-download-adapter");
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

function env(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    ...overrides,
  };
}

function assertSafeJson(value) {
  const raw = JSON.stringify(value);
  assert(!/<\?xml|<cfdi:Comprobante|%PDF/i.test(raw), "document content leaked in JSON");
  assert(!/SANDBOXKEYLOCAL123|SANDBOXSECRETLOCAL123|SANDBOXPLUGINLOCAL123/i.test(raw), "credential leaked");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path leaked");
}

check("download_xml_live_writes_file_and_metadata", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  let calledPath = "";
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUID716" }, {
    env: env(),
    storageDir: path.join(tempRoot, "xml"),
    requestFn: async (request) => {
      calledPath = request.path;
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/xml",
        rawText: "<?xml version=\"1.0\"?><cfdi:Comprobante Total=\"1160\"/>",
        data: "<?xml version=\"1.0\"?><cfdi:Comprobante Total=\"1160\"/>",
      };
    },
  });
  assert.strictEqual(calledPath, "/v4/cfdi40/CFDIUID716/xml");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.artifact_status, "DOWNLOADED");
  assert.strictEqual(result.xml_provider_available, true);
  assert.strictEqual(result.xml_downloaded, true);
  assert(result.xml_sha256 && result.xml_sha256.length === 64);
  assert(result.xml_size_bytes > 0);
  assert(result.xml_storage_path.endsWith("cfdi.xml"));
  assert(fs.existsSync(path.join(root, result.xml_storage_path)));
  assertSafeJson(result);
  return result.artifact_status;
});

check("download_pdf_live_writes_file_and_metadata", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.downloadPdf({ pac_invoice_id: "CFDIUIDPDF716" }, {
    env: env(),
    storageDir: path.join(tempRoot, "pdf"),
    requestFn: async (request) => {
      assert.strictEqual(request.path, "/v4/cfdi40/CFDIUIDPDF716/pdf");
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/pdf",
        rawBuffer: Buffer.from("%PDF-1.4 sandbox pdf", "utf8"),
      };
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pdf_downloaded, true);
  assert(result.pdf_sha256 && result.pdf_sha256.length === 64);
  assert(result.pdf_size_bytes > 0);
  assert(fs.existsSync(path.join(root, result.pdf_storage_path)));
  assertSafeJson(result);
  return result.pdf_size_bytes;
});

check("download_provider_error_is_normalized_without_document", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUIDERR716" }, {
    env: env(),
    storageDir: path.join(tempRoot, "xml-error"),
    requestFn: async () => ({
      ok: false,
      status: 500,
      statusText: "Sandbox error",
      contentType: "application/json",
      data: { response: "error", message: "fallo sandbox" },
      rawText: JSON.stringify({ response: "error", message: "fallo sandbox" }),
    }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PAC_SANDBOX_ERROR");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_XML_DOWNLOAD_FAILED");
  assertSafeJson(result);
  return result.normalized_errors[0].code;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Live Download Adapter Contract Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

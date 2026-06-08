const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-placeholder-downloads");

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

const checks = [];
function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

check("xml_placeholder_no_se_marca_descargado", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUID716", environment: "SANDBOX" }, {
    env: env(),
    storageDir: path.join(tempRoot, "xml"),
    requestFn: async () => ({ ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: "CFDI XML" }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_XML_CONTENT_INVALID");
  assert.strictEqual(result.raw.validation.status, "INVALID_PLACEHOLDER");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, "xml", "cfdi.xml")), false);
  assert.strictEqual(fs.existsSync(path.join(tempRoot, "xml", "xml-content-validation.json")), true);
  return result.normalized_errors[0].code;
});

check("pdf_placeholder_no_se_marca_descargado", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.downloadPdf({ cfdi_uid: "CFDIUID716", environment: "SANDBOX" }, {
    env: env(),
    storageDir: path.join(tempRoot, "pdf"),
    requestFn: async () => ({ ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: Buffer.from("CFDI PDF") }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID");
  assert.strictEqual(result.raw.validation.status, "INVALID_PLACEHOLDER");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, "pdf", "cfdi.pdf")), false);
  assert.strictEqual(fs.existsSync(path.join(tempRoot, "pdf", "pdf-content-validation.json")), true);
  return result.normalized_errors[0].code;
});

Promise.all(checks).then((results) => {
  for (const item of results) {
    console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  }
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

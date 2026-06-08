const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-blank-pdf");
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

function blankPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 1 >>\nstream\n \nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, " "),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

check("facturacom_adapter_rejects_blank_pdf_before_final_file", async () => {
  cleanTemp();
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.downloadPdf({ cfdi_uid: "CFDIUID716" }, {
    env: env(),
    storageDir: path.join(tempRoot, "pdf"),
    requestFn: async () => ({ ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: blankPdf() }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PAC_SANDBOX_ERROR");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID");
  assert.strictEqual(result.raw.validation.status, "PDF_VISUAL_CONTENT_MISSING");
  assert.strictEqual(result.raw.validation.pdf_visual_content_present, false);
  assert(!fs.existsSync(path.join(tempRoot, "pdf", "cfdi.pdf")), "blank PDF must not be written as final artifact");
  assert(fs.existsSync(path.join(tempRoot, "pdf", "pdf-content-validation.json")), "diagnostic should be written");
  return result.raw.validation.status;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Download Rejects Blank PDF Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

const assert = require("assert");
const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
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

function validPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

check("pdf_not_ready_retries_and_then_downloads", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  let count = 0;
  const result = await adapter.downloadPdf({ cfdi_uid: "CFDIUID716" }, {
    env: env(),
    pdfRetryCount: 2,
    pdfRetryDelayMs: 0,
    requestFn: async () => {
      count += 1;
      if (count === 1) return { ok: false, status: 202, statusText: "PDF not ready", data: { message: "pdf processing" } };
      return { ok: true, status: 200, contentType: "application/pdf", rawBuffer: validPdf() };
    },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(count, 2);
  assert.strictEqual(result.pdf_validation_status, "VALID");
  return result.normalized_warnings.join("|");
});

check("pdf_not_ready_returns_retryable_after_bounded_retries", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  let count = 0;
  const result = await adapter.downloadPdf({ cfdi_uid: "CFDIUID716" }, {
    env: env(),
    pdfRetryCount: 2,
    pdfRetryDelayMs: 0,
    requestFn: async () => {
      count += 1;
      return { ok: false, status: 202, statusText: "PDF not ready", data: { message: "pdf processing" } };
    },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PDF_NOT_READY_RETRYABLE");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_PDF_NOT_READY_RETRYABLE");
  assert.strictEqual(result.raw.pdf_retryable, true);
  assert.strictEqual(count, 3);
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com PDF Download Retry Not Ready Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

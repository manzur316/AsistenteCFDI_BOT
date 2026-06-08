const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  sendSandboxInvoiceDocumentsToTelegram,
} = require("./lib/telegram-document-delivery-channel");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-telegram-document-delivery-human-filenames");
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

function writeFixtures() {
  cleanTemp();
  const exportDir = path.join(tempRoot, "exports");
  fs.mkdirSync(exportDir, { recursive: true });
  const xml = path.join(exportDir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.xml");
  const pdf = path.join(exportDir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf");
  fs.writeFileSync(xml, VALID_XML);
  fs.writeFileSync(pdf, VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

check("telegram_delivery_dry_run_uses_human_filenames", async () => {
  const files = writeFixtures();
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files,
    dryRun: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
  });
  assert.strictEqual(result.status, "DRY_RUN");
  assert.strictEqual(result.files_valid, true);
  assert(result.files.some((item) => item.path.endsWith("Real-Bilbao_2026-06-08_F-24_SANDBOX.xml")));
  assert(result.files.some((item) => item.path.endsWith("Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf")));
  const raw = JSON.stringify(result);
  assert(!/TELEGRAM_BOT_TOKEN|TEST_TOKEN_NOT_REAL|123456789/.test(raw), "token or full chat id leaked");
  assert(!/<\?xml|%PDF|00000000-0000-4000-8000-000000000716/.test(raw), "document content or UUID leaked");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path leaked");
  return result.files.length;
});

Promise.all(checks).then((results) => {
  console.log("Telegram Document Delivery Human Filenames Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

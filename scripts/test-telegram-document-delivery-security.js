const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  sendSandboxInvoiceDocumentsToTelegram,
  validateDeliveryFiles,
} = require("./lib/telegram-document-delivery-channel");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-telegram-document-delivery-security");
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

check("delivery_rejects_placeholder_documents", async () => {
  cleanTemp();
  const xml = path.join(tempRoot, "cfdi.xml");
  const pdf = path.join(tempRoot, "cfdi.pdf");
  fs.writeFileSync(xml, "CFDI XML", "utf8");
  fs.writeFileSync(pdf, "CFDI PDF", "utf8");
  const files = {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
  const validation = validateDeliveryFiles(files);
  assert.strictEqual(validation.ok, false);
  assert.strictEqual(validation.xml.status, "INVALID_PLACEHOLDER");
  assert.strictEqual(validation.pdf.status, "INVALID_PLACEHOLDER");
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files,
    dryRun: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "6573879494",
      TELEGRAM_BOT_TOKEN: "123456:ABCDEF",
    },
  });
  assert.strictEqual(result.status, "BLOCKED");
  assert.strictEqual(result.files_valid, false);
  assert(result.errors.includes("DOCUMENT_ARTIFACT_CONTENT_INVALID"));
  const raw = JSON.stringify(result);
  assert(!raw.includes("123456:ABCDEF"), "token leaked");
  assert(!raw.includes("6573879494"), "chat id leaked");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF/i.test(raw), "document content leaked");
  return result.status;
});

check("delivery_rejects_files_outside_runtime", () => {
  const validation = validateDeliveryFiles({
    xml: "README.md",
    pdf: "README.md",
  });
  assert.strictEqual(validation.ok, false);
  assert.strictEqual(validation.xml.status, "XML_FILE_MISSING");
  assert.strictEqual(validation.pdf.status, "PDF_FILE_MISSING");
  assert.strictEqual(validation.xml_path, null);
  assert.strictEqual(validation.pdf_path, null);
  return "blocked";
});

Promise.all(checks).then((results) => {
  console.log("Telegram Document Delivery Security Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

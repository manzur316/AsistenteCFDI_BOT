const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { sendSandboxInvoiceDocumentsToTelegram } = require("./lib/telegram-document-delivery-channel");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-telegram-document-delivery-dry-run");
const checks = [];

const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0">
  <cfdi:Complemento>
    <tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-4000-8000-000000000716" />
  </cfdi:Complemento>
</cfdi:Comprobante>`;

const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

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

function writeFiles() {
  cleanTemp();
  const xml = path.join(tempRoot, "cfdi.xml");
  const pdf = path.join(tempRoot, "cfdi.pdf");
  fs.writeFileSync(xml, VALID_XML, "utf8");
  fs.writeFileSync(pdf, VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

check("dry_run_validates_files_without_sending", async () => {
  const files = writeFiles();
  let called = false;
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files,
    dryRun: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "6573879494",
      TELEGRAM_BOT_TOKEN: "123456:ABCDEF",
    },
    requestFn: async () => {
      called = true;
      return { ok: true };
    },
  });
  assert.strictEqual(called, false, "dry-run should not call Telegram");
  assert.strictEqual(result.status, "DRY_RUN");
  assert.strictEqual(result.files_valid, true);
  assert.strictEqual(result.delivery_ready, true);
  assert.strictEqual(result.dry_run, true);
  const raw = JSON.stringify(result);
  assert(!raw.includes("123456:ABCDEF"), "token leaked");
  assert(!raw.includes("6573879494"), "chat id leaked");
  assert(!/[A-Za-z]:[\\/]/.test(raw), "absolute path leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF/i.test(raw), "document content leaked");
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Telegram Document Delivery Send Dry Run Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

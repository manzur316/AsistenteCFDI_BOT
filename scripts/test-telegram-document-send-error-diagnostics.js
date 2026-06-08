const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  sendSandboxInvoiceDocumentsToTelegram,
} = require("./lib/telegram-document-delivery-channel");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-telegram-document-send-error-diagnostics");
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const xml = path.join(tempRoot, "cfdi.xml");
const pdf = path.join(tempRoot, "cfdi.pdf");
fs.writeFileSync(xml, "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000717\" /></cfdi:Complemento></cfdi:Comprobante>");
fs.writeFileSync(pdf, Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]));

(async () => {
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files: {
      xml: path.relative(root, xml).replace(/\\/g, "/"),
      pdf: path.relative(root, pdf).replace(/\\/g, "/"),
    },
    dryRun: false,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "123456:SECRET_TOKEN_SHOULD_NOT_LEAK",
    },
    requestFn: () => ({
      ok: false,
      status: 400,
      data: {
        ok: false,
        error_code: 400,
        description: "Bad Request: chat not found 123456789",
      },
    }),
  });
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.errors[0], "TELEGRAM_DOCUMENT_SEND_FAILED");
  assert.strictEqual(result.telegram_error_diagnostics[0].telegram_http_status, 400);
  assert.strictEqual(result.telegram_error_diagnostics[0].telegram_error_code, 400);
  assert(result.telegram_error_diagnostics[0].telegram_description_safe.includes("chat not found"));
  const raw = JSON.stringify(result);
  assert(!raw.includes("SECRET_TOKEN_SHOULD_NOT_LEAK"));
  assert(!raw.includes("123456789"));
  console.log("Telegram Document Send Error Diagnostics Tests");
  console.log(" - send_document_error_is_sanitized: PASS (TELEGRAM_DOCUMENT_SEND_FAILED)");
  console.log("\nPASS total: 1/1");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

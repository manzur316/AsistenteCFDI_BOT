const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  buildCanonicalDocumentDeliveryRequest,
  buildCanonicalDocumentDeliveryResult,
  validateCanonicalDocumentDeliveryRequest,
} = require("./lib/document-delivery/canonical-document-delivery-contract");
const { diagnoseDocumentDeliveryConfig } = require("./lib/telegram-document-delivery-channel");

const root = path.resolve(__dirname, "..");
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function assertSafePublicJson(value) {
  const raw = JSON.stringify(value);
  assert(!/TEST_TOKEN|F-Api-Key|F-Secret-Key|F-PLUGIN|\.env|CSD|BEGIN PRIVATE KEY/i.test(raw), "secret marker leaked");
  assert(!/cliente\.real@example\.com/i.test(raw), "full email leaked");
  assert(!/1234567890123/.test(raw), "full chat id leaked");
  assert(!/XAXX010101000|[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/i.test(raw), "RFC leaked");
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(raw), "UUID leaked");
  assert(!/CFDIUIDSECRET|UIDSECRET/.test(raw), "UID leaked");
  assert(!/[A-Za-z]:[\\/]|\/Users\/|\/home\//.test(raw), "absolute path leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|PK\x03\x04/.test(raw), "document bytes leaked");
}

check("canonical_request_blocks_absolute_paths_and_redacts_email", () => {
  const request = buildCanonicalDocumentDeliveryRequest({
    provider: "factura_com",
    environment: "SANDBOX",
    channel: "PROVIDER_EMAIL",
    recipient: { email: "cliente.real@example.com", confirmed: true },
    documents: {
      xml_path: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime/doc.xml",
      pdf_path: "/tmp/doc.pdf",
      xml_content_valid: true,
      pdf_content_valid: true,
    },
  });
  assert.strictEqual(request.recipient.email_redacted, "c***@example.com");
  assert.strictEqual(request.documents.xml_path, "[BLOCKED_PATH]");
  assert.strictEqual(request.documents.pdf_path, "[BLOCKED_PATH]");
  assertSafePublicJson(buildCanonicalDocumentDeliveryResult({
    ok: true,
    channel: "PROVIDER_EMAIL",
    status: "DRY_RUN",
    recipient_present: true,
    recipient_email: "cliente.real@example.com",
    documents_valid: true,
  }));
  return request.recipient.email_redacted;
});

check("smtp_is_not_implemented_as_primary_flow", () => {
  const request = buildCanonicalDocumentDeliveryRequest({
    channel: "SMTP_FUTURE_OPTIONAL",
    recipient: { email: "cliente.real@example.com", confirmed: true },
    documents: {
      xml_path: "runtime/x.xml",
      pdf_path: "runtime/x.pdf",
      xml_content_valid: true,
      pdf_content_valid: true,
    },
  });
  const validation = validateCanonicalDocumentDeliveryRequest(request);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SMTP_NOT_IMPLEMENTED"));
  return validation.errors.join("|");
});

check("telegram_config_never_returns_token_or_full_chat_id", () => {
  const config = diagnoseDocumentDeliveryConfig({
    TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "1234567890123",
    TELEGRAM_BOT_TOKEN: "TEST_TOKEN_SUPER_SECRET",
  });
  assert.strictEqual(config.ready, true);
  assert.strictEqual(config.delivery_chat_id_redacted, "[REDACTED_CHAT_ID len=13]");
  assertSafePublicJson(config);
  return config.delivery_chat_id_redacted;
});

check("client_primary_email_contract_does_not_add_secondary_fields", () => {
  const sqlPath = path.join(root, "sql", "015_client_primary_email_foundation.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert(/ADD COLUMN IF NOT EXISTS email\b/i.test(sql));
  assert(!/email2|email3|billing_email|document_delivery_email/i.test(sql));
  return "primary-only";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

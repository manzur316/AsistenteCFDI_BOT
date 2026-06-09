const assert = require("assert");
const { sanitizeReport, sanitizeString } = require("./qa/sanitize-report");

const report = sanitizeReport({
  telegramBotToken: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_secret",
  n8nApiKey: "n8n_api_key_secret",
  chat_id: "6573879494",
  email: "cliente.real@example.com",
  rfc: "ABC010203XYZ",
  callback_data: "cfdi:abcdefghijklmnop",
  xml: "<?xml version=\"1.0\"?><cfdi:Comprobante>secret</cfdi:Comprobante>",
  pdf: "%PDF-1.4 secret",
});

const serialized = JSON.stringify(report);
assert(!serialized.includes("123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ_secret"));
assert(!serialized.includes("n8n_api_key_secret"));
assert(!serialized.includes("6573879494"));
assert(!serialized.includes("cliente.real@example.com"));
assert(!serialized.includes("ABC010203XYZ"));
assert(!serialized.includes("abcdefghijklmnop"));
assert(!serialized.includes("<cfdi:Comprobante>"));
assert(!serialized.includes("%PDF-1.4 secret"));
assert.strictEqual(sanitizeString("correo test@example.com").includes("test@example.com"), false);

console.log("QA Sanitize Report Tests");
console.log(" - sanitizer_redacts_secrets_tokens_email_rfc_xml_pdf: PASS");
console.log("\nPASS total: 1/1");

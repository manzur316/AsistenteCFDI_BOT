const assert = require("assert");

const {
  DOCUMENT_DELIVERY_CHANNELS,
  DOCUMENT_DELIVERY_STATUSES,
  buildCanonicalDocumentDeliveryRequest,
  buildCanonicalDocumentDeliveryResult,
  redactEmail,
  validateCanonicalDocumentDeliveryRequest,
} = require("./lib/document-delivery/canonical-document-delivery-contract");

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

check("canonical_request_validates_safe_provider_email", () => {
  const request = buildCanonicalDocumentDeliveryRequest({
    provider: "factura_com",
    environment: "SANDBOX",
    draft_id: "DRAFT-1",
    client_id: "CLIENT-1",
    channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
    recipient: { email: "cliente@example.com", source: "cfdi_clients.email", confirmed: true },
    documents: {
      xml_path: "runtime/storage-sandbox/demo/exports/demo.xml",
      pdf_path: "runtime/storage-sandbox/demo/exports/demo.pdf",
      xml_content_valid: true,
      pdf_content_valid: true,
    },
  });
  const validation = validateCanonicalDocumentDeliveryRequest(request);
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(request.delivery_policy.allow_production, false);
  assert.strictEqual(request.recipient.email_redacted, "c***@example.com");
  assert(!JSON.stringify(request).includes("C:/"), "absolute path leaked");
  return request.channel;
});

check("production_is_blocked_by_default", () => {
  const request = buildCanonicalDocumentDeliveryRequest({
    environment: "PRODUCTION",
    channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
    recipient: { email: "cliente@example.com", confirmed: true },
    documents: { xml_path: "runtime/a.xml", pdf_path: "runtime/a.pdf", xml_content_valid: true, pdf_content_valid: true },
  });
  const validation = validateCanonicalDocumentDeliveryRequest(request);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("DOCUMENT_DELIVERY_PRODUCTION_BLOCKED"));
  return validation.errors[0];
});

check("invalid_documents_are_blocked", () => {
  const request = buildCanonicalDocumentDeliveryRequest({
    channel: DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL,
    documents: { xml_path: "runtime/a.xml", pdf_path: "runtime/a.pdf", xml_content_valid: true, pdf_content_valid: false },
  });
  const validation = validateCanonicalDocumentDeliveryRequest(request);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("DOCUMENTS_NOT_VALID"));
  return validation.errors[0];
});

check("result_redacts_email", () => {
  const result = buildCanonicalDocumentDeliveryResult({
    ok: true,
    status: DOCUMENT_DELIVERY_STATUSES.DRY_RUN,
    channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
    recipient_present: true,
    recipient_email: "real@example.com",
    documents_valid: true,
  });
  assert.strictEqual(result.recipient_email_redacted, "r***@example.com");
  assert.strictEqual(redactEmail("real@example.com"), "r***@example.com");
  assert(!JSON.stringify(result).includes("real@example.com"), "email completo filtrado");
  return result.status;
});

console.log("Document Delivery Canonical Contract Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

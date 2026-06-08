const assert = require("assert");

const {
  buildDeliveryIdempotencyKey,
  buildFindExistingDeliverySql,
} = require("./lib/document-delivery/document-delivery-ledger-store");

const input = {
  environment: "SANDBOX",
  draft_id: "DRAFT-PROVIDER-DUP-1",
  channel: "PROVIDER_EMAIL",
  recipient_email: "cliente@example.com",
  xml_sha256: "a".repeat(64),
  pdf_sha256: "b".repeat(64),
};

const key = buildDeliveryIdempotencyKey(input);
const sql = buildFindExistingDeliverySql(input);

assert(key.includes("PROVIDER_EMAIL"));
assert(!key.includes("cliente@example.com"));
assert(sql.includes("delivery_status = 'SENT'"));
assert(sql.includes("document_delivery_ledger"));

console.log("Provider Email Delivery Duplicate Block Tests");
console.log(" - provider_email_duplicate_uses_sent_idempotency: PASS (PROVIDER_EMAIL)");
console.log("\nPASS total: 1/1");

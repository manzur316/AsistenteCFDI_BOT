const assert = require("assert");

const {
  LEDGER_STATUSES,
  buildDeliveryIdempotencyKey,
  buildFindExistingDeliverySql,
  buildRecordDeliveryAttemptSql,
} = require("./lib/document-delivery/document-delivery-ledger-store");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

const base = {
  draft_id: "DRAFT-SENT-BLOCKS-DUP",
  client_id: "CLI-REAL-BILBAO",
  environment: "SANDBOX",
  channel: "PROVIDER_EMAIL",
  recipient_email: "cliente@example.com",
  xml_sha256: "c".repeat(64),
  pdf_sha256: "d".repeat(64),
  documents_valid: true,
  xml_content_valid: true,
  pdf_content_valid: true,
};

check("sent_lookup_uses_canonical_idempotency_key", () => {
  const key = buildDeliveryIdempotencyKey(base);
  const sql = buildFindExistingDeliverySql({ ...base, idempotency_key: key });
  assert(sql.includes(key), "canonical key missing");
  assert(sql.includes("delivery_status = 'SENT'"), "SENT-only filter missing");
  return "sent_only";
});

check("sent_row_is_preserved_when_duplicate_block_attempt_is_recorded", () => {
  const key = buildDeliveryIdempotencyKey(base);
  const sql = buildRecordDeliveryAttemptSql({
    ...base,
    delivery_status: LEDGER_STATUSES.BLOCKED_DUPLICATE,
    delivery_action: "SEND",
    idempotency_key: key,
    normalized_warnings: ["DELIVERY_ALREADY_SENT"],
  });
  assert(sql.includes("document_delivery_ledger.delivery_status = 'SENT' AND EXCLUDED.delivery_status <> 'SENT'"));
  assert(sql.includes("THEN document_delivery_ledger.delivery_status ELSE EXCLUDED.delivery_status END"));
  assert(!sql.includes(":BLOCKED_DUPLICATE:"), "duplicate status leaked into idempotency key");
  return "preserve_sent";
});

console.log("Document Delivery SENT Blocks Duplicate Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

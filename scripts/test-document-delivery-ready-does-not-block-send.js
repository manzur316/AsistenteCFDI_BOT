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
  draft_id: "DRAFT-NOT-BLOCKING-1",
  client_id: "CLI-REAL-BILBAO",
  environment: "SANDBOX",
  channel: "TELEGRAM_DOCUMENT_CHANNEL",
  telegram_chat_id: "123456789",
  xml_sha256: "a".repeat(64),
  pdf_sha256: "b".repeat(64),
  documents_valid: true,
  xml_content_valid: true,
  pdf_content_valid: true,
};

check("duplicate_lookup_only_treats_sent_as_blocking", () => {
  const sql = buildFindExistingDeliverySql({ ...base, onlySent: true });
  assert(sql.includes("delivery_status = 'SENT'"));
  assert(!sql.includes("READY"));
  assert(!sql.includes("DRY_RUN"));
  return "sent_only";
});

check("ready_upsert_can_be_promoted_to_sent", () => {
  const key = buildDeliveryIdempotencyKey(base);
  const readySql = buildRecordDeliveryAttemptSql({ ...base, delivery_status: LEDGER_STATUSES.READY, delivery_action: "PREPARE", idempotency_key: key });
  const sentSql = buildRecordDeliveryAttemptSql({ ...base, delivery_status: LEDGER_STATUSES.SENT, delivery_action: "SEND", idempotency_key: key });
  assert(readySql.includes("ON CONFLICT (idempotency_key) DO UPDATE SET"));
  assert(sentSql.includes("ELSE EXCLUDED.delivery_status END"));
  assert(sentSql.includes("WHEN EXCLUDED.delivery_status = 'SENT'"));
  assert(sentSql.includes("COALESCE(EXCLUDED.sent_at, now())"));
  return "promotable";
});

check("ready_and_dry_run_statuses_are_not_duplicate_blockers", () => {
  const findSql = buildFindExistingDeliverySql(base);
  assert(/AND d\.delivery_status = 'SENT'/.test(findSql));
  assert(!/delivery_status IN/.test(findSql), "lookup should not block on multiple statuses");
  return "not_blocking";
});

console.log("Document Delivery READY Does Not Block Send Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

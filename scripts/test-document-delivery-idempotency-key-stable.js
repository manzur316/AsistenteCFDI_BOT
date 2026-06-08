const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  LEDGER_STATUSES,
  buildDeliveryIdempotencyKey,
  buildRecordDeliveryAttemptSql,
} = require("./lib/document-delivery/document-delivery-ledger-store");

const source = fs.readFileSync(path.join(__dirname, "lib", "sandbox-document-delivery-action.js"), "utf8");
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
  environment: "SANDBOX",
  draft_id: "DRAFT-STABLE-1",
  channel: "PROVIDER_EMAIL",
  recipient_email: "cliente@example.com",
  xml_sha256: "x".repeat(64),
  pdf_sha256: "p".repeat(64),
  documents_valid: true,
  xml_content_valid: true,
  pdf_content_valid: true,
};

check("canonical_idempotency_key_has_no_status_or_timestamp", () => {
  const key = buildDeliveryIdempotencyKey(base);
  assert(!key.includes(":READY:"));
  assert(!key.includes(":DRY_RUN:"));
  assert(!key.includes(":ERROR:"));
  assert(!/\d{13}/.test(key), "timestamp-like value found in key");
  assert(!key.includes("cliente@example.com"));
  return "stable";
});

check("attempt_ledger_key_no_longer_appends_status_date", () => {
  assert(!source.includes("${canonical}:${status}:${Date.now()}"), "attemptLedgerKey still appends status/timestamp");
  assert(/function attemptLedgerKey\(base = \{\}, status\) \{\s*return canonicalLedgerKey\(base\);/s.test(source), "attemptLedgerKey must return canonical key");
  return "canonical";
});

check("ready_and_sent_attempts_share_same_canonical_key", () => {
  const key = buildDeliveryIdempotencyKey(base);
  const readySql = buildRecordDeliveryAttemptSql({ ...base, delivery_status: LEDGER_STATUSES.READY, delivery_action: "PREPARE", idempotency_key: key });
  const sentSql = buildRecordDeliveryAttemptSql({ ...base, delivery_status: LEDGER_STATUSES.SENT, delivery_action: "SEND", idempotency_key: key });
  assert(readySql.includes(key), "READY SQL missing canonical key");
  assert(sentSql.includes(key), "SENT SQL missing canonical key");
  assert(!readySql.includes(":READY:"), "READY status leaked into idempotency key");
  assert(!sentSql.includes(":SENT:"), "SENT status leaked into idempotency key");
  return "shared";
});

console.log("Document Delivery Idempotency Key Stable Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

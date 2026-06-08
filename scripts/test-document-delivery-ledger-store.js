const assert = require("assert");

const {
  buildDeliveryIdempotencyKey,
  buildFindExistingDeliverySql,
  buildRecordDeliveryAttemptSql,
  deliverySqlFields,
  findExistingDelivery,
  recordDeliveryAttempt,
  sanitizeEvidence,
} = require("./lib/document-delivery/document-delivery-ledger-store");

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

function execReturning(jsonValue, observed = []) {
  return (_command, args) => {
    observed.push(args.join(" "));
    return `${JSON.stringify(jsonValue)}\n`;
  };
}

const base = {
  draft_id: "DRAFT-LEDGER-1",
  client_id: "CLI-REAL-BILBAO",
  provider: "factura_com",
  environment: "SANDBOX",
  channel: "PROVIDER_EMAIL",
  recipient_email: "test@example.com",
  recipient_present: true,
  email_confirmed: true,
  provider_email_sync_status: "SYNCED",
  documents_valid: true,
  xml_content_valid: true,
  pdf_content_valid: true,
  pdf_source: "PROVIDER",
  xml_sha256: "a".repeat(64),
  pdf_sha256: "b".repeat(64),
  xml_size_bytes: 1234,
  pdf_size_bytes: 4567,
  human_xml_path: "runtime/storage-sandbox/demo.xml",
  human_pdf_path: "runtime/storage-sandbox/demo.pdf",
};

check("builds_stable_idempotency_key_without_email", () => {
  const key = buildDeliveryIdempotencyKey(base);
  assert(key.startsWith("document_delivery:SANDBOX:DRAFT-LEDGER-1:PROVIDER_EMAIL:email:"));
  assert(!key.includes("test@example.com"));
  assert(key.includes(base.xml_sha256));
  assert(key.includes(base.pdf_sha256));
  return "safe";
});

check("record_sql_contains_safe_fields_and_no_secret", () => {
  const sql = buildRecordDeliveryAttemptSql({
    ...base,
    delivery_status: "SENT",
    delivery_action: "SEND",
    idempotency_key: buildDeliveryIdempotencyKey(base),
    evidence: {
      token: "123456:SECRET_TELEGRAM_TOKEN",
      email: "test@example.com",
      chat_id: "123456789",
      xml: "<?xml secret",
      path: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime/file.pdf",
    },
  });
  assert(sql.includes("INSERT INTO document_delivery_ledger"));
  assert(sql.includes("idx_document_delivery_ledger_idempotency") === false);
  assert(!sql.includes("SECRET_TELEGRAM_TOKEN"));
  assert(!sql.includes("test@example.com"));
  assert(!sql.includes("<?xml"));
  assert(!/[A-Za-z]:[\\/]/.test(sql));
  return "sql";
});

check("record_delivery_attempt_uses_exec_adapter", () => {
  const observed = [];
  const row = {
    delivery_id: "DELIV-1",
    delivery_status: "SENT",
    channel: "PROVIDER_EMAIL",
    recipient_redacted: "t***@example.com",
  };
  const result = recordDeliveryAttempt({
    ...base,
    delivery_status: "SENT",
    delivery_action: "SEND",
    idempotency_key: buildDeliveryIdempotencyKey(base),
  }, { execFileSync: execReturning(row, observed) });
  assert.strictEqual(result.delivery_status, "SENT");
  assert(observed[0].includes("INSERT INTO document_delivery_ledger"));
  return result.delivery_status;
});

check("find_existing_delivery_queries_sent_only", () => {
  const sql = buildFindExistingDeliverySql({ ...base, onlySent: true });
  assert(sql.includes("delivery_status = 'SENT'"));
  const found = findExistingDelivery(base, {
    execFileSync: execReturning({ delivery_id: "DELIV-SENT", delivery_status: "SENT" }),
  });
  assert.strictEqual(found.delivery_status, "SENT");
  return found.delivery_id;
});

check("sanitize_evidence_redacts_sensitive_values", () => {
  const safe = sanitizeEvidence({
    token: "123456:SECRET",
    chat_id: "999999999",
    email: "person@example.com",
    uuid: "00000000-0000-4000-8000-000000000001",
    pdf: "%PDF-1.4 secret",
  });
  const raw = JSON.stringify(safe);
  assert(!raw.includes("SECRET"));
  assert(!raw.includes("999999999"));
  assert(!raw.includes("person@example.com"));
  assert(!raw.includes("00000000-0000-4000-8000-000000000001"));
  assert(!raw.includes("%PDF"));
  return "redacted";
});

check("delivery_sql_fields_keeps_relative_runtime_paths", () => {
  const row = deliverySqlFields({
    ...base,
    human_xml_path: "runtime/storage-sandbox/demo.xml",
    human_pdf_path: "runtime/storage-sandbox/demo.pdf",
  });
  assert.strictEqual(row.human_xml_path, "runtime/storage-sandbox/demo.xml");
  assert.strictEqual(row.human_pdf_path, "runtime/storage-sandbox/demo.pdf");
  assert.strictEqual(row.recipient_redacted, "t***@example.com");
  return row.channel;
});

Promise.all(checks).then((results) => {
  let pass = 0;
  for (const result of results) {
    if (result.pass) pass += 1;
    printCheck(result.name, result.pass, result.value);
  }
  console.log(`\nPASS total: ${pass}/${results.length}`);
  if (pass !== results.length) process.exit(1);
});

const assert = require("assert");

const {
  buildDeliveryIdempotencyKey,
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

const base = {
  environment: "SANDBOX",
  draft_id: "DRAFT-IDEMPOTENCY-1",
  channel: "PROVIDER_EMAIL",
  recipient_email: "cliente@example.com",
  xml_sha256: "x".repeat(64),
  pdf_sha256: "p".repeat(64),
};

check("same_draft_channel_destination_hashes_duplicate_key", () => {
  const a = buildDeliveryIdempotencyKey(base);
  const b = buildDeliveryIdempotencyKey({ ...base });
  assert.strictEqual(a, b);
  assert(!a.includes("cliente@example.com"));
  return "duplicate";
});

check("different_channel_allowed", () => {
  const provider = buildDeliveryIdempotencyKey(base);
  const telegram = buildDeliveryIdempotencyKey({
    ...base,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    telegram_chat_id: "123456789",
  });
  assert.notStrictEqual(provider, telegram);
  return "allowed";
});

check("different_hash_allowed", () => {
  const a = buildDeliveryIdempotencyKey(base);
  const b = buildDeliveryIdempotencyKey({ ...base, pdf_sha256: "q".repeat(64) });
  assert.notStrictEqual(a, b);
  return "allowed";
});

check("destination_uses_hash_not_plain_email_or_chat", () => {
  const provider = buildDeliveryIdempotencyKey(base);
  const telegram = buildDeliveryIdempotencyKey({
    ...base,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    telegram_chat_id: "987654321",
  });
  assert(!provider.includes("cliente@example.com"));
  assert(!telegram.includes("987654321"));
  assert(provider.includes(":email:"));
  assert(telegram.includes(":telegram:"));
  return "safe";
});

check("force_is_policy_flag_not_part_of_canonical_key", () => {
  const normal = buildDeliveryIdempotencyKey(base);
  const forced = buildDeliveryIdempotencyKey({ ...base, force: true });
  assert.strictEqual(normal, forced);
  return "force";
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

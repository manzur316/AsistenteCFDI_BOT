const assert = require("assert");
const fs = require("fs");

const sqlPath = "sql/013_shared_bot_access_subscription_foundation.sql";
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function sql() {
  return fs.readFileSync(sqlPath, "utf8");
}

test("migration_exists", () => {
  assert(fs.existsSync(sqlPath));
  return sqlPath;
});

test("creates_expected_tables", () => {
  const text = sql();
  for (const table of [
    "channel_identities",
    "tenant_memberships",
    "tenant_subscriptions",
    "tenant_entitlements",
    "invitation_tokens",
    "usage_credit_ledger",
  ]) {
    assert(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}`, "i").test(text), table);
  }
  return "tables";
});

test("contains_required_columns", () => {
  const text = sql().toLowerCase();
  for (const column of [
    "channel_user_id text not null",
    "chat_id text",
    "username text",
    "user_id text not null",
    "tenant_id text not null",
    "default_emitter_id text",
    "plan_code text not null",
    "token_hash text not null",
    "used_count integer not null default 0",
    "quantity integer not null",
  ]) {
    assert(text.includes(column), column);
  }
  return "columns";
});

test("indexes_expected_access_paths", () => {
  const text = sql();
  assert(/UNIQUE INDEX IF NOT EXISTS idx_channel_identities_channel_user/i.test(text));
  assert(text.includes("ON channel_identities(channel, channel_user_id)"));
  assert(text.includes("idx_tenant_memberships_tenant_user"));
  assert(text.includes("idx_tenant_subscriptions_tenant_status"));
  assert(text.includes("idx_invitation_tokens_token_hash"));
  assert(text.includes("idx_usage_credit_ledger_tenant_created"));
  return "indexes";
});

test("invitation_uses_hash_not_plain_token_column", () => {
  const text = sql().toLowerCase();
  assert(text.includes("token_hash text not null"));
  assert(!/\btoken\s+text\b/.test(text), "plain token column found");
  return "hash";
});

test("migration_is_additive_not_destructive", () => {
  const text = sql();
  assert(!/\bDROP\s+TABLE\b/i.test(text));
  assert(!/\bTRUNCATE\b/i.test(text));
  assert(!/\bDELETE\s+FROM\b/i.test(text));
  assert(!/\bALTER\s+TABLE\s+cfdi_/i.test(text));
  return "additive";
});

let pass = 0;
for (const item of tests) {
  try {
    const detail = item.fn();
    pass += 1;
    console.log(`PASS ${item.name}: ${detail}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`PASS total: ${pass}/${tests.length}`);

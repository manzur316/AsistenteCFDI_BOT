const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sqlPath = path.join(root, "sql", "009_provider_multitenant_foundation.sql");
const syncSqlPath = path.join(root, "sql", "012_provider_client_sync_foundation.sql");
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

function sql() {
  return fs.readFileSync(sqlPath, "utf8");
}

function syncSql() {
  return fs.readFileSync(syncSqlPath, "utf8");
}

check("migration_exists", () => {
  assert(fs.existsSync(sqlPath));
  assert(fs.existsSync(syncSqlPath));
  return path.relative(root, sqlPath).replace(/\\/g, "/");
});

check("migration_creates_expected_tables", () => {
  const text = sql();
  for (const table of [
    "satbot_tenants",
    "tenant_fiscal_profiles",
    "tenant_fiscal_activities",
    "provider_accounts",
    "provider_client_links",
    "provider_invoice_links",
    "provider_usage_ledger",
    "provider_capabilities_snapshot",
  ]) {
    assert(new RegExp(`CREATE TABLE IF NOT EXISTS\\s+${table}`, "i").test(text), `${table} missing`);
  }
  return "tables";
});

check("migration_is_additive_not_destructive", () => {
  const text = sql();
  assert(!/\bDROP\s+TABLE\b/i.test(text), "DROP TABLE found");
  assert(!/\bALTER\s+TABLE\s+cfdi_drafts\b/i.test(text), "destructive cfdi_drafts alter found");
  assert(!/\bDELETE\s+FROM\b/i.test(text), "DELETE found");
  assert(!/\bTRUNCATE\b/i.test(text), "TRUNCATE found");
  return "additive";
});

check("tenant_and_provider_columns_exist", () => {
  const text = sql();
  for (const required of [
    "tenant_id text",
    "provider text not null",
    "environment text not null",
    "provider_client_uid text",
    "provider_invoice_uid text",
    "payment_status_provider text",
    "payment_status_local text",
    "credentials_ref text",
    "capabilities jsonb",
  ]) {
    assert(text.toLowerCase().includes(required.toLowerCase()), `${required} missing`);
  }
  return "columns";
});

check("default_personal_tenant_seeded", () => {
  const text = sql();
  assert(text.includes("TENANT_PERSONAL_DEFAULT"));
  assert(/ON CONFLICT\s*\(tenant_id\)\s*DO NOTHING/i.test(text));
  return "TENANT_PERSONAL_DEFAULT";
});

check("provider_client_sync_unique_link_index_exists", () => {
  const text = syncSql();
  assert(/CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_provider_client_links_unique_local/i.test(text));
  assert(text.includes("tenant_id, client_id, provider, environment"));
  assert(!/\bDROP\s+TABLE\b|\bTRUNCATE\b|\bDELETE\s+FROM\b/i.test(text));
  return "unique local link";
});

console.log("Provider Multitenant Schema Contract Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");
const fs = require("fs");

const sql = fs.readFileSync("sql/011_tenant_fiscal_profile_rules.sql", "utf8");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("migracion define tenant fiscal profile foundation", () => {
  assert(sql.includes("CREATE TABLE IF NOT EXISTS tenant_fiscal_profiles"));
  for (const column of [
    "profile_id",
    "tenant_id",
    "rfc",
    "razon_social",
    "tipo_persona",
    "regimen_fiscal",
    "codigo_postal_fiscal",
    "default_uso_cfdi",
    "default_moneda",
    "default_lugar_expedicion",
    "human_review_required",
    "status",
  ]) {
    assert(sql.includes(column), column);
  }
  return "profile columns";
});

test("migracion agrega activity links y invoice policy", () => {
  assert(sql.includes("CREATE TABLE IF NOT EXISTS tenant_fiscal_activity_links"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS tenant_invoice_policy"));
  for (const column of ["default_metodo_pago", "default_forma_pago", "allow_ppd", "allow_pue", "require_human_confirmation"]) {
    assert(sql.includes(column), column);
  }
  return "policy tables";
});

test("migracion conserva TENANT_PERSONAL_DEFAULT y es aditiva", () => {
  assert(sql.includes("TENANT_PERSONAL_DEFAULT"));
  assert(sql.includes("ADD COLUMN IF NOT EXISTS"));
  assert(!/\bDROP\s+TABLE\b/i.test(sql));
  assert(!/\bTRUNCATE\b/i.test(sql));
  assert(!/\bDELETE\s+FROM\b/i.test(sql));
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

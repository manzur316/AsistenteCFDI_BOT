const assert = require("assert");
const fs = require("fs");
const sql = fs.readFileSync("sql/010_sat_catalog_foundation.sql", "utf8");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("SQL crea tablas foundation", () => {
  assert(sql.includes("CREATE TABLE IF NOT EXISTS sat_catalog_sources"));
  assert(sql.includes("CREATE TABLE IF NOT EXISTS sat_catalog_entries"));
  return "tables";
});

test("sat_catalog_sources tiene columnas requeridas", () => {
  for (const column of ["source_id", "source_type", "source_name", "source_path", "source_hash", "catalog_version", "imported_at", "metadata"]) {
    assert(sql.includes(column), column);
  }
  return "sources columns";
});

test("sat_catalog_entries tiene columnas requeridas e indices", () => {
  for (const column of ["entry_id", "catalog_name", "key text", "description", "valid_from", "valid_to", "attributes jsonb", "active boolean"]) {
    assert(sql.includes(column), column);
  }
  assert(sql.includes("idx_sat_catalog_entries_catalog_key"));
  assert(sql.includes("idx_sat_catalog_entries_attributes_gin"));
  return "entries columns";
});

test("migracion es aditiva y no destructiva", () => {
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

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { canonicalClientFromLocalClient, mapCanonicalProviderClientToFacturaComPayload } = require("./lib/factura-com-provider-client-mapper");

const root = path.resolve(__dirname, "..");
const sqlPath = path.join(root, "sql", "015_client_primary_email_foundation.sql");
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

check("sql_adds_single_primary_email_only", () => {
  const sql = fs.readFileSync(sqlPath, "utf8");
  assert(/ADD COLUMN IF NOT EXISTS email text/i.test(sql));
  assert(/ADD COLUMN IF NOT EXISTS email_confirmed boolean/i.test(sql));
  assert(!/email2|email3|billing_email|document_delivery_email/i.test(sql), "secondary email field found");
  return "email";
});

check("canonical_client_preserves_primary_email", () => {
  const canonical = canonicalClientFromLocalClient({
    client_id: "CLIENT-EMAIL",
    rfc: "ABC010203AB1",
    razon_social: "CLIENTE DEMO",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    email: "cliente@example.com",
    validated_by_human: true,
  });
  assert.strictEqual(canonical.email, "cliente@example.com");
  const payload = mapCanonicalProviderClientToFacturaComPayload(canonical);
  assert.strictEqual(payload.email, "cliente@example.com");
  assert(!Object.prototype.hasOwnProperty.call(payload, "email2"));
  assert(!Object.prototype.hasOwnProperty.call(payload, "billing_email"));
  return payload.email;
});

console.log("Client Primary Email Contract Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

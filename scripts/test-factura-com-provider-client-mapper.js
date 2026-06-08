const assert = require("assert");

const {
  mapCanonicalProviderClientToFacturaComPayload,
  normalizeRfc,
  redactRfc,
  validateFacturaComClientCreateInput,
} = require("./lib/factura-com-provider-client-mapper");

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
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function validClient(overrides = {}) {
  return {
    client_id: "CLIENT-REAL-BILBAO",
    razon_social: "REAL BILBAO SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    validated_by_human: true,
    ...overrides,
  };
}

check("normalizes_rfc_and_maps_facturacom_payload", () => {
  const payload = mapCanonicalProviderClientToFacturaComPayload(validClient({ rfc: " abc010203ab1 " }));
  assert.strictEqual(payload.rfc, "ABC010203AB1");
  assert.strictEqual(payload.razons, "REAL BILBAO SA DE CV");
  assert.strictEqual(payload.codpos, "77500");
  assert.strictEqual(payload.regimen, "601");
  assert.strictEqual(payload.usocfdi, "G03");
  assert.strictEqual(payload.pais, "MEX");
  return payload.rfc;
});

check("requires_human_validated_client_data", () => {
  const result = validateFacturaComClientCreateInput(validClient({ validated_by_human: false }));
  assert.strictEqual(result.ok, false);
  assert(result.errors.includes("CLIENT_NOT_VALIDATED_FOR_PROVIDER_SYNC"));
  return result.status;
});

check("blocks_generic_rfc_by_default", () => {
  const result = validateFacturaComClientCreateInput(validClient({ rfc: "XAXX010101000" }));
  assert.strictEqual(result.ok, false);
  assert(result.errors.includes("GENERIC_RFC_NOT_ALLOWED_FOR_PROVIDER_SYNC"));
  return "generic blocked";
});

check("redaction_does_not_leak_complete_rfc", () => {
  assert.strictEqual(normalizeRfc("abc010203ab1"), "ABC010203AB1");
  const redacted = redactRfc("ABC010203AB1");
  assert(!redacted.includes("ABC010203AB1"));
  assert(redacted.includes("len=12"));
  return redacted;
});

console.log("Factura.com Provider Client Mapper Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

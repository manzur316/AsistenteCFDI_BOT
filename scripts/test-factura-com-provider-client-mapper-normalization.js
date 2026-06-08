const assert = require("assert");
const {
  canonicalClientFromLocalClient,
  mapCanonicalProviderClientToFacturaComPayload,
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

const client = {
  client_id: "CLI-REAL-BILBAO",
  legal_name: "Real Bilbao",
  rfc: "XAXX010101000",
  codigo_postal_fiscal: "77500",
  regimen_fiscal: "Personas Morales con Fines no Lucrativos",
  uso_cfdi_default: "Gastos en general",
  validated_by_human: true,
};

check("canonical_provider_client_normaliza_regimen_y_uso", () => {
  const canonical = canonicalClientFromLocalClient(client);
  assert.strictEqual(canonical.fiscal_regime, "603");
  assert.strictEqual(canonical.cfdi_use, "G03");
  return `${canonical.fiscal_regime}/${canonical.cfdi_use}`;
});

check("payload_provider_client_envia_claves_sat", () => {
  const payload = mapCanonicalProviderClientToFacturaComPayload(client);
  assert.strictEqual(payload.regimen, "603");
  assert.strictEqual(payload.usocfdi, "G03");
  assert.ok(!payload.regimen.includes("Personas"));
  assert.ok(!payload.usocfdi.includes("Gastos"));
  return `${payload.regimen}/${payload.usocfdi}`;
});

check("uso_g1_bloquea_sync", () => {
  const validation = validateFacturaComClientCreateInput({
    ...client,
    uso_cfdi_default: "G1",
  });
  assert.strictEqual(validation.ok, false);
  assert.ok(validation.errors.includes("CLIENT_CFDI_USE_NEEDS_CONFIRMATION"));
  return validation.errors.join("|");
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

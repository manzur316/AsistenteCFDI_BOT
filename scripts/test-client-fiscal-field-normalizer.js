const assert = require("assert");
const { normalizeClientFiscalFields } = require("./lib/clients/client-fiscal-field-normalizer");

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("real_bilbao_descripciones_normalizan_a_claves_sat", () => {
  const result = normalizeClientFiscalFields({
    client_id: "CLI-REAL-BILBAO",
    regimen_fiscal: "Personas Morales con Fines no Lucrativos",
    uso_cfdi_default: "Gastos en general",
    codigo_postal_fiscal: "77500",
    tipo_persona: "MORAL",
    rfc: "XAXX010101000",
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.normalized_client.regimen_fiscal, "603");
  assert.strictEqual(result.normalized_client.uso_cfdi_default, "G03");
  assert.strictEqual(result.normalized_client.regimen_fiscal_description, "Personas Morales con Fines no Lucrativos");
  assert.ok(result.normalized_client.uso_cfdi_description.includes("Gastos"));
  return `${result.normalized_client.regimen_fiscal}/${result.normalized_client.uso_cfdi_default}`;
});

check("g1_queda_bloqueado_en_cliente", () => {
  const result = normalizeClientFiscalFields({
    client_id: "CLI-TEST",
    regimen_fiscal: "603",
    uso_cfdi_default: "G1",
    codigo_postal_fiscal: "77500",
    tipo_persona: "MORAL",
  });
  assert.strictEqual(result.ok, false);
  assert.ok(result.blockers.some((item) => item.includes("uso_cfdi_default:INVALID_FORMAT")));
  return result.blockers.join("|");
});

check("no_expone_rfc_completo_en_summary", () => {
  const result = normalizeClientFiscalFields({
    client_id: "CLI-REAL-BILBAO",
    rfc: "ABC010203XYZ",
    regimen_fiscal: "603",
    uso_cfdi_default: "G03",
    codigo_postal_fiscal: "77500",
  });
  const serialized = JSON.stringify(result.normalized_client.fiscal_normalization_summary);
  assert.ok(!serialized.includes("ABC010203XYZ"));
  return "safe";
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

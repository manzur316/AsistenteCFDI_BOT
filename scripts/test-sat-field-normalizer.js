const assert = require("assert");
const {
  normalizeClaveUnidad,
  normalizeFormaPago,
  normalizeMetodoPago,
  normalizeRegimenFiscal,
  normalizeUsoCfdi,
} = require("./lib/sat-catalogs/sat-field-normalizer");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("regimen_603_exact_key", () => {
  const result = normalizeRegimenFiscal("603");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "EXACT_KEY");
  assert.strictEqual(result.key, "603");
  return result.description;
});

check("regimen_descripcion_personas_morales_sin_lucro", () => {
  const result = normalizeRegimenFiscal("Personas Morales con Fines no Lucrativos");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.key, "603");
  assert.strictEqual(result.status, "NORMALIZED");
  return result.key;
});

check("regimen_alias_sin_acentos", () => {
  const result = normalizeRegimenFiscal("personas morales fines no lucrativos");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.key, "603");
  return result.key;
});

check("regimen_resico", () => {
  assert.strictEqual(normalizeRegimenFiscal("Regimen Simplificado de Confianza").key, "626");
  assert.strictEqual(normalizeRegimenFiscal("RESICO").key, "626");
  return "626";
});

check("uso_cfdi_g03_exact_key", () => {
  const result = normalizeUsoCfdi("G03");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "EXACT_KEY");
  return result.key;
});

check("uso_cfdi_gastos_en_general", () => {
  const result = normalizeUsoCfdi("Gastos en general");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.key, "G03");
  return result.description;
});

check("uso_cfdi_adquisicion_mercancias", () => {
  const result = normalizeUsoCfdi("Adquisición de mercancías");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.key, "G01");
  return result.key;
});

check("uso_cfdi_g1_invalid_no_padding", () => {
  const result = normalizeUsoCfdi("G1");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "INVALID_FORMAT");
  assert.strictEqual(result.key, null);
  return result.errors[0];
});

check("forma_pago_transferencia", () => {
  const result = normalizeFormaPago("Transferencia electrónica de fondos");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.key, "03");
  return result.key;
});

check("forma_pago_no_inventa_tarjeta_transferencia", () => {
  const result = normalizeFormaPago("Tarjeta de transferencia");
  assert.strictEqual(result.ok, false);
  assert.ok(["NOT_FOUND", "NEEDS_CONFIRMATION"].includes(result.status));
  return result.status;
});

check("metodo_pago_pue_ppd", () => {
  assert.strictEqual(normalizeMetodoPago("Pago en una sola exhibición").key, "PUE");
  assert.strictEqual(normalizeMetodoPago("Pago en parcialidades o diferido").key, "PPD");
  return "PUE/PPD";
});

check("clave_unidad_pieza_y_servicio", () => {
  assert.strictEqual(normalizeClaveUnidad("Pieza").key, "H87");
  assert.strictEqual(normalizeClaveUnidad("Unidad de servicio").key, "E48");
  const ambiguous = normalizeClaveUnidad("Servicio");
  assert.strictEqual(ambiguous.ok, false);
  assert.strictEqual(ambiguous.status, "NEEDS_CONFIRMATION");
  return "H87/E48";
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");

const {
  explainUsoCfdiCompatibilityFailure,
  validateReceptorForCfdi,
} = require("./lib/cfdi-receptor-compatibility-validator");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

check("uso_cfdi_g1_is_invalid_and_not_silently_normalized", () => {
  const result = validateReceptorForCfdi({
    rfc: "ABC010203AB1",
    regimenFiscalReceptor: "601",
    usoCfdi: "G1",
    clientUid: "UID-PRESENT",
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.effective_uso_cfdi, "G1");
  assert(result.errors.includes("LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG"));
  const explanation = explainUsoCfdiCompatibilityFailure({
    rfc: "ABC010203AB1",
    regimenFiscalReceptor: "601",
    usoCfdi: "G1",
    clientUid: "UID-PRESENT",
  });
  assert(/UsoCFDI invalido: G1/.test(explanation));
  assert(/clave SAT completa/.test(explanation));
  return result.effective_uso_cfdi;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com UsoCFDI invalid diagnostic tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

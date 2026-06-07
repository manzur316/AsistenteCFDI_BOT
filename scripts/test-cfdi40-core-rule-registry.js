const assert = require("assert");
const { getCfdi40CoreRules, validateCfdi40CoreRuleRegistry } = require("./lib/cfdi-rules/cfdi-rule-registry");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("registry contiene reglas iniciales requeridas", () => {
  const rules = getCfdi40CoreRules();
  const ids = new Set(rules.map((rule) => rule.rule_id));
  for (const id of [
    "CFDI40_PAYMENT_PPD_REQUIRES_FORMA99",
    "CFDI40_OBJETOIMP_02_REQUIRES_CONCEPT_TAXES",
    "CFDI40_RECEPTOR_USO_CFDI_MATCHES_REGIMEN",
    "CFDI40_TASAOCUOTA_SIX_DECIMALS",
    "CFDI40_FOREIGN_GENERIC_RECEPTOR_RULE",
  ]) {
    assert(ids.has(id), id);
  }
  assert.strictEqual(rules.length, 12);
  return `${rules.length} rules`;
});

test("cada regla cumple contrato provider independent", () => {
  const validation = validateCfdi40CoreRuleRegistry();
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  assert(getCfdi40CoreRules().every((rule) => rule.provider_independent === true));
  return "valid";
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

const assert = require("assert");
const fs = require("fs");
const { evaluateConceptEligibility } = require("./lib/fiscal-activities/concept-eligibility-engine");

const rulesDoc = JSON.parse(fs.readFileSync("data/fiscal-activity-rules.example.json", "utf8"));
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("Activity eligibility devuelve conceptos sugeridos", () => {
  const result = evaluateConceptEligibility({
    tenant_activity_codes: ["TECH_CCTV_NETWORK_SERVICES"],
    concept: { familia: "CCTV", clave_prod_serv: "81111812" },
    message: "diagnostico tecnico CCTV",
  }, rulesDoc);
  assert.strictEqual(result.allowed, true);
  assert.strictEqual(result.suggested, true);
  assert.strictEqual(result.needs_review, true);
  assert(result.candidate_concepts.length > 0);
  return result.reason_codes.join(",");
});

test("Terminos bloqueados no son permitidos", () => {
  const result = evaluateConceptEligibility({
    tenant_activity_codes: ["TECH_CCTV_NETWORK_SERVICES"],
    concept: { familia: "CCTV", clave_prod_serv: "81111812" },
    message: "renta de equipo",
  }, rulesDoc);
  assert.strictEqual(result.blocked, true);
  assert(result.reason_codes.includes("BLOCKED_TERM_MATCH"));
  return result.blocked_matches.join(",");
});

test("Sin actividad configurada requiere revision", () => {
  const result = evaluateConceptEligibility({
    tenant_activity_codes: [],
    concept: { familia: "CCTV", clave_prod_serv: "81111812" },
  }, rulesDoc);
  assert.strictEqual(result.allowed, false);
  assert.strictEqual(result.needs_review, true);
  assert(result.reason_codes.includes("NO_ACTIVITY_RULE_MATCH"));
  return "needs_review";
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

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docPath = path.join(root, "docs", "FISCAL_ACTIVITY_RULES_ARCHITECTURE.md");
const examplePath = path.join(root, "data", "fiscal-activity-rules.example.json");
const catalogPath = path.join(root, "data", "concepts.normalized.json");
const checks = [];
const { assertFiscalActivityRulesDocument } = require("./lib/fiscal-activities/fiscal-activity-contract");

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

check("architecture_doc_exists_and_defines_terms", () => {
  const text = fs.readFileSync(docPath, "utf8");
  for (const term of ["FiscalActivity", "ConceptRule", "TenantActivityLink", "ConceptEligibility"]) {
    assert(text.includes(term), `${term} missing`);
  }
  assert(/No sustituye contador/i.test(text));
  assert(/revision humana/i.test(text));
  return "doc";
});

check("example_rules_are_non_productive_and_parseable", () => {
  const data = JSON.parse(fs.readFileSync(examplePath, "utf8"));
  assert.strictEqual(data.non_productive, true);
  assert.strictEqual(data.human_review_required, true);
  assert(Array.isArray(data.activities));
  assert(Array.isArray(data.concept_rules));
  assert(data.activities.some((activity) => activity.activity_code === "TECH_CCTV_NETWORK_SERVICES"));
  assert(data.concept_rules.some((rule) => rule.suggested_clave_unidad.includes("E48")));
  assert(data.global_blocked_terms.includes("renta de equipo"));
  const validation = assertFiscalActivityRulesDocument(data);
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return data.schema_version;
});

check("catalog_active_was_not_modified_by_foundation", () => {
  assert(fs.existsSync(catalogPath));
  const status = require("child_process").spawnSync("git", ["diff", "--name-only", "--", "data/concepts.normalized.json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.strictEqual(status.status, 0);
  assert.strictEqual(status.stdout.trim(), "");
  return "unchanged";
});

check("example_does_not_activate_real_concepts", () => {
  const text = fs.readFileSync(examplePath, "utf8");
  assert(!/"active"\s*:\s*true/i.test(text));
  assert(/Ejemplo no productivo|non_productive/i.test(text));
  return "safe";
});

console.log("Fiscal Activity Rules Foundation Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

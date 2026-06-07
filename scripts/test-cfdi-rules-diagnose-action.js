const assert = require("assert");
const { ACTIONS, runSandboxAction } = require("./lib/sandbox-action-runner");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("diagnose action esta allowlisted", async () => {
  assert(ACTIONS.includes("sandbox.cfdi.rules.diagnose"));
  return "allowlisted";
});

test("diagnose action devuelve fuentes, catalogos, reglas y tenant default", async () => {
  const result = await runSandboxAction("sandbox.cfdi.rules.diagnose", { writeResult: false, writeAudit: false });
  assert(["OK", "NEEDS_SOURCE"].includes(result.status), result.status);
  assert(result.output.source_registry);
  assert(result.output.catalogs);
  assert(result.output.rule_sets);
  assert(result.output.default_tenant_profile);
  assert.strictEqual(result.output.protected_files.concepts_normalized_touched, "NO");
  assert.strictEqual(result.output.human_review_required, true);
  return result.status;
});

(async () => {
  let pass = 0;
  for (const item of tests) {
    try {
      const detail = await item.fn();
      pass += 1;
      console.log(`PASS ${item.name}: ${detail}`);
    } catch (error) {
      console.error(`FAIL ${item.name}: ${error.message}`);
      process.exitCode = 1;
    }
  }
  console.log(`PASS total: ${pass}/${tests.length}`);
})();

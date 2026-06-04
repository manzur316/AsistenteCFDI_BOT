const assert = require("assert");
const {
  PAC_ADAPTER_METHODS,
  PAC_ENVIRONMENTS,
  PacAdapterContractError,
  assertPacAdapter,
  methodNameList,
  normalizeGenericPacError,
} = require("./lib/pac-adapter-contract");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function fakeAdapter(overrides = {}) {
  const adapter = {};
  for (const method of PAC_ADAPTER_METHODS) {
    adapter[method] = () => ({ ok: true, method });
  }
  return Object.assign(adapter, overrides);
}

check("contract_exports_required_methods", () => {
  assert.deepStrictEqual(PAC_ADAPTER_METHODS, [
    "createDraftPayload",
    "validatePayload",
    "stampSandbox",
    "downloadXml",
    "downloadPdf",
    "getStatus",
    "normalizeError",
  ]);
  return PAC_ADAPTER_METHODS.join(",");
});

check("contract_defines_sandbox_and_production_labels", () => {
  assert.strictEqual(PAC_ENVIRONMENTS.SANDBOX, "SANDBOX");
  assert.strictEqual(PAC_ENVIRONMENTS.PRODUCTION, "PRODUCTION");
  return "SANDBOX/PRODUCTION labels only";
});

check("assertPacAdapter_accepts_complete_adapter", () => {
  const result = assertPacAdapter(fakeAdapter(), { adapterName: "FakeAdapter" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.adapterName, "FakeAdapter");
  assert.deepStrictEqual(result.methods, PAC_ADAPTER_METHODS);
  return `${result.methods.length} methods`;
});

check("assertPacAdapter_rejects_missing_method", () => {
  const adapter = fakeAdapter();
  delete adapter.downloadPdf;
  assert.throws(
    () => assertPacAdapter(adapter, { adapterName: "BrokenAdapter" }),
    (error) => {
      assert(error instanceof PacAdapterContractError);
      assert(error.details.missing_methods.includes("downloadPdf"));
      return true;
    },
  );
  return "missing downloadPdf rejected";
});

check("methodNameList_filters_functions_only", () => {
  const adapter = fakeAdapter({ downloadXml: "not-a-function" });
  const methods = methodNameList(adapter);
  assert(!methods.includes("downloadXml"));
  assert(methods.includes("downloadPdf"));
  return methods.length;
});

check("normalizeGenericPacError_returns_stable_shape", () => {
  const normalized = normalizeGenericPacError(
    {
      code: "HTTP_400",
      message: "Payload invalido",
      response: { status: 400, statusText: "Bad Request", data: { detail: "demo" } },
    },
    { provider: "PAC_DEMO", environment: PAC_ENVIRONMENTS.SANDBOX },
  );
  assert.strictEqual(normalized.ok, false);
  assert.strictEqual(normalized.provider, "PAC_DEMO");
  assert.strictEqual(normalized.environment, "SANDBOX");
  assert.strictEqual(normalized.code, "HTTP_400");
  assert.strictEqual(normalized.http_status, 400);
  assert.deepStrictEqual(normalized.raw, { detail: "demo" });
  return normalized.code;
});

console.log("PAC Adapter Contract Tests");
for (const item of checks) {
  printCheck(item.name, item.pass, item.value);
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

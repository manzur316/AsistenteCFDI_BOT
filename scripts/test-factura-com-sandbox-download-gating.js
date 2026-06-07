const assert = require("assert");
const path = require("path");

const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function liveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    ...overrides,
  };
}

check("mock_mode_does_not_call_network", async () => {
  let called = false;
  const adapter = new FacturaComSandboxAdapter();
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUID716" }, {
    requestFn: async () => {
      called = true;
      throw new Error("network should not be called");
    },
  });
  assert.strictEqual(called, false);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  return result.normalized_errors[0].code;
});

check("live_requires_live_flag", async () => {
  const env = liveEnv({ FACTURACOM_SANDBOX_LIVE: "0" });
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUID716" }, {
    env,
    storageDir: path.join(root, "runtime", "test-download-gating"),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  return result.normalized_errors[0].code;
});

check("production_url_is_blocked", async () => {
  const env = liveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com" });
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.downloadPdf({ cfdi_uid: "CFDIUID716" }, {
    env,
    storageDir: path.join(root, "runtime", "test-download-gating"),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  const raw = JSON.stringify(result);
  assert(!/https:\/\/api\.factura\.com/.test(raw));
  return result.normalized_errors[0].code;
});

check("missing_identity_returns_needs_runtime", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.downloadXml({}, {
    env,
    storageDir: path.join(root, "runtime", "test-download-gating"),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_XML_IDENTITY_REQUIRED");
  return result.status;
});

check("storage_outside_runtime_is_blocked", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.downloadXml({ cfdi_uid: "CFDIUID716" }, {
    env,
    storageDir: root,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_XML_STORAGE_INVALID");
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Download Gating Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

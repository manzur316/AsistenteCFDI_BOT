const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  resolveFacturaComSandboxConfig,
  safeFacturaComSandboxConfig,
} = require("./lib/facturacom-sandbox-config-resolver");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-sandbox-config-resolver");
const localEnvPath = path.join(tempRoot, ".env.pac.sandbox.local");
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

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function completeEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "APIKEY_SUPER_SECRET_123",
    FACTURACOM_SECRET_KEY: "SECRET_SUPER_SECRET_123",
    FACTURACOM_PLUGIN: "PLUGIN_SUPER_SECRET_123",
    FACTURACOM_SANDBOX_RECEIVER_UID: "CLIENTUID_PRIVATE_123",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    ...overrides,
  };
}

function writeLocalEnv(env) {
  fs.mkdirSync(path.dirname(localEnvPath), { recursive: true });
  fs.writeFileSync(localEnvPath, Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", "utf8");
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert(!/APIKEY_SUPER_SECRET_123|SECRET_SUPER_SECRET_123|PLUGIN_SUPER_SECRET_123|CLIENTUID_PRIVATE_123/.test(text), "secret leaked");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path leaked");
}

check("process_env_complete_resolves_ok", () => {
  cleanTemp();
  const result = resolveFacturaComSandboxConfig({ env: completeEnv(), localEnvPath, loadLocalEnv: false });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.config_source, "process.env");
  assert.strictEqual(result.resolved_env.FACTURACOM_API_KEY, "APIKEY_SUPER_SECRET_123");
  assertNoSecrets(safeFacturaComSandboxConfig(result));
  return result.config_source;
});

check("local_env_file_resolves_when_process_env_empty", () => {
  cleanTemp();
  writeLocalEnv(completeEnv());
  const result = resolveFacturaComSandboxConfig({ env: {}, localEnvPath });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.config_source, ".env.pac.sandbox.local");
  assert.strictEqual(result.local_env_file_present, true);
  assertNoSecrets(safeFacturaComSandboxConfig(result));
  return result.config_source;
});

check("missing_local_env_returns_needs_config", () => {
  cleanTemp();
  const result = resolveFacturaComSandboxConfig({ env: {}, localEnvPath });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.missing.includes("FACTURACOM_SANDBOX_MODE_REQUIRED"));
  assert(result.missing.includes("FACTURACOM_SANDBOX_API_KEY_REQUIRED"));
  return result.missing.length;
});

check("mock_mode_requires_live", () => {
  const result = resolveFacturaComSandboxConfig({ env: completeEnv({ FACTURACOM_SANDBOX_MODE: "mock" }), localEnvPath, loadLocalEnv: false });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.missing.includes("FACTURACOM_SANDBOX_MODE_REQUIRED"));
  return result.missing.join("|");
});

check("live_flag_zero_requires_live_enabled", () => {
  const result = resolveFacturaComSandboxConfig({ env: completeEnv({ FACTURACOM_SANDBOX_LIVE: "0" }), localEnvPath, loadLocalEnv: false });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.missing.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED"));
  return result.missing.join("|");
});

check("production_base_url_is_blocked", () => {
  const result = resolveFacturaComSandboxConfig({ env: completeEnv({ FACTURACOM_BASE_URL: "https://api.factura.com" }), localEnvPath, loadLocalEnv: false });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.missing.includes("FACTURACOM_SANDBOX_BASE_URL_REQUIRED"));
  assert(result.missing.includes("FACTURACOM_SANDBOX_PRODUCTION_URL_BLOCKED"));
  assert.strictEqual(result.production_blocked, false);
  assertNoSecrets(safeFacturaComSandboxConfig(result));
  return "blocked";
});

check("aliases_resolve_to_canonical_env", () => {
  const result = resolveFacturaComSandboxConfig({
    env: completeEnv({
      FACTURACOM_BASE_URL: "",
      FACTURACOM_API_KEY: "",
      FACTURACOM_SECRET_KEY: "",
      FACTURACOM_PLUGIN: "",
      FACTURACOM_SANDBOX_BASE_URL: "https://sandbox.factura.com/api/",
      FACTURACOM_SANDBOX_API_KEY: "APIKEY_SUPER_SECRET_123",
      FACTURACOM_SANDBOX_SECRET_KEY: "SECRET_SUPER_SECRET_123",
      FACTURACOM_SANDBOX_PLUGIN: "PLUGIN_SUPER_SECRET_123",
    }),
    localEnvPath,
    loadLocalEnv: false,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.resolved_env.FACTURACOM_BASE_URL, "https://sandbox.factura.com/api");
  assert.strictEqual(result.resolved_env.FACTURACOM_API_KEY, "APIKEY_SUPER_SECRET_123");
  return result.resolved_env.FACTURACOM_BASE_URL;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Config Resolver Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const {
  assertFacturaComSandboxEnv,
  buildFacturaComHeaders,
  sanitizeFacturaComError,
  sanitizeFacturaComResponse,
  sanitizeValue,
} = require("./lib/factura-com-live-client");
const { buildSmokeConfig } = require("./smoke-factura-com-sandbox");
const { analyze } = require("./analyze-factura-com-sandbox-results");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-sandbox-smoke-safety");

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

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function validLiveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "LOCAL_FAKE_API_KEY_1234567890",
    FACTURACOM_SECRET_KEY: "LOCAL_FAKE_SECRET_KEY_1234567890",
    FACTURACOM_PLUGIN: "LOCAL_FAKE_PLUGIN_1234567890",
    FACTURACOM_SANDBOX_SERIE: "SERIE-DEMO",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "00000",
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "0",
    FACTURACOM_SANDBOX_CANCEL_TEST: "0",
    FACTURACOM_SANDBOX_DOWNLOAD_TEST: "0",
    FACTURACOM_SANDBOX_BATCH_SIZE: "1",
    ...overrides,
  };
}

function runNode(args, env = {}) {
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function assertNoSecret(value, secret) {
  const serialized = JSON.stringify(value);
  assert(!serialized.includes(secret), `secret leaked: ${secret}`);
}

cleanTemp();

check("smoke_sin_live_sale_0_y_no_escribe_runtime", () => {
  const runtimeDir = path.join(tempRoot, "no-live");
  const result = runNode(["scripts/smoke-factura-com-sandbox.js"], {
    FACTURACOM_SANDBOX_LIVE: "0",
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert(result.stdout.includes("SKIPPED: live disabled"), result.stdout);
  assert(!fs.existsSync(runtimeDir), "runtime no-live no debe crearse");
  return "SKIPPED";
});

check("env_sin_api_key_falla_preflight_live", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_API_KEY: "" })), /FACTURACOM_API_KEY/);
  return "preflight";
});

check("base_url_produccion_bloqueada", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com" })), /Produccion|sandbox/);
  return "production blocked";
});

check("base_url_no_sandbox_bloqueada", () => {
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://example.com/api" })), /sandbox\.factura\.com/);
  assert.throws(() => assertFacturaComSandboxEnv(validLiveEnv({ FACTURACOM_BASE_URL: "https://sandbox.factura.com.evil.test/api" })), /sandbox\.factura\.com/);
  return "non-sandbox blocked";
});

check("headers_se_construyen_y_sanitizan", () => {
  const env = validLiveEnv();
  const headers = buildFacturaComHeaders(env);
  assert.strictEqual(headers["F-Api-Key"], env.FACTURACOM_API_KEY);
  const sanitized = sanitizeValue({ headers }, env);
  assert.strictEqual(sanitized.headers["F-Api-Key"], "[REDACTED]");
  assert.strictEqual(sanitized.headers["F-Secret-Key"], "[REDACTED]");
  assert.strictEqual(sanitized.headers["F-PLUGIN"], "[REDACTED]");
  assertNoSecret(sanitized, env.FACTURACOM_API_KEY);
  assertNoSecret(sanitized, env.FACTURACOM_SECRET_KEY);
  assertNoSecret(sanitized, env.FACTURACOM_PLUGIN);
  return "redacted";
});

check("request_response_error_sanitizados", () => {
  const env = validLiveEnv();
  const response = sanitizeFacturaComResponse({
    headers: { "F-Api-Key": env.FACTURACOM_API_KEY },
    data: { RFC: "AAA010101AAA", message: `bad ${env.FACTURACOM_SECRET_KEY}` },
  }, env);
  const error = sanitizeFacturaComError(new Error(`plugin ${env.FACTURACOM_PLUGIN} rfc AAA010101AAA`), env);
  assertNoSecret(response, env.FACTURACOM_API_KEY);
  assertNoSecret(response, env.FACTURACOM_SECRET_KEY);
  assertNoSecret(error, env.FACTURACOM_PLUGIN);
  assert(JSON.stringify(response).includes("[REDACTED_RFC]"));
  assert(JSON.stringify(error).includes("[REDACTED_RFC]"));
  return "clean";
});

check("smoke_no_escribe_fuera_de_runtime", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "smoke-factura-com-sandbox.js"), "utf8");
  assert(source.includes("ensureRuntimeDir"));
  assert(source.includes("isInside"));
  assert(!/writeFileSync\([^)]*data[\\/]/i.test(source));
  assert(!/writeFileSync\([^)]*workflow[\\/]/i.test(source));
  return "runtime guarded";
});

check("analyzer_detecta_secretos_simulados", () => {
  const runtimeDir = path.join(tempRoot, "secret-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    artifacts: [{ path: path.relative(root, path.join(runtimeDir, "bad.json")).replace(/\\/g, "/") }],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), { total_attempts: 0, warnings: [] });
  fs.writeFileSync(path.join(runtimeDir, "bad.json"), '{"F-Api-Key":"REALSECRET1234567890"}', "utf8");
  const result = runNode(["scripts/analyze-factura-com-sandbox-results.js", runtimeDir]);
  assert.notStrictEqual(result.status, 0, "analyzer debe fallar con secreto");
  assert(result.stdout.includes("Sensitive findings") || result.stderr.includes("ERROR"));
  return "detected";
});

check("analyzer_acepta_manifest_limpio", () => {
  const runtimeDir = path.join(tempRoot, "clean-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 0,
    successful: 0,
    errors: 0,
    needs_local_config: 0,
    xml_downloaded: 0,
    pdf_downloaded: 0,
    cancel_ok: 0,
    cancel_error: 0,
    sandbox_uuids: [],
    warnings: [],
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.sensitive_findings.length, 0);
  const cli = runNode(["scripts/analyze-factura-com-sandbox-results.js", runtimeDir]);
  assert.strictEqual(cli.status, 0, cli.stderr);
  return "clean";
});

check("download_y_cancel_apagados_por_default", () => {
  const config = buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0" });
  assert.strictEqual(config.downloadTest, false);
  assert.strictEqual(config.cancelTest, false);
  assert.strictEqual(config.createClients, false);
  assert.strictEqual(config.batchSize, 1);
  return "defaults off";
});

check("batch_size_solo_1_o_5", () => {
  assert.strictEqual(buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0", FACTURACOM_SANDBOX_BATCH_SIZE: "5" }).batchSize, 5);
  assert.strictEqual(buildSmokeConfig({ FACTURACOM_SANDBOX_LIVE: "0", FACTURACOM_SANDBOX_BATCH_SIZE: "999" }).batchSize, 1);
  return "1|5";
});

check("workflows_y_catalogo_no_modificados", () => {
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ];
  const forbidden = changed.filter((file) => file.startsWith("workflow/") || file === "data/concepts.normalized.json");
  assert.strictEqual(forbidden.length, 0, forbidden.join(", "));
  return "protected clean";
});

check("live_no_se_ejecuta_en_tests", () => {
  assert.notStrictEqual(process.env.FACTURACOM_SANDBOX_LIVE, "1");
  return "no live";
});

console.log("Factura.com Sandbox Smoke Safety Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

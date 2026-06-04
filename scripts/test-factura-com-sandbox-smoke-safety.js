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
const {
  buildSmokeConfig,
  extractUid,
  findClientUidInResponse,
  runSmoke,
} = require("./smoke-factura-com-sandbox");
const { analyze } = require("./analyze-factura-com-sandbox-results");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-facturacom-sandbox-smoke-safety");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
const asyncChecks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function checkAsync(name, fn) {
  asyncChecks.push({ name, fn });
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

check("analyzer_reporta_uid_map_y_contadores_cliente", () => {
  const runtimeDir = path.join(tempRoot, "uid-map-runtime");
  writeJson(path.join(runtimeDir, "manifest.json"), {
    schema_version: "facturacom_sandbox_smoke.v1",
    live: true,
    base_url: "https://sandbox.factura.com/api",
    artifacts: [],
    attempts: [],
  });
  writeJson(path.join(runtimeDir, "summary.json"), {
    total_attempts: 1,
    successful: 1,
    errors: 0,
    clients_created: 1,
    client_uids_found: 1,
    client_uid_missing: 0,
    ambiguous_clients: 0,
    sandbox_uuids: [],
    warnings: [],
  });
  writeJson(path.join(runtimeDir, "client-uids.local.json"), {
    "CLIENT-DEMO-PF-GENERIC": "UID-DEMO-CLIENT",
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.clients_created, 1);
  assert.strictEqual(result.client_uids_found, 1);
  assert.strictEqual(result.client_uid_missing, 0);
  assert.strictEqual(result.ambiguous_clients, 0);
  assert.strictEqual(result.client_uid_map_exists, true);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return "uid map";
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

check("extract_uid_soporta_formas_facturacom", () => {
  const cases = [
    [{ UID: "UID-ROOT" }, "UID-ROOT"],
    [{ uid: "UID-LOWER" }, "UID-LOWER"],
    [{ Uid: "UID-MIXED" }, "UID-MIXED"],
    [{ data: { UID: "UID-DATA" } }, "UID-DATA"],
    [{ Data: { UID: "UID-DATA-UPPER" } }, "UID-DATA-UPPER"],
    [{ data: { uid: "UID-DATA-LOWER" } }, "UID-DATA-LOWER"],
    [{ Data: { uid: "UID-DATA-UPPER-LOWER" } }, "UID-DATA-UPPER-LOWER"],
    [{ data: { Data: { UID: "UID-NESTED-DATA" } } }, "UID-NESTED-DATA"],
    [{ data: { data: { UID: "UID-NESTED-LOWER" } } }, "UID-NESTED-LOWER"],
    [{ data: { data: [{ UID: "UID-ARRAY", rfc: "XAXX010101000" }] } }, "UID-ARRAY"],
    [{ data: { response: { UID: "UID-RESPONSE" } } }, "UID-RESPONSE"],
    [{ response: { UID: "UID-ROOT-RESPONSE" } }, "UID-ROOT-RESPONSE"],
    [{ ok: true, data: { data: [{ nested: { UID: "UID-DEEP" } }] } }, "UID-DEEP"],
  ];
  for (const [shape, expected] of cases) {
    assert.strictEqual(extractUid(shape), expected, JSON.stringify(shape));
  }
  return `${cases.length} shapes`;
});

check("find_client_uid_elige_por_rfc_client_id_y_nombre", () => {
  const expectedClient = {
    client_id: "CLIENT-DEMO-PF-GENERIC",
    rfc: "XAXX010101000",
    legal_name: "PERSONA FISICA GENERICA DEMO",
  };
  const response = {
    data: [
      { UID: "UID-OTHER", rfc: "AAA010101AAA", client_id: "OTHER" },
      { UID: "UID-EXPECTED", rfc: "XAXX010101000", client_id: "CLIENT-DEMO-PF-GENERIC", razons: "PERSONA FISICA GENERICA DEMO" },
    ],
  };
  assert.deepStrictEqual(findClientUidInResponse(response, expectedClient), { uid: "UID-EXPECTED", reason: "found" });
  return "found";
});

check("find_client_uid_detecta_rfc_ambiguo", () => {
  const expectedClient = {
    client_id: "CLIENT-DEMO-PF-GENERIC",
    rfc: "XAXX010101000",
    legal_name: "PERSONA FISICA GENERICA DEMO",
  };
  const response = {
    data: [
      { UID: "UID-A", rfc: "XAXX010101000" },
      { UID: "UID-B", rfc: "XAXX010101000" },
    ],
  };
  assert.deepStrictEqual(findClientUidInResponse(response, expectedClient), { uid: null, reason: "ambiguous_client_uid" });
  return "ambiguous";
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

checkAsync("create_ok_sin_uid_hace_lookup_y_continua_cfdi", async () => {
  const runtimeDir = path.join(tempRoot, "fallback-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "1",
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    if (method === "POST" && requestPath === "/v1/clients/create") {
      return { ok: true, status: 200, data: { message: "cliente creado sin uid" } };
    }
    if (method === "GET" && requestPath === "/v1/clients/XAXX010101000") {
      return {
        ok: true,
        status: 200,
        data: {
          data: [{
            UID: "UID-CLIENT-LOOKUP",
            rfc: "XAXX010101000",
            client_id: "CLIENT-DEMO-PF-GENERIC",
            razons: "PERSONA FISICA GENERICA DEMO",
          }],
        },
      };
    }
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { Data: { UID: "UID-CFDI-001", UUID: "00000000-0000-4000-8000-000000000777" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/UID-CFDI-001") {
      return { ok: true, status: 200, data: { Data: { UID: "UID-CFDI-001" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  assert.strictEqual(result.summary.successful, 1);
  assert(calls.some((call) => call.method === "POST" && call.path === "/v1/clients/create"), "debe crear cliente");
  assert(calls.some((call) => call.method === "GET" && call.path === "/v1/clients/XAXX010101000"), "debe hacer lookup por RFC");
  assert(calls.some((call) => call.method === "POST" && call.path === "/v4/cfdi40/create"), "debe continuar CFDI tras UID");
  const uidMapPath = path.join(runtimeDir, "client-uids.local.json");
  assert(fs.existsSync(uidMapPath), "debe persistir client-uids.local.json en runtime");
  const uidMap = JSON.parse(fs.readFileSync(uidMapPath, "utf8"));
  assert.strictEqual(uidMap["CLIENT-DEMO-PF-GENERIC"], "UID-CLIENT-LOOKUP");
  const gitChanged = git(["status", "--short", "runtime/client-uids.local.json"]);
  assert.strictEqual(gitChanged.length, 0, "client-uids.local.json raiz no debe versionarse");
  return "lookup ok";
});

checkAsync("uid_missing_no_intenta_cfdi", async () => {
  const runtimeDir = path.join(tempRoot, "missing-uid-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "1",
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    if (method === "POST" && requestPath === "/v1/clients/create") {
      return { ok: true, status: 200, data: { message: "created_without_uid" } };
    }
    if (method === "GET" && requestPath.startsWith("/v1/clients")) {
      return { ok: true, status: 200, data: { data: [] } };
    }
    throw new Error(`CFDI no debe ejecutarse: ${method} ${requestPath}`);
  };

  const result = await runSmoke(env, { requestFn });
  assert.strictEqual(result.summary.successful, 0);
  assert.strictEqual(result.summary.client_uid_missing, 1);
  assert.strictEqual(result.manifest.attempts[0].status, "CLIENT_UID_MISSING");
  assert(!calls.some((call) => call.path === "/v4/cfdi40/create"), "no debe intentar CFDI sin UID");
  assert(!fs.existsSync(path.join(runtimeDir, "client-uids.local.json")), "no debe persistir UID faltante");
  return "blocked before cfdi";
});

(async () => {
  for (const item of asyncChecks) {
    try {
      const value = await item.fn();
      checks.push({ name: item.name, pass: true, value: value === undefined ? "" : String(value) });
    } catch (error) {
      checks.push({ name: item.name, pass: false, value: error.message });
    }
  }

  console.log("Factura.com Sandbox Smoke Safety Tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();

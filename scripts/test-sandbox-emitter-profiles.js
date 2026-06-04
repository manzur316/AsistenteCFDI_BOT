const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SANDBOX_EMITTER_PROFILES_PATH,
  applyEmitterProfileToFacturaComConfig,
  buildSafeEmitterProfileReport,
  getSandboxEmitterProfile,
  loadSandboxEmitterProfiles,
  validateSandboxEmitterProfile,
} = require("./lib/sandbox-emitter-profile-loader");
const { runSmoke } = require("./smoke-factura-com-sandbox");
const { analyze } = require("./analyze-factura-com-sandbox-results");
const { inspectRuntime } = require("./inspect-facturacom-sandbox-response-shape");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-emitter-profiles");
const samplePfRfc = ["XAMA", "620210", "DQ5"].join("");
const checks = [];
const asyncChecks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

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

function validLiveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "LOCAL_FAKE_API_KEY_1234567890",
    FACTURACOM_SECRET_KEY: "LOCAL_FAKE_SECRET_KEY_1234567890",
    FACTURACOM_PLUGIN: "LOCAL_FAKE_PLUGIN_1234567890",
    FACTURACOM_SANDBOX_SERIE: "SERIE-DEMO",
    FACTURACOM_SANDBOX_EMITTER_PROFILE_ID: "EMITTER_XAMA_612_DEMO",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "00000",
    FACTURACOM_SANDBOX_EMITTER_REGIMEN_FISCAL: "626",
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "0",
    FACTURACOM_SANDBOX_CANCEL_TEST: "0",
    FACTURACOM_SANDBOX_DOWNLOAD_TEST: "0",
    FACTURACOM_SANDBOX_BATCH_SIZE: "1",
    FACTURACOM_SKIP_AUTH_PREFLIGHT: "1",
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
    ...overrides,
  };
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

cleanTemp();

const loaded = loadSandboxEmitterProfiles();

check("emitter_profiles_file_exists", () => {
  assert(fs.existsSync(DEFAULT_SANDBOX_EMITTER_PROFILES_PATH));
  return path.relative(root, DEFAULT_SANDBOX_EMITTER_PROFILES_PATH);
});

check("emitter_xama_612_demo_valid", () => {
  const validation = loaded.validations.EMITTER_XAMA_612_DEMO;
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  assert.strictEqual(validation.rfc_shape, "PF");
  assert.strictEqual(validation.normalized_rfc_length, 13);
  assert.strictEqual(validation.regimenFiscal, "612");
  assert.strictEqual(validation.lugarExpedicion, "01219");
  return `${validation.rfc_shape}/${validation.regimenFiscal}/${validation.lugarExpedicion}`;
});

check("resico_real_blocked_not_allowed_for_smoke", () => {
  const validation = loaded.validations.EMITTER_RESICO_626_REAL_BLOCKED_FOR_SANDBOX;
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_EMITTER_PROFILE_NOT_ALLOWED_FOR_SMOKE"));
  return validation.errors.join(",");
});

check("lugar_expedicion_00000_fails", () => {
  const validation = validateSandboxEmitterProfile({
    profile_id: "BAD_LUGAR",
    rfc: samplePfRfc,
    legal_name: "ALBA XKARAJAM MENDEZ",
    regimenFiscal: "612",
    lugarExpedicion: "00000",
    expected_csd_rfc: samplePfRfc,
    allowedForSmoke: true,
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_EMITTER_LUGAR_EXPEDICION_INVALID"));
  return validation.errors.join(",");
});

check("expected_csd_rfc_distinto_fails", () => {
  const validation = validateSandboxEmitterProfile({
    profile_id: "BAD_CSD",
    rfc: samplePfRfc,
    legal_name: "ALBA XKARAJAM MENDEZ",
    regimenFiscal: "612",
    lugarExpedicion: "01219",
    expected_csd_rfc: "AAA010101AAA",
    allowedForSmoke: true,
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_EMITTER_CSD_RFC_MISMATCH"));
  return validation.errors.join(",");
});

check("safe_report_no_rfc_completo", () => {
  const report = buildSafeEmitterProfileReport(loaded.byId.get("EMITTER_XAMA_612_DEMO"));
  assert.strictEqual(report.ok, true);
  assert(!JSON.stringify(report).includes(samplePfRfc));
  assert.strictEqual(report.rfc_shape, "PF");
  return report.profile_id;
});

check("apply_profile_overrides_env_defaults", () => {
  const { profile } = getSandboxEmitterProfile("EMITTER_XAMA_612_DEMO", { loadedProfiles: loaded });
  const applied = applyEmitterProfileToFacturaComConfig({
    emitterRegimenFiscal: "626",
    lugarExpedicion: "00000",
  }, profile);
  assert.strictEqual(applied.emitterRegimenFiscal, "612");
  assert.strictEqual(applied.lugarExpedicion, "01219");
  return `${applied.emitterRegimenFiscal}/${applied.lugarExpedicion}`;
});

check("profile_no_credentials_or_csd_files", () => {
  const raw = fs.readFileSync(DEFAULT_SANDBOX_EMITTER_PROFILES_PATH, "utf8");
  assert(!/api[_-]?key|secret|token|password|\.cer\b|\.key\b|BEGIN PRIVATE KEY/i.test(raw));
  return "clean";
});

checkAsync("smoke_usa_emitter_profile_xama_612_01219", async () => {
  const runtimeDir = path.join(tempRoot, "smoke-profile-runtime");
  const calls = [];
  const result = await runSmoke(validLiveEnv({ FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir }), {
    requestFn: async ({ method, path: requestPath, body }) => {
      calls.push({ method, path: requestPath, body });
      if (method === "POST" && requestPath === "/v4/cfdi40/create") {
        return { ok: true, status: 200, data: { response: "success", Data: { UID: "CFDI-UID-EMITTER-PASS" } } };
      }
      if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-EMITTER-PASS") {
        return { ok: true, status: 200, data: { response: "success", Data: { UID: "CFDI-UID-EMITTER-PASS" } } };
      }
      throw new Error(`unexpected request: ${method} ${requestPath}`);
    },
  });
  const cfdiCall = calls.find((call) => call.path === "/v4/cfdi40/create");
  assert(cfdiCall, "debe llamar CFDI create");
  assert.strictEqual(cfdiCall.body.RegimenFiscal, "612");
  assert.strictEqual(cfdiCall.body.LugarExpedicion, "01219");
  assert.notStrictEqual(cfdiCall.body.RegimenFiscal, "626");
  assert.strictEqual(result.summary.active_sandbox_emitter_profile_id, "EMITTER_XAMA_612_DEMO");
  assert.strictEqual(result.summary.effective_emitter_regimen, "612");
  assert.strictEqual(result.summary.effective_lugar_expedicion, "01219");
  return `${cfdiCall.body.RegimenFiscal}/${cfdiCall.body.LugarExpedicion}`;
});

checkAsync("smoke_blocked_emitter_profile_no_crea_cliente_ni_cfdi", async () => {
  const runtimeDir = path.join(tempRoot, "blocked-emitter-runtime");
  const calls = [];
  const result = await runSmoke(validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_EMITTER_PROFILE_ID: "EMITTER_RESICO_626_REAL_BLOCKED_FOR_SANDBOX",
    FACTURACOM_SANDBOX_CREATE_CLIENTS: "1",
  }), {
    requestFn: async ({ method, path: requestPath }) => {
      calls.push({ method, path: requestPath });
      throw new Error(`no debe llamar PAC: ${method} ${requestPath}`);
    },
  });
  assert.strictEqual(result.summary.sandbox_emitter_profile_errors, 1);
  assert.strictEqual(result.summary.total_attempts, 0);
  assert.strictEqual(calls.length, 0);
  assert(result.manifest.artifacts.some((artifact) => artifact.type === "LOCAL_INVALID_SANDBOX_EMITTER_PROFILE"));
  return "blocked";
});

checkAsync("error_303_clasifica_emitter_csd_rfc_mismatch", async () => {
  const runtimeDir = path.join(tempRoot, "error-303-runtime");
  await runSmoke(validLiveEnv({ FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir }), {
    requestFn: async ({ method, path: requestPath }) => {
      if (method === "POST" && requestPath === "/v4/cfdi40/create") {
        return {
          ok: true,
          status: 200,
          data: {
            response: "error",
            message: {
              message: "303 - El RFC del CSD del Emisor no corresponde al RFC que viene como Emisor en el Comprobante.",
              messageDetail: "El RFC registrado en el certificado debe ser igual al registrado en el emisor del CFDI",
              status: "error",
            },
          },
        };
      }
      throw new Error(`unexpected request: ${method} ${requestPath}`);
    },
  });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.emitter_csd_rfc_mismatch_detected > 0, true);
  assert.strictEqual(result.pac_error_303_detected > 0, true);
  assert(result.api_error_classifications_detected.includes("EMITTER_CSD_RFC_MISMATCH"));
  const output = inspectRuntime(runtimeDir);
  assert(output.includes("Active sandbox emitter profile: EMITTER_XAMA_612_DEMO"));
  assert(output.includes("Effective emitter RegimenFiscal: 612"));
  assert(output.includes("Effective LugarExpedicion: 01219"));
  assert(!output.includes(samplePfRfc));
  return "EMITTER_CSD_RFC_MISMATCH";
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

  console.log("Sandbox Emitter Profiles Tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();

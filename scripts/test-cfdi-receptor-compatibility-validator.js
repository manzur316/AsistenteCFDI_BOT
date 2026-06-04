const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  explainUsoCfdiCompatibilityFailure,
  loadCompatibilityIndex,
  normalizeRfc,
  inferPersonTypeFromRfc,
  validateReceptorForCfdi,
  validateRfcShape,
  validateUsoCfdiRegimenCompatibility,
} = require("./lib/cfdi-receptor-compatibility-validator");
const { runSmoke } = require("./smoke-factura-com-sandbox");
const { analyze } = require("./analyze-factura-com-sandbox-results");
const { inspectRuntime } = require("./inspect-facturacom-sandbox-response-shape");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-cfdi-receptor-compatibility-validator");
const samplePfRfc = ["XAMA", "620210", "DQ5"].join("");
const sampleInvalidRfc = `${samplePfRfc}Z`;
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

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
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
    FACTURACOM_SKIP_AUTH_PREFLIGHT: "1",
    ...overrides,
  };
}

cleanTemp();

check("xama_normaliza_a_pf_len_13", () => {
  const rfc = normalizeRfc(samplePfRfc);
  assert.strictEqual(rfc, samplePfRfc);
  assert.strictEqual(inferPersonTypeFromRfc(rfc), "PF");
  const validation = validateRfcShape(rfc);
  assert.strictEqual(validation.ok, true);
  assert.strictEqual(validation.normalized_rfc_length, 13);
  return `${validation.rfc_shape}/${validation.normalized_rfc_length}`;
});

check("xama_trailing_space_advierte_sin_exponer", () => {
  const validation = validateRfcShape(`${samplePfRfc} `);
  assert.strictEqual(validation.ok, true);
  assert(validation.warnings.includes("LOCAL_RFC_HAS_HIDDEN_CHARACTERS"));
  assert.strictEqual(validation.normalized_rfc_length, 13);
  assert(!JSON.stringify(validation).includes(samplePfRfc));
  return validation.warnings.join(",");
});

check("rfc_len_14_invalido_si_no_es_normalizable", () => {
  const validation = validateRfcShape(sampleInvalidRfc);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("LOCAL_INVALID_RFC_SHAPE"));
  assert.strictEqual(validation.normalized_rfc_length, 14);
  return validation.errors.join(",");
});

check("regimen_612_g03_pf_pasa_si_catalogo_lo_permite", () => {
  const validation = validateUsoCfdiRegimenCompatibility({
    usoCfdi: "G03",
    regimenFiscalReceptor: "612",
    personType: "PF",
  });
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  return validation.catalog_entry.descripcion;
});

check("regimen_612_s01_respeta_catalogo_local", () => {
  const catalog = loadCompatibilityIndex().byUso.get("S01");
  const expectedAllowed = catalog.regimenes_allowed.includes("612") && catalog.persona_fisica_allowed === true;
  const validation = validateUsoCfdiRegimenCompatibility({
    usoCfdi: "S01",
    regimenFiscalReceptor: "612",
    personType: "PF",
  });
  assert.strictEqual(validation.ok, expectedAllowed);
  return expectedAllowed ? "catalog_allows_612_s01" : "catalog_blocks_612_s01";
});

check("regimen_616_s01_pasa", () => {
  const validation = validateUsoCfdiRegimenCompatibility({
    usoCfdi: "S01",
    regimenFiscalReceptor: "616",
    personType: "PF",
  });
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  return "S01/616";
});

check("uso_vacio_falla", () => {
  const validation = validateUsoCfdiRegimenCompatibility({
    usoCfdi: "",
    regimenFiscalReceptor: "612",
    personType: "PF",
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("LOCAL_USO_CFDI_REQUIRED"));
  return validation.errors.join(",");
});

check("regimen_vacio_falla", () => {
  const validation = validateUsoCfdiRegimenCompatibility({
    usoCfdi: "G03",
    regimenFiscalReceptor: "",
    personType: "PF",
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("LOCAL_REGIMEN_FISCAL_RECEPTOR_REQUIRED"));
  return validation.errors.join(",");
});

check("client_uid_vacio_falla", () => {
  const validation = validateReceptorForCfdi({
    rfc: samplePfRfc,
    regimenFiscalReceptor: "612",
    usoCfdi: "G03",
    clientUid: "",
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("LOCAL_RECEPTOR_UID_REQUIRED"));
  return validation.errors.join(",");
});

check("explicacion_no_imprime_rfc_completo", () => {
  const explanation = explainUsoCfdiCompatibilityFailure({
    rfc: sampleInvalidRfc,
    regimenFiscalReceptor: "612",
    usoCfdi: "G03",
    clientUid: "UID-DEMO",
  });
  assert(!explanation.includes(sampleInvalidRfc), explanation);
  assert(explanation.includes("forma invalida"));
  return explanation;
});

checkAsync("smoke_corta_antes_de_pac_por_local_cfdi40161", async () => {
  const runtimeDir = path.join(tempRoot, "local-cfdi40161-runtime");
  const calls = [];
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_USO_CFDI: "CN01",
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    calls.push({ method, path: requestPath });
    throw new Error(`no debe llamar PAC: ${method} ${requestPath}`);
  };
  const result = await runSmoke(env, { requestFn });
  const attempt = result.manifest.attempts[0];
  assert.strictEqual(attempt.status, "CFDI_LOCAL_RULE_ERROR");
  assert.strictEqual(result.summary.local_cfdi_rule_errors, 1);
  assert.strictEqual(result.summary.needs_local_config, 1);
  assert(attempt.local_config_errors.includes("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH"));
  assert(!calls.some((call) => call.path === "/v4/cfdi40/create"));
  assert(result.manifest.artifacts.some((artifact) => artifact.type === "CFDI_LOCAL_RULE_ERROR"));
  return "blocked";
});

checkAsync("inspector_muestra_catalogos_pero_no_rfc", async () => {
  const runtimeDir = path.join(tempRoot, "inspector-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  const requestFn = async ({ method, path: requestPath }) => {
    if (method === "POST" && requestPath === "/v4/cfdi40/create") {
      return { ok: true, status: 200, data: { response: "success", Data: { UID: "CFDI-UID-DEMO" } } };
    }
    if (method === "GET" && requestPath === "/v4/cfdi/uid/CFDI-UID-DEMO") {
      return { ok: true, status: 200, data: { response: "success", Data: { UID: "CFDI-UID-DEMO" } } };
    }
    throw new Error(`unexpected request: ${method} ${requestPath}`);
  };
  await runSmoke(env, { requestFn });
  const output = inspectRuntime(runtimeDir);
  assert(output.includes('body.UsoCFDI: string(len=3, preview="G03")'), output);
  assert(output.includes('body.Receptor.RegimenFiscalR: string(len=3, preview="612")'), output);
  assert(!output.includes(samplePfRfc));
  return "safe preview";
});

checkAsync("analyzer_reporta_effective_uso_y_person_type", async () => {
  const runtimeDir = path.join(tempRoot, "analyzer-runtime");
  const env = validLiveEnv({
    FACTURACOM_SANDBOX_RUNTIME_PATH: runtimeDir,
    FACTURACOM_SANDBOX_USO_CFDI: "CN01",
    FACTURACOM_SANDBOX_CLIENT_UIDS_JSON: JSON.stringify({ "CLIENT-DEMO-PF-GENERIC": "UID-CLIENT-LOCAL" }),
  });
  await runSmoke(env, { requestFn: async () => { throw new Error("no PAC"); } });
  const result = analyze(runtimeDir);
  assert.strictEqual(result.local_cfdi_rule_errors, 1);
  assert.strictEqual(result.effective_uso_cfdi, "CN01");
  assert.strictEqual(result.effective_regimen_fiscal_receptor, "612");
  assert.strictEqual(result.effective_person_type, "GENERIC_NATIONAL");
  assert.strictEqual(result.rfc_shape, "GENERIC_NATIONAL");
  assert.strictEqual(result.uso_cfdi_regimen_persona_mismatch, 1);
  return `${result.effective_uso_cfdi}/${result.effective_person_type}`;
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

  console.log("CFDI receptor compatibility validator tests");
  for (const item of checks) printCheck(item.name, item.pass, item.value);
  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();

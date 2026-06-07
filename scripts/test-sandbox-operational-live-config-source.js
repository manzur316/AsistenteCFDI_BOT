const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const { runSandboxAction } = require("./lib/sandbox-action-runner");
const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-operational-live-config-source");
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

function writeLocalEnv() {
  fs.mkdirSync(path.dirname(localEnvPath), { recursive: true });
  const apiKeyName = "FACTURACOM_" + "API_KEY";
  const secretKeyName = "FACTURACOM_" + "SECRET_KEY";
  const pluginName = "FACTURACOM_" + "PLUGIN";
  fs.writeFileSync(localEnvPath, [
    "FACTURACOM_SANDBOX_MODE=live",
    "FACTURACOM_SANDBOX_LIVE=1",
    "FACTURACOM_BASE_URL=https://sandbox.factura.com/api",
    `${apiKeyName}=APIKEY_PRIVATE_SOURCE_TEST`,
    `${secretKeyName}=SECRET_PRIVATE_SOURCE_TEST`,
    `${pluginName}=PLUGIN_PRIVATE_SOURCE_TEST`,
    "FACTURACOM_SANDBOX_RECEIVER_UID=CLIENTUID_PRIVATE_SOURCE_TEST",
    "FACTURACOM_SANDBOX_SERIE=SBOX",
    "FACTURACOM_SANDBOX_USO_CFDI=G03",
    "FACTURACOM_SANDBOX_FORMA_PAGO=03",
    "FACTURACOM_SANDBOX_METODO_PAGO=PUE",
    "FACTURACOM_SANDBOX_MONEDA=MXN",
    "FACTURACOM_SANDBOX_LUGAR_EXPEDICION=77723",
  ].join("\n") + "\n", "utf8");
}

function draft(overrides = {}) {
  return {
    draft_id: "DRAFT-LIVE-CONFIG-SOURCE",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    emitter_id: "EMITTER-DEMO",
    original_text: "venta de camara CCTV",
    ready_to_copy: true,
    amount: 1000,
    subtotal: 1000,
    tax_mode: "ADD_IVA",
    iva_amount: 160,
    iva_retention_amount: 0,
    isr_retention_amount: 0,
    total: 1160,
    blockers: [],
    current_client: {
      client_id: "CLIENT-DEMO-SOURCE",
      display_name: "Cliente Demo Source",
      razon_social: "CLIENTE DEMO SOURCE SA DE CV",
      rfc: "XAXX010101000",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77723",
      uso_cfdi_default: "G03",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
      objeto_imp: "02",
    },
    ...overrides,
  };
}

function providerResponse() {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    contentType: "application/json",
    data: {
      response: "success",
      message: "Factura creada y enviada satisfactoriamente",
      Data: {
        UID: "CFDIUIDSOURCE",
        UUID: "00000000-0000-4000-8000-000000000716",
        Serie: "SBOX",
        Folio: "716B",
      },
    },
  };
}

function assertNoSecrets(value) {
  const text = JSON.stringify(value);
  assert(!/APIKEY_PRIVATE_SOURCE_TEST|SECRET_PRIVATE_SOURCE_TEST|PLUGIN_PRIVATE_SOURCE_TEST|CLIENTUID_PRIVATE_SOURCE_TEST/.test(text), "secret leaked");
}

check("draft_stamp_resolves_local_env_when_process_env_empty", async () => {
  cleanTemp();
  writeLocalEnv();
  let called = 0;
  const result = await runSandboxDraftStamp({
    draft: draft(),
    env: {},
    localEnvPath,
    requireLiveSandbox: true,
    storageRoot: tempRoot,
    adapterContext: {
      requestFn: async () => {
        called += 1;
        return providerResponse();
      },
    },
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(result.output.pac_provider_config.config_source, ".env.pac.sandbox.local");
  assertNoSecrets(result.output.pac_provider_config);
  return result.output.pac_provider_config.config_source;
});

check("action_runner_uses_resolver_for_draft_stamp", async () => {
  cleanTemp();
  writeLocalEnv();
  let called = 0;
  const result = await runSandboxAction("sandbox.draft.stamp", {
    draft: draft({ draft_id: "DRAFT-LIVE-CONFIG-RUNNER" }),
    env: {},
    localEnvPath,
    requireLiveSandbox: true,
    storageRoot: tempRoot,
    adapterContext: {
      requestFn: async () => {
        called += 1;
        return providerResponse();
      },
    },
    writeResult: false,
    writeAudit: false,
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.pac_provider_config.config_source, ".env.pac.sandbox.local");
  assertNoSecrets(result);
  return result.status;
});

check("cli_require_live_reports_resolver_missing_config", () => {
  cleanTemp();
  const child = spawnSync(process.execPath, [
    "scripts/run-sandbox-action.js",
    "sandbox.draft.stamp",
    "--draft-json-b64",
    Buffer.from(JSON.stringify(draft({ draft_id: "DRAFT-CLI-MISSING-CONFIG" })), "utf8").toString("base64url"),
    "--require-live-sandbox",
  ], {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      FACTURACOM_SANDBOX_ENV_FILE: path.join(tempRoot, "missing.local"),
    },
    encoding: "utf8",
  });
  assert.strictEqual(child.status, 0, child.stderr || child.stdout);
  const parsed = JSON.parse(child.stdout);
  assert.strictEqual(parsed.status, "NEEDS_CONFIG");
  assert(parsed.output.validation_error_codes.includes("FACTURACOM_SANDBOX_MODE_REQUIRED"));
  assert.strictEqual(parsed.output.pac_provider_config.config_source, "missing");
  assertNoSecrets(parsed);
  return parsed.status;
});

check("diagnose_action_returns_safe_config_summary", async () => {
  cleanTemp();
  writeLocalEnv();
  const result = await runSandboxAction("sandbox.facturacom.config.diagnose", {
    env: {},
    localEnvPath,
    writeResult: false,
    writeAudit: false,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.provider, "factura_com");
  assert.strictEqual(result.output.config_source, ".env.pac.sandbox.local");
  assert.strictEqual(result.output.credentials_present, true);
  assertNoSecrets(result);
  return result.output.config_source;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Operational Live Config Source Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

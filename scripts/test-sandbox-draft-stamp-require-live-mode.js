const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-draft-stamp-require-live-mode");
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

function liveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    FACTURACOM_SANDBOX_RECEIVER_UID: "CLIENTUID716B",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
    ...overrides,
  };
}

function approvedDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-REQUIRE-LIVE-716B",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    emitter_id: "EMITTER-DEMO",
    message_original: "venta de camara CCTV",
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
      client_id: "CLIENT-DEMO-LIVE",
      display_name: "Cliente Demo Live",
      razon_social: "CLIENTE DEMO LIVE SA DE CV",
      rfc: "XAXX010101000",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
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

check("without_require_live_sandbox_keeps_mock_available_for_tests", async () => {
  cleanTemp();
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({ draft_id: "DRAFT-MOCK-STILL-AVAILABLE" }),
    env: liveEnv({ FACTURACOM_SANDBOX_MODE: "mock", FACTURACOM_SANDBOX_LIVE: "0" }),
    storageRoot: tempRoot,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(result.output.pac_result.mode, "mock");
  return result.output.pac_result.mode;
});

check("require_live_sandbox_blocks_mock_mode_before_mock_stamp", async () => {
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({ draft_id: "DRAFT-MOCK-BLOCKED" }),
    env: liveEnv({ FACTURACOM_SANDBOX_MODE: "mock" }),
    storageRoot: tempRoot,
    requireLiveSandbox: true,
    loadLocalEnv: false,
  });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.output.error_class, "FACTURACOM_SANDBOX_MODE_REQUIRED");
  assert.notStrictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.notStrictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(fs.existsSync(path.join(tempRoot, "draft-stamps", "DRAFT-MOCK-BLOCKED")), false);
  return result.output.error_class;
});

for (const [name, envPatch, expectedCode] of [
  ["missing_live_flag", { FACTURACOM_SANDBOX_LIVE: "0" }, "FACTURACOM_SANDBOX_LIVE_REQUIRED"],
  ["missing_api_key", { FACTURACOM_API_KEY: "" }, "FACTURACOM_SANDBOX_API_KEY_REQUIRED"],
  ["missing_secret_key", { FACTURACOM_SECRET_KEY: "" }, "FACTURACOM_SANDBOX_SECRET_KEY_REQUIRED"],
  ["missing_plugin", { FACTURACOM_PLUGIN: "" }, "FACTURACOM_SANDBOX_PLUGIN_REQUIRED"],
  ["missing_serie", { FACTURACOM_SANDBOX_SERIE: "" }, "FACTURACOM_SANDBOX_SERIE_REQUIRED"],
]) {
  check(`require_live_sandbox_${name}_returns_needs_config`, async () => {
    const result = await runSandboxDraftStamp({
      draft: approvedDraft({ draft_id: `DRAFT-${name}` }),
      env: liveEnv(envPatch),
      storageRoot: tempRoot,
      requireLiveSandbox: true,
      loadLocalEnv: false,
    });
    assert.strictEqual(result.status, "NEEDS_CONFIG");
    assert(result.output.validation_error_codes.includes(expectedCode), `${expectedCode} missing`);
    assert.notStrictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
    assert.notStrictEqual(result.output.payment_status, "PENDIENTE");
    return expectedCode;
  });
}

check("require_live_sandbox_missing_receiver_uid_is_allowed_when_provider_link_exists", async () => {
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({
      draft_id: "DRAFT-LIVE-LINK-NO-RECEIVER-UID",
      provider_client_link: {
        provider_client_link_id: "PCL-NO-RECEIVER",
        provider_client_uid: "CLIENTUID-LINK-NO-RECEIVER",
        provider: "factura_com",
        environment: "SANDBOX",
        sync_status: "LINKED",
      },
    }),
    env: liveEnv({ FACTURACOM_SANDBOX_RECEIVER_UID: "" }),
    storageRoot: tempRoot,
    requireLiveSandbox: true,
    loadLocalEnv: false,
    adapter: {
      stampSandbox: async () => ({
        ok: true,
        provider: "factura_com",
        environment: "SANDBOX",
        status: "OK",
        live_mode: true,
        cfdi_uid: "CFDIUID-NO-RECEIVER",
        uuid: "00000000-0000-4000-8000-000000716017",
        serie: "SBOX",
        folio: "NOUID",
        artifact_status: "DOWNLOAD_READY",
        normalized_warnings: [],
      }),
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.provider_client_uid_source, "provider_client_links");
  assert.strictEqual(result.output.pac_provider_config.receiver_uid_present, true);
  return result.output.provider_client_uid_source;
});

check("require_live_sandbox_success_uses_live_and_download_ready", async () => {
  cleanTemp();
  let networkCalls = 0;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({
      draft_id: "DRAFT-LIVE-SUCCESS-716B",
      provider_client_link: {
        provider_client_link_id: "PCL-REQUIRE-LIVE",
        provider_client_uid: "CLIENTUID716B-LINK",
        provider: "factura_com",
        environment: "SANDBOX",
        sync_status: "LINKED",
      },
    }),
    env: liveEnv(),
    storageRoot: tempRoot,
    requireLiveSandbox: true,
    adapterContext: {
      requestFn: async (request) => {
        networkCalls += 1;
        assert.strictEqual(request.path, "/v4/cfdi40/create");
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          contentType: "application/json",
          data: {
            response: "success",
            Data: {
              UID: "CFDIUID716B",
              UUID: "00000000-0000-4000-8000-000000716016",
              Serie: "SBOX",
              Folio: "716B",
            },
          },
        };
      },
    },
  });
  assert.strictEqual(networkCalls, 1);
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  assert.strictEqual(result.output.pac_result.mode, "live");
  assert.strictEqual(result.output.sandbox_pac_summary.mode, "live");
  assert.strictEqual(result.output.pac_result.artifact_status, "DOWNLOAD_READY");
  return result.output.sandbox_pac_summary.mode;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Stamp Require Live Mode Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

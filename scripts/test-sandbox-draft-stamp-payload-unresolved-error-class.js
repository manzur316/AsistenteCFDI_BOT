const assert = require("assert");

const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function liveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G1",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
    FACTURACOM_SANDBOX_TIPO_DOCUMENTO: "factura",
    FACTURACOM_SANDBOX_EMITTER_REGIMEN: "626",
    ...overrides,
  };
}

function approvedDraft() {
  return {
    draft_id: "DRAFT-PAYLOAD-UNRESOLVED",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    message_original: "venta de camara CCTV",
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
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      razon_social: "PROPIETARIOS DE REAL BILBAO",
      rfc: "PRB150731II8",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
      uso_cfdi_default: "G03",
      validated_by_human: true,
    },
    provider_client_link: {
      provider_client_link_id: "PCL-REAL-BILBAO",
      provider_client_uid: "UID-REAL-BILBAO-SECRET",
      sync_status: "MANUAL_LINKED",
      provider: "factura_com",
      environment: "SANDBOX",
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
      objeto_imp: "02",
    },
  };
}

check("stamp_payload_unresolved_has_precise_error_class_and_safe_diagnostics", async () => {
  const result = await runSandboxDraftStamp({
    draft: approvedDraft(),
    env: liveEnv(),
    requireLiveSandbox: true,
    loadLocalEnv: false,
  });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.output.error_class, "FACTURACOM_SANDBOX_PAYLOAD_UNRESOLVED");
  assert.strictEqual(result.output.pac_provider_config.status, "OK");
  assert.strictEqual(result.output.provider_client_link_status, "FOUND");
  assert.strictEqual(result.output.provider_client_uid_source, "provider_client_links");
  assert.strictEqual(result.output.payload_unresolved_fields_present, true);
  assert(result.output.payload_unresolved_fields_count > 0);
  assert(Array.isArray(result.output.payload_unresolved_fields));
  assert(result.output.local_config_errors.includes("LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG"));
  assert.strictEqual(result.output.receptor_compatibility.compatibility_status, "FAIL");
  assert.strictEqual(result.output.receptor_compatibility.effective_uso_cfdi, "G1");
  const raw = JSON.stringify(result);
  assert(!raw.includes("UID-REAL-BILBAO-SECRET"));
  assert(!raw.includes("PRB150731II8"));
  assert(!/SANDBOXSECRETLOCAL123|SANDBOXKEYLOCAL123|SANDBOXPLUGINLOCAL123/.test(raw));
  return result.output.error_class;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox draft stamp payload unresolved error class tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

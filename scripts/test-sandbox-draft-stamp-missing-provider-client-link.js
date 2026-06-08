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

function liveEnv() {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    FACTURACOM_SANDBOX_RECEIVER_UID: "GLOBAL-LEGACY-UID-SHOULD-NOT-BE-USED",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
  };
}

function approvedDraft() {
  return {
    draft_id: "DRAFT-MISSING-PROVIDER-LINK",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    amount: 1000,
    subtotal: 1000,
    tax_mode: "ADD_IVA",
    iva_amount: 160,
    iva_retention_amount: 0,
    isr_retention_amount: 0,
    total: 1160,
    blockers: [],
    current_client: {
      client_id: "CLIENT-NOT-LINKED",
      display_name: "Cliente Sin Link",
      razon_social: "CLIENTE SIN LINK SA DE CV",
      rfc: "ABC010203AB1",
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
      objeto_imp: "02",
    },
  };
}

check("missing_provider_client_link_blocks_live_stamp_even_with_global_uid", async () => {
  let adapterCalled = false;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft(),
    env: liveEnv(),
    requireLiveSandbox: true,
    loadLocalEnv: false,
    adapter: {
      stampSandbox: async () => {
        adapterCalled = true;
        return { ok: true };
      },
    },
  });
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.output.error_class, "PROVIDER_CLIENT_LINK_MISSING");
  assert(result.errors.includes("PROVIDER_CLIENT_LINK_MISSING"));
  assert.strictEqual(adapterCalled, false);
  assert.strictEqual(result.output.provider_client_link_status, "MISSING");
  assert(String(result.output.next_action).includes("sandbox.provider.client.sync"));
  return result.output.error_class;
});

check("legacy_receiver_uid_requires_explicit_flag", async () => {
  let seenReceptorUid = null;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft(),
    env: liveEnv(),
    requireLiveSandbox: true,
    allowLegacyReceiverUid: true,
    loadLocalEnv: false,
    adapter: {
      stampSandbox: async (_request, context) => {
        seenReceptorUid = context.factura_com.receptor_uid || context.env.FACTURACOM_SANDBOX_RECEIVER_UID;
        return {
          ok: true,
          provider: "factura_com",
          environment: "SANDBOX",
          status: "OK",
          live_mode: true,
          cfdi_uid: "CFDIUID-LEGACY",
          uuid: "00000000-0000-4000-8000-000000000717",
          serie: "SBOX",
          folio: "LEGACY",
          artifact_status: "DOWNLOAD_READY",
          normalized_warnings: [],
        };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(seenReceptorUid, "GLOBAL-LEGACY-UID-SHOULD-NOT-BE-USED");
  assert.strictEqual(result.output.provider_client_uid_source, "legacy_env");
  return result.output.provider_client_uid_source;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Stamp Missing Provider Client Link Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

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
    FACTURACOM_SANDBOX_RECEIVER_UID: "LEGACY-UID-SHOULD-BE-GATED",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
  };
}

function approvedDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-PREFLIGHT",
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
      client_id: "CLI-PREFLIGHT",
      display_name: "Cliente Preflight",
      razon_social: "CLIENTE PREFLIGHT SA DE CV",
      rfc: "ABC010203AB1",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
      uso_cfdi_default: "G03",
      validated_by_human: true,
      email: "cliente.preflight@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      objeto_imp: "02",
    },
    ...overrides,
  };
}

check("require_live_blocks_missing_provider_link_before_adapter", async () => {
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
  assert.strictEqual(adapterCalled, false);
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  assert.strictEqual(result.output.error_class, "PROVIDER_CLIENT_LINK_MISSING");
  assert.strictEqual(result.output.recommended_action, "SYNC_PROVIDER_CLIENT");
  assert.strictEqual(result.output.provider_client_readiness.ready_for_provider_stamp, false);
  assert(result.output.provider_client_readiness.blockers.includes("CLIENT_PROVIDER_LINK_MISSING"));
  return result.output.error_class;
});

check("require_live_allows_existing_provider_link", async () => {
  let seenUid = null;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({
      draft_id: "DRAFT-PREFLIGHT-LINKED",
      provider_client_link: {
        provider_client_uid: "UID-LINKED-PREFLIGHT-123",
        sync_status: "LINKED",
        provider: "factura_com",
        environment: "SANDBOX",
      },
    }),
    env: liveEnv({ FACTURACOM_SANDBOX_RECEIVER_UID: "" }),
    requireLiveSandbox: true,
    loadLocalEnv: false,
    adapter: {
      stampSandbox: async (_request, context) => {
        seenUid = context.factura_com.receptor_uid;
        return {
          ok: true,
          provider: "factura_com",
          environment: "SANDBOX",
          status: "OK",
          live_mode: true,
          cfdi_uid: "CFDIUID-PREFLIGHT",
          uuid: "00000000-0000-4000-8000-000000000718",
          serie: "SBOX",
          folio: "PREFLIGHT",
          normalized_warnings: [],
        };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(seenUid, "UID-LINKED-PREFLIGHT-123");
  assert.strictEqual(result.output.provider_client_uid_source, "provider_client_links");
  assert.strictEqual(result.output.provider_client_readiness.ready_for_provider_stamp, true);
  return result.output.provider_client_uid_source;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Stamp Provider Link Preflight Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

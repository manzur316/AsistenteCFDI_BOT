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
    FACTURACOM_SANDBOX_RECEIVER_UID: "",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
    ...overrides,
  };
}

function approvedDraft() {
  return {
    draft_id: "DRAFT-PROVIDER-LINK-1",
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
      client_id: "CLIENT-LINKED",
      display_name: "Cliente Linked",
      razon_social: "CLIENTE LINKED SA DE CV",
      rfc: "ABC010203AB1",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
      uso_cfdi_default: "G03",
      validated_by_human: true,
    },
    provider_client_link: {
      provider_client_link_id: "PCL-LINKED",
      provider_client_uid: "CLIENTUID-PROVIDER-LINK-123",
      sync_status: "LINKED",
      provider: "factura_com",
      environment: "SANDBOX",
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
  };
}

check("stamp_uses_provider_client_link_instead_of_global_receiver_uid", async () => {
  let seenReceptorUid = null;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft(),
    env: liveEnv(),
    requireLiveSandbox: true,
    loadLocalEnv: false,
    adapter: {
      stampSandbox: async (_request, context) => {
        seenReceptorUid = context.factura_com.receptor_uid;
        return {
          ok: true,
          provider: "factura_com",
          environment: "SANDBOX",
          status: "OK",
          live_mode: true,
          cfdi_uid: "CFDIUID-LINKED",
          uuid: "00000000-0000-4000-8000-000000000716",
          serie: "SBOX",
          folio: "LINKED",
          xml_provider_available: true,
          pdf_provider_available: true,
          artifact_status: "DOWNLOAD_READY",
          normalized_warnings: [],
        };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(seenReceptorUid, "CLIENTUID-PROVIDER-LINK-123");
  assert.strictEqual(result.output.provider_client_uid_source, "provider_client_links");
  assert.strictEqual(result.output.provider_client_link_status, "FOUND");
  const raw = JSON.stringify(result);
  assert(!raw.includes("CLIENTUID-PROVIDER-LINK-123"));
  return result.output.provider_client_uid_source;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Stamp Uses Provider Client Link Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

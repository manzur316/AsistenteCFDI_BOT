const assert = require("assert");

const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");

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

function canonicalPacRequest() {
  const draft = buildCanonicalDraftFromBotPreview({
    draft_id: "DRAFT-PAYLOAD-UNRESOLVED",
    emitter_id: "EMITTER-DEMO",
    source_channel: "TELEGRAM",
    source_message_id: "MSG-1",
    original_text: "venta de camara CCTV",
    confirmed_by_human: true,
    requires_human_review: true,
    status: "APROBADO",
    client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      razon_social: "PROPIETARIOS DE REAL BILBAO",
      rfc: "PRB150731II8",
      regimen_fiscal: "601",
      codigo_postal_fiscal: "77500",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
      objeto_imp: "02",
    },
    amount: 1000,
    subtotal: 1000,
    iva_amount: 160,
    total: 1160,
    tax_mode: "ADD_IVA",
    blockers: [],
  });
  assert.strictEqual(draft.ready_for_pac, true);
  const invoice = promoteCanonicalDraftToInvoiceDocument(draft, {
    pac_provider: "Factura.com Sandbox",
    pac_environment: "SANDBOX",
  });
  assert.strictEqual(invoice.ok, true);
  const pacRequest = buildCanonicalPacRequest(invoice.invoice_document, "stampSandbox", {
    provider: "Factura.com Sandbox",
    environment: "SANDBOX",
  });
  assert.strictEqual(pacRequest.ok, true);
  pacRequest.pac_request.payload.canonical_draft = draft;
  return pacRequest.pac_request;
}

check("live_adapter_returns_payload_unresolved_not_config_missing", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env, mode: "live" });
  const result = await adapter.liveStampSandbox(canonicalPacRequest(), {
    env,
    mode: "live",
    factura_com: { receptor_uid: "UID-REAL-BILBAO-SECRET" },
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_PAYLOAD_UNRESOLVED");
  assert(result.normalized_errors[0].message.includes("Payload Factura.com sandbox"));
  assert.strictEqual(result.raw.payload_unresolved_fields_present, true);
  assert(result.raw.payload_unresolved_fields_count > 0);
  assert(result.raw.local_config_errors.includes("LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG"));
  assert.strictEqual(result.raw.receptor_compatibility.effective_uso_cfdi, "G1");
  const raw = JSON.stringify(result);
  assert(!raw.includes("UID-REAL-BILBAO-SECRET"));
  assert(!raw.includes("PRB150731II8"));
  assert(!/SANDBOXSECRETLOCAL123|SANDBOXKEYLOCAL123|SANDBOXPLUGINLOCAL123/.test(raw));
  return result.normalized_errors[0].code;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com sandbox payload unresolved diagnostics tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

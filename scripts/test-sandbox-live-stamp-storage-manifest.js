const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-live-stamp-storage-manifest");
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

function env() {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    FACTURACOM_SANDBOX_RECEIVER_UID: "CLIENTUID716",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
  };
}

function draft() {
  return {
    draft_id: "DRAFT-LIVE-MANIFEST-716",
    status: "APROBADO",
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
  };
}

function assertSafeStorageText(text) {
  assert(!/SANDBOXKEYLOCAL123|SANDBOXSECRETLOCAL123|SANDBOXPLUGINLOCAL123/i.test(text), "credential leaked");
  assert(!/XAXX010101000|[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/i.test(text), "RFC leaked");
  assert(!/00000000-0000-4000-8000-000000000716/i.test(text), "UUID leaked");
  assert(!/CFDIUID716|CLIENTUID716/i.test(text), "UID leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(text), "document leaked");
}

check("live_stamp_writes_sanitized_manifest_bundle", async () => {
  cleanTemp();
  const result = await runSandboxDraftStamp({
    draft: draft(),
    env: env(),
    storageRoot: tempRoot,
    adapterContext: {
      requestFn: async () => ({
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/json",
        data: {
          response: "success",
          message: "Factura creada y enviada satisfactoriamente",
          Data: {
            UID: "CFDIUID716",
            UUID: "00000000-0000-4000-8000-000000000716",
            Serie: "SBOX",
            Folio: "716",
          },
        },
      }),
    },
  });
  assert.strictEqual(result.status, "OK");
  const paths = [
    result.output.manifest_path,
    result.output.canonical_request_path,
    result.output.provider_response_path,
    result.output.normalized_result_path,
  ];
  for (const file of paths) {
    assert(file && fs.existsSync(file), file);
    assert(file.startsWith(tempRoot), file);
    assertSafeStorageText(fs.readFileSync(file, "utf8"));
  }
  const manifest = JSON.parse(fs.readFileSync(result.output.manifest_path, "utf8"));
  assert.strictEqual(manifest.schema_version, "sandbox_draft_stamp_manifest.v2");
  assert.strictEqual(manifest.mode, "live");
  assert.strictEqual(manifest.pac_identity.uuid_present, true);
  assert.strictEqual(manifest.pac_identity.pac_invoice_id_present, true);
  assert.strictEqual(manifest.xml_available, true);
  assert.strictEqual(manifest.pdf_available, true);
  return path.basename(result.output.manifest_path);
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Live Stamp Storage Manifest Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

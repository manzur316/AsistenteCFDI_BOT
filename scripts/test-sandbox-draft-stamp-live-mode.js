const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-draft-stamp-live-mode");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
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
    FACTURACOM_SANDBOX_RECEIVER_UID: "CLIENTUID715",
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
    draft_id: "DRAFT-LIVE-MODE-715",
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

function executeCode(code, input, itemsProvider = () => []) {
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, {}, itemsProvider, 0)[0].json;
}

check("sandbox_draft_stamp_live_mode_returns_safe_presence_flags", async () => {
  cleanTemp();
  const env = liveEnv();
  let networkCalls = 0;
  const result = await runSandboxDraftStamp({
    draft: approvedDraft(),
    env,
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
            message: "Factura creada y enviada satisfactoriamente",
            Data: {
              UID: "CFDIUID715",
              UUID: "00000000-0000-4000-8000-000000000715",
              Serie: "SBOX",
              Folio: "715",
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
  assert.strictEqual(result.output.pac_result.live_mode, true);
  assert.strictEqual(result.output.pac_result.mode, "live");
  assert.strictEqual(result.output.pac_result.uuid_present, true);
  assert.strictEqual(result.output.pac_result.pac_invoice_id_present, true);
  assert.strictEqual(result.output.pac_result.xml_provider_available, true);
  assert.strictEqual(result.output.pac_result.pdf_provider_available, true);
  assert.strictEqual(result.output.pac_result.xml_downloaded, false);
  assert.strictEqual(result.output.pac_result.pdf_downloaded, false);
  assert.strictEqual(result.output.pac_result.artifact_status, "DOWNLOAD_READY");
  const raw = JSON.stringify(result);
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(raw));
  return result.output.invoice_status;
});

check("sandbox_draft_stamp_live_missing_config_returns_needs_config", async () => {
  const result = await runSandboxDraftStamp({
    draft: approvedDraft({ draft_id: "DRAFT-LIVE-MISSING-CONFIG" }),
    env: liveEnv({ FACTURACOM_SANDBOX_LIVE: "0" }),
    storageRoot: tempRoot,
    requireLiveSandbox: true,
  });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.output.error_class, "FACTURACOM_SANDBOX_LIVE_REQUIRED");
  return result.status;
});

check("n8n_summary_reports_presence_without_ids", () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const summaryCode = workflow.nodes.find((node) => node.name === "Build PAC Sandbox Action Summary").parameters.jsCode;
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "OK",
    ok: true,
    duration_ms: 88,
    artifacts: [{ key: "output.manifest_path", path: "runtime/storage-sandbox/draft-stamps/demo/sandbox-stamp-manifest.json" }],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-LIVE-MODE-715",
      provider: "Factura.com Sandbox",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      client_display_name: "Cliente Demo Live",
      total: 1160,
      pac_result: {
        live_mode: true,
        mode: "live",
        uuid_present: true,
        pac_invoice_id_present: true,
        cfdi_uid_present: true,
        xml_provider_available: true,
        pdf_provider_available: true,
        xml_downloaded: false,
        pdf_downloaded: false,
      },
    },
  });
  const source = {
    update_id: 715,
    chat_id: "CHAT-LIVE-MODE",
    requested_sandbox_action: "sandbox.draft.stamp",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
  };
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert(result.telegram_message.includes("Resultado PAC: live sandbox"));
  assert(result.telegram_message.includes("UUID sandbox: presente (oculto)"));
  assert(result.telegram_message.includes("PAC/CFDI ID sandbox: presente (oculto)"));
  assert(result.telegram_message.includes("XML disponible: pendiente de descarga"));
  assert(result.telegram_message.includes("PDF disponible: pendiente de descarga"));
  assert(!/00000000-0000-4000-8000-000000000715|CFDIUID715/i.test(result.telegram_message));
  return "presence only";
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Draft Stamp Live Mode Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

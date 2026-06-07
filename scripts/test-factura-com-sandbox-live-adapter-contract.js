const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { FacturaComSandboxAdapter, SANDBOX_MODES } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const clients = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-clients.json"), "utf8"));
const drafts = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-drafts.json"), "utf8"));
const clientById = new Map(clients.map((client) => [client.client_id, client]));

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

function buildPacRequest() {
  const fixture = drafts[0];
  const canonicalDraft = buildCanonicalDraftFromBotPreview({
    draft: fixture,
    client: clientById.get(fixture.client_ref || fixture.client_id),
  });
  const promoted = promoteCanonicalDraftToInvoiceDocument(canonicalDraft, {
    issued_at: "2026-06-04T00:00:00.000Z",
  });
  assert.strictEqual(promoted.ok, true, promoted.errors.join(", "));
  const request = buildCanonicalPacRequest(promoted.invoice_document, "stampSandbox").pac_request;
  request.payload.canonical_draft = canonicalDraft;
  return request;
}

function liveEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    FACTURACOM_SANDBOX_RECEIVER_UID: "CLIENTUID714",
    FACTURACOM_SANDBOX_SERIE: "SBOX",
    FACTURACOM_SANDBOX_USO_CFDI: "G03",
    FACTURACOM_SANDBOX_FORMA_PAGO: "03",
    FACTURACOM_SANDBOX_METODO_PAGO: "PUE",
    FACTURACOM_SANDBOX_MONEDA: "MXN",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: "77500",
    ...overrides,
  };
}

check("default_mode_stays_mock", () => {
  const adapter = new FacturaComSandboxAdapter();
  assert.strictEqual(adapter.getPublicConfig().mode, SANDBOX_MODES.MOCK);
  assert.strictEqual(adapter.mockOnly, true);
  return adapter.getPublicConfig().mode;
});

check("live_mode_calls_facturacom_create_endpoint_with_sandbox_body", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env });
  let called = false;
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async (request) => {
      called = true;
      assert.strictEqual(request.method, "POST");
      assert.strictEqual(request.path, "/v4/cfdi40/create");
      assert.strictEqual(request.env.FACTURACOM_BASE_URL, "https://sandbox.factura.com/api");
      assert(request.body.Receptor.UID);
      assert(request.body.Conceptos.length > 0);
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        contentType: "application/json",
        data: {
          response: "success",
          message: "Factura creada y enviada satisfactoriamente",
          Data: {
            UID: "CFDIUID714",
            UUID: "00000000-0000-4000-8000-000000000714",
            Serie: "SBOX",
            Folio: "714",
          },
        },
      };
    },
  });
  assert.strictEqual(called, true);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.mode, "live");
  assert.strictEqual(result.live_mode, true);
  assert.strictEqual(result.status, "SANDBOX_STAMPED");
  assert.strictEqual(result.cfdi_uid, "CFDIUID714");
  assert.strictEqual(result.uuid, "00000000-0000-4000-8000-000000000714");
  assert.strictEqual(result.xml_provider_available, true);
  assert.strictEqual(result.pdf_provider_available, true);
  assert.strictEqual(result.xml_downloaded, false);
  assert.strictEqual(result.pdf_downloaded, false);
  assert.strictEqual(result.artifact_status, "DOWNLOAD_READY");
  return result.status;
});

check("live_provider_error_is_normalized", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      data: { response: "error", message: "Cliente sandbox invalido" },
    }),
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PAC_SANDBOX_ERROR");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_API_ERROR");
  return result.normalized_errors[0].code;
});

check("live_result_does_not_include_documents", async () => {
  const env = liveEnv();
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      data: { response: "success", Data: { UID: "CFDIUID714" } },
    }),
  });
  const raw = JSON.stringify(result);
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|sendDocument|sendMediaGroup/i.test(raw));
  return "no documents";
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Live Adapter Contract Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

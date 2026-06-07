const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const {
  FacturaComSandboxAdapter,
  SANDBOX_MODES,
} = require("./lib/factura-com-sandbox-adapter");

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

check("adapter_default_mock_still_available_for_technical_tests", async () => {
  const adapter = new FacturaComSandboxAdapter();
  const result = await adapter.stampSandbox(buildPacRequest());
  assert.strictEqual(adapter.getPublicConfig().mode, SANDBOX_MODES.MOCK);
  assert.strictEqual(result.ok, true);
  assert.notStrictEqual(result.mode, "live");
  return "mock";
});

check("require_live_sandbox_blocks_mock_adapter_fallback", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: liveEnv({ FACTURACOM_SANDBOX_MODE: "mock" }) });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env: liveEnv({ FACTURACOM_SANDBOX_MODE: "mock" }),
    requireLiveSandbox: true,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED");
  return result.normalized_errors[0].code;
});

check("live_mode_never_uses_production_url", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: liveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com/api" }) });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env: liveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com/api" }),
    requireLiveSandbox: true,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(JSON.stringify(result).includes("FACTURA_COM_PRODUCTION_BLOCKED"));
  assert(!/stampProduction/i.test(JSON.stringify(result)));
  return "blocked";
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Operational Live Provider Mode Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

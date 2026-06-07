const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

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

function validLiveEnv(overrides = {}) {
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

check("mock_mode_does_not_call_live_request", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: { FACTURACOM_SANDBOX_MODE: "mock" } });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env: { FACTURACOM_SANDBOX_MODE: "mock" },
    requestFn: async () => { throw new Error("requestFn must not run in mock mode"); },
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pac_invoice_id.startsWith("FACTURA-COM-MOCK-"), true);
  return "mock";
});

check("live_requires_explicit_live_flag", async () => {
  let called = false;
  const env = validLiveEnv({ FACTURACOM_SANDBOX_LIVE: "0" });
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async () => { called = true; },
  });
  assert.strictEqual(called, false);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_CONFIG_MISSING");
  return result.status;
});

check("live_blocks_production_base_url", async () => {
  let called = false;
  const env = validLiveEnv({ FACTURACOM_BASE_URL: "https://api.factura.com/api" });
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async () => { called = true; },
  });
  assert.strictEqual(called, false);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  const raw = JSON.stringify(result);
  assert(!/https:\/\/api\.factura\.com/i.test(raw), "production URL leaked");
  return result.normalized_errors[0].code;
});

check("live_requires_local_invoice_config_before_network", async () => {
  let called = false;
  const env = validLiveEnv({ FACTURACOM_SANDBOX_RECEIVER_UID: "" });
  const adapter = new FacturaComSandboxAdapter({ env });
  const result = await adapter.stampSandbox(buildPacRequest(), {
    env,
    requestFn: async () => { called = true; },
  });
  assert.strictEqual(called, false);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert.strictEqual(result.normalized_errors[0].code, "FACTURACOM_SANDBOX_LOCAL_CONFIG_MISSING");
  return result.normalized_errors[0].code;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Sandbox Live Gating Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

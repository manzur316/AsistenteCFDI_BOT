const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { assertPacAdapter, PAC_ENVIRONMENTS } = require("./lib/pac-adapter-contract");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { FacturaComSandboxAdapter, PROVIDER } = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const adapterPath = path.join(root, "scripts", "lib", "factura-com-sandbox-adapter.js");
const clients = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-clients.json"), "utf8"));
const drafts = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-drafts.json"), "utf8"));
const successResponses = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "facturacom-mock-success-responses.json"), "utf8"));
const errorResponses = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "facturacom-mock-error-responses.json"), "utf8"));
const clientById = new Map(clients.map((client) => [client.client_id, client]));

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function runtimeSnapshot() {
  const runtimePath = path.join(root, "runtime");
  if (!fs.existsSync(runtimePath)) return [];
  return fs.readdirSync(runtimePath).sort().map((name) => {
    const fullPath = path.join(runtimePath, name);
    const stat = fs.statSync(fullPath);
    return `${name}:${stat.size}`;
  });
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

check("adapter_no_usa_transporte_ni_env", () => {
  const source = fs.readFileSync(adapterPath, "utf8");
  assert(!/\bfetch\b|axios|require\(["']http["']\)|require\(["']https["']\)|process\.env|ENV_KEYS/i.test(source));
  assert(!/X-Api-Key|X-Secret-Key|Bearer\s+[A-Za-z0-9._-]{10,}/i.test(source));
  return "mock only";
});

check("adapter_no_contiene_api_keys_tokens", () => {
  const source = fs.readFileSync(adapterPath, "utf8");
  assert(!/api[_-]?key|secret[_-]?key|token|password|CSD|certificate/i.test(source));
  return "clean source";
});

check("adapter_cumple_contrato_pac_interno", () => {
  const adapter = new FacturaComSandboxAdapter();
  const contract = assertPacAdapter(adapter);
  assert.strictEqual(contract.ok, true);
  assert.strictEqual(adapter.provider, PROVIDER);
  assert.strictEqual(adapter.mockOnly, true);
  return contract.methods.length;
});

check("mockStampSandbox_requiere_canonical_pac_request", () => {
  const adapter = new FacturaComSandboxAdapter();
  const result = adapter.mockStampSandbox({});
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.normalized_errors[0].code, "CANONICAL_INVOICE_REQUIRED");
  return result.normalized_errors[0].code;
});

check("mockStampSandbox_regresa_canonical_pac_result", () => {
  const adapter = new FacturaComSandboxAdapter();
  const response = successResponses.find((item) => item.fixture_id === "SUCCESS-CCTV-SERVICE");
  const result = adapter.mockStampSandbox(buildPacRequest(), response);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.provider, PROVIDER);
  assert.strictEqual(result.operation, "stampSandbox");
  assert.strictEqual(result.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(result.requires_human_review, true);
  return result.uuid;
});

check("mockCancelSandbox_regresa_canonical_pac_result", () => {
  const adapter = new FacturaComSandboxAdapter();
  const response = successResponses.find((item) => item.fixture_id === "CANCEL-SANDBOX-OK");
  const result = adapter.mockCancelSandbox({ uuid: response.uuid, environment: PAC_ENVIRONMENTS.SANDBOX }, response);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.operation, "cancelInvoice");
  assert.strictEqual(result.status, "SANDBOX_CANCELLED");
  return result.status;
});

check("errores_se_normalizan", () => {
  const adapter = new FacturaComSandboxAdapter();
  const error = errorResponses.find((item) => item.fixture_id === "ERROR-GENERIC-PAC");
  const result = adapter.normalizeError(error, { operation: "stampSandbox" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.provider, PROVIDER);
  assert.strictEqual(result.normalized_errors[0].code, "GENERIC_SANDBOX_ERROR");
  return result.normalized_errors[0].code;
});

check("produccion_queda_bloqueada", () => {
  const adapter = new FacturaComSandboxAdapter();
  const request = buildPacRequest();
  request.environment = PAC_ENVIRONMENTS.PRODUCTION;
  const result = adapter.mockStampSandbox(request);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.normalized_errors[0].code, "FACTURA_COM_SANDBOX_ONLY");
  return "blocked";
});

check("no_genera_archivos_xml_pdf_reales", () => {
  const adapter = new FacturaComSandboxAdapter();
  const xml = adapter.downloadXml({ uuid: "00000000-0000-4000-8000-000000000001" });
  const pdf = adapter.downloadPdf({ uuid: "00000000-0000-4000-8000-000000000001" });
  assert.strictEqual(xml.ok, false);
  assert.strictEqual(pdf.ok, false);
  assert(!("content" in xml));
  assert(!("content" in pdf));
  return "no artifacts";
});

check("no_escribe_runtime", () => {
  const before = runtimeSnapshot();
  const adapter = new FacturaComSandboxAdapter();
  adapter.mockStampSandbox(buildPacRequest(), successResponses[0]);
  adapter.mockCancelSandbox({ uuid: "00000000-0000-4000-8000-000000000006" }, successResponses.find((item) => item.fixture_id === "CANCEL-SANDBOX-OK"));
  assert.deepStrictEqual(runtimeSnapshot(), before);
  return "no runtime writes";
});

console.log("Factura.com Sandbox Adapter Mock Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

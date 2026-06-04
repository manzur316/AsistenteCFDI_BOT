const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { REVIEW_STATUSES } = require("./lib/canonical-cfdi-contracts");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { normalizeRfc, validateRfcShape } = require("./lib/cfdi-receptor-compatibility-validator");
const { applySandboxFiscalProfilesToClients, loadSandboxFiscalProfiles } = require("./lib/sandbox-fiscal-profile-loader");

const root = path.resolve(__dirname, "..");
const clientsPath = path.join(root, "data", "sandbox", "canonical-test-clients.json");
const draftsPath = path.join(root, "data", "sandbox", "canonical-test-drafts.json");

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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const rawClients = readJson(clientsPath);
const drafts = readJson(draftsPath);
const profiles = loadSandboxFiscalProfiles();
const clients = applySandboxFiscalProfilesToClients(rawClients, { loadedProfiles: profiles }).clients;
const clientById = new Map(clients.map((client) => [client.client_id, client]));

function buildDraft(fixture, clientOverride = null) {
  const client = clientOverride || clientById.get(fixture.client_ref || fixture.client_id);
  return buildCanonicalDraftFromBotPreview({ draft: fixture, client });
}

check("cinco_clientes_cargan", () => {
  assert.strictEqual(clients.length, 5);
  return clients.length;
});

check("cinco_drafts_cargan", () => {
  assert.strictEqual(drafts.length, 5);
  return drafts.length;
});

check("fixtures_positivos_pasan_build_canonical_draft", () => {
  const built = drafts.map((fixture) => buildDraft(fixture));
  for (const draft of built) {
    assert.strictEqual(draft.contract_validation.ok, true, `${draft.draft_id}: ${draft.contract_validation.errors.join(", ")}`);
    assert.strictEqual(draft.ready_for_pac, true, draft.draft_id);
  }
  return `${built.length} drafts`;
});

check("caso_incompleto_queda_needs_review", () => {
  const incompleteClient = clientById.get("CLIENT-DEMO-INCOMPLETE");
  const draft = buildDraft(drafts[0], incompleteClient);
  assert.strictEqual(draft.review_status, REVIEW_STATUSES.NEEDS_REVIEW);
  assert.strictEqual(draft.ready_for_pac, false);
  assert(draft.blockers.some((item) => item.type === "rfc_faltante"));
  return "NEEDS_REVIEW";
});

check("fixtures_sin_datos_reales_evidentes", () => {
  const combined = `${fs.readFileSync(clientsPath, "utf8")}\n${fs.readFileSync(draftsPath, "utf8")}`;
  const sanitized = combined.replace(/XAXX010101000|XEXX010101000|AAA010101AAA|BBB010101BBB|XAMA620210DQ5/g, "");
  assert(!/Juandi|Emberhub|CLIENTE_REAL|RFC_REAL|MANZUR|Cuenta real|Banco real/i.test(sanitized));
  assert(!/[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/.test(sanitized));
  return "demo only";
});

check("fixtures_sin_api_secret_token_csd_xml_pdf_banco", () => {
  const combined = `${fs.readFileSync(clientsPath, "utf8")}\n${fs.readFileSync(draftsPath, "utf8")}`;
  assert(!/api[_-]?key|secret|token|password|csd|certificado|private[_-]?key|estado de cuenta|bank|clabe|<cfdi|xml|pdf/i.test(combined));
  return "no sensitive fixture data";
});

check("fixtures_rfc_sin_caracteres_ocultos_y_forma_valida", () => {
  for (const client of clients.filter((item) => item.rfc)) {
    const validation = validateRfcShape(client.rfc);
    assert.strictEqual(validation.ok, true, `${client.client_id}: ${validation.errors.join(",")}`);
    assert.strictEqual(validation.has_hidden_characters, false, client.client_id);
    assert.strictEqual(normalizeRfc(client.rfc), client.rfc, client.client_id);
  }
  return "rfc canonical";
});

check("drafts_positivos_promueven_a_invoice_sandbox", () => {
  for (const fixture of drafts) {
    const draft = buildDraft(fixture);
    const promoted = promoteCanonicalDraftToInvoiceDocument(draft, { issued_at: "2026-06-04T00:00:00.000Z" });
    assert.strictEqual(promoted.ok, true, `${fixture.draft_id}: ${promoted.errors.join(", ")}`);
    assert.strictEqual(promoted.invoice_document.pac_environment, "SANDBOX");
  }
  return "sandbox invoices";
});

check("positivos_generan_canonical_pac_request_sin_llamar_pac", () => {
  for (const fixture of drafts) {
    const draft = buildDraft(fixture);
    const promoted = promoteCanonicalDraftToInvoiceDocument(draft, { issued_at: "2026-06-04T00:00:00.000Z" });
    const request = buildCanonicalPacRequest(promoted.invoice_document, "stampSandbox");
    assert.strictEqual(request.ok, true, `${fixture.draft_id}: ${request.errors.join(", ")}`);
    assert(request.pac_request.idempotency_key);
    assert.strictEqual(request.pac_request.provider, "PAC_ADAPTER_HUB");
  }
  return "pac requests mock-only";
});

console.log("Canonical Sandbox Fixtures Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

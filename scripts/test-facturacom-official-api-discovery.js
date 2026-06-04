const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { PAC_ENVIRONMENTS } = require("./lib/canonical-cfdi-contracts");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const {
  OFFICIAL_DOCS_CONFIRMED,
  OFFICIAL_DOCS_PARTIAL,
  TODO_DOCS_REQUIRED,
  mapCanonicalInvoiceToFacturaComPayload,
} = require("./lib/factura-com-payload-mapper");

const root = path.resolve(__dirname, "..");
const docPath = path.join(root, "docs", "FACTURACOM_OFFICIAL_API_DISCOVERY.md");
const mapperDocPath = path.join(root, "docs", "FACTURACOM_SANDBOX_MAPPER.md");
const notesPath = path.join(root, "data", "sandbox", "facturacom-official-contract.notes.json");
const mapperPath = path.join(root, "scripts", "lib", "factura-com-payload-mapper.js");

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

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(read(filePath));
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function assertNoCredentialLiterals(label, text) {
  const forbidden = [
    /\bbot\d{6,}:[A-Za-z0-9_-]{20,}\b/,
    /JDJ5JDEw[A-Za-z0-9+/=_-]{20,}/,
    /9d4095c8f7ed5785cb14c0e3b033eeb8252416ed/i,
    /FACTURACOM_SANDBOX_API_KEY\s*=\s*(?!REEMPLAZAR|CHANGE|PLACEHOLDER|TEST_)[^\s#]+/i,
    /FACTURACOM_SANDBOX_SECRET_KEY\s*=\s*(?!REEMPLAZAR|CHANGE|PLACEHOLDER|TEST_)[^\s#]+/i,
    /["'](?:api_key|secret_key|token)["']\s*:\s*["'](?!REEMPLAZAR|CHANGE|PLACEHOLDER|TEST_|DEMO)[^"']{12,}["']/i,
  ];
  const hit = forbidden.find((pattern) => pattern.test(text));
  assert(!hit, `${label} contiene literal sensible: ${hit}`);
}

function loadOfficialPayloadScenario(overrides = {}) {
  const clients = readJson(path.join(root, "data", "sandbox", "canonical-test-clients.json"));
  const drafts = readJson(path.join(root, "data", "sandbox", "canonical-test-drafts.json"));
  const fixture = drafts.find((item) => item.draft_id === "DRAFT-DEMO-CCTV-SERVICE");
  assert(fixture, "fixture DRAFT-DEMO-CCTV-SERVICE no existe");
  const clientById = new Map(clients.map((client) => [client.client_id, client]));
  const canonicalDraft = buildCanonicalDraftFromBotPreview({
    draft: fixture,
    client: clientById.get(fixture.client_ref || fixture.client_id),
  });
  const promoted = promoteCanonicalDraftToInvoiceDocument(canonicalDraft, {
    issued_at: "2026-06-04T00:00:00.000Z",
  });
  assert.strictEqual(promoted.ok, true, promoted.errors.join(", "));
  const pacRequestResult = buildCanonicalPacRequest(promoted.invoice_document, "stampSandbox");
  assert.strictEqual(pacRequestResult.ok, true, pacRequestResult.errors.join(", "));
  const canonicalPacRequest = pacRequestResult.pac_request;
  canonicalPacRequest.payload.canonical_draft = canonicalDraft;
  return mapCanonicalInvoiceToFacturaComPayload(promoted.invoice_document, {
    canonicalDraft,
    canonicalPacRequest,
    ...overrides,
  });
}

check("discovery_doc_exists", () => {
  assert(fs.existsSync(docPath));
  return path.relative(root, docPath);
});

check("contract_notes_exists_and_valid_json", () => {
  const notes = readJson(notesPath);
  assert.strictEqual(notes.api_version, "facturacom_official_discovery_6a5b.v1");
  assert.strictEqual(notes.non_live, true);
  return notes.api_version;
});

check("mapper_doc_updated", () => {
  const text = read(mapperDocPath);
  assert(text.includes("Campos Confirmados Por Documentacion Oficial"));
  assert(text.includes("official_request"));
  return path.relative(root, mapperDocPath);
});

check("official_sources_are_facturacom_apidocs", () => {
  const notes = readJson(notesPath);
  assert(notes.docs_source.length >= 8);
  for (const source of notes.docs_source) {
    assert.strictEqual(source.official, true, source.id);
    assert(/^https:\/\/factura\.com\/apidocs\//.test(source.url), source.url);
  }
  return `${notes.docs_source.length} official sources`;
});

check("sandbox_enabled_production_blocked", () => {
  const notes = readJson(notesPath);
  assert.strictEqual(notes.environments.sandbox.base_url, "https://sandbox.factura.com/api");
  assert.strictEqual(notes.environments.sandbox.enabled_for_repo, true);
  assert.strictEqual(notes.environments.sandbox.live_calls_enabled, false);
  assert.strictEqual(notes.environments.production.base_url, "https://api.factura.com");
  assert.strictEqual(notes.environments.production.enabled_for_repo, false);
  assert.strictEqual(notes.environments.production.blocked_reason, "PRODUCTION_BLOCKED");
  return "sandbox documented, production blocked";
});

check("endpoints_are_sandbox_only_and_non_live", () => {
  const notes = readJson(notesPath);
  const required = [
    "create_cfdi40",
    "get_cfdi_by_uid",
    "get_cfdi_by_uuid",
    "download_cfdi_pdf",
    "download_cfdi_xml",
    "cancel_cfdi40",
    "list_clients",
    "get_client",
    "create_client",
    "create_product",
    "catalog_generic",
    "catalog_uso_cfdi",
  ];
  const byId = new Map(notes.endpoints.map((endpoint) => [endpoint.id, endpoint]));
  for (const id of required) {
    const endpoint = byId.get(id);
    assert(endpoint, `endpoint faltante ${id}`);
    assert.deepStrictEqual(endpoint.enabled_environments, ["sandbox"], id);
    assert.strictEqual(endpoint.production_enabled, false, id);
    assert.strictEqual(endpoint.live_call_enabled, false, id);
  }
  return `${required.length} endpoints`;
});

check("required_fields_confirmed_and_unresolved_present", () => {
  const notes = readJson(notesPath);
  for (const field of ["Receptor.UID", "TipoDocumento", "Conceptos", "UsoCFDI", "Serie", "FormaPago", "MetodoPago", "Moneda"]) {
    assert(notes.required_fields.cfdi40_create_confirmed.includes(field), field);
  }
  for (const field of ["ClaveProdServ", "ClaveUnidad", "ValorUnitario", "ObjetoImp", "Impuestos.Traslados.Importe"]) {
    assert(notes.required_fields.concept_confirmed.includes(field), field);
  }
  assert(notes.unresolved_fields.some((item) => item.includes("Receptor.UID")));
  assert(notes.unresolved_fields.some((item) => item.includes("Serie")));
  assert(notes.unresolved_fields.some((item) => item.includes("Warnings")));
  return `${notes.unresolved_fields.length} unresolved`;
});

check("auth_shape_has_headers_no_values", () => {
  const notes = readJson(notesPath);
  for (const header of ["Content-Type", "F-PLUGIN", "F-Api-Key", "F-Secret-Key"]) {
    assert(notes.auth_shape.headers.includes(header), header);
  }
  assert.strictEqual(notes.auth_shape.repo_policy, "no_credentials_no_plugin_value_no_real_tokens");
  return notes.auth_shape.credential_policy;
});

check("docs_and_notes_have_no_credential_literals", () => {
  assertNoCredentialLiterals("discovery doc", read(docPath));
  assertNoCredentialLiterals("mapper doc", read(mapperDocPath));
  assertNoCredentialLiterals("contract notes", read(notesPath));
  return "clean";
});

check("mapper_has_no_transport_or_env", () => {
  const mapperText = read(mapperPath);
  const forbidden = [
    /\bfetch\s*\(/,
    /\baxios\b/,
    /require\s*\(\s*["']https?["']\s*\)/,
    /\bhttp\.request\b/,
    /\bhttps\.request\b/,
    /process\.env/,
  ];
  const hit = forbidden.find((pattern) => pattern.test(mapperText));
  assert(!hit, `mapper contiene transporte/env: ${hit}`);
  return "no fetch/axios/http/process.env";
});

check("mapper_exposes_official_request_with_confirmed_field_names", () => {
  const payload = loadOfficialPayloadScenario();
  assert.strictEqual(payload.official_request.provider_field_status, OFFICIAL_DOCS_PARTIAL);
  assert.strictEqual(payload.official_request.endpoint.path, "/v4/cfdi40/create");
  assert.strictEqual(payload.official_request.endpoint.method, "POST");
  assert.strictEqual(payload.official_request.endpoint.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(payload.official_request.body.Receptor.provider_field_status, TODO_DOCS_REQUIRED);
  assert.strictEqual(payload.official_request.body.Conceptos[0].provider_field_status, OFFICIAL_DOCS_CONFIRMED);
  assert.strictEqual(payload.official_request.body.Conceptos[0].ClaveProdServ, payload.concepts[0].clave_prod_serv);
  assert.strictEqual(payload.official_request.body.Conceptos[0].ClaveUnidad, payload.concepts[0].clave_unidad);
  assert(payload.official_request.unresolved_fields.some((item) => item.includes("Receptor.UID")));
  return payload.official_request.body.Conceptos[0].ClaveProdServ;
});

check("mapper_accepts_explicit_sandbox_fields_without_inventing", () => {
  const payload = loadOfficialPayloadScenario({
    factura_com: {
      receptor_uid: "UID-DEMO-SANDBOX",
      TipoDocumento: "factura",
      Serie: "SERIE-DEMO",
      FormaPago: "03",
      MetodoPago: "PUE",
      Moneda: "MXN",
      LugarExpedicion: "00000",
      EnviarCorreo: false,
    },
    uso_cfdi: "G03",
  });
  assert.strictEqual(payload.official_request.body.Receptor.UID, "UID-DEMO-SANDBOX");
  assert.strictEqual(payload.official_request.body.Receptor.provider_field_status, OFFICIAL_DOCS_CONFIRMED);
  assert.strictEqual(payload.official_request.body.TipoDocumento, "factura");
  assert.strictEqual(payload.official_request.body.UsoCFDI, "G03");
  assert.strictEqual(payload.official_request.body.EnviarCorreo, false);
  assert(!payload.official_request.unresolved_fields.some((item) => item.includes("Receptor.UID")));
  return payload.official_request.body.UsoCFDI;
});

check("workflows_not_modified", () => {
  const changed = [
    ...git(["diff", "--name-only", "--", "workflow"]),
    ...git(["diff", "--cached", "--name-only", "--", "workflow"]),
  ];
  assert.strictEqual(changed.length, 0, changed.join(", "));
  return "workflow unchanged";
});

check("protected_catalog_runtime_sources_not_modified", () => {
  const protectedPrefixes = [
    "data/concepts.normalized.json",
    "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
    "runtime/",
  ];
  const changed = [
    ...git(["diff", "--name-only"]),
    ...git(["diff", "--cached", "--name-only"]),
  ].filter((file) => protectedPrefixes.some((prefix) => file === prefix || file.startsWith(prefix)));
  assert.strictEqual(changed.length, 0, changed.join(", "));
  return "protected paths clean";
});

console.log("Factura.com Official API Discovery Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

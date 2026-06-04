const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { PAC_ENVIRONMENTS } = require("./lib/canonical-cfdi-contracts");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const {
  PROVIDER,
  assertFacturaComSandboxPayload,
  mapCanonicalInvoiceToFacturaComPayload,
  normalizeFacturaComErrorResponse,
  normalizeFacturaComSuccessResponse,
} = require("./lib/factura-com-payload-mapper");

const root = path.resolve(__dirname, "..");
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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildScenario(draftId) {
  const fixture = drafts.find((item) => item.draft_id === draftId);
  assert(fixture, `fixture ${draftId} no existe`);
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
  return {
    fixture,
    canonicalDraft,
    invoice: promoted.invoice_document,
    canonicalPacRequest,
  };
}

function mapScenario(draftId) {
  const scenario = buildScenario(draftId);
  const payload = mapCanonicalInvoiceToFacturaComPayload(scenario.invoice, {
    canonicalDraft: scenario.canonicalDraft,
    canonicalPacRequest: scenario.canonicalPacRequest,
  });
  const validation = assertFacturaComSandboxPayload(payload);
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return { ...scenario, payload };
}

function expectMapperError(name, fn, expectedCode) {
  check(name, () => {
    assert.throws(fn, (error) => {
      assert.strictEqual(error.name, "FacturaComPayloadMapperError");
      if (expectedCode) assert.strictEqual(error.code, expectedCode);
      return true;
    });
    return expectedCode || "controlled";
  });
}

check("convierte_servicio_cctv_a_payload_facturacom_mock", () => {
  const { payload } = mapScenario("DRAFT-DEMO-CCTV-SERVICE");
  assert.strictEqual(payload.provider, PROVIDER);
  assert.strictEqual(payload.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(payload.concepts[0].clave_prod_serv, "81111811");
  assert.strictEqual(payload.concepts[0].clave_unidad, "E48");
  return payload.concepts[0].description;
});

check("convierte_producto_cctv", () => {
  const { payload } = mapScenario("DRAFT-DEMO-CCTV-PRODUCT");
  assert.strictEqual(payload.concepts[0].clave_unidad, "H87");
  assert.strictEqual(payload.concepts[0].clave_prod_serv, "45121500");
  return payload.concepts[0].line_id;
});

check("convierte_instalacion_control_acceso", () => {
  const { payload } = mapScenario("DRAFT-DEMO-ACCESS-INSTALL");
  assert.strictEqual(payload.concepts[0].clave_prod_serv, "72151701");
  assert.strictEqual(payload.concepts[0].tax_object, "02");
  return payload.draft_id;
});

check("convierte_mantenimiento_barrera", () => {
  const { payload } = mapScenario("DRAFT-DEMO-BARRIER-MAINTENANCE");
  assert.strictEqual(payload.concepts[0].clave_prod_serv, "72151704");
  return payload.totals.total;
});

check("convierte_multilinea", () => {
  const { payload } = mapScenario("DRAFT-DEMO-MULTILINE-MATERIAL-SERVICE");
  assert.strictEqual(payload.concepts.length, 2);
  assert.strictEqual(payload.concepts[0].clave_unidad, "H87");
  assert.strictEqual(payload.concepts[1].clave_unidad, "E48");
  return `${payload.concepts.length} concepts`;
});

expectMapperError("receptor_incompleto_falla_controlado", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  mapCanonicalInvoiceToFacturaComPayload(invoice, {
    canonicalDraft,
    canonicalPacRequest,
    receiver: { ...canonicalDraft.receiver, rfc: null },
  });
}, "FACTURA_COM_REQUIRED_FIELD");

expectMapperError("falta_clave_sat_falla_controlado", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  const lineItems = clone(canonicalDraft.line_items);
  lineItems[0].product_service_key = null;
  mapCanonicalInvoiceToFacturaComPayload(invoice, { canonicalPacRequest, canonicalDraft, line_items: lineItems });
}, "FACTURA_COM_REQUIRED_FIELD");

expectMapperError("falta_unidad_falla_controlado", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  const lineItems = clone(canonicalDraft.line_items);
  lineItems[0].unit_key = null;
  mapCanonicalInvoiceToFacturaComPayload(invoice, { canonicalPacRequest, canonicalDraft, line_items: lineItems });
}, "FACTURA_COM_REQUIRED_FIELD");

expectMapperError("falta_cp_regimen_rfc_falla_controlado", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  mapCanonicalInvoiceToFacturaComPayload(invoice, {
    canonicalDraft,
    canonicalPacRequest,
    receiver: { ...canonicalDraft.receiver, rfc: null, tax_regime: null, fiscal_zip: null },
  });
}, "FACTURA_COM_REQUIRED_FIELD");

check("no_inventa_campos_fiscales", () => {
  const { payload, canonicalDraft } = mapScenario("DRAFT-DEMO-CCTV-SERVICE");
  assert.strictEqual(payload.receiver.rfc, canonicalDraft.receiver.rfc);
  assert.strictEqual(payload.receiver.tax_regime, canonicalDraft.receiver.tax_regime);
  assert.strictEqual(payload.receiver.fiscal_zip, canonicalDraft.receiver.fiscal_zip);
  assert.strictEqual(payload.concepts[0].clave_prod_serv, canonicalDraft.line_items[0].product_service_key);
  assert.strictEqual(payload.concepts[0].clave_unidad, canonicalDraft.line_items[0].unit_key);
  return "canonical values preserved";
});

check("environment_siempre_sandbox", () => {
  const { payload } = mapScenario("DRAFT-DEMO-CCTV-SERVICE");
  assert.strictEqual(payload.environment, PAC_ENVIRONMENTS.SANDBOX);
  return payload.environment;
});

expectMapperError("production_bloqueado", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  mapCanonicalInvoiceToFacturaComPayload({ ...invoice, pac_environment: PAC_ENVIRONMENTS.PRODUCTION }, {
    canonicalDraft,
    canonicalPacRequest,
  });
}, "FACTURA_COM_PRODUCTION_BLOCKED");

check("no_muta_canonical_invoice", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = buildScenario("DRAFT-DEMO-CCTV-SERVICE");
  const before = JSON.stringify(invoice);
  mapCanonicalInvoiceToFacturaComPayload(invoice, { canonicalDraft, canonicalPacRequest });
  assert.strictEqual(JSON.stringify(invoice), before);
  return "immutable";
});

check("normalized_success_produce_canonical_pac_result_ok_true", () => {
  const response = successResponses.find((item) => item.fixture_id === "SUCCESS-CCTV-SERVICE");
  const result = normalizeFacturaComSuccessResponse(response, { operation: "stampSandbox" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.provider, PROVIDER);
  assert.strictEqual(result.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(result.uuid, "00000000-0000-4000-8000-000000000001");
  return result.status;
});

check("normalized_error_produce_canonical_pac_result_ok_false", () => {
  const error = errorResponses.find((item) => item.fixture_id === "ERROR-REQUIRED-FIELD-MISSING");
  const result = normalizeFacturaComErrorResponse(error, { operation: "stampSandbox" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.normalized_errors.length, 1);
  assert.strictEqual(result.normalized_errors[0].code, "REQUIRED_FIELD_MISSING");
  return result.status;
});

check("cancelacion_mock_ok_normaliza_cancelInvoice", () => {
  const response = successResponses.find((item) => item.fixture_id === "CANCEL-SANDBOX-OK");
  const result = normalizeFacturaComSuccessResponse(response, { operation: "cancelInvoice" });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.operation, "cancelInvoice");
  assert.strictEqual(result.status, "SANDBOX_CANCELLED");
  return result.uuid;
});

check("cancelacion_mock_error_normaliza_cancel_failed", () => {
  const error = errorResponses.find((item) => item.fixture_id === "CANCEL-SANDBOX-ERROR");
  const result = normalizeFacturaComErrorResponse(error, { operation: "cancelInvoice" });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "CANCEL_FAILED");
  assert.strictEqual(result.requires_human_review, true);
  return result.normalized_errors[0].code;
});

console.log("Factura.com Payload Mapper Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

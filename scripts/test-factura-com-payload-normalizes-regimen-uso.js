const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const { buildCanonicalPacRequest, promoteCanonicalDraftToInvoiceDocument } = require("./lib/canonical-invoice-builder");
const { mapCanonicalInvoiceToFacturaComPayload } = require("./lib/factura-com-payload-mapper");

const root = path.resolve(__dirname, "..");
const clients = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-clients.json"), "utf8"));
const drafts = JSON.parse(fs.readFileSync(path.join(root, "data", "sandbox", "canonical-test-drafts.json"), "utf8"));
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function scenario() {
  const fixture = drafts.find((item) => item.draft_id === "DRAFT-DEMO-CCTV-SERVICE");
  const fixtureClient = clients.find((item) => item.client_id === fixture.client_ref);
  const client = {
    ...fixtureClient,
    tax_regime: "Personas Morales con Fines no Lucrativos",
    regimen_fiscal: "Personas Morales con Fines no Lucrativos",
    cfdi_use: "Gastos en general",
    uso_cfdi_default: "Gastos en general",
    person_type: "MORAL",
  };
  const canonicalDraft = buildCanonicalDraftFromBotPreview({ draft: fixture, client });
  const promoted = promoteCanonicalDraftToInvoiceDocument(canonicalDraft, { issued_at: "2026-06-04T00:00:00.000Z" });
  assert.strictEqual(promoted.ok, true, promoted.errors.join(", "));
  const pacRequestResult = buildCanonicalPacRequest(promoted.invoice_document, "stampSandbox");
  assert.strictEqual(pacRequestResult.ok, true, pacRequestResult.errors.join(", "));
  return {
    canonicalDraft,
    invoice: promoted.invoice_document,
    canonicalPacRequest: pacRequestResult.pac_request,
  };
}

check("payload_usa_claves_sat_normalizadas_en_receptor_y_uso", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = scenario();
  const payload = mapCanonicalInvoiceToFacturaComPayload(invoice, {
    canonicalDraft,
    canonicalPacRequest,
    factura_com: {
      receptor_uid: "UID-SANDBOX-TEST",
      TipoDocumento: "factura",
      UsoCFDI: "Gastos en general",
      FormaPago: "Transferencia electrónica de fondos",
      MetodoPago: "Pago en una sola exhibición",
      Moneda: "Peso Mexicano",
      LugarExpedicion: "77500",
    },
  });
  assert.strictEqual(payload.receiver.tax_regime, "603");
  assert.strictEqual(payload.receiver.cfdi_use, "G03");
  assert.strictEqual(payload.official_request.body.Receptor.RegimenFiscalR, "603");
  assert.strictEqual(payload.official_request.body.UsoCFDI, "G03");
  assert.strictEqual(payload.official_request.body.FormaPago, "03");
  assert.strictEqual(payload.official_request.body.MetodoPago, "PUE");
  assert.strictEqual(payload.official_request.body.Moneda, "MXN");
  assert.ok(payload.official_request.local_config_warnings.includes("SAT_DESCRIPTION_NORMALIZED_TO_KEY"));
  return `${payload.official_request.body.Receptor.RegimenFiscalR}/${payload.official_request.body.UsoCFDI}`;
});

check("uso_cfdi_g1_sigue_como_unresolved", () => {
  const { invoice, canonicalDraft, canonicalPacRequest } = scenario();
  const payload = mapCanonicalInvoiceToFacturaComPayload(invoice, {
    canonicalDraft,
    canonicalPacRequest,
    factura_com: {
      receptor_uid: "UID-SANDBOX-TEST",
      TipoDocumento: "factura",
      UsoCFDI: "G1",
      FormaPago: "03",
      MetodoPago: "PUE",
      Moneda: "MXN",
      LugarExpedicion: "77500",
    },
  });
  assert.ok(payload.official_request.unresolved_fields.some((item) => item.includes("options_uso_cfdi")));
  assert.strictEqual(payload.official_request.body.UsoCFDI, "G1");
  return "G1 blocked";
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

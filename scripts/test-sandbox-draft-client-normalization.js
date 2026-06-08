const assert = require("assert");
const { normalizeDraftRow } = require("./lib/sandbox-draft-db-loader");
const { canonicalInputFromDraft } = require("./lib/sandbox-draft-stamp-action");

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

const baseDraft = {
  draft_id: "DRAFT-TEST-NORMALIZATION",
  status: "APROBADO",
  invoice_status: "BORRADOR",
  payment_status: "PENDIENTE",
  client_id: "CLI-REAL-BILBAO",
  client_found: true,
  amount: 100,
  subtotal: 100,
  iva_amount: 16,
  total: 116,
  tax_mode: "IVA_16",
  concept: {
    id: "SVC-CCTV-001",
    concepto_factura: "SERVICIO DE REVISION CCTV",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    objeto_imp: "02",
  },
  line_items: [],
  blockers: [],
};

check("current_client_normalizado_prevalece_sobre_snapshot_viejo", () => {
  const draft = normalizeDraftRow({
    ...baseDraft,
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      rfc: "XAXX010101000",
      razon_social: "Real Bilbao",
      regimen_fiscal: "603",
      uso_cfdi_default: "G03",
      codigo_postal_fiscal: "77500",
      tipo_persona: "MORAL",
      validated_by_human: true,
    },
    client_snapshot: {
      client_id: "CLI-REAL-BILBAO",
      regimen_fiscal: "Personas Morales con Fines no Lucrativos",
      uso_cfdi_default: "Gastos en general",
      codigo_postal_fiscal: "77500",
    },
  });
  assert.strictEqual(draft.current_client.regimen_fiscal, "603");
  assert.strictEqual(draft.client.regimen_fiscal, "603");
  const canonicalInput = canonicalInputFromDraft(draft);
  assert.strictEqual(canonicalInput.client.regimen_fiscal, "603");
  assert.strictEqual(canonicalInput.client.uso_cfdi_default, "G03");
  return canonicalInput.client.regimen_fiscal;
});

check("snapshot_historico_con_descripcion_se_normaliza_si_no_hay_current", () => {
  const draft = normalizeDraftRow({
    ...baseDraft,
    current_client: {},
    client_snapshot: {
      client_id: "CLI-REAL-BILBAO",
      rfc: "XAXX010101000",
      razon_social: "Real Bilbao",
      regimen_fiscal: "Personas Morales con Fines no Lucrativos",
      uso_cfdi_default: "Gastos en general",
      codigo_postal_fiscal: "77500",
      tipo_persona: "MORAL",
      validated_by_human: true,
    },
  });
  assert.strictEqual(draft.client_snapshot.regimen_fiscal, "603");
  assert.strictEqual(draft.client_snapshot.uso_cfdi_default, "G03");
  assert.ok(draft.client_fiscal_normalization_report.client_snapshot.regimen_fiscal.ok);
  return `${draft.client_snapshot.regimen_fiscal}/${draft.client_snapshot.uso_cfdi_default}`;
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

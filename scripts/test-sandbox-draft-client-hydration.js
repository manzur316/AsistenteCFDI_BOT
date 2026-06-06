const assert = require("assert");

const { normalizeDraftRow, buildDraftByIdQuery } = require("./lib/sandbox-draft-db-loader");
const { canonicalInputFromDraft, validateDraftForSandboxStamp } = require("./lib/sandbox-draft-stamp-action");

const currentClient = {
  client_id: "CLI-REAL-BILBAO",
  display_name: "Real Bilbao",
  razon_social: "PROPIETARIOS DE REAL BILBAO",
  rfc: "PRB150731II8",
  regimen_fiscal: "603",
  codigo_postal_fiscal: "77723",
  uso_cfdi_default: "G03",
  tipo_persona: "MORAL_SIN_FINES_LUCRO",
  validated_by_human: true,
};

const oldSnapshot = {
  client_id: "CLI-REAL-BILBAO",
  display_name: "Real Bilbao",
  validated_by_human: false,
};

function draftRow(overrides = {}) {
  return {
    draft_id: "DRAFT-20260606-071142-173694258",
    status: "APROBADO",
    invoice_status: "SANDBOX_ERROR",
    payment_status: "NO_APLICA",
    client_id: "CLI-REAL-BILBAO",
    client_found: true,
    current_client: currentClient,
    historical_client_snapshot: oldSnapshot,
    client_snapshot: currentClient,
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA CCTV",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
    },
    amount: 7887,
    subtotal: 7887,
    iva_amount: 1261.92,
    total: 9148.92,
    tax_mode: "MAS_IVA",
    blockers: [],
    line_items: [],
    ...overrides,
  };
}

const checks = [];
function check(name, fn) {
  try { checks.push({ name, pass: true, value: fn() || "" }); } catch (error) { checks.push({ name, pass: false, value: error.message }); }
}

check("query_prioritizes_current_client_from_cfdi_clients", () => {
  const sql = buildDraftByIdQuery("DRAFT-1");
  assert(sql.includes("AS current_client"));
  assert(sql.includes("COALESCE(to_jsonb(c)"));
  assert(sql.includes("historical_client_snapshot"));
  assert(sql.includes("client_found"));
  assert(sql.indexOf("to_jsonb(c)") < sql.indexOf("NULLIF(d.client_snapshot"));
  return "current_client";
});

check("normalized_draft_uses_current_client_not_stale_snapshot", () => {
  const draft = normalizeDraftRow(draftRow());
  assert.strictEqual(draft.client.validated_by_human, true);
  assert.strictEqual(draft.client_snapshot.validated_by_human, true);
  assert.strictEqual(draft.historical_client_snapshot.validated_by_human, false);
  return draft.client.display_name;
});

check("validation_does_not_block_on_stale_snapshot_false", () => {
  const draft = normalizeDraftRow(draftRow());
  const result = validateDraftForSandboxStamp(draft, { FACTURACOM_SANDBOX_LIVE: "1" });
  assert(!result.errors.includes("client_not_validated"));
  assert(!result.errors.includes("client_rfc_required"));
  assert(!result.errors.includes("client_regimen_required"));
  assert(!result.errors.includes("client_fiscal_zip_required"));
  return result.status;
});

check("canonical_input_uses_current_client", () => {
  const input = canonicalInputFromDraft(normalizeDraftRow(draftRow()));
  assert.strictEqual(input.client.validated_by_human, true);
  assert.strictEqual(input.client.rfc, "PRB150731II8");
  assert.strictEqual(input.historical_client_snapshot.validated_by_human, false);
  return input.client.client_id;
});

check("missing_current_client_returns_client_not_found", () => {
  const draft = normalizeDraftRow(draftRow({ client_found: false, current_client: {}, client_snapshot: oldSnapshot }));
  const result = validateDraftForSandboxStamp(draft, { FACTURACOM_SANDBOX_LIVE: "1" });
  assert(result.errors.includes("CLIENT_NOT_FOUND"));
  return result.errors.join(",");
});

for (const item of checks) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

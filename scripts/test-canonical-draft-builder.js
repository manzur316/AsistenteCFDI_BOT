const assert = require("assert");
const {
  REVIEW_STATUSES,
  validateCanonicalDraft,
} = require("./lib/canonical-cfdi-contracts");
const {
  assertCanonicalDraftReadyForPac,
  buildCanonicalDraftFromBotPreview,
  buildCanonicalLineItemFromConcept,
  buildCanonicalReceiverFromClient,
} = require("./lib/canonical-draft-builder");

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

function demoClient(overrides = {}) {
  return {
    client_id: "CLIENT-DEMO",
    display_name: "Cliente Demo",
    legal_name: "CLIENTE GENERICO DEMO",
    rfc: "XAXX010101000",
    tax_regime: "612",
    fiscal_zip: "00000",
    person_type: "FISICA",
    validated_by_human: true,
    ...overrides,
  };
}

function demoConcept(overrides = {}) {
  return {
    id: "SVC-CCTV-DEMO",
    concepto_factura: "SERVICIO TECNICO CCTV DEMO",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    familia: "CCTV",
    tipo: "SERVICIO",
    operacion: "SERVICIO",
    ...overrides,
  };
}

function demoPreview(overrides = {}) {
  return {
    draft_id: "DRAFT-DEMO",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    source_channel: "TELEGRAM",
    source_message_id: "UPDATE-DEMO-1",
    original_text: "Cliente demo, revise camaras por 1000 + IVA",
    confirmed_by_human: true,
    requires_human_review: true,
    ready_to_copy: true,
    blockers: [],
    client: demoClient(),
    concept: demoConcept(),
    amount: 1000,
    subtotal: 1000,
    iva_amount: 160,
    total: 1160,
    ...overrides,
  };
}

check("preview_simple_a_canonical_draft_valido", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview());
  const validation = validateCanonicalDraft(draft);
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  assert.strictEqual(draft.ready_for_pac, true);
  return draft.draft_id;
});

check("cliente_validado_a_canonical_receiver_valido", () => {
  const receiver = buildCanonicalReceiverFromClient(demoClient());
  assert.strictEqual(receiver.validated_by_human, true);
  assert.strictEqual(receiver.rfc, "XAXX010101000");
  assert.strictEqual(receiver.tax_regime, "612");
  assert.strictEqual(receiver.fiscal_zip, "00000");
  return receiver.client_id;
});

check("cliente_no_validado_conserva_warning", () => {
  const receiver = buildCanonicalReceiverFromClient(demoClient({ validated_by_human: false }));
  assert.strictEqual(receiver.validated_by_human, false);
  assert(receiver.validation_warnings.includes("cliente_no_validado_por_humano"));
  return receiver.validation_warnings.join(",");
});

check("draft_con_blocker_no_esta_listo_para_pac", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({ blockers: [{ type: "cliente_no_validado" }] }));
  const readiness = assertCanonicalDraftReadyForPac(draft);
  assert.strictEqual(readiness.ok, false);
  assert(readiness.errors.includes("draft_con_blockers_no_listo_para_pac"));
  return draft.review_status;
});

check("draft_confirmado_sin_blockers_listo_para_pac", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview());
  const readiness = assertCanonicalDraftReadyForPac(draft);
  assert.strictEqual(readiness.ok, true, readiness.errors.join(", "));
  assert.strictEqual(draft.review_status, REVIEW_STATUSES.APPROVED_BY_HUMAN);
  return "ready";
});

check("line_item_conserva_clave_sat_y_unidad_auditada", () => {
  const line = buildCanonicalLineItemFromConcept(demoConcept(), { amount: 1000, iva_amount: 160 });
  assert.strictEqual(line.product_service_key, "81111811");
  assert.strictEqual(line.unit_key, "E48");
  assert.strictEqual(line.unit_name, "Unidad de servicio");
  return `${line.product_service_key}/${line.unit_key}`;
});

check("multilinea_genera_varias_partidas", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({
    concept: undefined,
    line_items: [
      { line_id: "L1", concept: demoConcept({ id: "PROD-DEMO", clave_prod_serv: "45121500", clave_unidad: "H87", unidad: "Pieza" }), subtotal: 700, iva_amount: 112 },
      { line_id: "L2", concept: demoConcept({ id: "SVC-DEMO" }), subtotal: 800, iva_amount: 128 },
    ],
    subtotal: 1500,
    iva_amount: 240,
    total: 1740,
  }));
  assert.strictEqual(draft.line_items.length, 2);
  assert.strictEqual(draft.totals.total, 1740);
  return `${draft.line_items.length} lines`;
});

check("no_inventa_rfc_regimen_cp_si_faltan", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({
    client: demoClient({ rfc: null, tax_regime: null, fiscal_zip: null, validated_by_human: false }),
  }));
  assert.strictEqual(draft.receiver.rfc, null);
  assert.strictEqual(draft.receiver.tax_regime, null);
  assert.strictEqual(draft.receiver.fiscal_zip, null);
  assert(draft.blockers.some((item) => item.type === "rfc_faltante"));
  assert.strictEqual(draft.ready_for_pac, false);
  return draft.review_status;
});

check("requires_human_review_siempre_true", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({ requires_human_review: false }));
  assert.strictEqual(draft.requires_human_review, true);
  assert(draft.line_items.every((line) => line.requires_human_review === true));
  return "true";
});

check("confirmed_by_human_false_bloquea_pac", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({ confirmed_by_human: false }));
  const readiness = assertCanonicalDraftReadyForPac(draft);
  assert.strictEqual(readiness.ok, false);
  assert(readiness.errors.includes("confirmed_by_human requerido para PAC"));
  return "blocked";
});

check("fixture_incompleto_no_se_promueve", () => {
  const draft = buildCanonicalDraftFromBotPreview(demoPreview({
    client: demoClient({ rfc: null, tax_regime: null, fiscal_zip: null, validated_by_human: false }),
    confirmed_by_human: true,
  }));
  const readiness = assertCanonicalDraftReadyForPac(draft);
  assert.strictEqual(draft.review_status, REVIEW_STATUSES.NEEDS_REVIEW);
  assert.strictEqual(readiness.ok, false);
  return "NEEDS_REVIEW";
});

console.log("Canonical Draft Builder Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

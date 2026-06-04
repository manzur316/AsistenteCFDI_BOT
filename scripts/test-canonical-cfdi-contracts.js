const assert = require("assert");
const {
  ARTIFACT_TYPES,
  CANCELLATION_STATUSES,
  INVOICE_STATUSES,
  PAC_ENVIRONMENTS,
  PAYMENT_STATUSES,
  REVIEW_STATUSES,
  validateCancellationTransition,
  validateCanonicalDraft,
  validateCanonicalInvoiceDocument,
  validateCanonicalPacResult,
  validatePaymentStatus,
} = require("./lib/canonical-cfdi-contracts");

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

function lineItem(overrides = {}) {
  return {
    line_id: "LINE-DEMO-001",
    description: "Servicio tecnico demo",
    quantity: 1,
    unit_key: "E48",
    unit_name: "Unidad de servicio",
    product_service_key: "81111811",
    unit_price: 1000,
    subtotal: 1000,
    tax_object: "02",
    taxes: [],
    activity_scope: { activity_ids: ["A2"], result: "ALLOW_CANDIDATE" },
    source_confidence: 92,
    requires_human_review: true,
    ...overrides,
  };
}

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-DEMO-001",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    source_channel: "TELEGRAM",
    source_message_id: "MSG-DEMO-001",
    original_text: "Servicio tecnico demo",
    status: INVOICE_STATUSES.DRAFT,
    review_status: REVIEW_STATUSES.NEEDS_REVIEW,
    confirmed_by_human: false,
    requires_human_review: true,
    created_at: "2026-06-04T00:00:00.000Z",
    updated_at: "2026-06-04T00:00:00.000Z",
    fiscal_warnings: [],
    blockers: [],
    line_items: [lineItem()],
    totals: {
      subtotal: 1000,
      taxes: {
        iva_transferred: 160,
        iva_retained: 0,
        isr_retained: 0,
        ieps: 0,
        total_taxes_transferred: 160,
        total_taxes_retained: 0,
        warnings: [],
      },
      total: 1160,
    },
    ...overrides,
  };
}

function validInvoice(overrides = {}) {
  return {
    internal_invoice_id: "INV-DEMO-001",
    draft_id: "DRAFT-DEMO-001",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    pac_provider: "FACTURA_COM",
    pac_environment: PAC_ENVIRONMENTS.SANDBOX,
    pac_invoice_id: "SANDBOX-INVOICE-001",
    uuid: "SANDBOX-UUID-001",
    serie: "S",
    folio: "1",
    status: INVOICE_STATUSES.SANDBOX_STAMPED,
    payment_status: PAYMENT_STATUSES.UNPAID,
    review_status: REVIEW_STATUSES.NEEDS_REVIEW,
    subtotal: 1000,
    taxes: {
      iva_transferred: 160,
      iva_retained: 0,
      isr_retained: 0,
      ieps: 0,
      total_taxes_transferred: 160,
      total_taxes_retained: 0,
      warnings: [],
    },
    total: 1160,
    issued_at: "2026-06-04T00:00:00.000Z",
    stamped_at: "2026-06-04T00:01:00.000Z",
    cancelled_at: null,
    storage_refs: {},
    pac_refs: {},
    audit_refs: [],
    ...overrides,
  };
}

function validPacResult(overrides = {}) {
  return {
    ok: true,
    provider: "FACTURA_COM",
    environment: PAC_ENVIRONMENTS.SANDBOX,
    operation: "stampSandbox",
    status: "SANDBOX_STAMPED",
    pac_invoice_id: "SANDBOX-INVOICE-001",
    uuid: "SANDBOX-UUID-001",
    serie: "S",
    folio: "1",
    xml_available: true,
    pdf_available: true,
    raw_response_ref: "ARTIFACT-PAC-001",
    normalized_errors: [],
    normalized_warnings: [],
    requires_human_review: true,
    ...overrides,
  };
}

check("exports_required_constants", () => {
  assert.strictEqual(INVOICE_STATUSES.DRAFT, "DRAFT");
  assert.strictEqual(PAYMENT_STATUSES.UNPAID, "UNPAID");
  assert.strictEqual(REVIEW_STATUSES.NEEDS_REVIEW, "NEEDS_REVIEW");
  assert.strictEqual(CANCELLATION_STATUSES.SANDBOX_CANCELLED, "SANDBOX_CANCELLED");
  assert.strictEqual(PAC_ENVIRONMENTS.SANDBOX, "SANDBOX");
  assert.strictEqual(ARTIFACT_TYPES.PAYLOAD_JSON, "PAYLOAD_JSON");
  return "constants";
});

check("draft_valido_pasa", () => {
  const validation = validateCanonicalDraft(validDraft());
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  assert(validation.warnings.includes("draft aun no confirmado por humano"));
  return validation.contract;
});

check("draft_sin_review_humana_falla", () => {
  const validation = validateCanonicalDraft(validDraft({ requires_human_review: false }));
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("requires_human_review debe ser true"));
  return "requires_human_review";
});

check("invoice_sandbox_valido_pasa", () => {
  const validation = validateCanonicalInvoiceDocument(validInvoice());
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return validation.contract;
});

check("invoice_production_sin_autorizacion_falla", () => {
  const validation = validateCanonicalInvoiceDocument(validInvoice({
    pac_environment: PAC_ENVIRONMENTS.PRODUCTION,
    status: INVOICE_STATUSES.PRODUCTION_STAMPED,
  }));
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.some((item) => item.includes("produccion no autorizada")));
  return "production blocked";
});

check("pac_result_error_normalizado_pasa", () => {
  const validation = validateCanonicalPacResult(validPacResult({
    ok: false,
    status: "PAC_ERROR",
    normalized_errors: [{ code: "PAC_422", message: "Error sandbox demo" }],
    xml_available: false,
    pdf_available: false,
  }));
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return validation.contract;
});

check("payment_status_valido_pasa", () => {
  const validation = validatePaymentStatus(PAYMENT_STATUSES.PAID);
  assert.strictEqual(validation.ok, true);
  return PAYMENT_STATUSES.PAID;
});

check("estado_desconocido_falla", () => {
  const validation = validateCanonicalInvoiceDocument(validInvoice({ status: "BORRAR" }));
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("status desconocido"));
  return "unknown status";
});

check("transicion_draft_a_draft_cancelled_valida", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.DRAFT,
    nextStatus: INVOICE_STATUSES.DRAFT_CANCELLED,
    reason: "operacion_no_realizada",
  });
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  assert.strictEqual(validation.must_delete, false);
  assert.strictEqual(validation.audit_required, true);
  return "local cancel";
});

check("transicion_sandbox_stamped_a_sandbox_cancelled_sin_request_falla", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.SANDBOX_STAMPED,
    nextStatus: INVOICE_STATUSES.SANDBOX_CANCELLED,
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_CANCELLED requiere solicitud previa"));
  return "request required";
});

check("transicion_sandbox_cancel_requested_a_sandbox_cancelled_valida", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED,
    nextStatus: INVOICE_STATUSES.SANDBOX_CANCELLED,
    pacResult: validPacResult({ operation: "cancelSandbox", status: "SANDBOX_CANCELLED" }),
  });
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return "sandbox cancelled";
});

check("transicion_pac_error_a_cancel_failed_valida", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED,
    nextStatus: INVOICE_STATUSES.CANCEL_FAILED,
    pacResult: validPacResult({
      ok: false,
      operation: "cancelSandbox",
      status: "PAC_ERROR",
      normalized_errors: [{ code: "PAC_TIMEOUT", message: "timeout demo" }],
    }),
  });
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return "cancel failed";
});

check("cancelado_no_se_elimina_solo_cambia_estado", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.DRAFT,
    nextStatus: INVOICE_STATUSES.DRAFT_CANCELLED,
    reason: "duplicada",
  });
  assert.strictEqual(validation.must_delete, false);
  assert.strictEqual(validation.previous_status, INVOICE_STATUSES.DRAFT);
  assert.strictEqual(validation.new_status, INVOICE_STATUSES.DRAFT_CANCELLED);
  return "audit only";
});

check("production_cancellation_bloqueada_por_ahora", () => {
  const validation = validateCancellationTransition({
    currentStatus: INVOICE_STATUSES.PRODUCTION_STAMPED,
    nextStatus: INVOICE_STATUSES.PRODUCTION_CANCEL_REQUESTED,
    reason: "error_cliente",
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("cancelacion de produccion bloqueada por ahora"));
  return "production cancellation blocked";
});

console.log("Canonical CFDI Contracts Tests");
for (const item of checks) {
  printCheck(item.name, item.pass, item.value);
}

const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

const assert = require("assert");
const {
  ARTIFACT_TYPES,
  INVOICE_STATUSES,
  PAC_ENVIRONMENTS,
} = require("./lib/canonical-cfdi-contracts");
const { buildCanonicalDraftFromBotPreview } = require("./lib/canonical-draft-builder");
const {
  buildCanonicalAuditEvent,
  buildCanonicalPacRequest,
  buildCanonicalStorageArtifact,
  promoteCanonicalDraftToInvoiceDocument,
} = require("./lib/canonical-invoice-builder");

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

function readyDraft(overrides = {}) {
  return buildCanonicalDraftFromBotPreview({
    draft_id: "DRAFT-INVOICE-DEMO",
    emitter_id: "EMITTER-DEMO",
    client_id: "CLIENT-DEMO",
    source_channel: "TELEGRAM",
    source_message_id: "UPDATE-DEMO-2",
    original_text: "Cliente demo, servicio tecnico por 1000 + IVA",
    confirmed_by_human: true,
    client: {
      client_id: "CLIENT-DEMO",
      display_name: "Cliente Demo",
      legal_name: "CLIENTE GENERICO DEMO",
      rfc: "XAXX010101000",
      tax_regime: "612",
      fiscal_zip: "00000",
      person_type: "FISICA",
      validated_by_human: true,
    },
    concept: {
      id: "SVC-DEMO",
      concepto_factura: "SERVICIO TECNICO DEMO",
      clave_prod_serv: "81111811",
      clave_unidad: "E48",
      unidad: "Unidad de servicio",
    },
    subtotal: 1000,
    iva_amount: 160,
    total: 1160,
    ...overrides,
  });
}

check("canonical_draft_confirmado_a_invoice_document", () => {
  const promoted = promoteCanonicalDraftToInvoiceDocument(readyDraft(), { issued_at: "2026-06-04T00:00:00.000Z" });
  assert.strictEqual(promoted.ok, true, promoted.errors.join(", "));
  assert.strictEqual(promoted.invoice_document.draft_id, "DRAFT-INVOICE-DEMO");
  assert.strictEqual(promoted.invoice_document.status, INVOICE_STATUSES.READY_FOR_PAC_SANDBOX);
  return promoted.invoice_document.internal_invoice_id;
});

check("draft_con_blockers_no_se_promueve", () => {
  const promoted = promoteCanonicalDraftToInvoiceDocument(readyDraft({ blockers: [{ type: "demo_blocker" }] }));
  assert.strictEqual(promoted.ok, false);
  assert(promoted.errors.includes("draft_con_blockers_no_listo_para_pac"));
  return "blocked";
});

check("draft_no_confirmado_no_se_promueve", () => {
  const promoted = promoteCanonicalDraftToInvoiceDocument(readyDraft({ confirmed_by_human: false }));
  assert.strictEqual(promoted.ok, false);
  assert(promoted.errors.includes("confirmed_by_human requerido para PAC"));
  return "not confirmed";
});

check("invoice_document_usa_sandbox_por_default", () => {
  const promoted = promoteCanonicalDraftToInvoiceDocument(readyDraft());
  assert.strictEqual(promoted.invoice_document.pac_environment, PAC_ENVIRONMENTS.SANDBOX);
  return promoted.invoice_document.pac_environment;
});

check("produccion_esta_bloqueada", () => {
  const promoted = promoteCanonicalDraftToInvoiceDocument(readyDraft(), { pac_environment: PAC_ENVIRONMENTS.PRODUCTION });
  assert.strictEqual(promoted.ok, false);
  assert(promoted.errors.includes("produccion_bloqueada_por_default"));
  return "blocked";
});

check("build_pac_request_genera_idempotency_key", () => {
  const invoice = promoteCanonicalDraftToInvoiceDocument(readyDraft()).invoice_document;
  const request = buildCanonicalPacRequest(invoice, "stampSandbox");
  assert.strictEqual(request.ok, true, request.errors.join(", "));
  assert(request.pac_request.idempotency_key.startsWith("PACREQ-"));
  return request.pac_request.idempotency_key;
});

check("operacion_stampSandbox_produce_canonical_pac_request", () => {
  const invoice = promoteCanonicalDraftToInvoiceDocument(readyDraft()).invoice_document;
  const request = buildCanonicalPacRequest(invoice, "stampSandbox");
  assert.strictEqual(request.pac_request.operation, "stampSandbox");
  assert.strictEqual(request.pac_request.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(request.pac_request.provider, "PAC_ADAPTER_HUB");
  return request.pac_request.operation;
});

check("cancelInvoice_requiere_invoiceRef_estado_compatible", () => {
  const invoice = promoteCanonicalDraftToInvoiceDocument(readyDraft()).invoice_document;
  const request = buildCanonicalPacRequest(invoice, "cancelInvoice");
  assert.strictEqual(request.ok, false);
  assert(request.errors.includes("cancelInvoice requiere estado timbrado o solicitud de cancelacion"));
  const stamped = { ...invoice, status: INVOICE_STATUSES.SANDBOX_STAMPED, pac_invoice_id: "PAC-DEMO-1" };
  const cancel = buildCanonicalPacRequest(stamped, "cancelInvoice");
  assert.strictEqual(cancel.ok, true, cancel.errors.join(", "));
  return "cancel guarded";
});

check("audit_event_registra_previous_new_status", () => {
  const event = buildCanonicalAuditEvent({
    entity_id: "INV-DEMO",
    previous_status: INVOICE_STATUSES.READY_FOR_PAC_SANDBOX,
    new_status: INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED,
    reason: "demo",
    actor: "USER-DEMO",
  });
  assert.strictEqual(event.previous_status, INVOICE_STATUSES.READY_FOR_PAC_SANDBOX);
  assert.strictEqual(event.new_status, INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED);
  return event.event_type;
});

check("storage_artifact_marca_sensitive_correctamente", () => {
  const payloadArtifact = buildCanonicalStorageArtifact({
    artifact_type: ARTIFACT_TYPES.PAYLOAD_JSON,
    internal_invoice_id: "INV-DEMO",
    draft_id: "DRAFT-DEMO",
    storage_path: "storage/demo/payload.json",
  });
  const reportArtifact = buildCanonicalStorageArtifact({
    artifact_type: ARTIFACT_TYPES.REPORT,
    internal_invoice_id: "INV-DEMO",
    draft_id: "DRAFT-DEMO",
    storage_path: "storage/demo/report.json",
  });
  assert.strictEqual(payloadArtifact.artifact.contains_sensitive_data, true);
  assert.strictEqual(reportArtifact.artifact.contains_sensitive_data, false);
  return "sensitive flags";
});

check("xml_pdf_futuros_no_se_crean_en_esta_fase", () => {
  const invoice = promoteCanonicalDraftToInvoiceDocument(readyDraft()).invoice_document;
  assert.deepStrictEqual(invoice.storage_refs, {});
  assert.strictEqual(invoice.uuid, null);
  assert.strictEqual(invoice.stamped_at, null);
  return "no files";
});

check("pac_request_no_contiene_credenciales", () => {
  const invoice = promoteCanonicalDraftToInvoiceDocument(readyDraft()).invoice_document;
  const request = buildCanonicalPacRequest(invoice, "stampSandbox");
  const serialized = JSON.stringify(request);
  assert(!/api_key|secret|token|password|CSD|certificate/i.test(serialized));
  return "clean";
});

console.log("Canonical Invoice Builder Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

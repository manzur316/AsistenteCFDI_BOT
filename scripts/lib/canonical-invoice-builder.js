const crypto = require("crypto");
const {
  ARTIFACT_TYPES,
  INVOICE_STATUSES,
  PAC_ENVIRONMENTS,
  PAYMENT_STATUSES,
  REVIEW_STATUSES,
  validateCanonicalInvoiceDocument,
} = require("./canonical-cfdi-contracts");
const { assertCanonicalDraftReadyForPac } = require("./canonical-draft-builder");

function nowIso() {
  return new Date().toISOString();
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function okResult(payload) {
  return { ok: true, errors: [], ...payload };
}

function failResult(errors, payload = {}) {
  return { ok: false, errors: Array.isArray(errors) ? errors : [errors], ...payload };
}

function promoteCanonicalDraftToInvoiceDocument(canonicalDraft, options = {}) {
  const environment = options.pac_environment || PAC_ENVIRONMENTS.SANDBOX;
  if (environment === PAC_ENVIRONMENTS.PRODUCTION && options.productionAuthorized !== true) {
    return failResult("produccion_bloqueada_por_default");
  }

  const readiness = assertCanonicalDraftReadyForPac(canonicalDraft);
  if (!readiness.ok) return failResult(readiness.errors, { readiness });

  const issuedAt = options.issued_at || nowIso();
  const internalInvoiceId = text(options.internal_invoice_id)
    || `INV-${safeId(canonicalDraft.draft_id)}-${stableHash(`${canonicalDraft.draft_id}|${issuedAt}`)}`;
  const invoice = {
    internal_invoice_id: internalInvoiceId,
    draft_id: canonicalDraft.draft_id,
    emitter_id: canonicalDraft.emitter_id,
    client_id: canonicalDraft.client_id,
    pac_provider: text(options.pac_provider || "PAC_ADAPTER_HUB"),
    pac_environment: environment,
    pac_invoice_id: null,
    uuid: null,
    serie: text(options.serie),
    folio: text(options.folio),
    status: INVOICE_STATUSES.READY_FOR_PAC_SANDBOX,
    payment_status: options.payment_status || PAYMENT_STATUSES.UNPAID,
    review_status: REVIEW_STATUSES.APPROVED_BY_HUMAN,
    subtotal: number(canonicalDraft.totals?.subtotal),
    taxes: canonicalDraft.totals?.taxes || {},
    total: number(canonicalDraft.totals?.total),
    issued_at: issuedAt,
    stamped_at: null,
    cancelled_at: null,
    storage_refs: {},
    pac_refs: {},
    audit_refs: [],
    canonical_draft_ref: {
      draft_id: canonicalDraft.draft_id,
      source_channel: canonicalDraft.source_channel,
      source_message_id: canonicalDraft.source_message_id,
    },
    requires_human_review: true,
  };
  const validation = validateCanonicalInvoiceDocument(invoice, {
    productionAuthorized: options.productionAuthorized === true,
  });
  if (!validation.ok) return failResult(validation.errors, { invoice_document: invoice, validation });
  return okResult({ invoice_document: invoice, validation });
}

function buildCanonicalPacRequest(canonicalInvoiceDocument, operation, options = {}) {
  const normalizedOperation = text(operation);
  if (!normalizedOperation) return failResult("operation requerido");
  const environment = options.environment || canonicalInvoiceDocument?.pac_environment || PAC_ENVIRONMENTS.SANDBOX;
  if (environment === PAC_ENVIRONMENTS.PRODUCTION && options.productionAuthorized !== true) {
    return failResult("produccion_bloqueada_por_default");
  }
  const validation = validateCanonicalInvoiceDocument(canonicalInvoiceDocument, {
    productionAuthorized: options.productionAuthorized === true,
  });
  if (!validation.ok) return failResult(validation.errors, { validation });

  if (normalizedOperation === "cancelInvoice") {
    const compatible = [
      INVOICE_STATUSES.SANDBOX_STAMPED,
      INVOICE_STATUSES.SANDBOX_CANCEL_REQUESTED,
      INVOICE_STATUSES.PRODUCTION_STAMPED,
      INVOICE_STATUSES.PRODUCTION_CANCEL_REQUESTED,
    ].includes(canonicalInvoiceDocument.status);
    if (!compatible) return failResult("cancelInvoice requiere estado timbrado o solicitud de cancelacion");
    const invoiceRef = options.invoiceRef || canonicalInvoiceDocument.pac_refs || {};
    if (!canonicalInvoiceDocument.pac_invoice_id && !canonicalInvoiceDocument.uuid && !invoiceRef.pac_invoice_id && !invoiceRef.uuid) {
      return failResult("cancelInvoice requiere invoiceRef PAC o uuid");
    }
  }

  const sourceInvoiceId = canonicalInvoiceDocument.internal_invoice_id;
  const idempotencyKey = text(options.idempotency_key)
    || `PACREQ-${safeId(sourceInvoiceId)}-${safeId(normalizedOperation)}-${stableHash(`${sourceInvoiceId}|${normalizedOperation}|${environment}`)}`;
  return okResult({
    pac_request: {
      provider: text(options.provider || canonicalInvoiceDocument.pac_provider || "PAC_ADAPTER_HUB"),
      environment,
      operation: normalizedOperation,
      payload: {
        canonical_invoice_document: canonicalInvoiceDocument,
        invoice_ref: options.invoiceRef || {
          pac_invoice_id: canonicalInvoiceDocument.pac_invoice_id,
          uuid: canonicalInvoiceDocument.uuid,
        },
      },
      idempotency_key: idempotencyKey,
      requested_at: options.requested_at || nowIso(),
      source_invoice_id: sourceInvoiceId,
      requires_human_review: true,
    },
  });
}

function buildCanonicalAuditEvent(params = {}) {
  return {
    event_id: text(params.event_id) || `AUD-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    entity_type: text(params.entity_type || "INVOICE"),
    entity_id: text(params.entity_id),
    event_type: text(params.event_type || "STATUS_CHANGE"),
    previous_status: text(params.previous_status),
    new_status: text(params.new_status),
    reason: text(params.reason),
    actor: text(params.actor || "SYSTEM"),
    created_at: params.created_at || nowIso(),
    metadata: params.metadata || {},
  };
}

function buildCanonicalStorageArtifact(params = {}) {
  const artifactType = text(params.artifact_type);
  const allowedTypes = Object.values(ARTIFACT_TYPES);
  if (!allowedTypes.includes(artifactType)) {
    return failResult("artifact_type desconocido");
  }
  const sensitiveByDefault = [
    ARTIFACT_TYPES.PAYLOAD_JSON,
    ARTIFACT_TYPES.PAC_RESPONSE_JSON,
    ARTIFACT_TYPES.XML,
    ARTIFACT_TYPES.PDF,
  ].includes(artifactType);
  return okResult({
    artifact: {
      artifact_id: text(params.artifact_id) || `ART-${artifactType}-${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
      internal_invoice_id: text(params.internal_invoice_id),
      draft_id: text(params.draft_id),
      artifact_type: artifactType,
      environment: params.environment || PAC_ENVIRONMENTS.SANDBOX,
      storage_path: text(params.storage_path),
      checksum: text(params.checksum),
      created_at: params.created_at || nowIso(),
      contains_sensitive_data: params.contains_sensitive_data === undefined
        ? sensitiveByDefault
        : params.contains_sensitive_data === true,
    },
  });
}

module.exports = {
  promoteCanonicalDraftToInvoiceDocument,
  buildCanonicalPacRequest,
  buildCanonicalAuditEvent,
  buildCanonicalStorageArtifact,
};

const fs = require("fs");
const path = require("path");

const { PAC_ENVIRONMENTS } = require("./canonical-cfdi-contracts");
const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { base64UrlDecodeJson } = require("./sandbox-draft-stamp-action");

const SANDBOX_DRAFT_CANCEL_STATUS = Object.freeze({
  REQUESTED: "SANDBOX_CANCELACION_PENDIENTE",
  CANCELING: "SANDBOX_CANCELANDO",
  CANCELED: "SANDBOX_CANCELADO",
  ERROR: "SANDBOX_CANCEL_ERROR",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "draft";
}

function readDraftFromOptions(options = {}) {
  if (options.draft && typeof options.draft === "object") return options.draft;
  if (options.draftJsonBase64) return base64UrlDecodeJson(options.draftJsonBase64);
  return null;
}

function findNestedIdentity(source = {}) {
  const candidates = [
    source,
    asObject(source.sandbox_identity),
    asObject(source.pac_identity),
    asObject(source.pac_refs),
    asObject(source.pac_result),
    asObject(source.sandbox_stamp_result),
    asObject(source.pac_sandbox_result),
    asObject(source.invoice_ref),
    asObject(asObject(source.output).pac_result),
    asObject(asObject(source.output).invoice_ref),
  ];
  for (const item of candidates) {
    const invoiceRef = {
      environment: PAC_ENVIRONMENTS.SANDBOX,
      provider: "Factura.com Sandbox",
      pac_invoice_id: text(item.pac_invoice_id || item.cfdi_uid || item.uid || item.id || item.invoice_id),
      cfdi_uid: text(item.cfdi_uid || item.uid || item.pac_invoice_id || item.id),
      uuid: text(item.uuid || item.cfdi_uuid),
      serie: text(item.serie),
      folio: text(item.folio),
      status: text(item.status || item.invoice_status),
    };
    if (invoiceRef.pac_invoice_id || invoiceRef.cfdi_uid || invoiceRef.uuid) return invoiceRef;
  }
  return null;
}

function extractSandboxInvoiceRef(draft = {}) {
  return findNestedIdentity(draft);
}

function hasSandboxCancellation(draft = {}) {
  const status = String(draft.status || "").toUpperCase();
  const sandboxStatus = String(draft.sandbox_status || draft.invoice_status || "").toUpperCase();
  return status === SANDBOX_DRAFT_CANCEL_STATUS.CANCELED
    || sandboxStatus === SANDBOX_DRAFT_CANCEL_STATUS.CANCELED
    || draft.sandbox_cancelled === true
    || Boolean(draft.sandbox_cancel_result || draft.pac_sandbox_cancel_result);
}

function hasSandboxCancellationInProgress(draft = {}) {
  const status = String(draft.status || "").toUpperCase();
  const sandboxStatus = String(draft.sandbox_status || draft.invoice_status || "").toUpperCase();
  return status === SANDBOX_DRAFT_CANCEL_STATUS.CANCELING
    || sandboxStatus === SANDBOX_DRAFT_CANCEL_STATUS.CANCELING
    || status === SANDBOX_DRAFT_CANCEL_STATUS.REQUESTED
    || sandboxStatus === SANDBOX_DRAFT_CANCEL_STATUS.REQUESTED;
}

function validateDraftForSandboxCancel(draft, env = {}) {
  const errors = [];
  const warnings = [];
  if (!draft || typeof draft !== "object") {
    return { ok: false, status: "ERROR", errors: ["DRAFT_NOT_FOUND"], warnings, invoiceRef: null };
  }

  if (env.FACTURACOM_SANDBOX_LIVE !== "1") {
    errors.push("FACTURACOM_SANDBOX_LIVE_REQUIRED");
  }

  const productionUrl = [
    env.FACTURACOM_BASE_URL,
    env.FACTURACOM_SANDBOX_BASE_URL,
    env.FACTURACOM_API_BASE_URL,
  ].filter(Boolean).join(" ");
  if (/https:\/\/api\.factura\.com/i.test(productionUrl)) errors.push("PRODUCTION_BLOCKED");

  const status = String(draft.status || "").toUpperCase();
  const sandboxStatus = String(draft.sandbox_status || draft.invoice_status || "").toUpperCase();
  const stamped = status === "SANDBOX_TIMBRADO" || sandboxStatus === "SANDBOX_TIMBRADO" || draft.sandbox_stamped === true;
  if (!text(draft.draft_id)) errors.push("draft_id_required");
  if (!stamped) errors.push("DRAFT_NOT_SANDBOX_STAMPED");
  if (hasSandboxCancellationInProgress(draft)) errors.push("DRAFT_SANDBOX_CANCEL_IN_PROGRESS");
  if (hasSandboxCancellation(draft)) errors.push("DRAFT_ALREADY_SANDBOX_CANCELLED");

  const invoiceRef = extractSandboxInvoiceRef(draft);
  if (!invoiceRef) errors.push("sandbox_identity_required");

  const finalStatus = errors.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED") ? "NEEDS_CONFIG" : "ERROR";
  return { ok: errors.length === 0, status: errors.length ? finalStatus : "OK", errors, warnings, invoiceRef };
}

function writeSandboxCancelManifest(input = {}) {
  const { draft, storageRoot, cancelResult, invoiceRef, now = new Date() } = input;
  if (!storageRoot) return null;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(storageRoot, "draft-cancellations", safeId(draft.draft_id), stamp);
  fs.mkdirSync(dir, { recursive: true });
  const responsePath = path.join(dir, "sandbox-cancel-response.json");
  const manifest = {
    schema_version: "sandbox_draft_cancel_manifest.v1",
    generated_at: now.toISOString(),
    provider: "Factura.com Sandbox",
    environment: PAC_ENVIRONMENTS.SANDBOX,
    draft_id: draft.draft_id,
    invoice_status: SANDBOX_DRAFT_CANCEL_STATUS.CANCELED,
    pac_identity: {
      uuid_present: Boolean(invoiceRef.uuid || cancelResult.uuid),
      pac_invoice_id_present: Boolean(invoiceRef.pac_invoice_id || cancelResult.pac_invoice_id),
      cfdi_uid_present: Boolean(invoiceRef.cfdi_uid || cancelResult.cfdi_uid),
      serie_present: Boolean(invoiceRef.serie || cancelResult.serie),
      folio_present: Boolean(invoiceRef.folio || cancelResult.folio),
    },
    cancel_result: {
      ok: cancelResult.ok === true,
      status: text(cancelResult.status),
      operation: text(cancelResult.operation),
    },
    original_artifacts_deleted: false,
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
  };
  fs.writeFileSync(responsePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return responsePath;
}

async function runSandboxDraftCancel(options = {}) {
  let draft = null;
  try {
    draft = readDraftFromOptions(options);
  } catch (error) {
    return {
      status: "ERROR",
      output: {},
      warnings: [],
      errors: [`DRAFT_JSON_INVALID: ${error.message}`],
    };
  }

  const validation = validateDraftForSandboxCancel(draft, options.env || {});
  if (!validation.ok) {
    return {
      status: validation.status,
      output: {
        invoice_status: SANDBOX_DRAFT_CANCEL_STATUS.ERROR,
        draft_id: text(draft?.draft_id || options.draftId),
        validation_errors: validation.errors,
        provider: "Factura.com Sandbox",
        sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
      },
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  const adapter = options.adapter || new FacturaComSandboxAdapter();
  const cancelResult = await adapter.cancelInvoice(validation.invoiceRef, options.adapterContext || {});
  if (cancelResult.ok !== true) {
    return {
      status: "ERROR",
      output: {
        invoice_status: SANDBOX_DRAFT_CANCEL_STATUS.ERROR,
        draft_id: draft.draft_id,
        provider: "Factura.com Sandbox",
        pac_status: cancelResult.status || "PAC_CANCEL_ERROR",
        normalized_errors: cancelResult.normalized_errors || [],
      },
      warnings: cancelResult.normalized_warnings || [],
      errors: (cancelResult.normalized_errors || []).map((item) => item.code || item.message || "PAC_CANCEL_ERROR"),
    };
  }

  const manifestPath = writeSandboxCancelManifest({
    draft,
    storageRoot: options.storageRoot,
    cancelResult,
    invoiceRef: validation.invoiceRef,
  });

  return {
    status: "OK",
    output: {
      draft_id: draft.draft_id,
      provider: "Factura.com Sandbox",
      invoice_status: SANDBOX_DRAFT_CANCEL_STATUS.CANCELED,
      artifacts_count: manifestPath ? 1 : 0,
      manifest_path: manifestPath || null,
      pac_result: {
        ok: true,
        provider: cancelResult.provider,
        environment: cancelResult.environment,
        status: cancelResult.status,
        uuid_present: Boolean(cancelResult.uuid || validation.invoiceRef.uuid),
        pac_invoice_id_present: Boolean(cancelResult.pac_invoice_id || validation.invoiceRef.pac_invoice_id),
        cfdi_uid_present: Boolean(cancelResult.cfdi_uid || validation.invoiceRef.cfdi_uid),
      },
      timeline_event: {
        event_type: "DRAFT_SANDBOX_CANCELLED",
        draft_id: draft.draft_id,
        status: SANDBOX_DRAFT_CANCEL_STATUS.CANCELED,
      },
      original_artifacts_deleted: false,
      sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
      requires_human_review: true,
    },
    warnings: cancelResult.normalized_warnings || [],
    errors: [],
  };
}

module.exports = {
  SANDBOX_DRAFT_CANCEL_STATUS,
  extractSandboxInvoiceRef,
  hasSandboxCancellation,
  hasSandboxCancellationInProgress,
  runSandboxDraftCancel,
  validateDraftForSandboxCancel,
};

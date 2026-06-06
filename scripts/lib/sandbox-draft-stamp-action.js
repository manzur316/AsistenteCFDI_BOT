const fs = require("fs");
const path = require("path");

const { PAC_ENVIRONMENTS } = require("./canonical-cfdi-contracts");
const { buildCanonicalDraftFromBotPreview } = require("./canonical-draft-builder");
const {
  buildCanonicalPacRequest,
  promoteCanonicalDraftToInvoiceDocument,
} = require("./canonical-invoice-builder");
const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { loadDraftFromPostgres } = require("./sandbox-draft-db-loader");

const SANDBOX_DRAFT_STAMP_STATUS = Object.freeze({
  STAMPING: "SANDBOX_TIMBRANDO",
  STAMPED: "SANDBOX_TIMBRADO",
  ERROR: "SANDBOX_ERROR",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function safeId(value) {
  return String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "draft";
}

function base64UrlDecodeJson(value) {
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function normalizeConcept(concept = {}) {
  return {
    id: text(concept.id || concept.concept_id),
    concepto_factura: text(concept.concepto_factura || concept.concepto_sugerido || concept.description),
    clave_prod_serv: text(concept.clave_prod_serv || concept.product_service_key),
    clave_unidad: text(concept.clave_unidad || concept.unit_key),
    unidad: text(concept.unidad || concept.unit_name),
    familia: text(concept.familia || concept.family),
    tipo: text(concept.tipo || concept.item_type),
    operacion: text(concept.operacion || concept.operation_type),
    objeto_imp: text(concept.objeto_imp || concept.tax_object) || "02",
  };
}

function normalizeClient(client = {}) {
  return {
    client_id: text(client.client_id || client.id),
    display_name: text(client.display_name || client.razon_social || client.name),
    razon_social: text(client.razon_social || client.legal_name || client.display_name || client.name),
    rfc: text(client.rfc),
    regimen_fiscal: text(client.regimen_fiscal || client.tax_regime),
    codigo_postal_fiscal: text(client.codigo_postal_fiscal || client.fiscal_zip || client.cp),
    uso_cfdi_default: text(client.uso_cfdi_default || client.uso_cfdi || client.cfdi_use),
    tipo_persona: text(client.tipo_persona || client.person_type),
    validated_by_human: client.validated_by_human === true,
  };
}

async function readDraftFromOptions(options = {}) {
  if (options.draft && typeof options.draft === "object") return options.draft;
  if (text(options.draftId)) {
    if (typeof options.draftLoader === "function") return options.draftLoader(text(options.draftId), options);
    return loadDraftFromPostgres(text(options.draftId), {
      ...(options.dbConfig || {}),
      env: options.env || process.env,
    });
  }
  if (options.draftJsonBase64) return base64UrlDecodeJson(options.draftJsonBase64);
  return null;
}

function hasSandboxStamp(draft = {}) {
  const status = String(draft.status || "").toUpperCase();
  const sandboxStatus = String(draft.sandbox_status || draft.invoice_status || "").toUpperCase();
  const successfulResult = hasSuccessfulSandboxStampResult(draft.sandbox_stamp_result)
    || hasSuccessfulSandboxStampResult(draft.pac_sandbox_result)
    || hasSuccessfulSandboxStampResult(draft.pac_result);
  return status === SANDBOX_DRAFT_STAMP_STATUS.STAMPED
    || sandboxStatus === SANDBOX_DRAFT_STAMP_STATUS.STAMPED
    || draft.sandbox_stamped === true
    || successfulResult;
}

function hasSuccessfulSandboxStampResult(result) {
  if (!result || typeof result !== "object") return false;
  const status = String(result.status || result.invoice_status || "").toUpperCase();
  const ok = result.ok === true || status === "OK" || status === SANDBOX_DRAFT_STAMP_STATUS.STAMPED;
  const identity = result.uuid || result.cfdi_uuid || result.pac_invoice_id || result.cfdi_uid || result.uid || result.invoice_id;
  const identityFlags = result.uuid_present === true || result.pac_invoice_id_present === true;
  return ok && Boolean(identity || identityFlags);
}

function hasSandboxStampInProgress(draft = {}) {
  const status = String(draft.status || "").toUpperCase();
  const sandboxStatus = String(draft.sandbox_status || draft.invoice_status || "").toUpperCase();
  return status === SANDBOX_DRAFT_STAMP_STATUS.STAMPING || sandboxStatus === SANDBOX_DRAFT_STAMP_STATUS.STAMPING;
}

function validateDraftForSandboxStamp(draft, env = {}) {
  const errors = [];
  const warnings = [];
  if (!draft || typeof draft !== "object") {
    return { ok: false, status: "ERROR", errors: ["DRAFT_NOT_FOUND"], warnings };
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

  if (!text(draft.draft_id)) errors.push("draft_id_required");
  if (hasSandboxStampInProgress(draft)) errors.push("DRAFT_SANDBOX_IN_PROGRESS");
  if (hasSandboxStamp(draft)) errors.push("DRAFT_ALREADY_SANDBOX_STAMPED");
  if (String(draft.status || "").toUpperCase() !== "APROBADO") errors.push("DRAFT_NOT_APPROVED");

  if (text(draft.client_id) && draft.client_found === false) errors.push("CLIENT_NOT_FOUND");

  const client = normalizeClient(draft.current_client || draft.client || draft.client_snapshot || {});
  if (!client.validated_by_human) errors.push("client_not_validated");
  if (!client.rfc) errors.push("client_rfc_required");
  if (!client.regimen_fiscal) errors.push("client_regimen_required");
  if (!client.codigo_postal_fiscal) errors.push("client_fiscal_zip_required");

  const concept = normalizeConcept(draft.concept || {});
  if (!concept.id && !concept.concepto_factura) errors.push("concept_required");
  if (!concept.clave_prod_serv) errors.push("clave_prod_serv_required");
  if (!concept.clave_unidad) errors.push("clave_unidad_required");

  const subtotal = number(draft.subtotal ?? draft.amount);
  const total = number(draft.total);
  const iva = number(draft.iva_amount ?? draft.calc?.iva_amount ?? draft.tax_summary?.iva_transferred);
  if (subtotal === null || subtotal <= 0) errors.push("amount_required");
  if (total === null || total <= 0) errors.push("total_required");
  if (!text(draft.tax_mode)) errors.push("tax_method_required");
  if (iva === null) errors.push("iva_amount_required");

  const blockers = asArray(draft.blockers).filter(Boolean);
  if (blockers.length) errors.push("draft_has_blockers");

  const status = errors.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED") ? "NEEDS_CONFIG" : "ERROR";
  return { ok: errors.length === 0, status: errors.length ? status : "OK", errors, warnings, client, concept };
}

function stableValidationCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  const map = {
    DRAFT_NOT_FOUND: "DRAFT_CONTEXT_MISSING",
    DRAFT_ID_REQUIRED: "DRAFT_CONTEXT_MISSING",
    CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
    CLIENT_MATCH_AMBIGUOUS: "CLIENT_MATCH_AMBIGUOUS",
    CLIENT_NOT_VALIDATED: "CLIENT_NOT_VALIDATED",
    CLIENT_RFC_REQUIRED: "RFC_MISSING",
    CLIENT_REGIMEN_REQUIRED: "REGIMEN_MISSING",
    CLIENT_FISCAL_ZIP_REQUIRED: "FISCAL_ZIP_MISSING",
    CONCEPT_REQUIRED: "CONCEPT_MISSING",
    CLAVE_PROD_SERV_REQUIRED: "CONCEPT_MISSING",
    CLAVE_UNIDAD_REQUIRED: "CONCEPT_MISSING",
    AMOUNT_REQUIRED: "AMOUNT_MISSING",
    TOTAL_REQUIRED: "AMOUNT_MISSING",
    TAX_METHOD_REQUIRED: "TAX_MODE_MISSING",
    IVA_AMOUNT_REQUIRED: "TAX_MODE_MISSING",
  };
  return map[normalized] || normalized || "DRAFT_VALIDATION_ERROR";
}

function stableValidationCodes(errors = []) {
  return [...new Set(asArray(errors).map(stableValidationCode).filter(Boolean))];
}

function canonicalInputFromDraft(draft = {}) {
  const hydratedClient = normalizeClient(draft.current_client || draft.client || draft.client_snapshot || {});
  const historicalClient = normalizeClient(draft.historical_client_snapshot || draft.client_snapshot || {});
  const subtotal = number(draft.subtotal ?? draft.amount) || 0;
  const ivaAmount = number(draft.iva_amount ?? draft.calc?.iva_amount ?? draft.tax_summary?.iva_transferred) ?? 0;
  const isrRetention = number(draft.isr_retention_amount ?? draft.calc?.isr_retention_amount ?? draft.tax_summary?.isr_retained) ?? 0;
  const ivaRetention = number(draft.iva_retention_amount ?? draft.calc?.iva_retention_amount ?? draft.tax_summary?.iva_retained) ?? 0;
  const total = number(draft.total) ?? (subtotal + ivaAmount - isrRetention - ivaRetention);
  return {
    ...draft,
    emitter_id: text(draft.emitter_id) || "EMITTER-DEMO",
    source_channel: "TELEGRAM",
    source_message_id: text(draft.source_message_id || draft.message_id || draft.update_id || draft.draft_id),
    original_text: text(draft.original_text || draft.message_original || draft.text) || "Borrador aprobado Telegram",
    confirmed_by_human: true,
    requires_human_review: true,
    client: hydratedClient,
    client_snapshot: hydratedClient,
    historical_client_snapshot: historicalClient,
    concept: normalizeConcept(draft.concept || {}),
    amount: subtotal,
    subtotal,
    total,
    iva_amount: ivaAmount,
    iva_retention_amount: ivaRetention,
    isr_retention_amount: isrRetention,
    calc: {
      ...(draft.calc || {}),
      iva_amount: ivaAmount,
      iva_transferred: ivaAmount,
      iva_retention_amount: ivaRetention,
      iva_retained: ivaRetention,
      isr_retention_amount: isrRetention,
      isr_retained: isrRetention,
      total_taxes_transferred: ivaAmount,
      total_taxes_retained: ivaRetention + isrRetention,
    },
    blockers: [],
  };
}

function draftErrorContext(draft = {}, options = {}) {
  const safeDraft = draft && typeof draft === "object" ? draft : {};
  const client = normalizeClient(safeDraft.current_client || safeDraft.client || safeDraft.client_snapshot || {});
  return {
    invoice_status: SANDBOX_DRAFT_STAMP_STATUS.ERROR,
    draft_status: text(safeDraft.status) || null,
    payment_status: text(safeDraft.payment_status) || "NO_APLICA",
    draft_id: text(safeDraft.draft_id || options.draftId),
    client_id: text(client.client_id || safeDraft.client_id),
    client_display_name: text(client.display_name || client.razon_social || client.client_id || safeDraft.client_id),
    total: number(safeDraft.total),
  };
}

function writeSandboxStampManifest(input = {}) {
  const { draft, storageRoot, canonicalDraft, invoiceDocument, pacResult, now = new Date() } = input;
  if (!storageRoot) return null;
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const dir = path.join(storageRoot, "draft-stamps", safeId(draft.draft_id), stamp);
  fs.mkdirSync(dir, { recursive: true });
  const manifestPath = path.join(dir, "sandbox-stamp-manifest.json");
  const manifest = {
    schema_version: "sandbox_draft_stamp_manifest.v1",
    generated_at: now.toISOString(),
    provider: "Factura.com Sandbox",
    environment: PAC_ENVIRONMENTS.SANDBOX,
    draft_id: draft.draft_id,
    invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
    canonical_draft_ready: canonicalDraft.ready_for_pac === true,
    internal_invoice_id: invoiceDocument.internal_invoice_id,
    client_id: canonicalDraft.client_id,
    total: invoiceDocument.total,
    pac_identity: {
      uuid_present: Boolean(pacResult.uuid),
      pac_invoice_id_present: Boolean(pacResult.pac_invoice_id),
      serie_present: Boolean(pacResult.serie),
      folio_present: Boolean(pacResult.folio),
    },
    xml_available: pacResult.xml_available === true,
    pdf_available: pacResult.pdf_available === true,
    human_review_warning: "BORRADOR SUJETO A REVISION HUMANA",
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifestPath;
}

async function runSandboxDraftStamp(options = {}) {
  let draft = null;
  try {
    draft = await readDraftFromOptions(options);
  } catch (error) {
    if (error && error.code === "DRAFT_DB_LOAD_FAILED") {
      return {
        status: "NEEDS_RUNTIME",
        output: {
          error_class: "DRAFT_DB_LOAD_FAILED",
          invoice_status: null,
          draft_status: null,
          payment_status: null,
          draft_id: text(options.draftId),
          provider: "Factura.com Sandbox",
          validation_errors: ["DRAFT_DB_LOAD_FAILED"],
          validation_error_codes: ["DRAFT_DB_LOAD_FAILED"],
          sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
        },
        warnings: ["No se pudo cargar el borrador desde PostgreSQL local."],
        errors: ["DRAFT_DB_LOAD_FAILED"],
      };
    }
    return {
      status: "ERROR",
      output: {
        error_class: "DRAFT_JSON_INVALID",
        draft_id: text(options.draftId),
        validation_errors: ["DRAFT_JSON_INVALID"],
        validation_error_codes: ["DRAFT_JSON_INVALID"],
      },
      warnings: [],
      errors: [`DRAFT_JSON_INVALID: ${error.message}`],
    };
  }

  const validation = validateDraftForSandboxStamp(draft, options.env || {});
  if (!validation.ok) {
    const validationCodes = stableValidationCodes(validation.errors);
    return {
      status: validation.status,
      output: {
        error_class: validation.errors.includes("DRAFT_NOT_FOUND") ? "DRAFT_CONTEXT_MISSING" : "DRAFT_VALIDATION_ERROR",
        ...draftErrorContext(draft, options),
        validation_errors: validation.errors,
        validation_error_codes: validationCodes,
        provider: "Factura.com Sandbox",
        sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
      },
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }

  const canonicalDraft = buildCanonicalDraftFromBotPreview(canonicalInputFromDraft(draft));
  if (canonicalDraft.ready_for_pac !== true) {
    const readinessErrors = canonicalDraft.blockers?.length
      ? canonicalDraft.blockers.map((blocker) => blocker.type || String(blocker))
      : canonicalDraft.contract_validation?.errors || ["canonical_draft_not_ready"];
    return {
      status: "ERROR",
      output: {
        error_class: "CANONICAL_DRAFT_NOT_READY",
        ...draftErrorContext(draft, options),
        validation_errors: readinessErrors,
        validation_error_codes: stableValidationCodes(readinessErrors),
        provider: "Factura.com Sandbox",
      },
      warnings: canonicalDraft.fiscal_warnings || [],
      errors: ["CANONICAL_DRAFT_NOT_READY", ...readinessErrors],
    };
  }

  const invoiceResult = promoteCanonicalDraftToInvoiceDocument(canonicalDraft, {
    pac_provider: "Factura.com Sandbox",
    pac_environment: PAC_ENVIRONMENTS.SANDBOX,
  });
  if (!invoiceResult.ok) {
    return {
      status: "ERROR",
      output: {
        error_class: "CANONICAL_INVOICE_NOT_READY",
        ...draftErrorContext(draft, options),
        validation_errors: invoiceResult.errors,
        validation_error_codes: stableValidationCodes(invoiceResult.errors),
        provider: "Factura.com Sandbox",
      },
      warnings: invoiceResult.warnings || [],
      errors: ["CANONICAL_INVOICE_NOT_READY", ...invoiceResult.errors],
    };
  }

  const pacRequestResult = buildCanonicalPacRequest(invoiceResult.invoice_document, "stampSandbox", {
    provider: "Factura.com Sandbox",
    environment: PAC_ENVIRONMENTS.SANDBOX,
  });
  if (!pacRequestResult.ok) {
    return {
      status: "ERROR",
      output: {
        error_class: "CANONICAL_PAC_REQUEST_NOT_READY",
        ...draftErrorContext(draft, options),
        validation_errors: pacRequestResult.errors,
        validation_error_codes: stableValidationCodes(pacRequestResult.errors),
        provider: "Factura.com Sandbox",
      },
      errors: ["CANONICAL_PAC_REQUEST_NOT_READY", ...pacRequestResult.errors],
      warnings: pacRequestResult.warnings || [],
    };
  }

  const pacRequest = pacRequestResult.pac_request;
  pacRequest.payload.canonical_draft = canonicalDraft;
  const adapter = options.adapter || new FacturaComSandboxAdapter();
  const pacResult = await adapter.stampSandbox(pacRequest, options.adapterContext || {});
  if (pacResult.ok !== true) {
    return {
      status: "ERROR",
      output: {
        error_class: "PAC_SANDBOX_ERROR",
        ...draftErrorContext(draft, options),
        provider: "Factura.com Sandbox",
        pac_status: pacResult.status || "PAC_ERROR",
        normalized_errors: pacResult.normalized_errors || [],
      },
      warnings: pacResult.normalized_warnings || [],
      errors: (pacResult.normalized_errors || []).map((item) => item.code || item.message || "PAC_ERROR"),
    };
  }

  const manifestPath = writeSandboxStampManifest({
    draft,
    storageRoot: options.storageRoot,
    canonicalDraft,
    invoiceDocument: invoiceResult.invoice_document,
    pacResult,
  });

  return {
    status: "OK",
    output: {
      draft_id: draft.draft_id,
      provider: "Factura.com Sandbox",
      invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
      draft_status: text(draft.status),
      payment_status: text(draft.payment_status) === "NO_APLICA" || !text(draft.payment_status) ? "PENDIENTE" : text(draft.payment_status),
      client_display_name: validation.client.display_name || validation.client.client_id,
      client_id: validation.client.client_id,
      total: invoiceResult.invoice_document.total,
      artifacts_count: manifestPath ? 1 : 0,
      manifest_path: manifestPath || null,
      canonical: {
        draft_ready_for_pac: true,
        invoice_status: invoiceResult.invoice_document.status,
        pac_request_operation: pacRequest.operation,
      },
      pac_result: {
        ok: true,
        provider: pacResult.provider,
        environment: pacResult.environment,
        status: pacResult.status,
        uuid_present: Boolean(pacResult.uuid),
        pac_invoice_id_present: Boolean(pacResult.pac_invoice_id),
        xml_available: pacResult.xml_available === true,
        pdf_available: pacResult.pdf_available === true,
      },
      timeline_event: {
        event_type: "DRAFT_SANDBOX_STAMPED",
        draft_id: draft.draft_id,
        status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
      },
      sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
      requires_human_review: true,
    },
    warnings: pacResult.normalized_warnings || [],
    errors: [],
  };
}

module.exports = {
  SANDBOX_DRAFT_STAMP_STATUS,
  base64UrlDecodeJson,
  canonicalInputFromDraft,
  hasSandboxStamp,
  hasSandboxStampInProgress,
  runSandboxDraftStamp,
  readDraftFromOptions,
  validateDraftForSandboxStamp,
};

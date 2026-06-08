const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { collectIdentity } = require("./sandbox-draft-download-artifacts-action");
const { readDraftFromOptions } = require("./sandbox-draft-stamp-action");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function redactRef(value) {
  const raw = text(value);
  if (!raw) return null;
  return `[REDACTED_REF len=${raw.length}]`;
}

function uniqueRefs(identity = {}) {
  const refs = [
    { ref_type: "cfdi_uid", value: text(identity.cfdi_uid || identity.uid) },
    { ref_type: "pac_invoice_id", value: text(identity.pac_invoice_id || identity.invoice_id || identity.id) },
    { ref_type: "uuid", value: text(identity.uuid || identity.cfdi_uuid) },
  ].filter((item) => item.value);
  const seen = new Set();
  return refs.filter((item) => {
    const key = `${item.ref_type}:${item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validationFromResult(result = {}) {
  return result.content_validation || result.raw?.validation || result.raw?.data?.validation || null;
}

function summarizePdfAttempt(ref, result = {}) {
  const validation = validationFromResult(result) || {};
  const errors = Array.isArray(result.normalized_errors)
    ? result.normalized_errors.map((item) => item.code || item.message || String(item))
    : [];
  const warnings = Array.isArray(result.normalized_warnings) ? result.normalized_warnings : [];
  return {
    ref_type: ref.ref_type,
    ref_present: Boolean(ref.value),
    ref_redacted: redactRef(ref.value),
    http_ok: result.ok === true,
    provider_status: result.status || null,
    content_type: result.raw?.contentType || result.raw?.content_type || null,
    content_disposition_present: Boolean(result.raw?.contentDisposition || result.raw?.content_disposition),
    size_bytes: result.pdf_size_bytes || validation.size_bytes || null,
    sha256: result.pdf_sha256 || validation.sha256 || null,
    pdf_magic_present: validation.pdf_magic_present === true,
    pdf_eof_present: validation.pdf_eof_present === true,
    pdf_page_count_estimate: validation.pdf_page_count_estimate ?? null,
    pdf_content_streams_present: validation.pdf_content_streams_present === true,
    pdf_visual_content_present: validation.pdf_visual_content_present === true,
    pdf_text_present: validation.pdf_text_present === true,
    pdf_graphics_present: validation.pdf_graphics_present === true,
    pdf_image_xobject_present: validation.pdf_image_xobject_present === true,
    pdf_validation_status: result.pdf_validation_status || validation.status || result.raw?.pdf_validation_status || null,
    pdf_retryable: result.raw?.pdf_retryable === true || result.status === "PDF_NOT_READY_RETRYABLE",
    download_path_used: "GET v4/cfdi40/{ref}/pdf",
    warnings,
    errors,
  };
}

function classifyPdfDiagnosis(testedRefs) {
  if (testedRefs.some((item) => item.http_ok && item.pdf_visual_content_present)) {
    return {
      status: "OK",
      root_cause_hypothesis: "PDF sandbox descargado con contenido visual probable.",
      next_action: "Permitir storage humano y delivery solo con validacion XML/PDF vigente.",
    };
  }
  if (testedRefs.some((item) => item.pdf_retryable || item.pdf_validation_status === "PDF_NOT_READY_RETRYABLE")) {
    return {
      status: "PDF_INVALID",
      root_cause_hypothesis: "Factura.com Sandbox parece tener PDF pendiente de generacion.",
      next_action: "Reintentar descarga con backoff acotado antes de bloquear como fallo definitivo.",
    };
  }
  if (testedRefs.length && testedRefs.every((item) => item.pdf_magic_present && item.pdf_eof_present && item.pdf_content_streams_present && !item.pdf_visual_content_present)) {
    return {
      status: "PROVIDER_LIMITATION",
      root_cause_hypothesis: "Factura.com Sandbox API devolvio PDF estructuralmente valido pero sin contenido visual confirmado para las referencias probadas.",
      next_action: "No enviar PDF; documentar limitacion o probar endpoint/identidad alternativa del proveedor.",
    };
  }
  if (testedRefs.some((item) => item.pdf_validation_status === "PDF_VISUAL_CONTENT_UNCERTAIN")) {
    return {
      status: "PDF_INVALID",
      root_cause_hypothesis: "PDF con streams no legibles o contenido visual no confirmado.",
      next_action: "Revisar detalle de streams/FlateDecode y mantener delivery bloqueado.",
    };
  }
  return {
    status: "ERROR",
    root_cause_hypothesis: testedRefs.length ? "No se obtuvo PDF sandbox util con las referencias probadas." : "No hay identidad CFDI sandbox para diagnosticar PDF.",
    next_action: testedRefs.length ? "Revisar identidad CFDI y configuracion live sandbox." : "Timbrar sandbox live o pasar cfdi_uid, pac_invoice_id o uuid.",
  };
}

async function runSandboxPdfDiagnose(options = {}) {
  const env = options.env || process.env;
  let draft = options.draft && typeof options.draft === "object" ? options.draft : null;
  if (!draft && text(options.draftId)) {
    try {
      draft = await readDraftFromOptions(options);
    } catch (_error) {
      draft = null;
    }
  }
  const identity = {
    ...collectIdentity(draft || {}),
    cfdi_uid: text(options.cfdiUid || options.cfdi_uid || collectIdentity(draft || {}).cfdi_uid),
    pac_invoice_id: text(options.pacInvoiceId || options.pac_invoice_id || collectIdentity(draft || {}).pac_invoice_id),
    uuid: text(options.uuid || collectIdentity(draft || {}).uuid),
  };
  const refs = uniqueRefs(identity);
  const adapter = options.adapter || new FacturaComSandboxAdapter({ env });
  const testedRefs = [];
  for (const ref of refs) {
    const result = await adapter.downloadPdf({ [ref.ref_type]: ref.value }, {
      env,
      requestFn: options.requestFn,
      pdfRetryCount: options.pdfRetryCount,
      pdfRetryDelayMs: options.pdfRetryDelayMs ?? 0,
    });
    testedRefs.push(summarizePdfAttempt(ref, result));
  }
  const classification = classifyPdfDiagnosis(testedRefs);
  return {
    status: classification.status,
    output: {
      draft_id: text(draft?.draft_id || options.draftId),
      tested_refs: testedRefs,
      root_cause_hypothesis: classification.root_cause_hypothesis,
      next_action: classification.next_action,
      provider_limitation_documented: classification.status === "PROVIDER_LIMITATION",
      requires_human_review: true,
    },
    warnings: testedRefs.some((item) => item.pdf_retryable) ? ["PDF_NOT_READY_RETRYABLE"] : [],
    errors: classification.status === "OK" ? [] : [classification.status],
  };
}

module.exports = {
  classifyPdfDiagnosis,
  runSandboxPdfDiagnose,
  summarizePdfAttempt,
};

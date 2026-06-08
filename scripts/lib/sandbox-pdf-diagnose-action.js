const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { collectIdentity } = require("./sandbox-draft-download-artifacts-action");
const { readDraftFromOptions } = require("./sandbox-draft-stamp-action");
const fs = require("fs");
const path = require("path");
const { detectPdfVisibleContentByRender } = require("./pdf/pdf-render-visual-checker");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function redactRef(value) {
  const raw = text(value);
  if (!raw) return null;
  return `[REDACTED_REF len=${raw.length}]`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function rel(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return "[BLOCKED_PATH]";
}

function diagnosticDir(draftId) {
  const safe = String(draftId || "direct")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "direct";
  const dir = path.join(runtimeRoot, "pdf-render-diagnostics", safe, new Date().toISOString().replace(/[:.]/g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
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

function summarizePdfAttempt(ref, result = {}, renderCheck = null) {
  const validation = validationFromResult(result) || {};
  const errors = Array.isArray(result.normalized_errors)
    ? result.normalized_errors.map((item) => item.code || item.message || String(item))
    : [];
  const warnings = Array.isArray(result.normalized_warnings) ? result.normalized_warnings : [];
  const renderStatus = renderCheck?.render_status || null;
  const renderBlank = renderStatus === "BLANK";
  const renderVisible = renderStatus === "VISIBLE";
  const validationStatus = renderBlank
    ? "PDF_RENDER_BLANK_PAGE"
    : renderVisible
      ? "VALID"
      : result.pdf_validation_status || validation.status || result.raw?.pdf_validation_status || null;
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
    pdf_visual_content_present: renderVisible || (validation.pdf_visual_content_present === true && !renderBlank),
    pdf_text_present: validation.pdf_text_present === true,
    pdf_graphics_present: validation.pdf_graphics_present === true,
    pdf_image_xobject_present: validation.pdf_image_xobject_present === true,
    pdf_validation_status: validationStatus,
    render_check_requested: Boolean(renderCheck),
    render_check_executed: renderCheck?.render_check_executed === true,
    render_check_available: renderCheck?.render_check_available === true,
    render_status: renderStatus,
    non_white_pixel_ratio: renderCheck?.non_white_pixel_ratio ?? null,
    non_white_pixel_count: renderCheck?.non_white_pixel_count ?? null,
    rendered_png_path: renderCheck?.rendered_png_path ? rel(renderCheck.rendered_png_path) : null,
    pdf_render_blank: renderBlank,
    pdf_retryable: result.raw?.pdf_retryable === true || result.status === "PDF_NOT_READY_RETRYABLE",
    download_path_used: "GET v4/cfdi40/{ref}/pdf",
    warnings: [...warnings, ...(renderCheck?.warnings || [])],
    errors: [...errors, ...(renderCheck?.errors || [])],
  };
}

function classifyPdfDiagnosis(testedRefs) {
  if (testedRefs.some((item) => item.http_ok && item.pdf_visual_content_present && item.pdf_validation_status === "VALID")) {
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
      root_cause_hypothesis: testedRefs.every((item) => item.pdf_render_blank)
        ? "Factura.com Sandbox API returned render-blank PDF for cfdi_uid/pac_invoice_id/uuid."
        : "Factura.com Sandbox API devolvio PDF estructuralmente valido pero sin contenido visual confirmado para las referencias probadas.",
      next_action: "No marcar provider PDF como valido; generar PDF local desde XML raw validado si existe.",
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
  const renderCheckRequested = options.renderCheck === true || options.render_check === true;
  const debugRender = options.debugRender === true || options.debug_render === true;
  const rootDiagnosticDir = renderCheckRequested || debugRender ? diagnosticDir(draft?.draft_id || options.draftId || "direct") : null;
  for (const ref of refs) {
    const refDir = rootDiagnosticDir ? path.join(rootDiagnosticDir, ref.ref_type) : null;
    const result = await adapter.downloadPdf({ [ref.ref_type]: ref.value }, {
      env,
      requestFn: options.requestFn,
      pdfRetryCount: options.pdfRetryCount,
      pdfRetryDelayMs: options.pdfRetryDelayMs ?? 0,
      storageDir: refDir || undefined,
      keepInvalidArtifactForDiagnostics: renderCheckRequested || debugRender,
    });
    const diagnosticPdfPath = result.pdf_storage_path
      ? path.resolve(repoRoot, result.pdf_storage_path)
      : result.raw?.data?.invalid_artifact_path
        ? path.resolve(repoRoot, result.raw.data.invalid_artifact_path)
        : null;
    const renderCheck = renderCheckRequested && diagnosticPdfPath && fs.existsSync(diagnosticPdfPath)
      ? detectPdfVisibleContentByRender({
        pdfPath: diagnosticPdfPath,
        outputDir: refDir || rootDiagnosticDir,
        debug: debugRender,
        timeoutMs: options.renderTimeoutMs || 10000,
        renderToPpm: options.renderToPpm,
      })
      : renderCheckRequested
        ? {
          ok: false,
          render_check_executed: false,
          render_check_available: false,
          render_status: "UNAVAILABLE",
          page_count_checked: 0,
          non_white_pixel_ratio: null,
          non_white_pixel_count: null,
          white_pixel_ratio: null,
          rendered_png_path: null,
          errors: [],
          warnings: ["PDF_RENDER_CHECK_UNAVAILABLE"],
        }
        : null;
    testedRefs.push(summarizePdfAttempt(ref, result, renderCheck));
  }
  const classification = classifyPdfDiagnosis(testedRefs);
  return {
    status: classification.status,
    output: {
      draft_id: text(draft?.draft_id || options.draftId),
      render_check_requested: renderCheckRequested,
      render_debug_dir: rootDiagnosticDir ? rel(rootDiagnosticDir) : null,
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

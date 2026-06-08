const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { PAC_ENVIRONMENTS } = require("./canonical-cfdi-contracts");
const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { renderLocalCfdiPdfFromXml } = require("./document-rendering/local-cfdi-pdf-renderer");
const {
  SANDBOX_DRAFT_STAMP_STATUS,
  readDraftFromOptions,
} = require("./sandbox-draft-stamp-action");

const ARTIFACT_STATUS = Object.freeze({
  DOWNLOADED: "DOWNLOADED",
  PARTIAL_DOWNLOAD: "PARTIAL_DOWNLOAD",
  DOWNLOAD_ERROR: "DOWNLOAD_ERROR",
  NEEDS_CONFIG: "NEEDS_CONFIG",
  NEEDS_RUNTIME: "NEEDS_RUNTIME",
});

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function safeId(value, fallback = "item") {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/.`);
  return resolved;
}

function rel(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return "[BLOCKED_PATH]";
}

function nowStamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, "-");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function fileSize(filePath) {
  return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
}

function hashIdentity(value) {
  return crypto.createHash("sha256").update(String(value || "missing")).digest("hex").slice(0, 16);
}

function safeFileSegment(value, fallback = "Documento") {
  return String(value || fallback)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || fallback;
}

function normalizeClient(draft = {}) {
  const client = draft.current_client || draft.client || draft.client_snapshot || {};
  return {
    client_id: text(draft.client_id || client.client_id || client.id) || "CLIENT-UNKNOWN",
    display_name: text(client.display_name || client.razon_social || client.name || draft.client_id) || "Cliente",
  };
}

function collectIdentity(draft = {}) {
  const summary = draft.sandbox_pac_summary || draft.pac_summary || {};
  const candidates = [
    summary,
    draft.sandbox_stamp_result,
    draft.pac_sandbox_result,
    draft.pac_result,
    draft,
  ].filter((item) => item && typeof item === "object");
  const out = {};
  for (const item of candidates) {
    out.cfdi_uid = out.cfdi_uid || text(item.cfdi_uid || item.uid);
    out.uuid = out.uuid || text(item.uuid || item.cfdi_uuid);
    out.pac_invoice_id = out.pac_invoice_id || text(item.pac_invoice_id || item.invoice_id || item.id);
    out.serie = out.serie || text(item.serie);
    out.folio = out.folio || text(item.folio);
  }
  out.ref = out.cfdi_uid || out.pac_invoice_id || out.uuid;
  return out;
}

function findLatestStampBundle(storageRoot, draftId) {
  const root = path.join(storageRoot, "draft-stamps", safeId(draftId));
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "sandbox-stamp-manifest.json")))
    .sort();
  return dirs[dirs.length - 1] || null;
}

function stampBundleDir(storageRoot, draftId, now) {
  const latest = findLatestStampBundle(storageRoot, draftId);
  if (latest) return latest;
  return path.join(storageRoot, "draft-stamps", safeId(draftId), nowStamp(now));
}

function storageInvoiceDir(storageRoot, draft, identity, now) {
  const date = now instanceof Date ? now : new Date();
  const yyyy = String(date.getUTCFullYear());
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const client = normalizeClient(draft);
  const invoiceIdentity = `invoice-${hashIdentity(identity.ref || draft.draft_id)}`;
  return path.join(
    storageRoot,
    "emitters",
    safeId(draft.emitter_id || "EMITTER-DEMO"),
    yyyy,
    mm,
    "clients",
    safeId(client.client_id),
    "invoices",
    invoiceIdentity,
  );
}

function copyIfDownloaded(result, targetDir, fileName) {
  const sourcePath = text(result?.xml_storage_path || result?.pdf_storage_path);
  if (!sourcePath) return null;
  const absolute = path.resolve(repoRoot, sourcePath);
  if (!fs.existsSync(absolute) || !isInside(runtimeRoot, absolute)) return null;
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, fileName);
  fs.copyFileSync(absolute, target);
  return target;
}

function validationError(status, output, errors, warnings = []) {
  return { status, output, errors, warnings };
}

function safeManifest(draft, identity, xmlResult, pdfResult, storageUpdated, extra = {}) {
  const xmlDownloaded = xmlResult?.xml_downloaded === true && xmlResult?.xml_content_valid === true;
  const pdfDownloaded = pdfResult?.pdf_downloaded === true && pdfResult?.pdf_content_valid === true;
  const xmlValidation = xmlResult?.content_validation || xmlResult?.raw?.validation || null;
  const pdfValidation = pdfResult?.content_validation || pdfResult?.raw?.validation || null;
  const providerPdfResult = extra.providerPdfResult || pdfResult;
  const providerPdfValidation = providerPdfResult?.content_validation
    || providerPdfResult?.raw?.validation
    || providerPdfResult?.raw?.data?.validation
    || null;
  const pdfSource = pdfDownloaded
    ? (pdfResult?.pdf_source || "PROVIDER")
    : null;
  const artifactStatus = xmlDownloaded && pdfDownloaded
    ? ARTIFACT_STATUS.DOWNLOADED
    : xmlDownloaded || pdfDownloaded
      ? ARTIFACT_STATUS.PARTIAL_DOWNLOAD
      : ARTIFACT_STATUS.DOWNLOAD_ERROR;
  return {
    schema_version: "sandbox_draft_download_artifacts.v1",
    generated_at: new Date().toISOString(),
    draft_id: text(draft.draft_id),
    client_id: text(draft.client_id || normalizeClient(draft).client_id),
    emitter_id: text(draft.emitter_id || "EMITTER-DEMO"),
    provider: "Factura.com Sandbox",
    environment: PAC_ENVIRONMENTS.SANDBOX,
    invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
    payment_status: text(draft.payment_status) || "PENDIENTE",
    cfdi_uid_present: Boolean(identity.cfdi_uid),
    uuid_present: Boolean(identity.uuid),
    pac_invoice_id_present: Boolean(identity.pac_invoice_id),
    xml_provider_available: true,
    pdf_provider_available: true,
    xml_downloaded: xmlDownloaded,
    pdf_downloaded: pdfDownloaded,
    provider_pdf_downloaded: providerPdfResult?.pdf_downloaded === true && providerPdfResult?.pdf_content_valid === true,
    provider_pdf_content_valid: providerPdfResult?.pdf_content_valid === true,
    provider_pdf_validation_status: providerPdfResult?.pdf_validation_status || providerPdfValidation?.status || providerPdfResult?.status || null,
    xml_content_valid: xmlResult?.xml_content_valid === true,
    pdf_content_valid: pdfResult?.pdf_content_valid === true,
    pdf_source: pdfSource,
    xml_validation_status: xmlResult?.xml_validation_status || xmlValidation?.status || null,
    pdf_validation_status: pdfResult?.pdf_validation_status || pdfValidation?.status || null,
    pdf_retryable: pdfResult?.raw?.pdf_retryable === true || pdfResult?.pdf_retryable === true || pdfResult?.status === "PDF_NOT_READY_RETRYABLE",
    pdf_visual_content_present: pdfValidation?.pdf_visual_content_present === true,
    pdf_page_count_estimate: Number.isFinite(pdfValidation?.pdf_page_count_estimate) ? pdfValidation.pdf_page_count_estimate : null,
    pdf_text_present: pdfValidation?.pdf_text_present === true,
    pdf_graphics_present: pdfValidation?.pdf_graphics_present === true,
    pdf_image_xobject_present: pdfValidation?.pdf_image_xobject_present === true,
    pdf_content_streams_present: pdfValidation?.pdf_content_streams_present === true,
    download_content_validation: {
      xml: xmlValidation,
      pdf: pdfValidation,
    },
    xml_storage_path: xmlResult?.xml_storage_path || null,
    pdf_storage_path: pdfResult?.pdf_storage_path || null,
    local_rendered_pdf_path: pdfResult?.local_rendered_pdf_path || null,
    provider_pdf_storage_path: providerPdfResult?.pdf_storage_path || null,
    xml_sha256: xmlResult?.xml_sha256 || null,
    pdf_sha256: pdfResult?.pdf_sha256 || null,
    xml_size_bytes: xmlResult?.xml_size_bytes || null,
    pdf_size_bytes: pdfResult?.pdf_size_bytes || null,
    artifact_status: artifactStatus,
    storage_updated: storageUpdated === true,
    requires_human_review: true,
  };
}

function humanFileBaseName(draft, identity, now) {
  const client = normalizeClient(draft);
  const date = (now instanceof Date ? now : new Date()).toISOString().slice(0, 10);
  const serie = safeFileSegment(identity.serie || draft.serie || draft.sandbox_pac_summary?.serie, "");
  const folio = safeFileSegment(identity.folio || draft.folio || draft.sandbox_pac_summary?.folio, "");
  const serieFolio = serie && folio
    ? `${serie}-${folio}`
    : serie || folio || `DRAFT-${hashIdentity(draft.draft_id || identity.ref).slice(0, 8)}`;
  return `${safeFileSegment(client.display_name || client.client_id || "Cliente")}_${date}_${serieFolio}_SANDBOX`;
}

function copyHumanAlias(sourcePath, invoiceDir, baseName, extension) {
  if (!sourcePath) return null;
  const targetDir = path.join(invoiceDir, "exports");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, `${baseName}.${extension}`);
  fs.copyFileSync(sourcePath, target);
  return target;
}

function absoluteRuntimePath(relativePath) {
  const safeRelative = text(relativePath);
  if (!safeRelative) return null;
  const absolute = path.resolve(repoRoot, safeRelative);
  if (!isInside(runtimeRoot, absolute) || !fs.existsSync(absolute)) return null;
  return absolute;
}

function localRenderedPdfResult(renderResult, outputPath, providerPdfResult) {
  const validation = renderResult?.pdf_validation || null;
  return {
    ok: renderResult?.ok === true,
    status: renderResult?.ok === true ? "OK" : "LOCAL_PDF_RENDER_INVALID",
    pdf_provider_available: providerPdfResult?.pdf_provider_available !== false,
    pdf_downloaded: renderResult?.ok === true,
    pdf_content_valid: renderResult?.ok === true,
    pdf_validation_status: validation?.status || renderResult?.status || null,
    pdf_storage_path: rel(outputPath),
    pdf_sha256: sha256File(outputPath),
    pdf_size_bytes: fileSize(outputPath),
    pdf_source: "LOCAL_RENDERED_FROM_XML",
    provider_pdf_content_valid: false,
    provider_pdf_validation_status: providerPdfResult?.pdf_validation_status
      || providerPdfResult?.raw?.validation?.status
      || providerPdfResult?.raw?.data?.validation?.status
      || providerPdfResult?.status
      || null,
    local_rendered_pdf_path: rel(outputPath),
    content_validation: validation,
    raw: {
      validation,
      pdf_source: "LOCAL_RENDERED_FROM_XML",
      provider_pdf_validation_status: providerPdfResult?.pdf_validation_status
        || providerPdfResult?.raw?.validation?.status
        || providerPdfResult?.raw?.data?.validation?.status
        || providerPdfResult?.status
        || null,
    },
    normalized_errors: [],
    normalized_warnings: ["PDF_LOCAL_RENDERED_FROM_XML"],
  };
}

function maybeRenderLocalPdfFallback({ xmlResult, pdfResult, identity, bundleDir }) {
  const xmlPath = absoluteRuntimePath(xmlResult?.xml_storage_path);
  const providerPdfValid = pdfResult?.pdf_downloaded === true && pdfResult?.pdf_content_valid === true;
  if (!xmlPath || providerPdfValid) return null;
  const outputPath = path.join(bundleDir, "downloads", "pdf-local", "cfdi-local-rendered.pdf");
  const renderResult = renderLocalCfdiPdfFromXml({
    xmlPath,
    outputPath,
    expectedIdentity: identity,
  });
  if (renderResult.ok !== true) return null;
  return localRenderedPdfResult(renderResult, outputPath, pdfResult);
}

function safeSandboxPacSummaryForOutput(draft, identity, manifest) {
  const source = draft.sandbox_pac_summary || {};
  return {
    provider: source.provider || "Factura.com Sandbox",
    mode: source.mode || source.environment || null,
    serie: identity.serie || source.serie || null,
    folio: identity.folio || source.folio || null,
    cfdi_uid_present: Boolean(identity.cfdi_uid || source.cfdi_uid),
    uuid_present: Boolean(identity.uuid || source.uuid),
    pac_invoice_id_present: Boolean(identity.pac_invoice_id || source.pac_invoice_id),
    xml_provider_available: true,
    pdf_provider_available: true,
    xml_downloaded: manifest.xml_downloaded,
    pdf_downloaded: manifest.pdf_downloaded,
    provider_pdf_downloaded: manifest.provider_pdf_downloaded,
    provider_pdf_content_valid: manifest.provider_pdf_content_valid,
    provider_pdf_validation_status: manifest.provider_pdf_validation_status,
    xml_content_valid: manifest.xml_content_valid,
    pdf_content_valid: manifest.pdf_content_valid,
    pdf_source: manifest.pdf_source,
    xml_validation_status: manifest.xml_validation_status,
    pdf_validation_status: manifest.pdf_validation_status,
    pdf_retryable: manifest.pdf_retryable,
    pdf_visual_content_present: manifest.pdf_visual_content_present,
    pdf_page_count_estimate: manifest.pdf_page_count_estimate,
    xml_storage_path: manifest.xml_storage_path,
    pdf_storage_path: manifest.pdf_storage_path,
    local_rendered_pdf_path: manifest.local_rendered_pdf_path || null,
    provider_pdf_storage_path: manifest.provider_pdf_storage_path || null,
    human_file_base_name: manifest.human_file_base_name || null,
    human_xml_path: manifest.human_xml_path || null,
    human_pdf_path: manifest.human_pdf_path || null,
    xml_sha256: manifest.xml_sha256,
    pdf_sha256: manifest.pdf_sha256,
    xml_size_bytes: manifest.xml_size_bytes,
    pdf_size_bytes: manifest.pdf_size_bytes,
    artifact_status: manifest.artifact_status,
  };
}

async function runSandboxDraftDownloadArtifacts(options = {}) {
  const env = options.env || process.env;
  const now = options.now || new Date();
  const storageRoot = assertRuntimePath(options.storageRoot || path.join(runtimeRoot, "storage-sandbox"), "storageRoot");
  let draft = null;
  try {
    draft = await readDraftFromOptions(options);
  } catch (error) {
    return validationError("NEEDS_RUNTIME", {
      error_class: "DRAFT_DB_LOAD_FAILED",
      draft_id: text(options.draftId),
      provider: "Factura.com Sandbox",
      artifact_status: ARTIFACT_STATUS.NEEDS_RUNTIME,
      sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
    }, ["DRAFT_DB_LOAD_FAILED"], ["No se pudo cargar el borrador desde PostgreSQL local."]);
  }

  if (!draft || typeof draft !== "object" || !text(draft.draft_id)) {
    return validationError("NEEDS_RUNTIME", {
      error_class: "DRAFT_CONTEXT_MISSING",
      draft_id: text(options.draftId),
      provider: "Factura.com Sandbox",
      artifact_status: ARTIFACT_STATUS.NEEDS_RUNTIME,
    }, ["DRAFT_CONTEXT_MISSING"]);
  }

  const invoiceStatus = String(draft.invoice_status || draft.sandbox_status || "").toUpperCase();
  if (invoiceStatus !== SANDBOX_DRAFT_STAMP_STATUS.STAMPED) {
    return validationError("NEEDS_RUNTIME", {
      error_class: "DRAFT_NOT_SANDBOX_STAMPED",
      draft_id: text(draft.draft_id),
      invoice_status: text(draft.invoice_status || draft.sandbox_status),
      payment_status: text(draft.payment_status) || "NO_APLICA",
      provider: "Factura.com Sandbox",
      artifact_status: ARTIFACT_STATUS.NEEDS_RUNTIME,
    }, ["DRAFT_NOT_SANDBOX_STAMPED"]);
  }

  const identity = collectIdentity(draft);
  if (!identity.ref) {
    return validationError("NEEDS_RUNTIME", {
      error_class: "SANDBOX_PAC_IDENTITY_MISSING",
      draft_id: text(draft.draft_id),
      invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
      payment_status: text(draft.payment_status) || "PENDIENTE",
      provider: "Factura.com Sandbox",
      artifact_status: ARTIFACT_STATUS.NEEDS_RUNTIME,
    }, ["SANDBOX_PAC_IDENTITY_MISSING"]);
  }

  const bundleDir = stampBundleDir(storageRoot, draft.draft_id, now);
  fs.mkdirSync(bundleDir, { recursive: true });
  const adapter = options.adapter || new FacturaComSandboxAdapter({ env });
  const adapterContext = { ...(options.adapterContext || {}), env };
  const xmlResult = await adapter.downloadXml(identity, {
    ...adapterContext,
    storageDir: path.join(bundleDir, "downloads", "xml"),
  });
  const pdfResult = await adapter.downloadPdf(identity, {
    ...adapterContext,
    storageDir: path.join(bundleDir, "downloads", "pdf"),
  });
  const finalPdfResult = (xmlResult?.xml_downloaded === true && xmlResult?.xml_content_valid === true)
    ? (maybeRenderLocalPdfFallback({ xmlResult, pdfResult, identity, bundleDir }) || pdfResult)
    : pdfResult;

  const xmlOk = xmlResult?.xml_downloaded === true && xmlResult?.xml_content_valid === true;
  const pdfOk = finalPdfResult?.pdf_downloaded === true && finalPdfResult?.pdf_content_valid === true;
  const clientInvoiceDir = storageInvoiceDir(storageRoot, draft, identity, now);
  const copiedXml = xmlOk ? copyIfDownloaded(xmlResult, path.join(clientInvoiceDir, "xml"), "cfdi.xml") : null;
  const copiedPdf = pdfOk ? copyIfDownloaded(finalPdfResult, path.join(clientInvoiceDir, "pdf"), finalPdfResult?.pdf_source === "LOCAL_RENDERED_FROM_XML" ? "cfdi-local-rendered.pdf" : "cfdi.pdf") : null;
  const storageUpdated = Boolean(copiedXml || copiedPdf);

  const manifest = safeManifest(draft, identity, xmlResult, finalPdfResult, storageUpdated, { providerPdfResult: pdfResult });
  const humanBaseName = storageUpdated ? humanFileBaseName(draft, identity, now) : null;
  if (copiedXml) {
    manifest.client_storage_xml_path = rel(copiedXml);
    manifest.client_storage_xml_sha256 = sha256File(copiedXml);
    manifest.client_storage_xml_size_bytes = fileSize(copiedXml);
    const humanXml = copyHumanAlias(copiedXml, clientInvoiceDir, humanBaseName, "xml");
    manifest.human_xml_path = rel(humanXml);
  }
  if (copiedPdf) {
    manifest.client_storage_pdf_path = rel(copiedPdf);
    manifest.client_storage_pdf_sha256 = sha256File(copiedPdf);
    manifest.client_storage_pdf_size_bytes = fileSize(copiedPdf);
    const humanPdfBaseName = manifest.pdf_source === "LOCAL_RENDERED_FROM_XML" ? `${humanBaseName}_LOCAL` : humanBaseName;
    const humanPdf = copyHumanAlias(copiedPdf, clientInvoiceDir, humanPdfBaseName, "pdf");
    manifest.human_pdf_path = rel(humanPdf);
  }
  if (humanBaseName) manifest.human_file_base_name = humanBaseName;
  if (storageUpdated) {
    writeJson(path.join(clientInvoiceDir, "manifest.json"), manifest);
    writeJson(path.join(clientInvoiceDir, "canonical-summary.json"), {
      schema_version: "sandbox_client_invoice_summary.v1",
      generated_at: new Date().toISOString(),
      draft_id: text(draft.draft_id),
      client_id: normalizeClient(draft).client_id,
      client_display_name: normalizeClient(draft).display_name,
      invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
      payment_status: text(draft.payment_status) || "PENDIENTE",
      total: number(draft.total),
      provider: "Factura.com Sandbox",
      artifact_status: manifest.artifact_status,
      xml_downloaded: manifest.xml_downloaded,
      pdf_downloaded: manifest.pdf_downloaded,
      xml_content_valid: manifest.xml_content_valid,
      pdf_content_valid: manifest.pdf_content_valid,
      pdf_visual_content_present: manifest.pdf_visual_content_present,
      human_file_base_name: manifest.human_file_base_name || null,
      requires_human_review: true,
    });
  }
  writeJson(path.join(bundleDir, "sandbox-download-manifest.json"), manifest);

  const status = xmlOk && pdfOk
    ? "OK"
    : xmlOk || pdfOk
      ? "PARTIAL_DOWNLOAD"
      : (xmlResult?.status === "NEEDS_CONFIG" || pdfResult?.status === "NEEDS_CONFIG")
        ? "NEEDS_CONFIG"
        : (xmlResult?.status === "NEEDS_RUNTIME" || pdfResult?.status === "NEEDS_RUNTIME")
          ? "NEEDS_RUNTIME"
          : "ERROR";
  const errors = [
    ...(xmlResult?.normalized_errors || []).map((item) => item.code || item.message || "XML_DOWNLOAD_ERROR"),
    ...(pdfOk ? [] : (pdfResult?.normalized_errors || []).map((item) => item.code || item.message || "PDF_DOWNLOAD_ERROR")),
  ];
  const client = normalizeClient(draft);
  return {
    status,
    output: {
      draft_id: text(draft.draft_id),
      provider: "Factura.com Sandbox",
      invoice_status: SANDBOX_DRAFT_STAMP_STATUS.STAMPED,
      draft_status: text(draft.status),
      payment_status: text(draft.payment_status) || "PENDIENTE",
      client_display_name: client.display_name,
      client_id: client.client_id,
      total: number(draft.total),
      artifact_status: manifest.artifact_status,
      xml_provider_available: true,
      pdf_provider_available: true,
      xml_downloaded: manifest.xml_downloaded,
      pdf_downloaded: manifest.pdf_downloaded,
      provider_pdf_downloaded: manifest.provider_pdf_downloaded,
      provider_pdf_content_valid: manifest.provider_pdf_content_valid,
      provider_pdf_validation_status: manifest.provider_pdf_validation_status,
      xml_content_valid: manifest.xml_content_valid,
      pdf_content_valid: manifest.pdf_content_valid,
      pdf_source: manifest.pdf_source,
      xml_validation_status: manifest.xml_validation_status,
      pdf_validation_status: manifest.pdf_validation_status,
      pdf_retryable: manifest.pdf_retryable,
      pdf_visual_content_present: manifest.pdf_visual_content_present,
      pdf_page_count_estimate: manifest.pdf_page_count_estimate,
      pdf_text_present: manifest.pdf_text_present,
      pdf_graphics_present: manifest.pdf_graphics_present,
      pdf_image_xobject_present: manifest.pdf_image_xobject_present,
      pdf_content_streams_present: manifest.pdf_content_streams_present,
      download_content_validation: manifest.download_content_validation,
      xml_storage_path: manifest.xml_storage_path,
      pdf_storage_path: manifest.pdf_storage_path,
      local_rendered_pdf_path: manifest.local_rendered_pdf_path,
      provider_pdf_storage_path: manifest.provider_pdf_storage_path,
      xml_sha256: manifest.xml_sha256,
      pdf_sha256: manifest.pdf_sha256,
      xml_size_bytes: manifest.xml_size_bytes,
      pdf_size_bytes: manifest.pdf_size_bytes,
      storage_updated: storageUpdated,
      manifest_path: rel(path.join(bundleDir, "sandbox-download-manifest.json")),
      client_storage_manifest_path: storageUpdated ? rel(path.join(clientInvoiceDir, "manifest.json")) : null,
      human_file_base_name: manifest.human_file_base_name || null,
      human_xml_path: manifest.human_xml_path || null,
      human_pdf_path: manifest.human_pdf_path || null,
      pac_identity: {
        cfdi_uid_present: Boolean(identity.cfdi_uid),
        uuid_present: Boolean(identity.uuid),
        pac_invoice_id_present: Boolean(identity.pac_invoice_id),
      },
      sandbox_pac_summary: safeSandboxPacSummaryForOutput(draft, identity, manifest),
      sandbox_notice: "CFDI de prueba. No es produccion fiscal real.",
      requires_human_review: true,
    },
    warnings: [
      ...(xmlResult?.normalized_warnings || []),
      ...(pdfOk ? (finalPdfResult?.normalized_warnings || []) : (pdfResult?.normalized_warnings || [])),
    ],
    errors,
  };
}

module.exports = {
  ARTIFACT_STATUS,
  collectIdentity,
  runSandboxDraftDownloadArtifacts,
};

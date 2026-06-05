const fs = require("fs");
const path = require("path");
const {
  DEFAULT_STORAGE_ROOT,
  buildStorageIndex,
  scanSensitiveFiles,
} = require("./sandbox-storage-engine");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const REPORT_SCHEMA_VERSION = "sandbox_reporting.v1";
const HUMAN_REVIEW_NOTICE = "Borrador sujeto a revisión humana. No sustituye contador.";

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) {
    throw new Error(`${label} fuera de runtime/: ${resolved}`);
  }
  return resolved;
}

function relFromRoot(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function relFromStorage(storageRoot, filePath) {
  return path.relative(storageRoot, filePath).replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function nowIso() {
  return new Date().toISOString();
}

function roundCurrency(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function addCurrency(current, next) {
  if (next === null || next === undefined || Number.isNaN(Number(next))) return current;
  return roundCurrency((current || 0) + Number(next));
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function normalizePeriod(year, month) {
  if (!year || !month) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

function storageRootFromIndex(index = {}, options = {}) {
  if (options.storageRoot) return assertRuntimePath(options.storageRoot, "storageRoot");
  if (index._storageRootAbs) return assertRuntimePath(index._storageRootAbs, "storageRoot");
  if (index.storage_root) return assertRuntimePath(path.resolve(repoRoot, index.storage_root), "storageRoot");
  return assertRuntimePath(DEFAULT_STORAGE_ROOT, "storageRoot");
}

function attachStorageRoot(index, storageRoot) {
  Object.defineProperty(index, "_storageRootAbs", {
    value: storageRoot,
    enumerable: false,
    configurable: true,
  });
  return index;
}

function attachManifestContext(manifest, storageRoot, manifestPath) {
  Object.defineProperty(manifest, "_storageRootAbs", {
    value: storageRoot,
    enumerable: false,
    configurable: true,
  });
  Object.defineProperty(manifest, "_manifestPathAbs", {
    value: manifestPath,
    enumerable: false,
    configurable: true,
  });
  return manifest;
}

function loadStorageIndex(storageRoot = DEFAULT_STORAGE_ROOT) {
  const resolvedStorageRoot = assertRuntimePath(storageRoot, "storageRoot");
  const indexPath = path.join(resolvedStorageRoot, "reports", "storage-index.json");
  if (!fs.existsSync(indexPath)) {
    if (!fs.existsSync(resolvedStorageRoot)) {
      throw new Error(`No existe storageRoot: ${relFromRoot(resolvedStorageRoot)}`);
    }
    return attachStorageRoot(buildStorageIndex(resolvedStorageRoot), resolvedStorageRoot);
  }
  const index = readJson(indexPath);
  return attachStorageRoot(index, resolvedStorageRoot);
}

function loadStoredInvoiceManifest(manifestPath) {
  const resolved = path.isAbsolute(manifestPath)
    ? path.resolve(manifestPath)
    : path.resolve(repoRoot, manifestPath);
  assertRuntimePath(resolved, "manifestPath");
  return readJson(resolved);
}

function resolveManifestPath(document = {}, index = {}, options = {}) {
  const storageRoot = storageRootFromIndex(index, options);
  const rawPath = text(document.manifest_path);
  if (!rawPath) throw new Error("Documento sin manifest_path");
  const resolved = path.isAbsolute(rawPath)
    ? path.resolve(rawPath)
    : path.resolve(storageRoot, rawPath);
  if (!isInside(storageRoot, resolved)) {
    throw new Error(`manifest_path fuera de storageRoot: ${rawPath}`);
  }
  return resolved;
}

function artifactRecords(invoiceManifest = {}, category) {
  return (Array.isArray(invoiceManifest.artifacts) ? invoiceManifest.artifacts : [])
    .filter((artifact) => !category || artifact.category === category);
}

function resolveArtifactPath(invoiceManifest = {}, artifact = {}) {
  const storageRoot = invoiceManifest._storageRootAbs;
  if (!storageRoot) return null;
  const rawPath = text(artifact.storage_path || artifact.invoice_relative_path);
  if (!rawPath) return null;
  const base = artifact.storage_path ? storageRoot : path.dirname(invoiceManifest._manifestPathAbs || "");
  const resolved = path.resolve(base, rawPath);
  if (!isInside(storageRoot, resolved)) return null;
  return resolved;
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return roundCurrency(Number(cleaned));
}

function findFirstNumberByKeys(value, keys) {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        const found = walk(item);
        if (found !== null) return found;
      }
      return null;
    }
    for (const [key, item] of Object.entries(node)) {
      if (wanted.has(key.toLowerCase())) {
        const number = parseNumber(item);
        if (number !== null) return number;
      }
    }
    for (const item of Object.values(node)) {
      const found = walk(item);
      if (found !== null) return found;
    }
    return null;
  }
  return walk(value);
}

function xmlAttribute(xml, name) {
  const match = new RegExp(`(?:^|[\\s<])${name}\\s*=\\s*"([^"]+)"`, "i").exec(xml);
  return match ? match[1] : null;
}

function firstXmlText(invoiceManifest = {}) {
  for (const artifact of artifactRecords(invoiceManifest, "xml")) {
    const resolved = resolveArtifactPath(invoiceManifest, artifact);
    if (resolved && fs.existsSync(resolved)) {
      return {
        path: artifact.storage_path || artifact.invoice_relative_path || null,
        xml: fs.readFileSync(resolved, "utf8"),
      };
    }
  }
  return { path: null, xml: null };
}

function extractXmlAmounts(invoiceManifest = {}) {
  const { path: xmlPath, xml } = firstXmlText(invoiceManifest);
  if (!xml) return null;
  const subtotal = parseNumber(xmlAttribute(xml, "SubTotal"));
  const total = parseNumber(xmlAttribute(xml, "Total"));
  const ivaTrasladado = parseNumber(xmlAttribute(xml, "TotalImpuestosTrasladados"));
  return {
    source: "XML",
    source_path: xmlPath,
    subtotal,
    iva_trasladado: ivaTrasladado,
    total,
  };
}

function extractManifestAmounts(invoiceManifest = {}) {
  return {
    source: "MANIFEST",
    subtotal: findFirstNumberByKeys(invoiceManifest, ["subtotal", "SubTotal"]),
    iva_trasladado: findFirstNumberByKeys(invoiceManifest, [
      "iva_trasladado",
      "ivaTrasladado",
      "TotalImpuestosTrasladados",
      "total_impuestos_trasladados",
    ]),
    total: findFirstNumberByKeys(invoiceManifest, ["total", "Total"]),
  };
}

function extractInvoiceAmounts(invoiceManifest, options = {}) {
  const manifestAmounts = extractManifestAmounts(invoiceManifest);
  const xmlAmounts = options.disableXml ? null : extractXmlAmounts(invoiceManifest);
  const subtotal = manifestAmounts.subtotal ?? xmlAmounts?.subtotal ?? null;
  const ivaTrasladado = manifestAmounts.iva_trasladado ?? xmlAmounts?.iva_trasladado ?? null;
  const total = manifestAmounts.total ?? xmlAmounts?.total ?? null;
  const hasAnyAmount = [subtotal, ivaTrasladado, total].some((value) => value !== null);
  const source = hasAnyAmount
    ? Array.from(new Set([manifestAmounts, xmlAmounts].filter(Boolean)
      .filter((item) => [item.subtotal, item.iva_trasladado, item.total].some((value) => value !== null))
      .map((item) => item.source))).join("+")
    : null;
  return sanitizeReportRecord({
    amount_status: hasAnyAmount ? "EXTRACTED" : "UNKNOWN",
    amount_source: source,
    amount_source_path: xmlAmounts?.source_path || null,
    subtotal,
    iva_trasladado: ivaTrasladado,
    total,
  });
}

function extractInvoiceDates(invoiceManifest) {
  const { xml } = firstXmlText(invoiceManifest);
  const fecha = xml ? xmlAttribute(xml, "Fecha") : null;
  const fechaTimbrado = xml ? xmlAttribute(xml, "FechaTimbrado") : null;
  return sanitizeReportRecord({
    fecha: fecha || invoiceManifest.created_at || invoiceManifest.generated_at || null,
    fecha_timbrado: fechaTimbrado,
    generated_at: invoiceManifest.generated_at || null,
    year: invoiceManifest.year || null,
    month: invoiceManifest.month || null,
  });
}

function loadInvoiceRecords(index = {}, options = {}) {
  const storageRoot = storageRootFromIndex(index, options);
  const period = options.period || null;
  return (Array.isArray(index.documents) ? index.documents : []).map((document) => {
    const manifestPath = resolveManifestPath(document, index, { storageRoot });
    const manifest = attachManifestContext(loadStoredInvoiceManifest(manifestPath), storageRoot, manifestPath);
    const amounts = extractInvoiceAmounts(manifest);
    const dates = extractInvoiceDates(manifest);
    const recordPeriod = normalizePeriod(manifest.year || document.year, manifest.month || document.month);
    const xmlPaths = artifactRecords(manifest, "xml").map((artifact) => artifact.storage_path || artifact.invoice_relative_path).filter(Boolean);
    const pdfPaths = artifactRecords(manifest, "pdf").map((artifact) => artifact.storage_path || artifact.invoice_relative_path).filter(Boolean);
    return sanitizeReportRecord({
      period: recordPeriod,
      invoice_id: manifest.invoice_id || document.invoice_id || null,
      draft_id: manifest.draft_id || document.draft_id || null,
      emitter_id: manifest.emitter_id || document.emitter_id || null,
      client_id: manifest.client_id || document.client_id || null,
      status: manifest.status || document.status || "UNKNOWN",
      identity_status: manifest.identity_status || document.identity_status || "UNKNOWN",
      uuid: manifest.uuid || document.uuid || null,
      cfdi_uid: manifest.cfdi_uid || document.cfdi_uid || null,
      serie: manifest.serie || null,
      folio: manifest.folio || null,
      fecha: dates.fecha,
      fecha_timbrado: dates.fecha_timbrado,
      has_xml: Boolean(manifest.has_xml || document.has_xml),
      has_pdf: Boolean(manifest.has_pdf || document.has_pdf),
      has_cancel_response: Boolean(manifest.has_cancel_response || document.has_cancel_response),
      amount_status: amounts.amount_status,
      amount_source: amounts.amount_source,
      subtotal: amounts.subtotal,
      iva_trasladado: amounts.iva_trasladado,
      total: amounts.total,
      manifest_path: relFromStorage(storageRoot, manifestPath),
      xml_paths: xmlPaths,
      pdf_paths: pdfPaths,
      human_review_warning: HUMAN_REVIEW_NOTICE,
    });
  }).filter((record) => !period || record.period === period);
}

function emptyStatusCounts() {
  return { CREATED: 0, CANCELLED: 0, ERROR: 0, PARTIAL: 0, UNKNOWN: 0 };
}

function statusCounts(records) {
  const counts = emptyStatusCounts();
  for (const record of records) {
    const status = counts[record.status] === undefined ? "UNKNOWN" : record.status;
    counts[status] += 1;
  }
  return counts;
}

function amountTotals(records) {
  let subtotal = null;
  let ivaTrasladado = null;
  let total = null;
  let extracted = 0;
  let unknown = 0;
  for (const record of records) {
    if (record.amount_status === "EXTRACTED") {
      extracted += 1;
      subtotal = addCurrency(subtotal, record.subtotal);
      ivaTrasladado = addCurrency(ivaTrasladado, record.iva_trasladado);
      total = addCurrency(total, record.total);
    } else {
      unknown += 1;
    }
  }
  return {
    amount_status: extracted === 0 ? "UNKNOWN" : (unknown > 0 ? "PARTIAL" : "EXTRACTED"),
    documents_with_amount: extracted,
    documents_without_amount: unknown,
    subtotal,
    iva_trasladado: ivaTrasladado,
    total,
  };
}

function defaultPeriod(index = {}) {
  const first = (Array.isArray(index.documents) ? index.documents : [])
    .map((doc) => normalizePeriod(doc.year, doc.month))
    .filter(Boolean)
    .sort()[0];
  return first || normalizePeriod(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);
}

function buildMonthlyReport(index, options = {}) {
  const period = options.period || defaultPeriod(index);
  const documents = loadInvoiceRecords(index, { ...options, period });
  const activeDocuments = documents.filter((doc) => doc.status === "CREATED");
  const cancelledDocuments = documents.filter((doc) => doc.status === "CANCELLED");
  const activeTotals = amountTotals(activeDocuments);
  const cancelledTotals = amountTotals(cancelledDocuments);
  const identityCounts = {
    COMPLETE: documents.filter((doc) => doc.identity_status === "COMPLETE").length,
    PARTIAL: documents.filter((doc) => /^PARTIAL/.test(String(doc.identity_status))).length,
    MISSING: documents.filter((doc) => doc.identity_status === "MISSING").length,
  };
  const report = sanitizeReportRecord({
    schema_version: `${REPORT_SCHEMA_VERSION}.monthly`,
    generated_at: nowIso(),
    period,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    total_documents: documents.length,
    status_counts: statusCounts(documents),
    xml_pdf: {
      with_xml: documents.filter((doc) => doc.has_xml).length,
      with_pdf: documents.filter((doc) => doc.has_pdf).length,
      without_xml: documents.filter((doc) => !doc.has_xml).length,
      without_pdf: documents.filter((doc) => !doc.has_pdf).length,
    },
    identity_counts: identityCounts,
    fiscal_totals: {
      ...activeTotals,
      cancelled_total: cancelledTotals.total,
      cancelled_subtotal: cancelledTotals.subtotal,
      cancelled_iva_trasladado: cancelledTotals.iva_trasladado,
      cancelled_amount_status: cancelledTotals.amount_status,
      note: "Cancelados no se suman como ingresos vigentes.",
    },
    documents,
  });
  assertReportingSafe(report);
  return report;
}

function buildClientReport(index, options = {}) {
  const monthly = buildMonthlyReport(index, options);
  const byClient = new Map();
  for (const document of monthly.documents) {
    const key = document.client_id || "CLIENT-UNKNOWN";
    if (!byClient.has(key)) {
      byClient.set(key, {
        client_id: key,
        total_documents: 0,
        status_counts: emptyStatusCounts(),
        with_xml: 0,
        with_pdf: 0,
        active_totals: amountTotals([]),
        cancelled_total: null,
        documents: [],
      });
    }
    const client = byClient.get(key);
    client.total_documents += 1;
    const status = client.status_counts[document.status] === undefined ? "UNKNOWN" : document.status;
    client.status_counts[status] += 1;
    if (document.has_xml) client.with_xml += 1;
    if (document.has_pdf) client.with_pdf += 1;
    client.documents.push(document);
  }
  const clients = Array.from(byClient.values()).map((client) => {
    const active = client.documents.filter((doc) => doc.status === "CREATED");
    const cancelled = client.documents.filter((doc) => doc.status === "CANCELLED");
    return sanitizeReportRecord({
      ...client,
      active_totals: amountTotals(active),
      cancelled_totals: amountTotals(cancelled),
      documents: client.documents.map((doc) => ({
        invoice_id: doc.invoice_id,
        status: doc.status,
        uuid: doc.uuid,
        cfdi_uid: doc.cfdi_uid,
        serie: doc.serie,
        folio: doc.folio,
        total: doc.total,
        amount_status: doc.amount_status,
        manifest_path: doc.manifest_path,
      })),
    });
  }).sort((a, b) => String(a.client_id).localeCompare(String(b.client_id)));
  const report = sanitizeReportRecord({
    schema_version: `${REPORT_SCHEMA_VERSION}.client`,
    generated_at: nowIso(),
    period: monthly.period,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    total_clients: clients.length,
    clients,
  });
  assertReportingSafe(report);
  return report;
}

function compactDocument(doc) {
  return {
    invoice_id: doc.invoice_id,
    draft_id: doc.draft_id,
    client_id: doc.client_id,
    status: doc.status,
    identity_status: doc.identity_status,
    uuid: doc.uuid,
    cfdi_uid: doc.cfdi_uid,
    serie: doc.serie,
    folio: doc.folio,
    manifest_path: doc.manifest_path,
  };
}

function buildDocumentControlReport(index, options = {}) {
  const monthly = buildMonthlyReport(index, options);
  const storageRoot = storageRootFromIndex(index, options);
  const sensitiveFindings = fs.existsSync(storageRoot) ? scanSensitiveFiles(storageRoot) : [];
  const report = sanitizeReportRecord({
    schema_version: `${REPORT_SCHEMA_VERSION}.control`,
    generated_at: nowIso(),
    period: monthly.period,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    documents_without_xml: monthly.documents.filter((doc) => !doc.has_xml).map(compactDocument),
    documents_without_pdf: monthly.documents.filter((doc) => !doc.has_pdf).map(compactDocument),
    documents_without_uuid: monthly.documents.filter((doc) => !doc.uuid).map(compactDocument),
    cancelled_documents: monthly.documents.filter((doc) => doc.status === "CANCELLED").map(compactDocument),
    identity_missing_documents: monthly.documents.filter((doc) => doc.identity_status === "MISSING").map(compactDocument),
    error_documents: monthly.documents.filter((doc) => doc.status === "ERROR").map(compactDocument),
    sensitive_findings: sensitiveFindings,
  });
  assertReportingSafe(report);
  return report;
}

function buildReportingSummary(reports) {
  const monthly = reports.monthly || {};
  const client = reports.client || {};
  const control = reports.control || {};
  const report = sanitizeReportRecord({
    schema_version: `${REPORT_SCHEMA_VERSION}.summary`,
    generated_at: nowIso(),
    period: monthly.period || client.period || control.period || null,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    total_documents: monthly.total_documents || 0,
    status_counts: monthly.status_counts || emptyStatusCounts(),
    xml_pdf: monthly.xml_pdf || {},
    identity_counts: monthly.identity_counts || {},
    fiscal_totals: monthly.fiscal_totals || {},
    total_clients: client.total_clients || 0,
    control_counts: {
      documents_without_xml: (control.documents_without_xml || []).length,
      documents_without_pdf: (control.documents_without_pdf || []).length,
      documents_without_uuid: (control.documents_without_uuid || []).length,
      cancelled_documents: (control.cancelled_documents || []).length,
      identity_missing_documents: (control.identity_missing_documents || []).length,
      error_documents: (control.error_documents || []).length,
      sensitive_findings: (control.sensitive_findings || []).length,
    },
    warnings: [
      HUMAN_REVIEW_NOTICE,
      "Cancelados no se suman como ingresos vigentes.",
    ],
  });
  assertReportingSafe(report);
  return report;
}

function sanitizeString(value) {
  return String(value)
    .replace(/<\?xml[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<cfdi:Comprobante[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/%PDF[\s\S]*$/i, "[REDACTED_PDF_TEXT]")
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]");
}

function sanitizeReportRecord(record) {
  if (record === null || record === undefined) return record;
  if (typeof record === "string") {
    const resolved = path.isAbsolute(record) ? path.resolve(record) : null;
    if (resolved && isInside(repoRoot, resolved)) return relFromRoot(resolved);
    if (resolved) return "[BLOCKED_ABSOLUTE_PATH]";
    return sanitizeString(record).replace(/\\/g, "/");
  }
  if (typeof record === "number" || typeof record === "boolean") return record;
  if (Array.isArray(record)) return record.map(sanitizeReportRecord);
  if (typeof record === "object") {
    const out = {};
    for (const [key, value] of Object.entries(record)) {
      if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeReportRecord(value);
      }
    }
    return out;
  }
  return null;
}

function assertReportingSafe(report) {
  const textReport = JSON.stringify(report);
  const findings = [];
  if (!textReport.includes(HUMAN_REVIEW_NOTICE)) findings.push("missing_human_review_notice");
  if (/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(textReport)) findings.push("xml_content_in_report");
  if (/%PDF-/i.test(textReport)) findings.push("pdf_content_in_report");
  if (/https:\/\/api\.factura\.com/i.test(textReport)) findings.push("production_url_in_report");
  if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(textReport)) {
    findings.push("secret_like_value_in_report");
  }
  if (/[A-Za-z]:[\\/]/.test(textReport) || /\\\\/.test(textReport)) findings.push("absolute_path_in_report");
  if (findings.length) throw new Error(`Reporte sandbox inseguro: ${findings.join(", ")}`);
  return true;
}

module.exports = {
  HUMAN_REVIEW_NOTICE,
  REPORT_SCHEMA_VERSION,
  assertReportingSafe,
  buildClientReport,
  buildDocumentControlReport,
  buildMonthlyReport,
  buildReportingSummary,
  extractInvoiceAmounts,
  extractInvoiceDates,
  loadStorageIndex,
  loadStoredInvoiceManifest,
  sanitizeReportRecord,
};

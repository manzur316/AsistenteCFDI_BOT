const fs = require("fs");
const path = require("path");
const {
  HUMAN_REVIEW_NOTICE,
  assertReportingSafe,
  sanitizeReportRecord,
} = require("./sandbox-reporting-engine");
const { DEFAULT_STORAGE_ROOT } = require("./sandbox-storage-engine");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const DEFAULT_REPORT_ROOT = path.join(runtimeRoot, "reports-sandbox");
const DEFAULT_PACKAGE_ROOT = path.join(runtimeRoot, "accountant-packages-sandbox");
const PACKAGE_SCHEMA_VERSION = "sandbox_accountant_package.v1";

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function assertInside(parent, child, label = "path") {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (!isInside(resolvedParent, resolvedChild)) {
    throw new Error(`${label} fuera de ${resolvedParent}: ${resolvedChild}`);
  }
  return resolvedChild;
}

function relFromRoot(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function relFromPackage(packageDir, filePath) {
  return path.relative(packageDir, filePath).replace(/\\/g, "/");
}

function safeSegment(value, fallback = "UNKNOWN") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sanitizePackageManifest(value), null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, String(value), "utf8");
}

function normalizePeriod(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function periodPathParts(period) {
  const safe = normalizePeriod(period) || "UNKNOWN-00";
  const [year, month] = safe.split("-");
  return { period: safe, year, month };
}

function listReportDirs(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (fs.existsSync(path.join(current, "monthly-summary.json"))) out.push(current);
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) stack.push(path.join(current, entry.name));
    }
  }
  return out.sort();
}

function resolveReportDir(reportRoot = DEFAULT_REPORT_ROOT, options = {}) {
  const resolvedReportRoot = assertRuntimePath(reportRoot, "reportRoot");
  if (fs.existsSync(path.join(resolvedReportRoot, "monthly-summary.json"))) return resolvedReportRoot;

  const requestedPeriod = normalizePeriod(options.period);
  if (requestedPeriod) {
    const { year, month } = periodPathParts(requestedPeriod);
    const nested = path.join(resolvedReportRoot, year, month);
    if (fs.existsSync(path.join(nested, "monthly-summary.json"))) return assertRuntimePath(nested, "reportDir");
    const dashed = path.join(resolvedReportRoot, requestedPeriod);
    if (fs.existsSync(path.join(dashed, "monthly-summary.json"))) return assertRuntimePath(dashed, "reportDir");
    throw new Error(`No existe reporte mensual para ${requestedPeriod}`);
  }

  const directPeriod = normalizePeriod(path.basename(resolvedReportRoot));
  if (directPeriod && fs.existsSync(path.join(resolvedReportRoot, "monthly-summary.json"))) return resolvedReportRoot;

  const dirs = listReportDirs(resolvedReportRoot);
  if (dirs.length === 0) throw new Error("No existen reportes sandbox. Ejecuta primero el Reporting Engine.");
  return dirs[dirs.length - 1];
}

function loadMonthlyReports(reportRoot = DEFAULT_REPORT_ROOT, options = {}) {
  const reportDir = resolveReportDir(reportRoot, options);
  const required = {
    monthly_json: "monthly-summary.json",
    monthly_csv: "monthly-summary.csv",
    client_json: "client-summary.json",
    client_csv: "client-summary.csv",
    control_json: "document-control.json",
    control_csv: "document-control.csv",
    accountant_review_json: "accountant-review.json",
  };
  const files = {};
  for (const [key, name] of Object.entries(required)) {
    const filePath = path.join(reportDir, name);
    if (!fs.existsSync(filePath)) throw new Error(`Falta reporte requerido: ${name}`);
    files[key] = filePath;
  }
  const reports = {
    report_dir: reportDir,
    report_dir_relative: relFromRoot(reportDir),
    files,
    monthly: readJson(files.monthly_json),
    client: readJson(files.client_json),
    control: readJson(files.control_json),
    accountant_review: readJson(files.accountant_review_json),
  };
  reports.period = normalizePeriod(reports.monthly.period) || normalizePeriod(options.period) || "UNKNOWN-00";
  assertReportingSafe(reports.accountant_review);
  return reports;
}

function attachInternalPath(record, filePath) {
  Object.defineProperty(record, "_sourceAbs", {
    value: filePath,
    enumerable: false,
    configurable: true,
  });
  return record;
}

function resolveStorageArtifact(storageRoot, relativePath) {
  const resolvedStorageRoot = assertRuntimePath(storageRoot, "storageRoot");
  const safeRelative = String(relativePath || "").replace(/\\/g, "/");
  if (!safeRelative || path.isAbsolute(safeRelative) || safeRelative.includes("..")) {
    throw new Error(`Ruta de artifact invalida: ${safeRelative}`);
  }
  const resolved = path.resolve(resolvedStorageRoot, safeRelative);
  assertInside(resolvedStorageRoot, resolved, "storage artifact");
  return resolved;
}

function collectStorageArtifacts(storageRoot = DEFAULT_STORAGE_ROOT, reports = {}) {
  const resolvedStorageRoot = assertRuntimePath(storageRoot, "storageRoot");
  const documents = reports.monthly?.documents || [];
  const artifacts = [];
  for (const document of documents) {
    const status = ["CREATED", "CANCELLED", "ERROR"].includes(document.status) ? document.status : "ERROR";
    for (const xmlPath of document.xml_paths || []) {
      const source = resolveStorageArtifact(resolvedStorageRoot, xmlPath);
      if (!fs.existsSync(source)) continue;
      artifacts.push(attachInternalPath({
        type: "XML",
        status,
        invoice_id: document.invoice_id,
        draft_id: document.draft_id,
        client_id: document.client_id,
        source_path: xmlPath,
        file_name: path.basename(source),
      }, source));
    }
    for (const pdfPath of document.pdf_paths || []) {
      const source = resolveStorageArtifact(resolvedStorageRoot, pdfPath);
      if (!fs.existsSync(source)) continue;
      artifacts.push(attachInternalPath({
        type: "PDF",
        status,
        invoice_id: document.invoice_id,
        draft_id: document.draft_id,
        client_id: document.client_id,
        source_path: pdfPath,
        file_name: path.basename(source),
      }, source));
    }
  }
  return artifacts;
}

function packageDirForPeriod(packageRoot, period) {
  const { period: safePeriod } = periodPathParts(period);
  return assertRuntimePath(path.join(packageRoot, safePeriod, "package"), "packageDir");
}

function packageZipForPeriod(packageRoot, period) {
  const { period: safePeriod } = periodPathParts(period);
  return assertRuntimePath(path.join(packageRoot, safePeriod, `accountant-package-${safePeriod}.zip`), "targetZip");
}

function accountantExcelPathForPeriod(packageRoot, period) {
  const { period: safePeriod } = periodPathParts(period);
  return assertRuntimePath(path.join(packageRoot, safePeriod, `accountant-review-${safePeriod}.xlsx`), "accountantExcelPath");
}

function optionalAccountantExcel(packageRoot, period, explicitPath) {
  const source = explicitPath
    ? assertRuntimePath(explicitPath, "accountantExcelPath")
    : accountantExcelPathForPeriod(packageRoot || DEFAULT_PACKAGE_ROOT, period);
  if (!fs.existsSync(source)) {
    return {
      optional: true,
      included: false,
      reason: "ACCOUNTANT_EXCEL_NOT_FOUND",
      source_path: relFromRoot(source),
    };
  }
  return {
    optional: true,
    included: true,
    source_path: relFromRoot(source),
    file_name: path.basename(source),
  };
}

function buildAccountantPackageManifest(context = {}) {
  const reports = context.reports || {};
  const monthly = reports.monthly || {};
  const control = reports.control || {};
  const artifacts = context.artifacts || [];
  const accountantExcel = context.accountantExcel || {
    optional: true,
    included: false,
    reason: "ACCOUNTANT_EXCEL_NOT_FOUND",
  };
  const statusCounts = monthly.status_counts || {};
  const alerts = [];
  if ((control.documents_without_xml || []).length) alerts.push("DOCUMENTS_WITHOUT_XML");
  if ((control.documents_without_pdf || []).length) alerts.push("DOCUMENTS_WITHOUT_PDF");
  if ((control.documents_without_uuid || []).length) alerts.push("DOCUMENTS_WITHOUT_UUID");
  if ((control.identity_missing_documents || []).length) alerts.push("IDENTITY_MISSING");
  if ((control.error_documents || []).length) alerts.push("ERROR_DOCUMENTS");
  if ((control.sensitive_findings || []).length) alerts.push("SENSITIVE_FINDINGS");
  alerts.push("CANCELLED_NOT_INCLUDED_IN_ACTIVE_INCOME");

  return sanitizePackageManifest({
    schema_version: PACKAGE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    period: reports.period || monthly.period,
    human_review_warning: HUMAN_REVIEW_NOTICE,
    source_report_dir: reports.report_dir_relative,
    package_dir: context.packageDir ? relFromRoot(context.packageDir) : null,
    zip_path: context.targetZip ? relFromRoot(context.targetZip) : null,
    totals: {
      total_documents: monthly.total_documents || 0,
      created: statusCounts.CREATED || 0,
      cancelled: statusCounts.CANCELLED || 0,
      error: statusCounts.ERROR || 0,
      active_subtotal: monthly.fiscal_totals?.subtotal ?? null,
      active_iva_trasladado: monthly.fiscal_totals?.iva_trasladado ?? null,
      active_total: monthly.fiscal_totals?.total ?? null,
      cancelled_total: monthly.fiscal_totals?.cancelled_total ?? null,
      amount_status: monthly.fiscal_totals?.amount_status || "UNKNOWN",
      cancelled_amount_status: monthly.fiscal_totals?.cancelled_amount_status || "UNKNOWN",
      note: "Cancelados no se suman como ingresos vigentes.",
    },
    included_reports: [
      "monthly-summary.json",
      "monthly-summary.csv",
      "client-summary.json",
      "client-summary.csv",
      "document-control.json",
      "document-control.csv",
      "accountant-review.json",
    ],
    accountant_excel: accountantExcel,
    included_artifacts: artifacts.map((artifact) => ({
      type: artifact.type,
      status: artifact.status,
      invoice_id: artifact.invoice_id,
      draft_id: artifact.draft_id,
      source_path: artifact.source_path,
      package_path: artifact.package_path || null,
    })),
    artifact_counts: {
      xml: artifacts.filter((artifact) => artifact.type === "XML").length,
      pdf: artifacts.filter((artifact) => artifact.type === "PDF").length,
    },
    alerts: Array.from(new Set(alerts)),
  });
}

function readmeText(manifest) {
  return [
    "PAQUETE CONTADOR SANDBOX",
    "",
    HUMAN_REVIEW_NOTICE,
    "",
    `Periodo: ${manifest.period}`,
    `Documentos: ${manifest.totals.total_documents}`,
    `Creados: ${manifest.totals.created}`,
    `Cancelados: ${manifest.totals.cancelled}`,
    `Errores: ${manifest.totals.error}`,
    "",
    "Reglas:",
    "- Este paquete es sandbox y no sustituye la revision del contador.",
    "- No contiene timbrado productivo ni folios fiscales reales de produccion.",
    "- Los cancelados estan separados y no se suman como ingresos vigentes.",
    "- Si falta XML/PDF o UUID, revisa document-control.json/csv.",
    "- No uses este paquete para presentar declaraciones sin revision humana.",
    "",
    "Contenido:",
    "- monthly-summary.json/csv",
    "- client-summary.json/csv",
    "- document-control.json/csv",
    "- accountant-review.json",
    "- accountant-review-YYYY-MM.xlsx si fue generado antes de empaquetar",
    "- XML/ y PDF/ con artifacts disponibles",
    "- CREATED/, CANCELLED/ y ERROR/ con indices por estatus",
    "",
  ].join("\r\n");
}

function copyFileInside(source, target, sourceRoot, packageDir) {
  assertInside(sourceRoot, source, "source");
  assertInside(packageDir, target, "target");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function statusDocuments(reports = {}, status) {
  return (reports.monthly?.documents || [])
    .filter((document) => document.status === status)
    .map((document) => sanitizePackageManifest({
      invoice_id: document.invoice_id,
      draft_id: document.draft_id,
      client_id: document.client_id,
      status: document.status,
      identity_status: document.identity_status,
      uuid: document.uuid,
      cfdi_uid: document.cfdi_uid,
      serie: document.serie,
      folio: document.folio,
      amount_status: document.amount_status,
      subtotal: document.subtotal,
      iva_trasladado: document.iva_trasladado,
      total: document.total,
      manifest_path: document.manifest_path,
      human_review_warning: HUMAN_REVIEW_NOTICE,
    }));
}

function copyAccountantPackageFiles(context = {}) {
  const reports = context.reports;
  const artifacts = context.artifacts || [];
  const packageDir = assertRuntimePath(context.packageDir, "packageDir");
  const reportDir = assertRuntimePath(reports.report_dir, "reportDir");
  const storageRoot = assertRuntimePath(context.storageRoot || DEFAULT_STORAGE_ROOT, "storageRoot");
  if (fs.existsSync(packageDir)) fs.rmSync(packageDir, { recursive: true, force: true });
  fs.mkdirSync(packageDir, { recursive: true });

  for (const dirName of ["XML", "PDF", "CREATED", "CANCELLED", "ERROR"]) {
    fs.mkdirSync(path.join(packageDir, dirName), { recursive: true });
  }

  const reportCopies = [];
  for (const source of Object.values(reports.files)) {
    const target = path.join(packageDir, path.basename(source));
    copyFileInside(source, target, reportDir, packageDir);
    reportCopies.push(relFromPackage(packageDir, target));
  }

  const accountantExcel = optionalAccountantExcel(
    context.packageRoot || DEFAULT_PACKAGE_ROOT,
    reports.period,
    context.accountantExcelPath,
  );
  if (accountantExcel.included) {
    const source = path.resolve(repoRoot, accountantExcel.source_path);
    const target = path.join(packageDir, accountantExcel.file_name);
    assertRuntimePath(source, "accountantExcelSource");
    assertInside(packageDir, target, "accountantExcelTarget");
    fs.copyFileSync(source, target);
    accountantExcel.package_path = relFromPackage(packageDir, target);
  }

  const copiedArtifacts = [];
  for (const artifact of artifacts) {
    const typeDir = artifact.type === "PDF" ? "PDF" : "XML";
    const statusDir = ["CREATED", "CANCELLED", "ERROR"].includes(artifact.status) ? artifact.status : "ERROR";
    const invoiceId = safeSegment(artifact.invoice_id || artifact.draft_id || "UNKNOWN");
    const target = path.join(packageDir, typeDir, statusDir, invoiceId, safeSegment(artifact.file_name || `${artifact.type}.bin`));
    copyFileInside(artifact._sourceAbs, target, storageRoot, packageDir);
    artifact.package_path = relFromPackage(packageDir, target);
    copiedArtifacts.push(artifact);
  }

  for (const status of ["CREATED", "CANCELLED", "ERROR"]) {
    writeJson(path.join(packageDir, status, "documents.json"), {
      status,
      human_review_warning: HUMAN_REVIEW_NOTICE,
      documents: statusDocuments(reports, status),
    });
  }

  const manifest = buildAccountantPackageManifest({
    ...context,
    artifacts: copiedArtifacts,
    accountantExcel,
  });
  writeText(path.join(packageDir, "README_CONTADOR.txt"), readmeText(manifest));
  writeJson(path.join(packageDir, "manifest.json"), {
    ...manifest,
    report_files: reportCopies,
  });
  assertAccountantPackageSafe(packageDir);
  return {
    package_dir: relFromRoot(packageDir),
    manifest,
    copied_reports: reportCopies.length,
    copied_artifacts: copiedArtifacts.length,
    accountant_excel: accountantExcel,
  };
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosDate, dosTime };
}

function listFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
    }
  }
  return out.sort();
}

function createZipArchive(sourceDir, targetZip) {
  const resolvedSourceDir = assertRuntimePath(sourceDir, "sourceDir");
  const resolvedTargetZip = assertRuntimePath(targetZip, "targetZip");
  assertInside(path.dirname(resolvedTargetZip), resolvedTargetZip, "targetZip");
  fs.mkdirSync(path.dirname(resolvedTargetZip), { recursive: true });

  const chunks = [];
  const central = [];
  let offset = 0;
  for (const file of listFiles(resolvedSourceDir)) {
    const data = fs.readFileSync(file);
    const name = relFromPackage(resolvedSourceDir, file);
    const nameBuffer = Buffer.from(name, "utf8");
    const stat = fs.statSync(file);
    const { dosDate, dosTime } = dosDateTime(stat.mtime);
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(dosTime, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    central.push(centralHeader, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }

  const centralSize = central.reduce((sum, chunk) => sum + chunk.length, 0);
  const centralOffset = offset;
  const fileCount = listFiles(resolvedSourceDir).length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileCount, 8);
  eocd.writeUInt16LE(fileCount, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);
  fs.writeFileSync(resolvedTargetZip, Buffer.concat([...chunks, ...central, eocd]));
  return {
    zip_path: relFromRoot(resolvedTargetZip),
    bytes: fs.statSync(resolvedTargetZip).size,
    entries: fileCount,
  };
}

function sanitizeString(value) {
  return String(value)
    .replace(/<\?xml[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<cfdi:Comprobante[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/%PDF[\s\S]*$/i, "[REDACTED_PDF_TEXT]")
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]");
}

function sanitizePackageManifest(manifest) {
  if (manifest === null || manifest === undefined) return manifest;
  if (typeof manifest === "string") {
    const resolved = path.isAbsolute(manifest) ? path.resolve(manifest) : null;
    if (resolved && isInside(repoRoot, resolved)) return relFromRoot(resolved);
    if (resolved) return "[BLOCKED_ABSOLUTE_PATH]";
    return sanitizeString(manifest).replace(/\\/g, "/");
  }
  if (typeof manifest === "number" || typeof manifest === "boolean") return manifest;
  if (Array.isArray(manifest)) return manifest.map(sanitizePackageManifest);
  if (typeof manifest === "object") {
    const out = {};
    for (const [key, value] of Object.entries(manifest)) {
      if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizePackageManifest(value);
      }
    }
    return out;
  }
  return null;
}

function findSensitiveText(filePath, content) {
  const findings = [];
  const name = relFromRoot(filePath);
  if (/\.env(?:\.|$)/i.test(path.basename(filePath))) findings.push(`${name}:env_file`);
  if (/\.(cer|key|pfx|p12)$/i.test(path.basename(filePath))) findings.push(`${name}:csd_or_key_file`);
  if (/https:\/\/api\.factura\.com/i.test(content)) findings.push(`${name}:production_url`);
  if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(content)) {
    findings.push(`${name}:secret_like_value`);
  }
  if (/[A-Za-z]:[\\/](?![\\/])/.test(content) || /\\\\/.test(content)) findings.push(`${name}:absolute_path`);
  return findings;
}

function assertAccountantPackageSafe(packageRoot) {
  const resolvedPackageRoot = assertRuntimePath(packageRoot, "packageRoot");
  const findings = [];
  for (const file of listFiles(resolvedPackageRoot)) {
    if (file.toLowerCase().endsWith(".zip")) findings.push(`${relFromRoot(file)}:zip_inside_package_folder`);
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (_error) {
      content = "";
    }
    const isXmlOrPdf = /\.(xml|pdf)$/i.test(file);
    if (!isXmlOrPdf) findings.push(...findSensitiveText(file, content));
  }
  if (findings.length) throw new Error(`Paquete contador sandbox inseguro: ${findings.join(" | ")}`);
  return {
    ok: true,
    sensitive_findings: [],
    file_count: listFiles(resolvedPackageRoot).length,
  };
}

module.exports = {
  DEFAULT_PACKAGE_ROOT,
  DEFAULT_REPORT_ROOT,
  DEFAULT_STORAGE_ROOT,
  HUMAN_REVIEW_NOTICE,
  accountantExcelPathForPeriod,
  assertAccountantPackageSafe,
  buildAccountantPackageManifest,
  collectStorageArtifacts,
  copyAccountantPackageFiles,
  createZipArchive,
  loadMonthlyReports,
  packageDirForPeriod,
  packageZipForPeriod,
  sanitizePackageManifest,
};

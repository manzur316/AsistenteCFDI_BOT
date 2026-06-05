const fs = require("fs");
const path = require("path");
const {
  HUMAN_REVIEW_NOTICE,
  assertReportingSafe,
} = require("./lib/sandbox-reporting-engine");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");
const DEFAULT_REPORT_ROOT = path.join(runtimeRoot, "reports-sandbox");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function listReportDirs(reportRoot) {
  if (!fs.existsSync(reportRoot)) return [];
  const dirs = [];
  for (const yearEntry of fs.readdirSync(reportRoot, { withFileTypes: true })) {
    if (!yearEntry.isDirectory()) continue;
    const yearDir = path.join(reportRoot, yearEntry.name);
    for (const monthEntry of fs.readdirSync(yearDir, { withFileTypes: true })) {
      if (!monthEntry.isDirectory()) continue;
      const reportDir = path.join(yearDir, monthEntry.name);
      if (fs.existsSync(path.join(reportDir, "monthly-summary.json"))) dirs.push(reportDir);
    }
  }
  return dirs.sort();
}

function resolveReportDir(arg) {
  if (arg) {
    const resolved = assertRuntimePath(arg, "reportDir");
    if (fs.existsSync(path.join(resolved, "monthly-summary.json"))) return resolved;
    const [year, month] = String(arg).split("-");
    if (/^\d{4}$/.test(year || "") && /^\d{2}$/.test(month || "")) {
      return assertRuntimePath(path.join(DEFAULT_REPORT_ROOT, year, month), "reportDir");
    }
    return resolved;
  }
  const dirs = listReportDirs(DEFAULT_REPORT_ROOT);
  if (dirs.length === 0) throw new Error("No existen reportes sandbox. Ejecuta node scripts/generate-sandbox-monthly-report.js primero.");
  return dirs[dirs.length - 1];
}

function analyze(reportArg = process.argv[2]) {
  const reportDir = resolveReportDir(reportArg);
  const monthly = readJson(path.join(reportDir, "monthly-summary.json"));
  const client = readJson(path.join(reportDir, "client-summary.json"));
  const control = readJson(path.join(reportDir, "document-control.json"));
  const accountant = readJson(path.join(reportDir, "accountant-review.json"));
  assertReportingSafe(accountant);
  const status = monthly.status_counts || {};
  const xmlPdf = monthly.xml_pdf || {};
  const identity = monthly.identity_counts || {};
  const totals = monthly.fiscal_totals || {};
  const warnings = Array.from(new Set([
    HUMAN_REVIEW_NOTICE,
    ...(accountant.summary?.warnings || []),
  ]));
  const sensitiveFindings = control.sensitive_findings || [];
  return {
    period: monthly.period,
    report_dir: path.relative(root, reportDir).replace(/\\/g, "/"),
    total_documents: Number(monthly.total_documents || 0),
    created: Number(status.CREATED || 0),
    cancelled: Number(status.CANCELLED || 0),
    error: Number(status.ERROR || 0),
    with_xml: Number(xmlPdf.with_xml || 0),
    with_pdf: Number(xmlPdf.with_pdf || 0),
    identity_complete: Number(identity.COMPLETE || 0),
    identity_missing: Number(identity.MISSING || 0),
    subtotal: totals.subtotal ?? null,
    iva_trasladado: totals.iva_trasladado ?? null,
    total: totals.total ?? null,
    cancelled_total: totals.cancelled_total ?? null,
    amount_status: totals.amount_status || "UNKNOWN",
    clients: (client.clients || []).map((item) => item.client_id),
    warnings,
    sensitive_findings: sensitiveFindings,
  };
}

function printAnalysis(result) {
  console.log("Sandbox reporting analysis");
  console.log(`Periodo: ${result.period}`);
  console.log(`Reporte: ${result.report_dir}`);
  console.log(`Total documentos: ${result.total_documents}`);
  console.log(`Creados: ${result.created}`);
  console.log(`Cancelados: ${result.cancelled}`);
  console.log(`Errores: ${result.error}`);
  console.log(`Con XML: ${result.with_xml}`);
  console.log(`Con PDF: ${result.with_pdf}`);
  console.log(`Identity complete: ${result.identity_complete}`);
  console.log(`Identity missing: ${result.identity_missing}`);
  console.log(`Subtotal: ${result.subtotal === null ? "UNKNOWN" : result.subtotal}`);
  console.log(`IVA trasladado: ${result.iva_trasladado === null ? "UNKNOWN" : result.iva_trasladado}`);
  console.log(`Total: ${result.total === null ? "UNKNOWN" : result.total}`);
  console.log(`Cancelled total: ${result.cancelled_total === null ? "UNKNOWN" : result.cancelled_total}`);
  console.log(`Amount status: ${result.amount_status}`);
  console.log(`Clientes: ${result.clients.join(", ") || "none"}`);
  console.log(`Warnings: ${result.warnings.join(" | ")}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyze(process.argv[2]);
    printAnalysis(result);
    if (result.sensitive_findings.length > 0) process.exit(1);
  } catch (error) {
    console.error(`SANDBOX_REPORTING_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyze,
};

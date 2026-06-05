const fs = require("fs");
const path = require("path");
const {
  HUMAN_REVIEW_NOTICE,
  assertReportingSafe,
  buildClientReport,
  buildDocumentControlReport,
  buildMonthlyReport,
  buildReportingSummary,
  loadStorageIndex,
  sanitizeReportRecord,
} = require("./lib/sandbox-reporting-engine");
const { DEFAULT_STORAGE_ROOT } = require("./lib/sandbox-storage-engine");

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

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sanitizeReportRecord(value), null, 2)}\n`, "utf8");
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const raw = Array.isArray(value) || typeof value === "object"
    ? JSON.stringify(sanitizeReportRecord(value))
    : String(value);
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function toCsv(rows, columns) {
  const safeRows = rows.map(sanitizeReportRecord);
  return [
    columns.join(","),
    ...safeRows.map((row) => columns.map((column) => csvEscape(row[column])).join(",")),
  ].join("\n") + "\n";
}

function writeCsv(filePath, rows, columns) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, toCsv(rows, columns), "utf8");
}

function monthlyCsvRow(report) {
  const status = report.status_counts || {};
  const xmlPdf = report.xml_pdf || {};
  const identity = report.identity_counts || {};
  const totals = report.fiscal_totals || {};
  return {
    period: report.period,
    total_documents: report.total_documents,
    created: status.CREATED || 0,
    cancelled: status.CANCELLED || 0,
    error: status.ERROR || 0,
    with_xml: xmlPdf.with_xml || 0,
    with_pdf: xmlPdf.with_pdf || 0,
    identity_complete: identity.COMPLETE || 0,
    identity_missing: identity.MISSING || 0,
    amount_status: totals.amount_status || "UNKNOWN",
    subtotal: totals.subtotal,
    iva_trasladado: totals.iva_trasladado,
    total: totals.total,
    cancelled_total: totals.cancelled_total,
    human_review_warning: HUMAN_REVIEW_NOTICE,
  };
}

function clientCsvRows(report) {
  return (report.clients || []).map((client) => ({
    period: report.period,
    client_id: client.client_id,
    total_documents: client.total_documents,
    created: client.status_counts?.CREATED || 0,
    cancelled: client.status_counts?.CANCELLED || 0,
    error: client.status_counts?.ERROR || 0,
    with_xml: client.with_xml,
    with_pdf: client.with_pdf,
    amount_status: client.active_totals?.amount_status || "UNKNOWN",
    subtotal: client.active_totals?.subtotal,
    iva_trasladado: client.active_totals?.iva_trasladado,
    total: client.active_totals?.total,
    cancelled_total: client.cancelled_totals?.total,
    human_review_warning: HUMAN_REVIEW_NOTICE,
  }));
}

function controlCsvRows(report) {
  const rows = [];
  const groups = [
    ["WITHOUT_XML", report.documents_without_xml || []],
    ["WITHOUT_PDF", report.documents_without_pdf || []],
    ["WITHOUT_UUID", report.documents_without_uuid || []],
    ["CANCELLED", report.cancelled_documents || []],
    ["IDENTITY_MISSING", report.identity_missing_documents || []],
    ["ERROR", report.error_documents || []],
  ];
  for (const [issue, documents] of groups) {
    for (const document of documents) {
      rows.push({
        period: report.period,
        issue,
        invoice_id: document.invoice_id,
        draft_id: document.draft_id,
        client_id: document.client_id,
        status: document.status,
        identity_status: document.identity_status,
        uuid: document.uuid,
        cfdi_uid: document.cfdi_uid,
        serie: document.serie,
        folio: document.folio,
        manifest_path: document.manifest_path,
        human_review_warning: HUMAN_REVIEW_NOTICE,
      });
    }
  }
  if (rows.length === 0) {
    rows.push({
      period: report.period,
      issue: "NONE",
      human_review_warning: HUMAN_REVIEW_NOTICE,
    });
  }
  return rows;
}

function outputDirForPeriod(reportRoot, period) {
  const safePeriod = String(period || "").match(/^\d{4}-\d{2}$/) ? period : "UNKNOWN";
  const [year, month] = safePeriod.split("-");
  return assertRuntimePath(path.join(reportRoot, year, month), "reportOutputDir");
}

function generateReports(options = {}) {
  const storageRoot = assertRuntimePath(options.storageRoot || DEFAULT_STORAGE_ROOT, "storageRoot");
  const reportRoot = assertRuntimePath(options.reportRoot || DEFAULT_REPORT_ROOT, "reportRoot");
  const indexPath = path.join(storageRoot, "reports", "storage-index.json");
  if (!fs.existsSync(indexPath) && !fs.existsSync(storageRoot)) {
    return {
      ok: false,
      skipped: true,
      reason: "STORAGE_SANDBOX_MISSING",
      message: "Se requiere ejecutar primero smoke sandbox y Storage Engine.",
      storage_root: rel(storageRoot),
    };
  }
  if (!fs.existsSync(indexPath)) {
    return {
      ok: false,
      skipped: true,
      reason: "STORAGE_INDEX_MISSING",
      message: "Se requiere ejecutar primero node scripts/store-facturacom-sandbox-artifacts.js.",
      storage_root: rel(storageRoot),
    };
  }

  const index = loadStorageIndex(storageRoot);
  const monthly = buildMonthlyReport(index, { period: options.period, storageRoot });
  const client = buildClientReport(index, { period: monthly.period, storageRoot });
  const control = buildDocumentControlReport(index, { period: monthly.period, storageRoot });
  const summary = buildReportingSummary({ monthly, client, control });
  const accountantReview = sanitizeReportRecord({
    schema_version: "sandbox_reporting.v1.accountant_review",
    generated_at: new Date().toISOString(),
    human_review_warning: HUMAN_REVIEW_NOTICE,
    summary,
    monthly,
    client,
    control,
  });
  assertReportingSafe(accountantReview);

  const outputDir = outputDirForPeriod(reportRoot, monthly.period);
  const files = {
    monthly_json: path.join(outputDir, "monthly-summary.json"),
    monthly_csv: path.join(outputDir, "monthly-summary.csv"),
    client_json: path.join(outputDir, "client-summary.json"),
    client_csv: path.join(outputDir, "client-summary.csv"),
    control_json: path.join(outputDir, "document-control.json"),
    control_csv: path.join(outputDir, "document-control.csv"),
    accountant_review_json: path.join(outputDir, "accountant-review.json"),
  };

  writeJson(files.monthly_json, monthly);
  writeCsv(files.monthly_csv, [monthlyCsvRow(monthly)], [
    "period",
    "total_documents",
    "created",
    "cancelled",
    "error",
    "with_xml",
    "with_pdf",
    "identity_complete",
    "identity_missing",
    "amount_status",
    "subtotal",
    "iva_trasladado",
    "total",
    "cancelled_total",
    "human_review_warning",
  ]);
  writeJson(files.client_json, client);
  writeCsv(files.client_csv, clientCsvRows(client), [
    "period",
    "client_id",
    "total_documents",
    "created",
    "cancelled",
    "error",
    "with_xml",
    "with_pdf",
    "amount_status",
    "subtotal",
    "iva_trasladado",
    "total",
    "cancelled_total",
    "human_review_warning",
  ]);
  writeJson(files.control_json, control);
  writeCsv(files.control_csv, controlCsvRows(control), [
    "period",
    "issue",
    "invoice_id",
    "draft_id",
    "client_id",
    "status",
    "identity_status",
    "uuid",
    "cfdi_uid",
    "serie",
    "folio",
    "manifest_path",
    "human_review_warning",
  ]);
  writeJson(files.accountant_review_json, accountantReview);

  return sanitizeReportRecord({
    ok: true,
    skipped: false,
    period: monthly.period,
    output_dir: rel(outputDir),
    files: Object.fromEntries(Object.entries(files).map(([key, file]) => [key, rel(file)])),
    summary,
  });
}

function printResult(result) {
  if (result.skipped) {
    console.log("Sandbox reporting skipped");
    console.log(result.message);
    console.log(`Reason: ${result.reason}`);
    console.log(`Storage: ${result.storage_root}`);
    return;
  }
  console.log("Sandbox reporting generated");
  console.log(`Period: ${result.period}`);
  console.log(`Output: ${result.output_dir}`);
  console.log(`Files: ${Object.values(result.files).join(", ")}`);
  console.log(`Human review: ${HUMAN_REVIEW_NOTICE}`);
}

if (require.main === module) {
  try {
    const result = generateReports({
      storageRoot: process.argv[2] || DEFAULT_STORAGE_ROOT,
      reportRoot: process.argv[3] || DEFAULT_REPORT_ROOT,
      period: process.argv[4] || undefined,
    });
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_REPORTING_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_REPORT_ROOT,
  generateReports,
  toCsv,
};

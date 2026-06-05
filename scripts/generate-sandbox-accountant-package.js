const fs = require("fs");
const path = require("path");
const {
  DEFAULT_PACKAGE_ROOT,
  DEFAULT_REPORT_ROOT,
  DEFAULT_STORAGE_ROOT,
  assertAccountantPackageSafe,
  buildAccountantPackageManifest,
  collectStorageArtifacts,
  copyAccountantPackageFiles,
  createZipArchive,
  loadMonthlyReports,
  packageDirForPeriod,
  packageZipForPeriod,
  sanitizePackageManifest,
} = require("./lib/sandbox-accountant-package");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");

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

function generateAccountantPackage(options = {}) {
  const reportRoot = assertRuntimePath(options.reportRoot || DEFAULT_REPORT_ROOT, "reportRoot");
  const storageRoot = assertRuntimePath(options.storageRoot || DEFAULT_STORAGE_ROOT, "storageRoot");
  const packageRoot = assertRuntimePath(options.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot");
  if (!fs.existsSync(reportRoot)) {
    return {
      ok: false,
      skipped: true,
      reason: "REPORTS_SANDBOX_MISSING",
      message: "Se requiere ejecutar primero node scripts/generate-sandbox-monthly-report.js.",
      report_root: rel(reportRoot),
    };
  }
  if (!fs.existsSync(storageRoot)) {
    return {
      ok: false,
      skipped: true,
      reason: "STORAGE_SANDBOX_MISSING",
      message: "Se requiere ejecutar primero smoke sandbox y Storage Engine.",
      storage_root: rel(storageRoot),
    };
  }

  const reports = loadMonthlyReports(reportRoot, { period: options.period });
  const artifacts = collectStorageArtifacts(storageRoot, reports);
  const packageDir = packageDirForPeriod(packageRoot, reports.period);
  const targetZip = packageZipForPeriod(packageRoot, reports.period);
  const context = {
    reports,
    artifacts,
    storageRoot,
    packageRoot,
    packageDir,
    targetZip,
  };
  const manifest = buildAccountantPackageManifest(context);
  const copyResult = copyAccountantPackageFiles({
    ...context,
    artifacts,
    manifest,
  });
  const zip = createZipArchive(packageDir, targetZip);
  const safety = assertAccountantPackageSafe(packageDir);
  return sanitizePackageManifest({
    ok: true,
    skipped: false,
    period: reports.period,
    package_dir: copyResult.package_dir,
    zip_path: zip.zip_path,
    zip_bytes: zip.bytes,
    zip_entries: zip.entries,
    copied_reports: copyResult.copied_reports,
    copied_artifacts: copyResult.copied_artifacts,
    accountant_excel: copyResult.accountant_excel,
    validation_checklist: copyResult.validation_checklist,
    artifact_counts: copyResult.manifest.artifact_counts,
    totals: copyResult.manifest.totals,
    alerts: copyResult.manifest.alerts,
    sensitive_findings: safety.sensitive_findings,
  });
}

function printResult(result) {
  if (result.skipped) {
    console.log("Sandbox accountant package skipped");
    console.log(result.message);
    console.log(`Reason: ${result.reason}`);
    return;
  }
  console.log("Sandbox accountant package generated");
  console.log(`Period: ${result.period}`);
  console.log(`Package: ${result.package_dir}`);
  console.log(`ZIP: ${result.zip_path}`);
  console.log(`ZIP entries: ${result.zip_entries}`);
  console.log(`Accountant Excel included: ${result.accountant_excel?.included ? "yes" : "no"}`);
  console.log(`Validation checklist included: ${result.validation_checklist?.included ? "yes" : "no"}`);
  console.log(`XML included: ${result.artifact_counts.xml}`);
  console.log(`PDF included: ${result.artifact_counts.pdf}`);
  console.log(`Alerts: ${result.alerts.join(", ") || "none"}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = generateAccountantPackage({
      reportRoot: process.argv[2] || DEFAULT_REPORT_ROOT,
      storageRoot: process.argv[3] || DEFAULT_STORAGE_ROOT,
      packageRoot: process.argv[4] || DEFAULT_PACKAGE_ROOT,
      period: process.argv[5] || undefined,
    });
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_PACKAGE_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  generateAccountantPackage,
};

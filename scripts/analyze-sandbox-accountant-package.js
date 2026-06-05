const fs = require("fs");
const path = require("path");
const {
  DEFAULT_PACKAGE_ROOT,
  assertAccountantPackageSafe,
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

function normalizePeriod(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function latestPackagePeriod(packageRoot) {
  if (!fs.existsSync(packageRoot)) return null;
  const periods = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePeriod(entry.name))
    .filter(Boolean)
    .sort();
  return periods[periods.length - 1] || null;
}

function resolvePackageDir(arg) {
  const packageRoot = assertRuntimePath(DEFAULT_PACKAGE_ROOT, "packageRoot");
  if (arg) {
    const period = normalizePeriod(arg);
    if (period) return assertRuntimePath(path.join(packageRoot, period, "package"), "packageDir");
    const resolved = assertRuntimePath(arg, "packageDir");
    if (path.basename(resolved).toLowerCase() === "package") return resolved;
    return path.join(resolved, "package");
  }
  const period = latestPackagePeriod(packageRoot);
  if (!period) throw new Error("No existen paquetes sandbox. Ejecuta node scripts/generate-sandbox-accountant-package.js primero.");
  return assertRuntimePath(path.join(packageRoot, period, "package"), "packageDir");
}

function analyze(packageArg = process.argv[2]) {
  const packageDir = resolvePackageDir(packageArg);
  const periodDir = path.dirname(packageDir);
  const period = normalizePeriod(path.basename(periodDir)) || "UNKNOWN";
  const zipPath = path.join(periodDir, `accountant-package-${period}.zip`);
  const manifestPath = path.join(packageDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`Falta manifest.json: ${manifestPath}`);
  const manifest = readJson(manifestPath);
  const files = listFiles(packageDir);
  const safety = assertAccountantPackageSafe(packageDir);
  const countExt = (ext) => files.filter((file) => file.toLowerCase().endsWith(ext)).length;
  const statusCounts = manifest.totals || {};
  return {
    period,
    package_dir: path.relative(root, packageDir).replace(/\\/g, "/"),
    zip_exists: fs.existsSync(zipPath),
    zip_path: path.relative(root, zipPath).replace(/\\/g, "/"),
    total_files: files.length,
    xml_included: countExt(".xml"),
    pdf_included: countExt(".pdf"),
    csv_included: countExt(".csv"),
    json_included: countExt(".json"),
    created: Number(statusCounts.created || 0),
    cancelled: Number(statusCounts.cancelled || 0),
    error: Number(statusCounts.error || 0),
    alerts: manifest.alerts || [],
    sensitive_findings: safety.sensitive_findings || [],
  };
}

function printAnalysis(result) {
  console.log("Sandbox accountant package analysis");
  console.log(`Periodo: ${result.period}`);
  console.log(`Package: ${result.package_dir}`);
  console.log(`ZIP existe: ${result.zip_exists}`);
  console.log(`ZIP: ${result.zip_path}`);
  console.log(`Total archivos: ${result.total_files}`);
  console.log(`XML incluidos: ${result.xml_included}`);
  console.log(`PDF incluidos: ${result.pdf_included}`);
  console.log(`CSV incluidos: ${result.csv_included}`);
  console.log(`JSON incluidos: ${result.json_included}`);
  console.log(`Creados: ${result.created}`);
  console.log(`Cancelados: ${result.cancelled}`);
  console.log(`Errores: ${result.error}`);
  console.log(`Alerts: ${result.alerts.join(", ") || "none"}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyze(process.argv[2]);
    printAnalysis(result);
    if (result.sensitive_findings.length > 0) process.exit(1);
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_PACKAGE_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyze,
};

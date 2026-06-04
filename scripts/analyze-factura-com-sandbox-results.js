const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const ALLOWED_DEMO_RFCS = new Set([
  "XAXX010101000",
  "XEXX010101000",
  "AAA010101AAA",
  "BBB010101BBB",
]);

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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
  return out;
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function countAttempts(summary = {}, manifest = {}) {
  const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
  return Number(summary.total_attempts ?? attempts.length ?? 0);
}

function findSensitiveText(filePath, content) {
  const findings = [];
  const patterns = [
    { name: "api_key_like", pattern: /(?:FACTURACOM_API_KEY|F-Api-Key|api[_-]?key)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "secret_key_like", pattern: /(?:FACTURACOM_SECRET_KEY|F-Secret-Key|secret[_-]?key)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "plugin_like", pattern: /(?:FACTURACOM_PLUGIN|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{12,}/i },
    { name: "production_url", pattern: /https:\/\/api\.factura\.com/i },
    { name: "production_enabled_true", pattern: /"production(?:_enabled)?"\s*:\s*true/i },
  ];
  for (const { name, pattern } of patterns) {
    if (pattern.test(content)) findings.push(`${rel(filePath)}:${name}`);
  }

  const rfcs = content.match(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi) || [];
  for (const rfc of rfcs) {
    if (!ALLOWED_DEMO_RFCS.has(rfc.toUpperCase())) findings.push(`${rel(filePath)}:rfc_not_allowed:${rfc}`);
  }
  return findings;
}

function scanRuntime(runtimeDir) {
  const resolved = path.resolve(runtimeDir || DEFAULT_RUNTIME_DIR);
  const allowedRoot = path.join(root, "runtime");
  if (!isInside(allowedRoot, resolved)) {
    throw new Error(`runtime fuera de runtime/: ${resolved}`);
  }
  const files = listFiles(resolved);
  const findings = [];
  for (const file of files) {
    if (!isInside(resolved, file)) findings.push(`${rel(file)}:outside_runtime_dir`);
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (_error) {
      content = "";
    }
    findings.push(...findSensitiveText(file, content));
  }
  return { files, findings };
}

function analyze(runtimeArg = process.argv[2]) {
  const runtimeDir = path.resolve(runtimeArg || DEFAULT_RUNTIME_DIR);
  const manifestPath = path.join(runtimeDir, "manifest.json");
  const summaryPath = path.join(runtimeDir, "summary.json");
  if (!fs.existsSync(manifestPath)) throw new Error(`No existe manifest: ${manifestPath}`);
  if (!fs.existsSync(summaryPath)) throw new Error(`No existe summary: ${summaryPath}`);

  const manifest = readJson(manifestPath);
  const summary = readJson(summaryPath);
  const scan = scanRuntime(runtimeDir);
  const clientUidMapPath = path.join(runtimeDir, "client-uids.local.json");
  const artifactPaths = (manifest.artifacts || []).map((artifact) => text(artifact.path)).filter(Boolean);
  const outsideArtifacts = artifactPaths.filter((artifactPath) => {
    const abs = path.resolve(root, artifactPath);
    return !isInside(runtimeDir, abs);
  });

  const errors = [...scan.findings];
  if (outsideArtifacts.length > 0) errors.push(`artifacts_outside_runtime:${outsideArtifacts.join(",")}`);

  const result = {
    runtime_dir: rel(runtimeDir),
    total_attempts: countAttempts(summary, manifest),
    successful: Number(summary.successful || 0),
    errors: Number(summary.errors || 0),
    needs_local_config: Number(summary.needs_local_config || 0),
    xml_downloaded: Number(summary.xml_downloaded || 0),
    pdf_downloaded: Number(summary.pdf_downloaded || 0),
    cancel_ok: Number(summary.cancel_ok || 0),
    cancel_error: Number(summary.cancel_error || 0),
    clients_created: Number(summary.clients_created || 0),
    client_uids_found: Number(summary.client_uids_found || 0),
    client_uid_missing: Number(summary.client_uid_missing || 0),
    ambiguous_clients: Number(summary.ambiguous_clients || 0),
    client_uid_map_exists: fs.existsSync(clientUidMapPath),
    sandbox_uuids: Array.isArray(summary.sandbox_uuids) ? summary.sandbox_uuids : [],
    warnings: Array.isArray(summary.warnings) ? summary.warnings : [],
    artifact_files: scan.files.map(rel),
    sensitive_findings: errors,
  };
  return result;
}

function printResult(result) {
  console.log("Factura.com sandbox smoke analysis");
  console.log(`Runtime: ${result.runtime_dir}`);
  console.log(`Total intentos: ${result.total_attempts}`);
  console.log(`Exitosos: ${result.successful}`);
  console.log(`Errores: ${result.errors}`);
  console.log(`Needs local config: ${result.needs_local_config}`);
  console.log(`XML descargados: ${result.xml_downloaded}`);
  console.log(`PDF descargados: ${result.pdf_downloaded}`);
  console.log(`Cancelaciones OK: ${result.cancel_ok}`);
  console.log(`Cancelaciones error: ${result.cancel_error}`);
  console.log(`Clientes creados: ${result.clients_created}`);
  console.log(`UIDs cliente encontrados: ${result.client_uids_found}`);
  console.log(`UIDs cliente faltantes: ${result.client_uid_missing}`);
  console.log(`Clientes ambiguos: ${result.ambiguous_clients}`);
  console.log(`client-uids.local.json existe: ${result.client_uid_map_exists ? "si" : "no"}`);
  console.log(`UUIDs demo/sandbox: ${result.sandbox_uuids.join(", ") || "none"}`);
  console.log(`Warnings: ${result.warnings.join(" | ") || "none"}`);
  console.log(`Artifacts revisados: ${result.artifact_files.length}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyze(process.argv[2]);
    printResult(result);
    if (result.sensitive_findings.length > 0) process.exit(1);
  } catch (error) {
    console.error(`FACTURACOM_SANDBOX_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyze,
};

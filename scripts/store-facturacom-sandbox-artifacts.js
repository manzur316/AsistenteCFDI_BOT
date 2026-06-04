const fs = require("fs");
const path = require("path");
const {
  DEFAULT_STORAGE_ROOT,
  buildStorageIndex,
  buildStoragePathForAttempt,
  buildStorageSummary,
  buildStoredInvoiceManifest,
  copySmokeArtifactToStorage,
  scanSensitiveFiles,
  sanitizeStorageRecord,
} = require("./lib/sandbox-storage-engine");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");
const DEFAULT_SMOKE_RUNTIME = path.join(runtimeRoot, "facturacom-sandbox");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertInsideRuntime(target, label) {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function readJsonRequired(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`Falta ${label}: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sanitizeStorageRecord(value), null, 2)}\n`, "utf8");
}

function rel(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function attemptSucceeded(attempt = {}) {
  return attempt.status === "CREATE_OK" || Boolean(attempt.cfdi_uid || attempt.uid);
}

function artifactsForAttempt(manifest = {}, attempt = {}) {
  const byDraft = (manifest.artifacts || [])
    .filter((artifact) => artifact && artifact.path && artifact.draft_id === attempt.draft_id);
  const seen = new Set(byDraft.map((artifact) => artifact.path));
  const fallback = (attempt.artifacts || [])
    .filter((artifactPath) => artifactPath && !seen.has(artifactPath))
    .map((artifactPath) => ({ type: "UNKNOWN", draft_id: attempt.draft_id, path: artifactPath }));
  return [...byDraft, ...fallback];
}

function buildCanonicalSummary(invoiceManifest = {}, attempt = {}) {
  return sanitizeStorageRecord({
    draft_id: invoiceManifest.draft_id,
    invoice_id: invoiceManifest.invoice_id,
    pac_provider: invoiceManifest.pac_provider,
    pac_environment: invoiceManifest.pac_environment,
    status: invoiceManifest.status,
    identity_status: invoiceManifest.identity_status,
    cfdi_uid: invoiceManifest.cfdi_uid,
    uuid: invoiceManifest.uuid,
    client_id: invoiceManifest.client_id,
    emitter_id: invoiceManifest.emitter_id,
    has_xml: invoiceManifest.has_xml,
    has_pdf: invoiceManifest.has_pdf,
    source_attempt_status: invoiceManifest.source_attempt_status,
    human_review_warning: invoiceManifest.human_review_warning,
    source_warnings: Array.isArray(attempt.warnings) ? attempt.warnings : [],
  });
}

function storeArtifacts(options = {}) {
  const smokeRuntime = assertInsideRuntime(options.smokeRuntime || DEFAULT_SMOKE_RUNTIME, "smokeRuntime");
  const storageRoot = assertInsideRuntime(options.storageRoot || DEFAULT_STORAGE_ROOT, "storageRoot");
  const manifestPath = path.join(smokeRuntime, "manifest.json");
  const summaryPath = path.join(smokeRuntime, "summary.json");
  const manifest = readJsonRequired(manifestPath, "manifest.json");
  const summary = readJsonRequired(summaryPath, "summary.json");
  const attempts = Array.isArray(manifest.attempts) ? manifest.attempts : [];
  if (attempts.length === 0) throw new Error("manifest.json no contiene attempts");
  const successfulAttempts = attempts.filter(attemptSucceeded);
  if (successfulAttempts.length === 0 && Number(summary.successful || 0) === 0) {
    throw new Error("No hay intentos exitosos para almacenar");
  }

  const smokeFindings = scanSensitiveFiles(smokeRuntime);
  if (smokeFindings.length > 0) throw new Error(`Sensitive findings en smoke runtime: ${smokeFindings.join(" | ")}`);

  fs.mkdirSync(storageRoot, { recursive: true });
  const stored = [];

  for (const attempt of attempts) {
    const pathInfo = buildStoragePathForAttempt(attempt, {
      storageRoot,
      manifest,
      createdAt: manifest.created_at || summary.created_at,
      clientId: attempt.client_id,
      emitterId: attempt.emitter_id || "EMITTER-DEMO",
    });
    fs.mkdirSync(pathInfo.invoiceDir, { recursive: true });

    const copiedArtifacts = artifactsForAttempt(manifest, attempt).map((artifact) => copySmokeArtifactToStorage(artifact, {
      root,
      smokeRuntime,
      storageRoot,
      invoiceDir: pathInfo.invoiceDir,
    }));
    const invoiceManifest = buildStoredInvoiceManifest(attempt, copiedArtifacts, {
      storageRoot,
      manifest,
      createdAt: manifest.created_at || summary.created_at,
      clientId: attempt.client_id,
      emitterId: attempt.emitter_id || "EMITTER-DEMO",
    });

    const invoiceManifestPath = path.join(pathInfo.invoiceDir, "manifest.json");
    const canonicalSummaryPath = path.join(pathInfo.invoiceDir, "canonical-summary.json");
    writeJson(invoiceManifestPath, invoiceManifest);
    writeJson(canonicalSummaryPath, buildCanonicalSummary(invoiceManifest, attempt));
    stored.push({
      invoice_id: invoiceManifest.invoice_id,
      manifest_path: rel(invoiceManifestPath),
      status: invoiceManifest.status,
      identity_status: invoiceManifest.identity_status,
    });
  }

  const index = buildStorageIndex(storageRoot);
  const storageSummary = buildStorageSummary(index);
  const reportsDir = path.join(storageRoot, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  writeJson(path.join(reportsDir, "storage-index.json"), index);
  writeJson(path.join(reportsDir, "storage-summary.json"), storageSummary);

  const storageFindings = scanSensitiveFiles(storageRoot);
  if (storageFindings.length > 0) throw new Error(`Sensitive findings en storage: ${storageFindings.join(" | ")}`);

  return sanitizeStorageRecord({
    ok: true,
    smoke_runtime: rel(smokeRuntime),
    storage_root: rel(storageRoot),
    stored_documents: stored.length,
    stored,
    reports: {
      index: rel(path.join(reportsDir, "storage-index.json")),
      summary: rel(path.join(reportsDir, "storage-summary.json")),
    },
  });
}

if (require.main === module) {
  try {
    const result = storeArtifacts({
      smokeRuntime: process.argv[2] || DEFAULT_SMOKE_RUNTIME,
      storageRoot: process.argv[3] || DEFAULT_STORAGE_ROOT,
    });
    console.log("Factura.com sandbox artifacts stored");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(`SANDBOX_STORAGE_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  storeArtifacts,
};

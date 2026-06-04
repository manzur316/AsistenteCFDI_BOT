const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const DEFAULT_STORAGE_ROOT = path.join(runtimeRoot, "storage-sandbox");
const STORAGE_SCHEMA_VERSION = "sandbox_storage.v1";
const INVOICE_SCHEMA_VERSION = "sandbox_storage_invoice.v1";
const HUMAN_REVIEW_WARNING = "BORRADOR SUJETO A REVISION HUMANA";

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function nowIso() {
  return new Date().toISOString();
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertInside(parent, child, label) {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (!isInside(resolvedParent, resolvedChild)) {
    throw new Error(`${label || "path"} fuera de ${resolvedParent}: ${resolvedChild}`);
  }
  return resolvedChild;
}

function ensureRuntimePath(target, label = "runtime path") {
  return assertInside(runtimeRoot, target, label);
}

function safeSegment(value, fallback = "UNKNOWN") {
  const cleaned = String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned || fallback;
}

function relFromRoot(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function relFromStorage(storageRoot, filePath) {
  return path.relative(storageRoot, filePath).replace(/\\/g, "/");
}

function parseDateParts(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return parseDateParts(null);
  return {
    year: String(date.getUTCFullYear()),
    month: String(date.getUTCMonth() + 1).padStart(2, "0"),
  };
}

function identityStatus(attempt = {}) {
  const hasProviderUid = Boolean(text(attempt.cfdi_uid));
  const hasUuid = Boolean(text(attempt.uuid));
  if (hasProviderUid && hasUuid) return "COMPLETE";
  if (hasProviderUid || text(attempt.pac_invoice_id) || hasUuid) return "PARTIAL_PROVIDER_UID";
  if (text(attempt.internal_invoice_id) || text(attempt.draft_id)) return "PARTIAL_INTERNAL_ID";
  return "MISSING";
}

function documentStatus(attempt = {}) {
  if (attempt.cancel_status === "OK" || /cancel/i.test(String(attempt.status || ""))) return "CANCELLED";
  if (/error|missing|ambiguous|invalid|failed/i.test(String(attempt.status || ""))) return "ERROR";
  if (identityStatus(attempt) === "MISSING" || identityStatus(attempt) === "PARTIAL_INTERNAL_ID") return "PARTIAL";
  return "CREATED";
}

function providerInvoiceIdForAttempt(attempt = {}) {
  return text(attempt.cfdi_uid || attempt.uuid || attempt.pac_invoice_id);
}

function internalInvoiceIdForAttempt(attempt = {}, context = {}) {
  const attemptIndex = context.attemptIndex ?? attempt.attempt_index ?? 0;
  return text(attempt.internal_invoice_id)
    || (text(attempt.draft_id) ? `${text(attempt.draft_id)}__attempt-${attemptIndex}` : null)
    || `INVOICE-UNKNOWN__attempt-${attemptIndex}`;
}

function invoiceIdForAttempt(attempt = {}, context = {}) {
  return safeSegment(context.invoiceIdOverride
    || providerInvoiceIdForAttempt(attempt)
    || internalInvoiceIdForAttempt(attempt, context));
}

function buildStoragePathForAttempt(attempt = {}, context = {}) {
  const storageRoot = ensureRuntimePath(path.resolve(context.storageRoot || DEFAULT_STORAGE_ROOT), "storageRoot");
  const parts = parseDateParts(context.createdAt || attempt.created_at || context.manifest?.created_at);
  const emitterId = safeSegment(context.emitterId || attempt.emitter_id || "EMITTER-DEMO");
  const clientId = safeSegment(context.clientId || attempt.client_id || "CLIENT-UNKNOWN");
  const invoiceId = invoiceIdForAttempt(attempt, context);
  const invoiceDir = path.join(
    storageRoot,
    "emitters",
    emitterId,
    parts.year,
    parts.month,
    "clients",
    clientId,
    "invoices",
    invoiceId,
  );
  assertInside(storageRoot, invoiceDir, "invoiceDir");
  return {
    storageRoot,
    invoiceDir,
    emitterId,
    clientId,
    year: parts.year,
    month: parts.month,
    invoiceId,
    baseInvoiceId: safeSegment(providerInvoiceIdForAttempt(attempt) || internalInvoiceIdForAttempt(attempt, context)),
  };
}

function classifyArtifact(artifact = {}) {
  const type = String(artifact.type || "").toUpperCase();
  const artifactPath = String(artifact.path || "").toLowerCase();
  if (type.includes("XML") || artifactPath.endsWith(".xml")) return { category: "xml", directory: "xml" };
  if (type.includes("PDF") || artifactPath.endsWith(".pdf")) return { category: "pdf", directory: "pdf" };
  if (type.includes("CANCEL")) return { category: "cancel", directory: "cancel" };
  if (type.includes("REQUEST")) return { category: "request", directory: "request" };
  if (type.includes("RESPONSE")) return { category: "response", directory: "response" };
  return { category: "misc", directory: "response" };
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function resolveArtifactSource(artifact = {}, context = {}) {
  const sourceRoot = path.resolve(context.root || repoRoot);
  const smokeRuntime = ensureRuntimePath(path.resolve(context.smokeRuntime || path.join(runtimeRoot, "facturacom-sandbox")), "smokeRuntime");
  const rawPath = text(artifact.path);
  if (!rawPath) throw new Error("Artifact sin path");
  const source = path.isAbsolute(rawPath) ? path.resolve(rawPath) : path.resolve(sourceRoot, rawPath);
  assertInside(smokeRuntime, source, "artifact source");
  if (!fs.existsSync(source)) throw new Error(`Artifact no existe: ${relFromRoot(source)}`);
  return source;
}

function copySmokeArtifactToStorage(artifact = {}, context = {}) {
  const storageRoot = ensureRuntimePath(path.resolve(context.storageRoot || DEFAULT_STORAGE_ROOT), "storageRoot");
  const invoiceDir = assertInside(storageRoot, context.invoiceDir, "invoiceDir");
  const source = resolveArtifactSource(artifact, context);
  const classification = classifyArtifact(artifact);
  const targetDir = path.join(invoiceDir, classification.directory);
  assertInside(invoiceDir, targetDir, "artifact target dir");
  fs.mkdirSync(targetDir, { recursive: true });
  const target = path.join(targetDir, safeSegment(path.basename(source), "artifact"));
  assertInside(invoiceDir, target, "artifact target");
  fs.copyFileSync(source, target);
  const stat = fs.statSync(target);
  return sanitizeStorageRecord({
    type: artifact.type || "UNKNOWN",
    category: classification.category,
    source_path: relFromRoot(source),
    storage_path: relFromStorage(storageRoot, target),
    invoice_relative_path: relFromStorage(invoiceDir, target),
    sha256: sha256File(target),
    bytes: stat.size,
    ok: artifact.ok !== false,
  });
}

function hasCategory(artifacts = [], category) {
  return artifacts.some((artifact) => artifact.category === category);
}

function buildStoredInvoiceManifest(attempt = {}, artifacts = [], context = {}) {
  const pathInfo = buildStoragePathForAttempt(attempt, context);
  const status = documentStatus(attempt);
  const normalizedIdentityStatus = identityStatus(attempt);
  return sanitizeStorageRecord({
    schema_version: INVOICE_SCHEMA_VERSION,
    generated_at: nowIso(),
    human_review_warning: HUMAN_REVIEW_WARNING,
    pac_provider: "factura.com",
    pac_environment: "SANDBOX",
    status,
    identity_status: normalizedIdentityStatus,
    emitter_id: pathInfo.emitterId,
    client_id: pathInfo.clientId,
    year: pathInfo.year,
    month: pathInfo.month,
    draft_id: attempt.draft_id || null,
    invoice_id: pathInfo.invoiceId,
    storage_invoice_id: pathInfo.invoiceId,
    base_invoice_id: pathInfo.baseInvoiceId,
    identity_collision: Boolean(context.identityCollision),
    identity_collision_warning: context.identityCollision ? "invoice_id_collision" : null,
    client_uid: text(attempt.client_uid),
    internal_invoice_id: text(attempt.internal_invoice_id),
    cfdi_uid: text(attempt.cfdi_uid),
    uuid: text(attempt.uuid),
    pac_invoice_id: text(attempt.pac_invoice_id),
    serie: text(attempt.serie),
    folio: text(attempt.folio),
    provider_status: text(attempt.identity_status),
    lookup_status: text(attempt.lookup_status),
    cancel_status: text(attempt.cancel_status),
    source_attempt_status: text(attempt.status),
    identity_sources: Array.isArray(attempt.identity_sources) ? attempt.identity_sources : [],
    has_xml: hasCategory(artifacts, "xml"),
    has_pdf: hasCategory(artifacts, "pdf"),
    has_cancel_response: hasCategory(artifacts, "cancel"),
    artifacts,
  });
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

function buildStorageIndex(storageRoot = DEFAULT_STORAGE_ROOT) {
  const resolvedStorageRoot = ensureRuntimePath(path.resolve(storageRoot), "storageRoot");
  const manifestFiles = listFiles(resolvedStorageRoot)
    .filter((file) => path.basename(file) === "manifest.json")
    .filter((file) => relFromStorage(resolvedStorageRoot, file).includes("/invoices/"));
  const documents = manifestFiles.map((file) => {
    const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
    return sanitizeStorageRecord({
      manifest_path: relFromStorage(resolvedStorageRoot, file),
      invoice_id: manifest.invoice_id,
      draft_id: manifest.draft_id,
      emitter_id: manifest.emitter_id,
      client_id: manifest.client_id,
      year: manifest.year,
      month: manifest.month,
      status: manifest.status,
      identity_status: manifest.identity_status,
      storage_invoice_id: manifest.storage_invoice_id || manifest.invoice_id,
      base_invoice_id: manifest.base_invoice_id || manifest.invoice_id,
      identity_collision: Boolean(manifest.identity_collision),
      client_uid: manifest.client_uid,
      internal_invoice_id: manifest.internal_invoice_id,
      cfdi_uid: manifest.cfdi_uid,
      uuid: manifest.uuid,
      pac_invoice_id: manifest.pac_invoice_id,
      pac_provider: manifest.pac_provider,
      pac_environment: manifest.pac_environment,
      has_xml: manifest.has_xml,
      has_pdf: manifest.has_pdf,
      has_cancel_response: manifest.has_cancel_response,
      artifact_count: Array.isArray(manifest.artifacts) ? manifest.artifacts.length : 0,
      human_review_warning: HUMAN_REVIEW_WARNING,
    });
  }).sort((a, b) => String(a.manifest_path).localeCompare(String(b.manifest_path)));

  return {
    schema_version: `${STORAGE_SCHEMA_VERSION}.index`,
    generated_at: nowIso(),
    storage_root: relFromRoot(resolvedStorageRoot),
    document_count: documents.length,
    documents,
  };
}

function increment(object, key) {
  const safeKey = key || "UNKNOWN";
  object[safeKey] = (object[safeKey] || 0) + 1;
}

function buildStorageSummary(index = {}) {
  const documents = Array.isArray(index.documents) ? index.documents : [];
  const summary = {
    schema_version: `${STORAGE_SCHEMA_VERSION}.summary`,
    generated_at: nowIso(),
    total_documents: documents.length,
    by_client: {},
    by_month: {},
    created: 0,
    cancelled: 0,
    error: 0,
    partial: 0,
    with_xml: 0,
    with_pdf: 0,
    identity_complete: 0,
    identity_partial: 0,
    identity_internal: 0,
    identity_missing: 0,
    identity_collisions: 0,
    duplicate_invoice_ids: {},
    documents_by_draft_id: {},
    documents_by_invoice_id: {},
    human_review_warning: HUMAN_REVIEW_WARNING,
  };

  const invoiceIdCounts = {};
  for (const document of documents) {
    increment(summary.by_client, document.client_id);
    increment(summary.by_month, `${document.year}-${document.month}`);
    increment(summary.documents_by_draft_id, document.draft_id || "UNKNOWN");
    increment(summary.documents_by_invoice_id, document.base_invoice_id || document.invoice_id || "UNKNOWN");
    increment(invoiceIdCounts, document.base_invoice_id || document.invoice_id || "UNKNOWN");
    if (document.status === "CREATED") summary.created += 1;
    else if (document.status === "CANCELLED") summary.cancelled += 1;
    else if (document.status === "ERROR") summary.error += 1;
    else summary.partial += 1;
    if (document.has_xml) summary.with_xml += 1;
    if (document.has_pdf) summary.with_pdf += 1;
    if (document.identity_status === "COMPLETE") summary.identity_complete += 1;
    else if (document.identity_status === "PARTIAL_PROVIDER_UID") summary.identity_partial += 1;
    else if (document.identity_status === "PARTIAL_INTERNAL_ID") {
      summary.identity_internal += 1;
      summary.identity_missing += 1;
    }
    else summary.identity_missing += 1;
    if (document.identity_collision) summary.identity_collisions += 1;
  }
  summary.duplicate_invoice_ids = Object.fromEntries(Object.entries(invoiceIdCounts).filter(([, count]) => count > 1));
  return summary;
}

function sanitizeString(value) {
  return String(value)
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]");
}

function sanitizeStorageRecord(record) {
  if (record === null || record === undefined) return record;
  if (typeof record === "string") {
    const resolved = path.isAbsolute(record) ? path.resolve(record) : null;
    if (resolved && isInside(repoRoot, resolved)) return relFromRoot(resolved);
    if (resolved) return "[BLOCKED_ABSOLUTE_PATH]";
    return sanitizeString(record);
  }
  if (typeof record === "number" || typeof record === "boolean") return record;
  if (Array.isArray(record)) return record.map(sanitizeStorageRecord);
  if (typeof record === "object") {
    const out = {};
    for (const [key, value] of Object.entries(record)) {
      if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeStorageRecord(value);
      }
    }
    return out;
  }
  return null;
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
    if (pattern.test(content)) findings.push(`${relFromRoot(filePath)}:${name}`);
  }
  return findings;
}

function scanSensitiveFiles(dir) {
  const resolved = ensureRuntimePath(path.resolve(dir), "scan dir");
  const findings = [];
  for (const file of listFiles(resolved)) {
    let content = "";
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (_error) {
      content = "";
    }
    findings.push(...findSensitiveText(file, content));
  }
  return findings;
}

module.exports = {
  DEFAULT_STORAGE_ROOT,
  HUMAN_REVIEW_WARNING,
  buildStorageIndex,
  buildStoragePathForAttempt,
  buildStorageSummary,
  buildStoredInvoiceManifest,
  classifyArtifact,
  copySmokeArtifactToStorage,
  documentStatus,
  identityStatus,
  invoiceIdForAttempt,
  scanSensitiveFiles,
  sanitizeStorageRecord,
};

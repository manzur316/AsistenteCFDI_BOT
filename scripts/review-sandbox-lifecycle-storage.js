const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_STORAGE_ROOT,
  buildStorageIndex,
  buildStorageSummary,
  scanSensitiveFiles,
} = require("./lib/sandbox-storage-engine");
const {
  makeHumanReadableCfdiFileName,
  sanitizeStorageRelativePath,
} = require("./lib/sandbox-human-readable-storage-naming");

const repoRoot = path.resolve(__dirname, "..");
const runtimeRoot = path.join(repoRoot, "runtime");
const REVIEW_SCHEMA_VERSION = "sandbox_lifecycle_storage_review.v1";
const REVIEW_JSON_NAME = "lifecycle-storage-review.json";
const REVIEW_MD_NAME = "lifecycle-storage-review.md";

const RFC_RE = /\b[A-Z&\u00d1]{3,4}\d{6}[A-Z0-9]{3}\b/i;
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const UID_VALUE_RE = /\b(?:CFDI[-_]?UID|PAC[-_]?UID|CLIENT[-_]?UID|UID)[-_A-Z0-9]{3,}\b/i;
const SECRET_RE = /(token|secret|api[-_ ]?key|password|authorization|F-Api-Key|F-Secret-Key|F-PLUGIN|FACTURACOM_[A-Z_]*(?:KEY|PLUGIN))/i;

function nowIso() {
  return new Date().toISOString();
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) {
    throw new Error(`${label} debe estar bajo runtime/: ${resolved}`);
  }
  return resolved;
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || "";
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value ?? "")).digest("hex");
}

function shortHash(value) {
  return sha256(value).slice(0, 10).toUpperCase();
}

function increment(target, key) {
  const safeKey = text(key) || "UNKNOWN";
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
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

function safeValue(value, prefix) {
  const raw = text(value);
  if (!raw) return null;
  if (RFC_RE.test(raw) || UUID_RE.test(raw) || UID_VALUE_RE.test(raw) || SECRET_RE.test(raw) || /[A-Za-z]:[\\/]/.test(raw)) {
    return `${prefix}-${shortHash(raw)}`;
  }
  const cleaned = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return cleaned || `${prefix}-${shortHash(raw)}`;
}

function normalizeLifecycleStatus(document = {}, manifest = {}) {
  const status = text(document.status || manifest.status).toUpperCase();
  if (status === "CANCELLED" || status === "SANDBOX_CANCELADO" || manifest.has_cancel_response) return "SANDBOX_CANCELADO";
  if (status === "CREATED" || status === "SANDBOX_TIMBRADO") return "SANDBOX_TIMBRADO";
  if (status === "ERROR" || status === "SANDBOX_ERROR") return "SANDBOX_ERROR";
  if (status === "PARTIAL" || status === "SANDBOX_PARTIAL") return "SANDBOX_PARTIAL";
  return "SANDBOX_UNKNOWN";
}

function resolveUnderStorage(storageRoot, relativePath) {
  const resolved = path.resolve(storageRoot, String(relativePath || ""));
  if (!isInside(storageRoot, resolved)) throw new Error(`Ruta fuera de storage sandbox: ${relativePath}`);
  return resolved;
}

function artifactChecksumRecords(manifest = {}) {
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  return artifacts.map((artifact) => ({
    category: safeValue(artifact.category || artifact.type || "UNKNOWN", "ARTIFACT"),
    invoice_relative_path: sanitizeStorageRelativePath(artifact.invoice_relative_path || artifact.storage_path || ""),
    bytes: Number.isFinite(Number(artifact.bytes)) ? Number(artifact.bytes) : null,
    sha256: /^[a-f0-9]{64}$/i.test(String(artifact.sha256 || "")) ? String(artifact.sha256).toLowerCase() : null,
    ok: artifact.ok === undefined ? true : Boolean(artifact.ok),
  }));
}

function loadStatusHistory(invoiceDir) {
  const historyPath = path.join(invoiceDir, "status-history.json");
  const history = readJson(historyPath, null);
  if (!history) return { exists: false, statuses: [] };
  const events = Array.isArray(history) ? history : Array.isArray(history.events) ? history.events : [];
  return {
    exists: true,
    statuses: events
      .map((event) => text(event.status || event.to_status || event.lifecycle_status).toUpperCase())
      .filter(Boolean),
  };
}

function validateStatusHistory(lifecycleStatus, statusHistory) {
  const warnings = [];
  if (!statusHistory.exists) {
    warnings.push("status_history_missing");
    return warnings;
  }
  const statuses = new Set(statusHistory.statuses);
  if (lifecycleStatus === "SANDBOX_TIMBRADO" && !statuses.has("SANDBOX_TIMBRADO") && !statuses.has("CREATED")) {
    warnings.push("status_history_missing_stamped_state");
  }
  if (lifecycleStatus === "SANDBOX_CANCELADO") {
    if (!statuses.has("SANDBOX_TIMBRADO") && !statuses.has("CREATED")) warnings.push("status_history_missing_prior_stamped_state");
    if (!statuses.has("SANDBOX_CANCELADO") && !statuses.has("CANCELLED")) warnings.push("status_history_missing_cancelled_state");
  }
  return warnings;
}

function safeHumanNames(document = {}, manifest = {}) {
  const dateValue = manifest.generated_at
    || manifest.created_at
    || (document.year && document.month ? `${document.year}-${document.month}-01` : null);
  const base = {
    date: dateValue,
    client_id: document.client_id || manifest.client_id,
    draft_id: document.draft_id || manifest.draft_id,
    internal_invoice_id: manifest.internal_invoice_id || document.internal_invoice_id,
    status: normalizeLifecycleStatus(document, manifest),
  };
  const names = {};
  if (manifest.has_xml || document.has_xml) names.xml = makeHumanReadableCfdiFileName({ ...base, extension: "xml" });
  if (manifest.has_pdf || document.has_pdf) names.pdf = makeHumanReadableCfdiFileName({ ...base, extension: "pdf" });
  if (manifest.has_cancel_response || document.has_cancel_response) names.cancel_json = makeHumanReadableCfdiFileName({ ...base, status: "SANDBOX_CANCELADO", extension: "json" });
  return names;
}

function safeDocumentReview(document = {}, context = {}) {
  const { storageRoot, ordinal } = context;
  const manifestPath = resolveUnderStorage(storageRoot, document.manifest_path);
  const invoiceDir = path.dirname(manifestPath);
  const manifest = readJson(manifestPath, {});
  const lifecycleStatus = normalizeLifecycleStatus(document, manifest);
  const statusHistory = loadStatusHistory(invoiceDir);
  const warnings = validateStatusHistory(lifecycleStatus, statusHistory);
  if (lifecycleStatus === "SANDBOX_CANCELADO" && (!manifest.has_xml || !manifest.has_pdf)) {
    warnings.push("cancelled_document_missing_original_xml_or_pdf");
  }

  return {
    document_ref: safeValue(document.draft_id || manifest.draft_id || `DOC-${ordinal}`, "DOC"),
    internal_invoice_ref: safeValue(manifest.internal_invoice_id || document.internal_invoice_id || document.draft_id || `DOC-${ordinal}`, "INV"),
    manifest_path: sanitizeStorageRelativePath(document.manifest_path),
    emitter_ref: safeValue(document.emitter_id || manifest.emitter_id, "EMITTER"),
    client_ref: safeValue(document.client_id || manifest.client_id, "CLIENT"),
    period: `${document.year || manifest.year || "0000"}-${document.month || manifest.month || "00"}`,
    provider: safeValue(document.pac_provider || manifest.pac_provider || "sandbox", "PAC"),
    status: lifecycleStatus,
    source_status: text(document.status || manifest.status) || "UNKNOWN",
    has_xml: Boolean(document.has_xml || manifest.has_xml),
    has_pdf: Boolean(document.has_pdf || manifest.has_pdf),
    has_cancel_response: Boolean(document.has_cancel_response || manifest.has_cancel_response),
    artifact_count: Array.isArray(manifest.artifacts) ? manifest.artifacts.length : Number(document.artifact_count || 0),
    status_history_exists: statusHistory.exists,
    status_history_states: statusHistory.statuses,
    checksum_records: artifactChecksumRecords(manifest),
    human_readable_names: safeHumanNames(document, manifest),
    warnings,
  };
}

function legacyLifecycleCounts(storageRoot) {
  const files = listFiles(storageRoot).map((file) => file.replace(/\\/g, "/"));
  return {
    draft_stamp_manifests: files.filter((file) => file.endsWith("/sandbox-stamp-manifest.json")).length,
    draft_cancel_responses: files.filter((file) => file.endsWith("/sandbox-cancel-response.json")).length,
  };
}

function reportSensitiveFindings(content) {
  const findings = [];
  const patterns = [
    ["rfc", RFC_RE],
    ["uuid", UUID_RE],
    ["uid_value", UID_VALUE_RE],
    ["absolute_path", /[A-Za-z]:[\\/]/],
    ["secret", SECRET_RE],
    ["xml_content", /<\?xml|<cfdi:Comprobante/i],
    ["pdf_content", /%PDF/i],
    ["production_url", /https:\/\/api\.factura\.com/i],
    ["csd_or_env", /\.(cer|key|pfx|p12)|\.env/i],
  ];
  for (const [name, pattern] of patterns) {
    if (pattern.test(content)) findings.push(name);
  }
  return findings;
}

function markdownReport(result) {
  const lines = [];
  lines.push("# Sandbox Lifecycle Storage Review");
  lines.push("");
  lines.push(`Schema: ${result.schema_version}`);
  lines.push(`Generated at: ${result.generated_at}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Total documents: ${result.total_documents}`);
  lines.push(`- With XML: ${result.with_xml}`);
  lines.push(`- With PDF: ${result.with_pdf}`);
  lines.push(`- With cancellation response: ${result.with_cancel_response}`);
  lines.push(`- Sensitive findings: ${result.sensitive_findings.length}`);
  lines.push("");
  lines.push("## By Status");
  lines.push("");
  for (const [key, count] of Object.entries(result.indexes.by_status)) lines.push(`- ${key}: ${count}`);
  lines.push("");
  lines.push("## By Period");
  lines.push("");
  for (const [key, count] of Object.entries(result.indexes.by_period)) lines.push(`- ${key}: ${count}`);
  lines.push("");
  lines.push("## Documents");
  lines.push("");
  for (const document of result.documents.slice(0, 25)) {
    lines.push(`- ${document.document_ref}: ${document.status}, period ${document.period}, XML=${document.has_xml}, PDF=${document.has_pdf}, cancel=${document.has_cancel_response}`);
  }
  lines.push("");
  lines.push("## Human Review");
  lines.push("");
  lines.push("- Sandbox only. No production PAC.");
  lines.push("- Borrador sujeto a revision humana. No sustituye contador.");
  lines.push("- No enviar XML/PDF/ZIP/Excel por Telegram en esta fase.");
  return `${lines.join("\n")}\n`;
}

function reviewSandboxLifecycleStorage(options = {}) {
  const storageRoot = assertRuntimePath(path.resolve(options.storageRoot || DEFAULT_STORAGE_ROOT), "storageRoot");
  const writeReports = options.writeReports !== false;
  if (!fs.existsSync(storageRoot)) {
    throw new Error(`No existe storage sandbox: ${path.relative(repoRoot, storageRoot).replace(/\\/g, "/")}`);
  }

  const index = buildStorageIndex(storageRoot);
  const summary = buildStorageSummary(index);
  const documents = (index.documents || []).map((document, indexNumber) => safeDocumentReview(document, {
    storageRoot,
    ordinal: indexNumber + 1,
  }));

  const result = {
    schema_version: REVIEW_SCHEMA_VERSION,
    generated_at: nowIso(),
    storage_root: path.relative(repoRoot, storageRoot).replace(/\\/g, "/"),
    ok: true,
    total_documents: documents.length,
    with_xml: documents.filter((document) => document.has_xml).length,
    with_pdf: documents.filter((document) => document.has_pdf).length,
    with_cancel_response: documents.filter((document) => document.has_cancel_response).length,
    lifecycle_storage_summary: {
      storage_index_documents: index.document_count || 0,
      storage_summary_total: summary.total_documents || 0,
      created: summary.created || 0,
      cancelled: summary.cancelled || 0,
      error: summary.error || 0,
      partial: summary.partial || 0,
    },
    indexes: {
      by_client: {},
      by_period: {},
      by_status: {},
      by_draft_id: {},
      by_internal_invoice_ref: {},
      by_provider: {},
    },
    legacy_action_layer: legacyLifecycleCounts(storageRoot),
    documents,
    validations: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
  };

  for (const document of documents) {
    increment(result.indexes.by_client, document.client_ref);
    increment(result.indexes.by_period, document.period);
    increment(result.indexes.by_status, document.status);
    increment(result.indexes.by_draft_id, document.document_ref);
    increment(result.indexes.by_internal_invoice_ref, document.internal_invoice_ref);
    increment(result.indexes.by_provider, document.provider);
    for (const warning of document.warnings) {
      result.warnings.push(`${document.document_ref}:${warning}`);
    }
    const missingChecksum = document.checksum_records.some((record) => !record.sha256);
    if (missingChecksum) result.warnings.push(`${document.document_ref}:checksum_missing`);
  }

  result.validations.push({
    id: "storage_root_runtime_only",
    status: result.storage_root.startsWith("runtime/") ? "PASS" : "FAIL",
    evidence: result.storage_root,
  });
  result.validations.push({
    id: "cancelled_documents_preserve_original_artifacts",
    status: documents.filter((document) => document.status === "SANDBOX_CANCELADO").every((document) => document.has_xml && document.has_pdf) ? "PASS" : "WARN",
    evidence: `${documents.filter((document) => document.status === "SANDBOX_CANCELADO").length} cancelled`,
  });
  result.validations.push({
    id: "checksums_available",
    status: documents.every((document) => document.checksum_records.every((record) => record.sha256)) ? "PASS" : "WARN",
    evidence: `${documents.reduce((count, document) => count + document.checksum_records.length, 0)} artifacts`,
  });

  result.sensitive_findings = scanSensitiveFiles(storageRoot);
  if (result.sensitive_findings.length) {
    result.ok = false;
    result.errors.push("storage_sensitive_findings_detected");
  }

  if (writeReports) {
    const reportsDir = path.join(storageRoot, "reports");
    const reportJsonPath = path.join(reportsDir, REVIEW_JSON_NAME);
    const reportMdPath = path.join(reportsDir, REVIEW_MD_NAME);
    writeJson(reportJsonPath, result);
    writeText(reportMdPath, markdownReport(result));
    const generatedFindings = [
      ...reportSensitiveFindings(fs.readFileSync(reportJsonPath, "utf8")).map((finding) => `${REVIEW_JSON_NAME}:${finding}`),
      ...reportSensitiveFindings(fs.readFileSync(reportMdPath, "utf8")).map((finding) => `${REVIEW_MD_NAME}:${finding}`),
    ];
    if (generatedFindings.length) {
      result.ok = false;
      result.sensitive_findings.push(...generatedFindings);
      result.errors.push("generated_review_report_sensitive_findings");
      writeJson(reportJsonPath, result);
    }
  }

  return result;
}

function parseArgs(argv) {
  const args = { storageRoot: DEFAULT_STORAGE_ROOT, writeReports: true };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--storage-root") args.storageRoot = argv[index += 1];
    else if (item === "--no-write") args.writeReports = false;
    else if (!item.startsWith("--")) args.storageRoot = item;
  }
  return args;
}

if (require.main === module) {
  try {
    const result = reviewSandboxLifecycleStorage(parseArgs(process.argv.slice(2)));
    console.log("Sandbox lifecycle storage review");
    console.log(`Storage: ${result.storage_root}`);
    console.log(`Documents: ${result.total_documents}`);
    console.log(`By status: ${JSON.stringify(result.indexes.by_status)}`);
    console.log(`Sensitive findings: ${result.sensitive_findings.length}`);
    console.log(`Warnings: ${result.warnings.length}`);
    console.log(`OK: ${result.ok}`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  REVIEW_SCHEMA_VERSION,
  normalizeLifecycleStatus,
  reportSensitiveFindings,
  reviewSandboxLifecycleStorage,
};

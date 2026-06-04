const fs = require("fs");
const path = require("path");
const {
  DEFAULT_STORAGE_ROOT,
  buildStorageIndex,
  buildStorageSummary,
  scanSensitiveFiles,
} = require("./lib/sandbox-storage-engine");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label) {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function analyze(storageArg = process.argv[2]) {
  const storageRoot = assertRuntimePath(storageArg || DEFAULT_STORAGE_ROOT, "storageRoot");
  if (!fs.existsSync(storageRoot)) throw new Error(`No existe storageRoot: ${storageRoot}`);
  const reportsDir = path.join(storageRoot, "reports");
  const index = readJsonIfExists(path.join(reportsDir, "storage-index.json")) || buildStorageIndex(storageRoot);
  const summary = readJsonIfExists(path.join(reportsDir, "storage-summary.json")) || buildStorageSummary(index);
  const sensitiveFindings = scanSensitiveFiles(storageRoot);
  const duplicateInvoiceIds = summary.duplicate_invoice_ids || {};
  const documentsByDraftId = summary.documents_by_draft_id || {};
  const documentsByInvoiceId = summary.documents_by_invoice_id || {};
  const identityCollisions = Number(summary.identity_collisions || 0);
  const clientUidInvoiceMatches = (index.documents || []).filter((document) => (
    document.client_uid
    && (
      (document.base_invoice_id || document.invoice_id) === document.client_uid
      || document.cfdi_uid === document.client_uid
    )
  ));
  const storageFindings = [
    ...sensitiveFindings,
    ...clientUidInvoiceMatches.map((document) => `invoice_id_matches_client_uid:${document.manifest_path}`),
  ];
  return {
    storage_root: path.relative(root, storageRoot).replace(/\\/g, "/"),
    total_documents: Number(summary.total_documents || 0),
    by_client: summary.by_client || {},
    by_month: summary.by_month || {},
    created: Number(summary.created || 0),
    cancelled: Number(summary.cancelled || 0),
    error: Number(summary.error || 0),
    partial: Number(summary.partial || 0),
    with_xml: Number(summary.with_xml || 0),
    with_pdf: Number(summary.with_pdf || 0),
    identity_complete: Number(summary.identity_complete || 0),
    identity_partial: Number(summary.identity_partial || 0),
    identity_internal: Number(summary.identity_internal || 0),
    identity_missing: Number(summary.identity_missing || 0),
    identity_collisions: identityCollisions,
    duplicate_invoice_ids: duplicateInvoiceIds,
    documents_by_draft_id: documentsByDraftId,
    documents_by_invoice_id: documentsByInvoiceId,
    sensitive_findings: storageFindings,
  };
}

function printAnalysis(result) {
  console.log("Sandbox storage analysis");
  console.log(`Storage: ${result.storage_root}`);
  console.log(`Total documentos almacenados: ${result.total_documents}`);
  console.log(`Por cliente: ${JSON.stringify(result.by_client)}`);
  console.log(`Por mes: ${JSON.stringify(result.by_month)}`);
  console.log(`Creados: ${result.created}`);
  console.log(`Cancelados: ${result.cancelled}`);
  console.log(`Errores: ${result.error}`);
  console.log(`Parciales: ${result.partial}`);
  console.log(`Con XML: ${result.with_xml}`);
  console.log(`Con PDF: ${result.with_pdf}`);
  console.log(`Identity complete: ${result.identity_complete}`);
  console.log(`Identity partial: ${result.identity_partial}`);
  console.log(`Identity internal: ${result.identity_internal}`);
  console.log(`Identity missing: ${result.identity_missing}`);
  console.log(`Identity collisions: ${result.identity_collisions}`);
  console.log(`Duplicate invoice ids: ${JSON.stringify(result.duplicate_invoice_ids)}`);
  console.log(`Documents by draft_id: ${JSON.stringify(result.documents_by_draft_id)}`);
  console.log(`Documents by invoice_id: ${JSON.stringify(result.documents_by_invoice_id)}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyze(process.argv[2]);
    printAnalysis(result);
    if (result.sensitive_findings.length > 0) process.exit(1);
  } catch (error) {
    console.error(`SANDBOX_STORAGE_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyze,
};

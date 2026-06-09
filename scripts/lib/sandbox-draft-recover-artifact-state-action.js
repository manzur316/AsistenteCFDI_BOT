const fs = require("fs");
const path = require("path");

const { PAC_ENVIRONMENTS } = require("./canonical-cfdi-contracts");
const { loadDraftFromPostgres } = require("./sandbox-draft-db-loader");
const { persistSandboxStampResult } = require("./sandbox-draft-stamp-persistence");
const { validateDeliveryFiles } = require("./telegram-document-delivery-channel");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const defaultActionResultsRoot = path.join(runtimeRoot, "action-results-sandbox");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/.`);
  return resolved;
}

function rel(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return null;
}

function readDraft(options = {}) {
  if (options.draft && typeof options.draft === "object") return options.draft;
  const draftId = text(options.draftId || options.draft_id);
  if (!draftId) return null;
  return loadDraftFromPostgres(draftId, {
    ...(options.dbConfig || {}),
    env: options.env || process.env,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    dockerContainer: options.dockerContainer,
    execFileSync: options.execFileSync,
  });
}

function candidateResultFiles(actionResultsRoot) {
  const root = assertRuntimePath(actionResultsRoot || defaultActionResultsRoot, "actionResultsRoot");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /sandbox\.draft\.download-artifacts\.json$/i.test(entry.name))
    .map((entry) => path.join(root, entry.name))
    .sort()
    .reverse();
}

function latestDownloadedRuntimeResult(draftId, options = {}) {
  for (const filePath of candidateResultFiles(options.actionResultsRoot)) {
    try {
      const result = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const output = result.output && typeof result.output === "object" ? result.output : {};
      if (result.action !== "sandbox.draft.download-artifacts") continue;
      if (result.ok !== true || result.status !== "OK") continue;
      if (text(output.draft_id) !== draftId) continue;
      if (String(output.artifact_status || "").toUpperCase() !== "DOWNLOADED") continue;
      if (output.xml_content_valid !== true || output.pdf_content_valid !== true) continue;
      return { filePath, result, output };
    } catch (_error) {
      // Ignore corrupt runtime result files during controlled recovery.
    }
  }
  return null;
}

function identityFromDraftAndOutput(draft = {}, output = {}) {
  const summary = draft.sandbox_pac_summary && typeof draft.sandbox_pac_summary === "object" ? draft.sandbox_pac_summary : {};
  return {
    cfdi_uid: text(output.cfdi_uid || summary.cfdi_uid),
    uuid: text(output.uuid || summary.uuid),
    pac_invoice_id: text(output.pac_invoice_id || summary.pac_invoice_id),
    serie: text(output.serie || summary.serie),
    folio: text(output.folio || summary.folio),
  };
}

async function runSandboxDraftRecoverArtifactState(options = {}) {
  const draftId = text(options.draftId || options.draft_id);
  if (!draftId) {
    return { status: "NEEDS_RUNTIME", output: { draft_id: null, error_class: "DRAFT_ID_REQUIRED" }, warnings: [], errors: ["DRAFT_ID_REQUIRED"] };
  }
  let draft;
  try {
    draft = readDraft({ ...options, draftId });
  } catch (_error) {
    return { status: "NEEDS_RUNTIME", output: { draft_id: draftId, error_class: "DRAFT_DB_LOAD_FAILED" }, warnings: [], errors: ["DRAFT_DB_LOAD_FAILED"] };
  }
  if (!draft) {
    return { status: "NEEDS_RUNTIME", output: { draft_id: draftId, error_class: "DRAFT_CONTEXT_MISSING" }, warnings: [], errors: ["DRAFT_CONTEXT_MISSING"] };
  }
  const runtime = latestDownloadedRuntimeResult(draftId, options);
  if (!runtime) {
    return { status: "NEEDS_RUNTIME", output: { draft_id: draftId, error_class: "RUNTIME_DOWNLOAD_RESULT_NOT_FOUND" }, warnings: [], errors: ["RUNTIME_DOWNLOAD_RESULT_NOT_FOUND"] };
  }
  const files = {
    xml: runtime.output.human_xml_path || runtime.output.xml_storage_path,
    pdf: runtime.output.human_pdf_path || runtime.output.pdf_storage_path,
  };
  const validation = validateDeliveryFiles(files);
  if (validation.ok !== true) {
    return {
      status: "NEEDS_RUNTIME",
      output: {
        draft_id: draftId,
        error_class: "RUNTIME_ARTIFACTS_INVALID",
        xml_content_valid: validation.xml.ok === true,
        pdf_content_valid: validation.pdf.ok === true,
      },
      warnings: [],
      errors: ["RUNTIME_ARTIFACTS_INVALID"],
    };
  }
  const summary = draft.sandbox_pac_summary && typeof draft.sandbox_pac_summary === "object" ? draft.sandbox_pac_summary : {};
  const link = draft.provider_client_link && typeof draft.provider_client_link === "object" ? draft.provider_client_link : {};
  const identity = identityFromDraftAndOutput(draft, runtime.output);
  const providerClientUid = text(summary.provider_client_uid || link.provider_client_uid || link.provider_client_id);
  const providerClientUidSource = providerClientUid && (!summary.provider_client_uid_source || String(summary.provider_client_uid_source).toLowerCase() === "missing")
    ? "provider_client_links"
    : summary.provider_client_uid_source || null;
  const providerClientLinkStatus = providerClientUid && (!summary.provider_client_link_status || String(summary.provider_client_link_status).toUpperCase() === "MISSING")
    ? "FOUND"
    : summary.provider_client_link_status || null;
  const persistenceSummary = {
    ...summary,
    provider: summary.provider || "Factura.com Sandbox",
    environment: summary.environment || PAC_ENVIRONMENTS.SANDBOX,
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: text(draft.payment_status || summary.payment_status) || "PENDIENTE",
    ...identity,
    cfdi_uid_present: Boolean(identity.cfdi_uid || summary.cfdi_uid_present === true),
    uuid_present: Boolean(identity.uuid || summary.uuid_present === true),
    pac_invoice_id_present: Boolean(identity.pac_invoice_id || summary.pac_invoice_id_present === true),
    serie_present: Boolean(identity.serie || summary.serie_present === true),
    folio_present: Boolean(identity.folio || summary.folio_present === true),
    artifact_status: "DOWNLOADED",
    xml_downloaded: true,
    pdf_downloaded: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    pdf_source: runtime.output.pdf_source || summary.pdf_source || null,
    xml_storage_path: runtime.output.xml_storage_path || summary.xml_storage_path || validation.xml_path_safe,
    pdf_storage_path: runtime.output.pdf_storage_path || summary.pdf_storage_path || validation.pdf_path_safe,
    human_xml_path: runtime.output.human_xml_path || summary.human_xml_path || validation.xml_path_safe,
    human_pdf_path: runtime.output.human_pdf_path || summary.human_pdf_path || validation.pdf_path_safe,
    xml_sha256: runtime.output.xml_sha256 || validation.xml.sha256,
    pdf_sha256: runtime.output.pdf_sha256 || validation.pdf.sha256,
    xml_size_bytes: runtime.output.xml_size_bytes ?? validation.xml.size_bytes,
    pdf_size_bytes: runtime.output.pdf_size_bytes ?? validation.pdf.size_bytes,
    provider_client_uid_source: providerClientUidSource,
    provider_client_uid: providerClientUid,
    provider_client_link_status: providerClientLinkStatus,
    legacy_receiver_uid_used: summary.legacy_receiver_uid_used === true,
  };
  const persistence = await persistSandboxStampResult({
    ...options,
    draftId,
    invoiceStatus: "SANDBOX_TIMBRADO",
    paymentStatus: persistenceSummary.payment_status,
    artifactStatus: "DOWNLOADED",
    pacResult: {
      ok: true,
      status: "DOWNLOADED",
      operation: "recoverArtifactState",
      ...identity,
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      xml_provider_available: true,
      pdf_provider_available: true,
      artifact_status: "DOWNLOADED",
    },
    sandboxPacSummary: persistenceSummary,
    providerClientLink: {
      provider_client_uid: persistenceSummary.provider_client_uid,
      source: persistenceSummary.provider_client_uid_source,
      provider_client_link_status: persistenceSummary.provider_client_link_status,
      legacy_receiver_uid_used: persistenceSummary.legacy_receiver_uid_used === true,
    },
    manifestPath: runtime.output.manifest_path,
  });
  if (persistence.ok !== true || persistence.persistence_status !== "UPDATED") {
    return {
      status: "NEEDS_RUNTIME",
      output: {
        draft_id: draftId,
        error_class: persistence.error_class || "SANDBOX_DRAFT_PERSISTENCE_ERROR",
        persistence_status: persistence.persistence_status || "FAILED",
        runtime_result_path: rel(runtime.filePath),
      },
      warnings: ["No se pudo persistir la recuperacion del estado documental."],
      errors: [persistence.error_class || "SANDBOX_DRAFT_PERSISTENCE_ERROR"],
    };
  }
  return {
    status: "RECOVERED",
    output: {
      draft_id: draftId,
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOADED",
      documents_valid: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      persistence_status: persistence.persistence_status,
      persistence_row: persistence.row,
      runtime_result_path: rel(runtime.filePath),
    },
    warnings: [],
    errors: [],
  };
}

module.exports = {
  latestDownloadedRuntimeResult,
  runSandboxDraftRecoverArtifactState,
};

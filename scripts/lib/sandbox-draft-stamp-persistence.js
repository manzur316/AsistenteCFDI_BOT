const path = require("path");
const { runPsqlRaw } = require("./local-db-psql-runner");
const { PAC_ENVIRONMENTS } = require("./canonical-cfdi-contracts");
const { buildProviderInvoiceLinkPersistencePlan } = require("./provider-contracts/provider-contract-index");

const repoRoot = path.resolve(__dirname, "../..");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `${sqlQuote(JSON.stringify(value || {}))}::jsonb`;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function relativeRuntimePath(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/^runtime[\\/]/i.test(raw)) return raw.replace(/\\/g, "/");
  const absolute = path.resolve(raw);
  if (isInside(repoRoot, absolute)) {
    return path.relative(repoRoot, absolute).replace(/\\/g, "/");
  }
  return null;
}

function toArtifactStatus(pacResult = {}) {
  const artifactStatus = text(pacResult.artifact_status);
  if (artifactStatus) return artifactStatus;
  const status = text(pacResult.status);
  if (["DOWNLOAD_READY", "DOWNLOADED", "PARTIAL_DOWNLOAD", "DOWNLOAD_ERROR", "NOT_REQUESTED"].includes(String(status || "").toUpperCase())) {
    return String(status).toUpperCase();
  }
  const stampedStatuses = new Set(["OK", "DONE", "SUCCESS", "SUCCEEDED", "SANDBOX_TIMBRADO", "STAMPED"]);
  if (pacResult.ok === true && (status === "" || stampedStatuses.has(status))) return "DOWNLOAD_READY";
  return "NOT_REQUESTED";
}

function toBoolean(value) {
  return value === true;
}

function boolFrom(...values) {
  for (const value of values) {
    if (value === true) return true;
    if (text(value)) return true;
  }
  for (const value of values) {
    if (value === false) return false;
  }
  return undefined;
}

function assignText(target, key, ...values) {
  for (const value of values) {
    const cleaned = text(value);
    if (cleaned) {
      target[key] = cleaned;
      return;
    }
  }
}

function assignBoolean(target, key, ...values) {
  const value = boolFrom(...values);
  if (value !== undefined) target[key] = value;
}

function assignRuntimePath(target, key, ...values) {
  for (const value of values) {
    const cleaned = relativeRuntimePath(value);
    if (cleaned) {
      target[key] = cleaned;
      return;
    }
  }
}

function assignNumber(target, key, ...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      target[key] = parsed;
      return;
    }
  }
}

function shouldPersistDraftState(options = {}) {
  const env = options.env || process.env || {};
  return Boolean(
    options.forcePersistDraftState === true
      || options.persistDraftState === true
      || options.dbConfig
      || options.dbExecMode
      || options.execMode
      || options.pgDockerContainer
      || options.dockerContainer
      || options.execFileSync
      || (
        options.writeResult === false === false && (
          env.CFDI_DB_EXEC_MODE
          || env.CFDI_PG_DOCKER_CONTAINER
          || env.CFDI_PGHOST
          || env.CFDI_PGPORT
          || env.CFDI_PGDATABASE
          || env.CFDI_PGUSER
          || env.CFDI_PGPASSWORD
          || env.POSTGRES_HOST
          || env.POSTGRES_PORT
          || env.POSTGRES_DB
          || env.POSTGRES_USER
          || env.PGHOST
          || env.PGPORT
          || env.PGDATABASE
          || env.PGUSER
          || env.PGPASSWORD
        )
      )
  );
}

function buildDbOptions(options = {}) {
  return {
    env: options.env || process.env,
    dbConfig: options.dbConfig,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    dockerContainer: options.dockerContainer,
    execFileSync: options.execFileSync,
  };
}

function buildPersistedPacResult(pacResult = {}, invoiceStatus, paymentStatus, artifactStatus) {
  const xmlProviderAvailable = pacResult.xml_provider_available === true || pacResult.xml_available === true;
  const pdfProviderAvailable = pacResult.pdf_provider_available === true || pacResult.pdf_available === true;
  const out = {
    ok: pacResult.ok === true,
    status: text(pacResult.status) || text(invoiceStatus),
    provider: text(pacResult.provider) || "Factura.com Sandbox",
    environment: text(pacResult.environment) || PAC_ENVIRONMENTS.SANDBOX,
    invoice_status: text(invoiceStatus),
    payment_status: text(paymentStatus),
    operation: text(pacResult.operation) || "stampSandbox",
    mode: pacResult.live_mode === true ? "live" : "mock",
    cfdi_uid: text(pacResult.cfdi_uid),
    uuid: text(pacResult.uuid),
    pac_invoice_id: text(pacResult.pac_invoice_id),
    serie: text(pacResult.serie),
    folio: text(pacResult.folio),
    cfdi_uid_present: boolFrom(pacResult.cfdi_uid_present, pacResult.cfdi_uid) === true,
    uuid_present: boolFrom(pacResult.uuid_present, pacResult.uuid) === true,
    pac_invoice_id_present: boolFrom(pacResult.pac_invoice_id_present, pacResult.pac_invoice_id) === true,
    serie_present: boolFrom(pacResult.serie_present, pacResult.serie) === true,
    folio_present: boolFrom(pacResult.folio_present, pacResult.folio) === true,
    xml_provider_available: xmlProviderAvailable,
    pdf_provider_available: pdfProviderAvailable,
    artifact_status: text(artifactStatus),
  };
  assignBoolean(out, "xml_downloaded", pacResult.xml_downloaded);
  assignBoolean(out, "pdf_downloaded", pacResult.pdf_downloaded);
  assignBoolean(out, "xml_content_valid", pacResult.xml_content_valid);
  assignBoolean(out, "pdf_content_valid", pacResult.pdf_content_valid);
  assignBoolean(out, "provider_pdf_downloaded", pacResult.provider_pdf_downloaded);
  assignBoolean(out, "provider_pdf_content_valid", pacResult.provider_pdf_content_valid);
  assignText(out, "pdf_source", pacResult.pdf_source);
  assignText(out, "xml_validation_status", pacResult.xml_validation_status);
  assignText(out, "pdf_validation_status", pacResult.pdf_validation_status);
  assignRuntimePath(out, "xml_storage_path", pacResult.xml_storage_path);
  assignRuntimePath(out, "pdf_storage_path", pacResult.pdf_storage_path);
  assignRuntimePath(out, "provider_pdf_storage_path", pacResult.provider_pdf_storage_path);
  assignText(out, "xml_sha256", pacResult.xml_sha256);
  assignText(out, "pdf_sha256", pacResult.pdf_sha256);
  assignNumber(out, "xml_size_bytes", pacResult.xml_size_bytes);
  assignNumber(out, "pdf_size_bytes", pacResult.pdf_size_bytes);
  return out;
}

function buildPersistedSummary(input = {}) {
  const {
    invoiceStatus = "SANDBOX_TIMBRADO",
    paymentStatus = "PENDIENTE",
    pacResult = {},
    sandboxPacSummary = {},
    manifestPath = null,
    providerClientLink = {},
  } = input;
  const xmlProviderAvailable = pacResult.xml_provider_available === true || pacResult.xml_available === true;
  const pdfProviderAvailable = pacResult.pdf_provider_available === true || pacResult.pdf_available === true;
  const artifactStatus = text(input.artifactStatus) || toArtifactStatus(pacResult);
  const out = {
    provider: text(sandboxPacSummary.provider) || text(pacResult.provider) || "Factura.com Sandbox",
    environment: text(sandboxPacSummary.environment) || PAC_ENVIRONMENTS.SANDBOX,
    invoice_status: text(invoiceStatus),
    payment_status: text(paymentStatus),
    xml_provider_available: sandboxPacSummary.xml_provider_available === undefined ? xmlProviderAvailable : toBoolean(sandboxPacSummary.xml_provider_available),
    pdf_provider_available: sandboxPacSummary.pdf_provider_available === undefined ? pdfProviderAvailable : toBoolean(sandboxPacSummary.pdf_provider_available),
    artifact_status: artifactStatus,
    xml_content_valid: toBoolean(sandboxPacSummary.xml_content_valid),
    pdf_content_valid: toBoolean(sandboxPacSummary.pdf_content_valid),
    xml_downloaded: toBoolean(sandboxPacSummary.xml_downloaded),
    pdf_downloaded: toBoolean(sandboxPacSummary.pdf_downloaded),
    updated_at: (input.now || new Date()).toISOString(),
  };
  const mode = text(sandboxPacSummary.mode) || (pacResult.live_mode === true ? "live" : pacResult.live_mode === false ? "mock" : null);
  assignText(out, "mode", mode);
  assignText(out, "cfdi_uid", sandboxPacSummary.cfdi_uid, pacResult.cfdi_uid);
  assignText(out, "uuid", sandboxPacSummary.uuid, pacResult.uuid);
  assignText(out, "pac_invoice_id", sandboxPacSummary.pac_invoice_id, pacResult.pac_invoice_id);
  assignText(out, "serie", sandboxPacSummary.serie, pacResult.serie);
  assignText(out, "folio", sandboxPacSummary.folio, pacResult.folio);
  assignBoolean(out, "cfdi_uid_present", sandboxPacSummary.cfdi_uid_present, sandboxPacSummary.cfdi_uid, pacResult.cfdi_uid_present, pacResult.cfdi_uid);
  assignBoolean(out, "uuid_present", sandboxPacSummary.uuid_present, sandboxPacSummary.uuid, pacResult.uuid_present, pacResult.uuid);
  assignBoolean(out, "pac_invoice_id_present", sandboxPacSummary.pac_invoice_id_present, sandboxPacSummary.pac_invoice_id, pacResult.pac_invoice_id_present, pacResult.pac_invoice_id);
  assignBoolean(out, "serie_present", sandboxPacSummary.serie_present, sandboxPacSummary.serie, pacResult.serie_present, pacResult.serie);
  assignBoolean(out, "folio_present", sandboxPacSummary.folio_present, sandboxPacSummary.folio, pacResult.folio_present, pacResult.folio);
  assignRuntimePath(out, "manifest_path", sandboxPacSummary.manifest_path, manifestPath);
  assignRuntimePath(out, "client_storage_manifest_path", sandboxPacSummary.client_storage_manifest_path);
  assignRuntimePath(out, "xml_storage_path", sandboxPacSummary.xml_storage_path, pacResult.xml_storage_path);
  assignRuntimePath(out, "pdf_storage_path", sandboxPacSummary.pdf_storage_path, pacResult.pdf_storage_path);
  assignRuntimePath(out, "provider_pdf_storage_path", sandboxPacSummary.provider_pdf_storage_path, pacResult.provider_pdf_storage_path);
  assignRuntimePath(out, "human_xml_path", sandboxPacSummary.human_xml_path);
  assignRuntimePath(out, "human_pdf_path", sandboxPacSummary.human_pdf_path);
  assignText(out, "human_file_base_name", sandboxPacSummary.human_file_base_name);
  assignText(out, "xml_sha256", sandboxPacSummary.xml_sha256, pacResult.xml_sha256);
  assignText(out, "pdf_sha256", sandboxPacSummary.pdf_sha256, pacResult.pdf_sha256);
  assignNumber(out, "xml_size_bytes", sandboxPacSummary.xml_size_bytes, pacResult.xml_size_bytes);
  assignNumber(out, "pdf_size_bytes", sandboxPacSummary.pdf_size_bytes, pacResult.pdf_size_bytes);
  assignText(out, "pdf_source", sandboxPacSummary.pdf_source, pacResult.pdf_source);
  assignText(out, "xml_validation_status", sandboxPacSummary.xml_validation_status, pacResult.xml_validation_status);
  assignText(out, "pdf_validation_status", sandboxPacSummary.pdf_validation_status, pacResult.pdf_validation_status);
  assignText(out, "provider_pdf_validation_status", sandboxPacSummary.provider_pdf_validation_status, pacResult.provider_pdf_validation_status);
  assignBoolean(out, "provider_pdf_downloaded", sandboxPacSummary.provider_pdf_downloaded, pacResult.provider_pdf_downloaded);
  assignBoolean(out, "provider_pdf_content_valid", sandboxPacSummary.provider_pdf_content_valid, pacResult.provider_pdf_content_valid);
  assignBoolean(out, "pdf_visual_content_present", sandboxPacSummary.pdf_visual_content_present, pacResult.pdf_visual_content_present);
  assignNumber(out, "pdf_page_count_estimate", sandboxPacSummary.pdf_page_count_estimate, pacResult.pdf_page_count_estimate);
  assignText(out, "provider_client_uid_source", providerClientLink.source, providerClientLink.provider_client_uid_source, sandboxPacSummary.provider_client_uid_source);
  assignText(out, "provider_client_uid", providerClientLink.provider_client_uid, sandboxPacSummary.provider_client_uid);
  const providerClientUid = text(out.provider_client_uid);
  if (providerClientUid && (!text(out.provider_client_uid_source) || String(out.provider_client_uid_source).toLowerCase() === "missing")) {
    out.provider_client_uid_source = "provider_client_links";
  }
  const providerClientStatus = text(providerClientLink.provider_client_link_status)
    || text(sandboxPacSummary.provider_client_link_status)
    || (providerClientUid ? "FOUND" : null);
  assignText(out, "provider_client_link_status", providerClientStatus);
  if (providerClientUid && String(out.provider_client_link_status || "").toUpperCase() === "MISSING") {
    out.provider_client_link_status = "FOUND";
  }
  if (sandboxPacSummary.legacy_receiver_uid_used !== undefined || providerClientLink.legacy_receiver_uid_used !== undefined) {
    out.legacy_receiver_uid_used = providerClientLink.legacy_receiver_uid_used === true || sandboxPacSummary.legacy_receiver_uid_used === true;
  }
  return out;
}

function sanitizePersistenceRow(raw) {
  if (!raw) return null;
  const line = String(raw || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  if (!line.startsWith("{") || !line.endsWith("}")) return null;
  try {
    return JSON.parse(line);
  } catch (_error) {
    return null;
  }
}

async function persistSandboxStampResult(input = {}) {
  const draftId = text(input.draftId);
  const invoiceStatus = text(input.invoiceStatus) || "SANDBOX_TIMBRADO";
  const paymentStatus = text(input.paymentStatus) || "PENDIENTE";
  if (!draftId) return { ok: false, persistence_status: "FAILED", error_class: "DRAFT_ID_REQUIRED" };
  if (!shouldPersistDraftState(input)) return { ok: true, persistence_status: "SKIPPED", draft_id: draftId };

  const pacResult = input.pacResult || {};
  const artifactStatus = text(input.artifactStatus) || toArtifactStatus(pacResult);
  const providerClientLink = input.providerClientLink || {};
  const summary = buildPersistedSummary({
    invoiceStatus,
    paymentStatus,
    pacResult,
    sandboxPacSummary: input.sandboxPacSummary || {},
    manifestPath: input.manifestPath,
    providerClientLink,
    now: input.now || new Date(),
    artifactStatus,
  });
  const persistedPacResult = buildPersistedPacResult(pacResult, invoiceStatus, paymentStatus, artifactStatus);
  const providerInvoiceLinkPlan = buildProviderInvoiceLinkPersistencePlan({
    tenant_id: input.tenantId || input.tenant_id,
    local_draft_id: draftId,
    draft_id: draftId,
    client_id: input.clientId || input.client_id || summary.client_id || pacResult.client_id,
    provider_name: summary.provider || pacResult.provider || "Factura.com Sandbox",
    provider_environment: summary.environment || pacResult.environment || PAC_ENVIRONMENTS.SANDBOX,
    provider_status: pacResult.provider_status || pacResult.status || artifactStatus,
    local_status: invoiceStatus,
    invoice_status: invoiceStatus,
    payment_status: paymentStatus,
    payment_status_local: paymentStatus,
    artifact_status: artifactStatus,
    sandbox_pac_summary: summary,
    provider_response: pacResult,
    manifest: {
      artifact_status: artifactStatus,
      manifest_path: summary.manifest_path || input.manifestPath,
      xml_path: summary.xml_storage_path || summary.human_xml_path,
      pdf_path: summary.pdf_storage_path || summary.human_pdf_path,
      xml_downloaded: summary.xml_downloaded === true,
      pdf_downloaded: summary.pdf_downloaded === true,
    },
    provider_raw_snapshot_ref: summary.manifest_path || input.manifestPath,
  });
  const summaryJson = sqlJson(summary);
  const resultJson = sqlJson({
    ...persistedPacResult,
    provider_client_link: providerClientLink || null,
    provider_stamp_at: (input.now || new Date()).toISOString(),
  });
  const safeDraftId = sqlQuote(draftId);
  const sql = [
    "UPDATE cfdi_drafts d SET",
    "invoice_status = " + sqlQuote(invoiceStatus) + ",",
    "payment_status = " + sqlQuote(paymentStatus) + ",",
    "sandbox_pac_summary = COALESCE(d.sandbox_pac_summary, '{}'::jsonb) || " + summaryJson + " || jsonb_build_object(",
    "'sandbox_stamp_result', " + resultJson + ",",
    "'pac_result', " + resultJson + ",",
    "'pac_sandbox_result', " + resultJson + ")",
    ", updated_at = now()",
    "WHERE d.draft_id = " + safeDraftId,
    "RETURNING to_jsonb(jsonb_build_object('draft_id', d.draft_id, 'invoice_status', d.invoice_status, 'payment_status', d.payment_status, 'sandbox_pac_summary', d.sandbox_pac_summary))::text;",
    providerInvoiceLinkPlan.should_persist ? providerInvoiceLinkPlan.sql : "",
  ].filter(Boolean).join(" ");

  try {
    const raw = runPsqlRaw(sql, buildDbOptions(input));
    const row = sanitizePersistenceRow(raw);
    if (!row) {
      return {
        ok: false,
        persistence_status: "FAILED",
        draft_id: draftId,
        error_class: "SANDBOX_DRAFT_PERSISTENCE_NO_RESULT",
      };
    }
    return {
      ok: true,
      persistence_status: "UPDATED",
      draft_id: draftId,
      row,
      provider_invoice_link_status: providerInvoiceLinkPlan.should_persist ? "UPSERTED" : "SKIPPED",
      provider_invoice_link_strategy: providerInvoiceLinkPlan.idempotency_strategy,
      provider_invoice_link_warnings: providerInvoiceLinkPlan.warnings,
    };
  } catch (error) {
    return {
      ok: false,
      persistence_status: "FAILED",
      draft_id: draftId,
      error_class: "SANDBOX_DRAFT_PERSISTENCE_ERROR",
      error: error.message || String(error),
    };
  }
}

module.exports = {
  buildDbOptions,
  buildPersistedPacResult,
  buildPersistedSummary,
  persistSandboxStampResult,
  sanitizePersistenceRow,
  shouldPersistDraftState,
};

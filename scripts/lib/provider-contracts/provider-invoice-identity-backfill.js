const {
  buildProviderInvoiceLinkPersistencePlan,
  DEFAULT_ENVIRONMENT,
  DEFAULT_PROVIDER,
  DEFAULT_TENANT_ID,
} = require("./provider-invoice-link-persistence");
const { normalizeProviderInvoiceIdentity } = require("./provider-invoice-identity.contract");

const BACKFILL_ACTIONS = Object.freeze({
  INSERT: "INSERT",
  UPDATE: "UPDATE",
  SKIP_NO_IDENTITY: "SKIP_NO_IDENTITY",
  SKIP_ALREADY_COMPLETE: "SKIP_ALREADY_COMPLETE",
});

const ARTIFACT_STATUS_RANK = Object.freeze({
  DOWNLOADED: 40,
  PARTIAL_DOWNLOAD: 30,
  DOWNLOAD_READY: 20,
  NOT_REQUESTED: 10,
});

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function firstText(...values) {
  for (const value of values) {
    const cleaned = text(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function asObject(value) {
  return isPlainObject(value) ? value : {};
}

function bool(value) {
  return value === true;
}

function normalizedProvider(value) {
  const raw = text(value);
  if (!raw) return DEFAULT_PROVIDER;
  if (/factura/i.test(raw)) return DEFAULT_PROVIDER;
  return raw;
}

function normalizedEnvironment(value) {
  const raw = text(value);
  if (!raw) return DEFAULT_ENVIRONMENT;
  if (/sandbox/i.test(raw)) return DEFAULT_ENVIRONMENT;
  return raw.toUpperCase();
}

function artifactRank(value) {
  return ARTIFACT_STATUS_RANK[String(value || "").toUpperCase()] || 0;
}

function bestArtifactStatus(a, b) {
  return artifactRank(b) > artifactRank(a) ? text(b) : text(a);
}

function backfillKey(input = {}) {
  return [
    text(input.tenant_id) || DEFAULT_TENANT_ID,
    text(input.draft_id || input.local_draft_id) || "NO_DRAFT",
    normalizedProvider(input.provider_name || input.provider),
    normalizedEnvironment(input.provider_environment || input.environment),
  ].join("|");
}

function statusImpliesDownloaded(value) {
  return String(value || "").toUpperCase() === "DOWNLOADED";
}

function extractExistingLink(row = {}) {
  const direct = row.provider_invoice_link || row.existing_provider_invoice_link || row.existing_link;
  if (isPlainObject(direct)) return direct;
  if (text(row.provider_invoice_link_id || row.existing_provider_invoice_link_id)) {
    return {
      provider_invoice_link_id: text(row.provider_invoice_link_id || row.existing_provider_invoice_link_id),
      tenant_id: text(row.link_tenant_id || row.tenant_id),
      draft_id: text(row.link_draft_id || row.draft_id),
      provider: text(row.link_provider || row.provider),
      environment: text(row.link_environment || row.environment),
      provider_invoice_id: text(row.link_provider_invoice_id || row.provider_invoice_id),
      provider_invoice_uid: text(row.link_provider_invoice_uid || row.provider_invoice_uid),
      uuid: text(row.link_uuid || row.uuid),
      serie: text(row.link_serie || row.serie),
      folio: text(row.link_folio || row.folio),
      xml_downloaded: row.link_xml_downloaded === true || row.xml_downloaded === true,
      pdf_downloaded: row.link_pdf_downloaded === true || row.pdf_downloaded === true,
    };
  }
  return null;
}

function buildBackfillCandidateFromDraftRow(draftRow = {}) {
  const summary = asObject(draftRow.sandbox_pac_summary);
  const artifactStatus = firstText(summary.artifact_status, draftRow.artifact_status);
  const downloaded = statusImpliesDownloaded(artifactStatus);
  return {
    source_type: "draft",
    tenant_id: firstText(draftRow.tenant_id, DEFAULT_TENANT_ID),
    draft_id: firstText(draftRow.draft_id, draftRow.local_draft_id),
    local_draft_id: firstText(draftRow.draft_id, draftRow.local_draft_id),
    client_id: text(draftRow.client_id),
    provider_name: firstText(summary.provider, draftRow.provider, DEFAULT_PROVIDER),
    provider_environment: firstText(summary.environment, draftRow.environment, DEFAULT_ENVIRONMENT),
    invoice_status: firstText(draftRow.invoice_status, summary.invoice_status),
    local_status: firstText(draftRow.invoice_status, summary.invoice_status),
    payment_status: firstText(draftRow.payment_status, summary.payment_status),
    artifact_status: artifactStatus,
    sandbox_pac_summary: {
      ...summary,
      provider: firstText(summary.provider, DEFAULT_PROVIDER),
      environment: firstText(summary.environment, DEFAULT_ENVIRONMENT),
      artifact_status: artifactStatus,
      xml_downloaded: summary.xml_downloaded === true || downloaded,
      pdf_downloaded: summary.pdf_downloaded === true || downloaded,
    },
    existing_link: extractExistingLink(draftRow),
  };
}

function buildBackfillCandidateFromManifest(manifest = {}) {
  const summary = asObject(manifest.sandbox_pac_summary);
  const artifactStatus = firstText(manifest.artifact_status, summary.artifact_status);
  const downloaded = statusImpliesDownloaded(artifactStatus);
  return {
    source_type: "manifest",
    tenant_id: firstText(manifest.tenant_id, DEFAULT_TENANT_ID),
    draft_id: firstText(manifest.draft_id, manifest.local_draft_id),
    local_draft_id: firstText(manifest.draft_id, manifest.local_draft_id),
    client_id: text(manifest.client_id),
    provider_name: firstText(manifest.provider, summary.provider, DEFAULT_PROVIDER),
    provider_environment: firstText(manifest.environment, summary.environment, DEFAULT_ENVIRONMENT),
    invoice_status: firstText(manifest.invoice_status, summary.invoice_status),
    local_status: firstText(manifest.invoice_status, summary.invoice_status),
    payment_status: firstText(manifest.payment_status, summary.payment_status),
    artifact_status: artifactStatus,
    provider_folio: firstText(manifest.provider_folio, manifest.folio, summary.folio),
    provider_serie: firstText(manifest.provider_serie, manifest.serie, summary.serie),
    provider_uuid: firstText(manifest.provider_uuid, manifest.uuid, summary.uuid),
    provider_invoice_uid: firstText(manifest.provider_invoice_uid, manifest.cfdi_uid, summary.cfdi_uid),
    provider_invoice_id: firstText(manifest.provider_invoice_id, manifest.pac_invoice_id, summary.pac_invoice_id),
    manifest: {
      ...manifest,
      artifact_status: artifactStatus,
      xml_downloaded: manifest.xml_downloaded === true || summary.xml_downloaded === true || downloaded,
      pdf_downloaded: manifest.pdf_downloaded === true || summary.pdf_downloaded === true || downloaded,
    },
    provider_raw_snapshot_ref: firstText(manifest.provider_raw_snapshot_ref, manifest.manifest_path, manifest._manifest_path),
    existing_link: extractExistingLink(manifest),
  };
}

function mergeDraftSummaryAndManifestIdentity(draftRow = {}, manifest = {}) {
  return mergeCandidateInputs([
    buildBackfillCandidateFromDraftRow(draftRow),
    buildBackfillCandidateFromManifest(manifest),
  ]);
}

function mergeSummary(left = {}, right = {}) {
  const out = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (out[key] === undefined || out[key] === null || out[key] === "") out[key] = value;
  }
  out.xml_downloaded = left.xml_downloaded === true || right.xml_downloaded === true || statusImpliesDownloaded(out.artifact_status);
  out.pdf_downloaded = left.pdf_downloaded === true || right.pdf_downloaded === true || statusImpliesDownloaded(out.artifact_status);
  out.artifact_status = bestArtifactStatus(left.artifact_status, right.artifact_status);
  return out;
}

function mergeCandidateInputs(candidates = []) {
  const list = candidates.filter(isPlainObject);
  const out = {};
  const sourceTypes = [];
  for (const item of list) {
    if (item.source_type && !sourceTypes.includes(item.source_type)) sourceTypes.push(item.source_type);
    out.source_type = sourceTypes.length > 1 ? "merged" : (sourceTypes[0] || out.source_type);
    out.source_types = sourceTypes.slice();
    out.tenant_id = firstText(out.tenant_id, item.tenant_id, DEFAULT_TENANT_ID);
    out.draft_id = firstText(out.draft_id, item.draft_id, item.local_draft_id);
    out.local_draft_id = firstText(out.local_draft_id, item.local_draft_id, item.draft_id);
    out.client_id = firstText(out.client_id, item.client_id);
    out.provider_name = firstText(out.provider_name, item.provider_name, item.provider, DEFAULT_PROVIDER);
    out.provider_environment = firstText(out.provider_environment, item.provider_environment, item.environment, DEFAULT_ENVIRONMENT);
    out.invoice_status = firstText(out.invoice_status, item.invoice_status, item.local_status);
    out.local_status = firstText(out.local_status, item.local_status, item.invoice_status);
    out.payment_status = firstText(out.payment_status, item.payment_status, item.payment_status_local);
    out.artifact_status = bestArtifactStatus(out.artifact_status, item.artifact_status);
    out.provider_folio = firstText(out.provider_folio, item.provider_folio, item.folio, item.sandbox_pac_summary?.folio, item.manifest?.folio);
    out.provider_serie = firstText(out.provider_serie, item.provider_serie, item.serie, item.sandbox_pac_summary?.serie, item.manifest?.serie);
    out.provider_uuid = firstText(out.provider_uuid, item.provider_uuid, item.uuid, item.sandbox_pac_summary?.uuid, item.manifest?.uuid);
    out.provider_invoice_uid = firstText(out.provider_invoice_uid, item.provider_invoice_uid, item.cfdi_uid, item.sandbox_pac_summary?.cfdi_uid, item.manifest?.cfdi_uid);
    out.provider_invoice_id = firstText(out.provider_invoice_id, item.provider_invoice_id, item.pac_invoice_id, item.sandbox_pac_summary?.pac_invoice_id, item.manifest?.pac_invoice_id);
    out.sandbox_pac_summary = mergeSummary(out.sandbox_pac_summary || {}, item.sandbox_pac_summary || {});
    out.manifest = mergeSummary(out.manifest || {}, item.manifest || {});
    out.xml_downloaded = out.xml_downloaded === true || item.xml_downloaded === true || item.sandbox_pac_summary?.xml_downloaded === true || item.manifest?.xml_downloaded === true || statusImpliesDownloaded(out.artifact_status);
    out.pdf_downloaded = out.pdf_downloaded === true || item.pdf_downloaded === true || item.sandbox_pac_summary?.pdf_downloaded === true || item.manifest?.pdf_downloaded === true || statusImpliesDownloaded(out.artifact_status);
    out.provider_raw_snapshot_ref = firstText(out.provider_raw_snapshot_ref, item.provider_raw_snapshot_ref, item.manifest_path, item._manifest_path);
    out.existing_link = out.existing_link || item.existing_link || null;
  }
  out.sandbox_pac_summary = {
    ...(out.sandbox_pac_summary || {}),
    provider: firstText(out.sandbox_pac_summary?.provider, out.provider_name, DEFAULT_PROVIDER),
    environment: firstText(out.sandbox_pac_summary?.environment, out.provider_environment, DEFAULT_ENVIRONMENT),
    folio: firstText(out.sandbox_pac_summary?.folio, out.provider_folio),
    serie: firstText(out.sandbox_pac_summary?.serie, out.provider_serie),
    uuid: firstText(out.sandbox_pac_summary?.uuid, out.provider_uuid),
    cfdi_uid: firstText(out.sandbox_pac_summary?.cfdi_uid, out.provider_invoice_uid),
    pac_invoice_id: firstText(out.sandbox_pac_summary?.pac_invoice_id, out.provider_invoice_id),
    artifact_status: firstText(out.sandbox_pac_summary?.artifact_status, out.artifact_status),
    xml_downloaded: out.xml_downloaded === true,
    pdf_downloaded: out.pdf_downloaded === true,
  };
  return out;
}

function dedupeBackfillCandidates(candidates = []) {
  const groups = new Map();
  for (const candidate of candidates.filter(isPlainObject)) {
    const key = backfillKey(candidate);
    const current = groups.get(key) || [];
    current.push(candidate);
    groups.set(key, current);
  }
  return Array.from(groups.values()).map((items) => mergeCandidateInputs(items));
}

function valuesMatch(candidateValue, existingValue) {
  const candidate = text(candidateValue);
  if (!candidate) return true;
  return candidate === text(existingValue);
}

function existingLinkIsComplete(existingLink, link) {
  const existing = asObject(existingLink);
  if (!text(existing.provider_invoice_link_id) && Object.keys(existing).length === 0) return false;
  const identityFields = [
    "provider_invoice_id",
    "provider_invoice_uid",
    "uuid",
    "serie",
    "folio",
  ];
  for (const field of identityFields) {
    if (!valuesMatch(link[field], existing[field])) return false;
  }
  if (link.xml_downloaded === true && existing.xml_downloaded !== true) return false;
  if (link.pdf_downloaded === true && existing.pdf_downloaded !== true) return false;
  return true;
}

function classifyBackfillCandidate(candidate = {}, persistencePlan = null) {
  const plan = persistencePlan || buildProviderInvoiceLinkPersistencePlan(candidate);
  if (!plan.should_persist) return BACKFILL_ACTIONS.SKIP_NO_IDENTITY;
  const existing = candidate.existing_link;
  if (!existing) return BACKFILL_ACTIONS.INSERT;
  if (existingLinkIsComplete(existing, plan.link)) return BACKFILL_ACTIONS.SKIP_ALREADY_COMPLETE;
  return BACKFILL_ACTIONS.UPDATE;
}

function sanitizePathRef(value) {
  const raw = text(value);
  if (!raw) return null;
  const basename = raw.replace(/\\/g, "/").split("/").filter(Boolean).pop();
  if (!basename) return "[path-redacted]";
  if (/(secret|token|password|api[_-]?key|authorization|bearer)/i.test(raw)) return "[path-redacted]";
  return basename;
}

function redactValue(value) {
  const raw = text(value);
  if (!raw) return raw;
  if (/(secret|token|password|api[_-]?key|authorization|bearer)/i.test(raw)) return "[REDACTED]";
  if (/^[A-Z&]{3,4}\d{6}[A-Z0-9]{3}$/i.test(raw)) return "[RFC_REDACTED]";
  if (/^[A-Za-z]:[\\/]/.test(raw) || /^runtime[\\/]/i.test(raw)) return sanitizePathRef(raw);
  return raw;
}

function summarizeCandidate(candidate, plan, action) {
  const identity = normalizeProviderInvoiceIdentity(candidate);
  return {
    action,
    key: backfillKey(candidate),
    draft_id: redactValue(candidate.draft_id || candidate.local_draft_id),
    provider: plan.link.provider,
    environment: plan.link.environment,
    ui_display_id: identity.ui_display_id,
    identity_confidence: identity.identity_confidence,
    has_folio: Boolean(plan.link.folio),
    has_uuid: Boolean(plan.link.uuid),
    has_provider_invoice_uid: Boolean(plan.link.provider_invoice_uid),
    has_provider_invoice_id: Boolean(plan.link.provider_invoice_id),
    xml_downloaded: plan.link.xml_downloaded === true,
    pdf_downloaded: plan.link.pdf_downloaded === true,
    source_types: candidate.source_types || [candidate.source_type || "unknown"],
    manifest_ref: sanitizePathRef(candidate.provider_raw_snapshot_ref || candidate.manifest_path || candidate._manifest_path),
    warnings: plan.warnings || [],
  };
}

function buildProviderInvoiceIdentityBackfillPlan(input = {}) {
  const draftCandidates = (Array.isArray(input.draftRows) ? input.draftRows : []).map(buildBackfillCandidateFromDraftRow);
  const manifestCandidates = (Array.isArray(input.manifests) ? input.manifests : []).map(buildBackfillCandidateFromManifest);
  const directCandidates = Array.isArray(input.candidates) ? input.candidates : [];
  const deduped = dedupeBackfillCandidates([...draftCandidates, ...manifestCandidates, ...directCandidates]);
  const limit = Number(input.limit);
  const limited = Number.isFinite(limit) && limit > 0 ? deduped.slice(0, limit) : deduped;
  const entries = limited.map((candidate) => {
    const persistencePlan = buildProviderInvoiceLinkPersistencePlan(candidate);
    const action = classifyBackfillCandidate(candidate, persistencePlan);
    return {
      action,
      candidate,
      persistence_plan: persistencePlan,
      sql: action === BACKFILL_ACTIONS.INSERT || action === BACKFILL_ACTIONS.UPDATE ? persistencePlan.sql : "",
      summary: summarizeCandidate(candidate, persistencePlan, action),
      warnings: persistencePlan.warnings || [],
    };
  });
  const warnings = Array.from(new Set(entries.flatMap((entry) => entry.warnings || [])));
  return {
    ok: true,
    dry_run: input.dryRun !== false,
    candidates_found: limited.length,
    inserts_planned: entries.filter((entry) => entry.action === BACKFILL_ACTIONS.INSERT).length,
    updates_planned: entries.filter((entry) => entry.action === BACKFILL_ACTIONS.UPDATE).length,
    skips_no_identity: entries.filter((entry) => entry.action === BACKFILL_ACTIONS.SKIP_NO_IDENTITY).length,
    skips_already_complete: entries.filter((entry) => entry.action === BACKFILL_ACTIONS.SKIP_ALREADY_COMPLETE).length,
    warnings_count: warnings.length,
    warnings,
    entries,
    summaries: entries.map((entry) => entry.summary),
  };
}

function sanitizeBackfillPlanForOutput(plan = {}) {
  return {
    ok: plan.ok === true,
    dry_run: plan.dry_run !== false,
    candidates_found: plan.candidates_found || 0,
    inserts_planned: plan.inserts_planned || 0,
    updates_planned: plan.updates_planned || 0,
    skips_no_identity: plan.skips_no_identity || 0,
    skips_already_complete: plan.skips_already_complete || 0,
    warnings_count: plan.warnings_count || 0,
    warnings: Array.isArray(plan.warnings) ? plan.warnings : [],
    candidates: Array.isArray(plan.summaries) ? plan.summaries : [],
  };
}

module.exports = {
  BACKFILL_ACTIONS,
  buildBackfillCandidateFromDraftRow,
  buildBackfillCandidateFromManifest,
  buildProviderInvoiceIdentityBackfillPlan,
  classifyBackfillCandidate,
  dedupeBackfillCandidates,
  mergeDraftSummaryAndManifestIdentity,
  sanitizeBackfillPlanForOutput,
};

const { normalizeProviderEnvironment, normalizeProviderName } = require("./provider-enums");

const SCHEMA_VERSION = "provider_invoice_identity.v1";

const IDENTITY_SOURCES = Object.freeze([
  "draft",
  "sandbox_pac_summary",
  "provider_response",
  "xml_metadata",
  "manifest",
  "merged",
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned.length ? cleaned : null;
}

function bool(value) {
  return value === true;
}

function firstTextFromObject(object, aliases) {
  if (!isPlainObject(object)) return null;
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(object, alias)) {
      const value = text(object[alias]);
      if (value) return value;
    }
  }
  return null;
}

function sourceLabel(value, fallback = "draft") {
  const label = text(value);
  if (label && IDENTITY_SOURCES.includes(label)) return label;
  return fallback;
}

function addSource(sources, label, object) {
  if (!isPlainObject(object)) return;
  sources.push({ label: sourceLabel(label), object });
}

function collectSources(input) {
  const root = isPlainObject(input) ? input : {};
  const draft = isPlainObject(root.draft) ? root.draft : null;
  const sources = [];
  addSource(sources, sourceLabel(root.identity_source, "draft"), root);
  addSource(sources, "draft", draft);
  addSource(sources, "sandbox_pac_summary", root.sandbox_pac_summary);
  addSource(sources, "sandbox_pac_summary", root.sandboxPacSummary);
  addSource(sources, "sandbox_pac_summary", draft?.sandbox_pac_summary);
  addSource(sources, "provider_response", root.provider_response);
  addSource(sources, "provider_response", root.providerResponse);
  addSource(sources, "provider_response", root.pacResult);
  addSource(sources, "provider_response", root.pac_result);
  addSource(sources, "provider_response", root.pac_sandbox_result);
  addSource(sources, "provider_response", root.sandbox_stamp_result);
  addSource(sources, "provider_response", draft?.pac_result);
  addSource(sources, "provider_response", draft?.pac_sandbox_result);
  addSource(sources, "provider_response", draft?.sandbox_stamp_result);
  addSource(sources, "xml_metadata", root.xml_metadata);
  addSource(sources, "xml_metadata", root.xmlMetadata);
  addSource(sources, "manifest", root.manifest);
  addSource(sources, "manifest", root.storage_manifest);
  addSource(sources, "manifest", root.download_manifest);
  addSource(sources, "manifest", draft?.manifest);
  return sources;
}

function pickFromSources(sources, aliases) {
  for (const source of sources) {
    const value = firstTextFromObject(source.object, aliases);
    if (value) return { value, label: source.label };
  }
  return { value: null, label: null };
}

function anyBooleanFromSources(sources, aliases) {
  return sources.some((source) => aliases.some((alias) => source.object?.[alias] === true));
}

function normalizeProviderLabel(value) {
  const normalized = normalizeProviderName(value);
  if (normalized) return normalized;
  const raw = text(value);
  if (!raw) return null;
  if (/factura/i.test(raw)) return "factura_com";
  return raw;
}

function normalizeEnvironmentLabel(value, providerValue) {
  const normalized = normalizeProviderEnvironment(value);
  if (normalized) return normalized;
  const raw = text(value);
  if (raw && /sandbox/i.test(raw)) return "SANDBOX";
  const providerRaw = text(providerValue);
  if (providerRaw && /sandbox/i.test(providerRaw)) return "SANDBOX";
  return raw;
}

function shortStableId(value, length = 8) {
  const raw = text(value);
  if (!raw) return null;
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, length);
}

function shortReadable(value, length = 8) {
  const raw = text(value);
  if (!raw) return null;
  const compact = raw.replace(/[^A-Za-z0-9]+/g, "");
  return (compact || shortStableId(raw, length)).slice(0, length);
}

function localHumanDraftIdFromDraftId(value) {
  const draftId = text(value);
  if (!draftId) return null;
  if (/^BOR-[A-Za-z0-9-]+$/i.test(draftId)) return draftId.toUpperCase();
  if (!/^DRAFT-/i.test(draftId)) return null;
  const digits = (draftId.match(/\d/g) || []).join("");
  const suffix = digits ? digits.slice(-4).padStart(4, "0") : shortStableId(draftId, 4);
  return `BOR-${suffix}`;
}

function providerIdentityPieces(identity) {
  return [
    text(identity.provider_folio || identity.folio || identity.Folio),
    text(identity.provider_uuid || identity.uuid || identity.UUID || identity.cfdi_uuid || identity.FolioFiscal || identity.folio_fiscal),
    text(identity.provider_invoice_uid || identity.cfdi_uid || identity.UID || identity.uid),
    text(identity.provider_invoice_id || identity.pac_invoice_id || identity.invoice_id || identity.factura_id),
  ].filter(Boolean);
}

function confidence(identity) {
  const folio = text(identity.provider_folio);
  const technical = [identity.provider_uuid, identity.provider_invoice_uid, identity.provider_invoice_id].some((item) => Boolean(text(item)));
  const present = providerIdentityPieces(identity).length;
  if (!present) return "NONE";
  if (folio && technical) return "STRONG";
  return "PARTIAL";
}

function looksPostStamped(identity) {
  const statusText = [
    identity.provider_status,
    identity.local_status,
    identity.invoice_status,
    identity.artifact_status,
  ].map((item) => String(item || "").toUpperCase()).join(" ");
  return identity.require_provider_identity === true
    || /\b(SANDBOX_TIMBRADO|TIMBRAD[AO]|STAMPED|DOWNLOAD_READY|DOWNLOADED)\b/.test(statusText);
}

function normalizeWarnings(inputWarnings, identity) {
  const warnings = Array.isArray(inputWarnings)
    ? inputWarnings.map((item) => text(item)).filter(Boolean)
    : [];
  if (looksPostStamped(identity) && confidence(identity) === "NONE" && !warnings.includes("PROVIDER_IDENTITY_MISSING")) {
    warnings.push("PROVIDER_IDENTITY_MISSING");
  }
  if (looksPostStamped(identity) && providerIdentityPieces(identity).length > 0 && !identity.provider_folio && !warnings.includes("PROVIDER_FOLIO_MISSING")) {
    warnings.push("PROVIDER_FOLIO_MISSING");
  }
  return warnings;
}

function computeIdentitySource(sources, fieldLabels) {
  const explicit = sources[0]?.object?.identity_source;
  if (text(explicit) && IDENTITY_SOURCES.includes(text(explicit))) return text(explicit);
  const labels = Array.from(new Set(fieldLabels.filter(Boolean)));
  if (labels.length > 1) return "merged";
  if (labels.length === 1) return labels[0];
  return "draft";
}

function normalizeProviderInvoiceIdentity(input = {}) {
  const sources = collectSources(input);
  const root = isPlainObject(input) ? input : {};
  const draft = isPlainObject(root.draft) ? root.draft : {};
  const localSources = [
    { label: sourceLabel(root.identity_source, "draft"), object: root },
    { label: "draft", object: draft },
  ].filter((item) => isPlainObject(item.object));

  const localDraft = pickFromSources(localSources, ["local_draft_id", "draft_id"]);
  const localHuman = pickFromSources(localSources, [
    "local_human_draft_id",
    "human_draft_id",
    "humanDraftId",
    "draft_display_id",
    "display_draft_id",
  ]);
  const provider = pickFromSources(sources, ["provider_name", "provider", "pac_provider"]);
  const environment = pickFromSources(sources, ["provider_environment", "environment", "mode", "pac_environment"]);
  const providerInvoiceId = pickFromSources(sources, ["provider_invoice_id", "pac_invoice_id", "invoice_id", "factura_id"]);
  const providerInvoiceUid = pickFromSources(sources, ["provider_invoice_uid", "cfdi_uid", "UID", "uid"]);
  const providerFolio = pickFromSources(sources, ["provider_folio", "folio", "Folio"]);
  const providerSerie = pickFromSources(sources, ["provider_serie", "serie", "Serie"]);
  const providerUuid = pickFromSources(sources, ["provider_uuid", "uuid", "UUID", "cfdi_uuid", "FolioFiscal", "folio_fiscal"]);
  const providerStatus = pickFromSources(sources, ["provider_status", "pac_status", "status"]);
  const stampedAt = pickFromSources(sources, ["stamped_at", "issued_at", "timbrado_at", "stamp_created_at"]);
  const xmlArtifact = pickFromSources(sources, ["xml_artifact_id"]);
  const pdfArtifact = pickFromSources(sources, ["pdf_artifact_id"]);
  const xmlPath = pickFromSources(sources, ["xml_path", "xml_storage_path", "human_xml_path", "client_storage_xml_path"]);
  const pdfPath = pickFromSources(sources, ["pdf_path", "pdf_storage_path", "human_pdf_path", "client_storage_pdf_path"]);
  const rawSnapshot = pickFromSources(sources, [
    "provider_raw_snapshot_ref",
    "raw_snapshot_ref",
    "provider_response_path",
    "manifest_path",
    "client_storage_manifest_path",
  ]);
  const localStatus = pickFromSources(sources, ["local_status", "invoice_status"]);
  const paymentStatus = pickFromSources(sources, ["payment_status", "payment_status_local"]);
  const artifactStatus = pickFromSources(sources, ["artifact_status"]);
  const clientDisplayName = pickFromSources(sources, ["client_display_name", "customer_display_name", "cliente", "client_name"]);

  const identity = {
    schema_version: SCHEMA_VERSION,

    local_draft_id: localDraft.value,
    local_human_draft_id: localHuman.value || localHumanDraftIdFromDraftId(localDraft.value),

    provider_name: normalizeProviderLabel(provider.value),
    provider_environment: normalizeEnvironmentLabel(environment.value, provider.value),

    provider_invoice_id: providerInvoiceId.value,
    provider_invoice_uid: providerInvoiceUid.value,
    provider_folio: providerFolio.value,
    provider_serie: providerSerie.value,
    provider_uuid: providerUuid.value,
    provider_status: providerStatus.value,

    stamped_at: stampedAt.value,

    xml_artifact_id: xmlArtifact.value,
    pdf_artifact_id: pdfArtifact.value,
    xml_path: xmlPath.value,
    pdf_path: pdfPath.value,

    provider_raw_snapshot_ref: rawSnapshot.value,

    identity_confidence: "NONE",
    identity_source: "draft",

    ui_display_id: null,
    debug_display_id: null,

    warnings: [],
  };

  identity.local_status = localStatus.value;
  identity.payment_status = paymentStatus.value;
  identity.artifact_status = artifactStatus.value;
  identity.client_display_name = clientDisplayName.value;
  identity.has_xml = bool(root.has_xml) || bool(root.xml_downloaded) || bool(root.xml_available) || bool(root.xml_content_valid)
    || anyBooleanFromSources(sources, ["has_xml", "xml_downloaded", "xml_available", "xml_content_valid"])
    || Boolean(identity.xml_artifact_id || identity.xml_path) || identity.artifact_status === "DOWNLOADED";
  identity.has_pdf = bool(root.has_pdf) || bool(root.pdf_downloaded) || bool(root.pdf_available) || bool(root.pdf_content_valid)
    || anyBooleanFromSources(sources, ["has_pdf", "pdf_downloaded", "pdf_available", "pdf_content_valid"])
    || Boolean(identity.pdf_artifact_id || identity.pdf_path) || identity.artifact_status === "DOWNLOADED";

  const identityLabels = [
    providerInvoiceId.label,
    providerInvoiceUid.label,
    providerFolio.label,
    providerSerie.label,
    providerUuid.label,
    providerStatus.label,
    stampedAt.label,
    xmlArtifact.label,
    pdfArtifact.label,
    xmlPath.label,
    pdfPath.label,
    rawSnapshot.label,
  ].filter(Boolean);
  identity.identity_source = computeIdentitySource(sources, identityLabels);
  identity.identity_confidence = confidence(identity);
  identity.warnings = normalizeWarnings(root.warnings, identity);
  identity.ui_display_id = resolveProviderDisplayId(identity);
  identity.debug_display_id = resolveDebugDisplayId(identity);
  return identity;
}

function resolveProviderDisplayId(identity) {
  if (!isPlainObject(identity)) return null;
  if (identity.schema_version !== SCHEMA_VERSION) {
    return normalizeProviderInvoiceIdentity(identity).ui_display_id;
  }
  const serie = text(identity.provider_serie);
  const folio = text(identity.provider_folio);
  if (serie && folio) return `${serie}-${folio}`;
  if (folio) return folio;
  const uuid = text(identity.provider_uuid);
  if (uuid) return `UUID-${shortReadable(uuid, 8)}`;
  const providerUid = text(identity.provider_invoice_uid);
  if (providerUid) return `PAC-${shortReadable(providerUid, 8)}`;
  const localHuman = text(identity.local_human_draft_id);
  if (localHuman && !/^DRAFT-/i.test(localHuman)) return localHuman;
  const localDraft = text(identity.local_draft_id);
  if (localDraft) return `FAC-SBX-${shortStableId(localDraft, 8)}`;
  return null;
}

function resolveDebugDisplayId(identity) {
  const normalized = identity?.schema_version === SCHEMA_VERSION ? identity : normalizeProviderInvoiceIdentity(identity);
  const pieces = [
    normalized.local_draft_id,
    normalized.ui_display_id,
    normalized.provider_invoice_id ? `provider_invoice_id=${normalized.provider_invoice_id}` : null,
    normalized.provider_invoice_uid ? `provider_invoice_uid=${normalized.provider_invoice_uid}` : null,
    normalized.provider_uuid ? `uuid=${normalized.provider_uuid}` : null,
  ].map((item) => text(item)).filter(Boolean);
  return pieces.length ? pieces.join(" / ") : null;
}

function resolveInvoiceDisplayIdentity(input = {}) {
  return normalizeProviderInvoiceIdentity(input);
}

function isProviderInvoiceIdentityComplete(identity) {
  return normalizeProviderInvoiceIdentity(identity).identity_confidence === "STRONG";
}

function buildProviderInvoiceLinkCandidate(identityInput = {}) {
  const identity = normalizeProviderInvoiceIdentity(identityInput);
  const warnings = [...identity.warnings];
  if (!identity.local_draft_id && !warnings.includes("LOCAL_DRAFT_ID_MISSING")) warnings.push("LOCAL_DRAFT_ID_MISSING");
  if (!identity.provider_name && !warnings.includes("PROVIDER_NAME_MISSING")) warnings.push("PROVIDER_NAME_MISSING");
  if (!identity.provider_environment && !warnings.includes("PROVIDER_ENVIRONMENT_MISSING")) warnings.push("PROVIDER_ENVIRONMENT_MISSING");
  if (identity.identity_confidence === "NONE" && !warnings.includes("PROVIDER_IDENTITY_MISSING")) warnings.push("PROVIDER_IDENTITY_MISSING");
  return {
    draft_id: identity.local_draft_id,
    provider_invoice_id: identity.provider_invoice_id,
    provider_invoice_uid: identity.provider_invoice_uid,
    uuid: identity.provider_uuid,
    serie: identity.provider_serie,
    folio: identity.provider_folio,
    provider_status: identity.provider_status,
    local_status: identity.local_status,
    has_xml: identity.has_xml === true,
    has_pdf: identity.has_pdf === true,
    xml_path: identity.xml_path,
    pdf_path: identity.pdf_path,
    provider_name: identity.provider_name,
    provider_environment: identity.provider_environment,
    raw_snapshot_ref: identity.provider_raw_snapshot_ref,
    xml_downloaded: identity.has_xml === true,
    pdf_downloaded: identity.has_pdf === true,
    warnings,
  };
}

function humanStatus(value) {
  const raw = text(value);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper === "SANDBOX_TIMBRADO") return "Timbrada sandbox";
  if (upper === "PENDIENTE") return "Pendiente";
  if (upper === "DOWNLOAD_READY") return "Documentos pendientes";
  if (upper === "DOWNLOADED") return "Documentos descargados";
  return raw.replace(/_/g, " ").toLowerCase().replace(/(^|\s)\S/g, (match) => match.toUpperCase());
}

function sanitizeProviderInvoiceIdentityForUi(identityInput = {}) {
  const identity = normalizeProviderInvoiceIdentity(identityInput);
  const uuidShort = identity.provider_uuid ? `UUID-${shortReadable(identity.provider_uuid, 8)}` : null;
  const localHuman = text(identity.local_human_draft_id);
  return {
    schema_version: identity.schema_version,
    ui_display_id: identity.ui_display_id,
    provider_folio: identity.provider_folio,
    provider_serie: identity.provider_serie,
    provider_name: identity.provider_name,
    provider_environment: identity.provider_environment,
    fiscal_status: humanStatus(identity.local_status || identity.provider_status),
    payment_status: humanStatus(identity.payment_status),
    document_status: humanStatus(identity.artifact_status),
    provider_uuid_short: uuidShort,
    provider_uuid_present: Boolean(identity.provider_uuid),
    provider_invoice_uid_present: Boolean(identity.provider_invoice_uid),
    provider_invoice_id_present: Boolean(identity.provider_invoice_id),
    local_human_draft_id: localHuman && !/^DRAFT-/i.test(localHuman) ? localHuman : null,
    client_display_name: identity.client_display_name,
    xml_available: identity.has_xml === true,
    pdf_available: identity.has_pdf === true,
    identity_confidence: identity.identity_confidence,
    warnings: identity.warnings,
  };
}

function redactSensitiveValue(value) {
  const raw = text(value);
  if (!raw) return raw;
  if (/(secret|token|password|api[_-]?key|authorization|bearer)/i.test(raw)) return "[REDACTED]";
  return raw;
}

function sanitizeDebugObject(object) {
  const out = {};
  for (const [key, value] of Object.entries(object)) {
    if (/secret|token|password|api[_-]?key|authorization/i.test(key)) {
      out[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      out[key] = redactSensitiveValue(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function sanitizeProviderInvoiceIdentityForDebug(identityInput = {}) {
  const identity = normalizeProviderInvoiceIdentity(identityInput);
  return sanitizeDebugObject({
    schema_version: identity.schema_version,
    local_draft_id: identity.local_draft_id,
    local_human_draft_id: identity.local_human_draft_id,
    ui_display_id: identity.ui_display_id,
    debug_display_id: identity.debug_display_id,
    provider_name: identity.provider_name,
    provider_environment: identity.provider_environment,
    provider_invoice_id: identity.provider_invoice_id,
    provider_invoice_uid: identity.provider_invoice_uid,
    provider_folio: identity.provider_folio,
    provider_serie: identity.provider_serie,
    provider_uuid: identity.provider_uuid,
    provider_status: identity.provider_status,
    local_status: identity.local_status,
    stamped_at: identity.stamped_at,
    xml_path: identity.xml_path,
    pdf_path: identity.pdf_path,
    provider_raw_snapshot_ref: identity.provider_raw_snapshot_ref,
    identity_confidence: identity.identity_confidence,
    identity_source: identity.identity_source,
    warnings: identity.warnings,
  });
}

module.exports = {
  IDENTITY_SOURCES,
  PROVIDER_INVOICE_IDENTITY_SCHEMA_VERSION: SCHEMA_VERSION,
  buildProviderInvoiceLinkCandidate,
  isProviderInvoiceIdentityComplete,
  normalizeProviderInvoiceIdentity,
  resolveInvoiceDisplayIdentity,
  resolveProviderDisplayId,
  sanitizeProviderInvoiceIdentityForDebug,
  sanitizeProviderInvoiceIdentityForUi,
};

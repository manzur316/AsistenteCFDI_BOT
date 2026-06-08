const { DEFAULT_ENVIRONMENT, DEFAULT_PROVIDER, DEFAULT_TENANT_ID } = require("../provider-client-link-store");
const { redactRfc, redactUid } = require("../factura-com-provider-client-mapper");

const PROVIDER_CLIENT_READINESS_SCHEMA_VERSION = "provider_client_readiness.v1";

const PROVIDER_CLIENT_READINESS_STATUSES = Object.freeze({
  READY: "CLIENT_PROVIDER_READY",
  LOCAL_MISSING: "CLIENT_LOCAL_MISSING",
  FISCAL_DATA_INCOMPLETE: "CLIENT_FISCAL_DATA_INCOMPLETE",
  NOT_VALIDATED_BY_HUMAN: "CLIENT_NOT_VALIDATED_BY_HUMAN",
  LINK_MISSING: "CLIENT_PROVIDER_LINK_MISSING",
  LINK_FOUND: "CLIENT_PROVIDER_LINK_FOUND",
  LINK_AMBIGUOUS: "CLIENT_PROVIDER_LINK_AMBIGUOUS",
  EMAIL_NEEDS_SYNC: "CLIENT_PROVIDER_EMAIL_NEEDS_SYNC",
  EMAIL_SYNCED: "CLIENT_PROVIDER_EMAIL_SYNCED",
  EMAIL_NOT_CONFIRMED: "CLIENT_PROVIDER_EMAIL_NOT_CONFIRMED",
  SYNC_UNKNOWN: "CLIENT_PROVIDER_SYNC_UNKNOWN",
  PRECHECK_BLOCKED: "CLIENT_PROVIDER_PRECHECK_BLOCKED",
});

const PROVIDER_CLIENT_RECOMMENDED_ACTIONS = Object.freeze({
  STAMP_SANDBOX: "STAMP_SANDBOX",
  SYNC_PROVIDER_CLIENT: "SYNC_PROVIDER_CLIENT",
  UPDATE_PROVIDER_EMAIL: "UPDATE_PROVIDER_EMAIL",
  COMPLETE_CLIENT_DATA: "COMPLETE_CLIENT_DATA",
  HUMAN_VALIDATE_CLIENT: "HUMAN_VALIDATE_CLIENT",
  RESOLVE_AMBIGUOUS_PROVIDER_MATCH: "RESOLVE_AMBIGUOUS_PROVIDER_MATCH",
  REVIEW_PROVIDER_SYNC: "REVIEW_PROVIDER_SYNC",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function bool(value) {
  return value === true || value === "true" || value === "t" || value === 1 || value === "1";
}

function normalizeEmail(value) {
  const email = text(value);
  return email && email.includes("@") ? email.toLowerCase() : null;
}

function redactEmail(value) {
  const email = normalizeEmail(value);
  if (!email) return null;
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1) || "*"}***@${domain}`;
}

function normalizeProviderLinks(input) {
  if (!input) return [];
  const list = Array.isArray(input) ? input : [input];
  return list
    .filter((link) => link && typeof link === "object" && Object.keys(link).length)
    .map((link) => ({
      provider_client_link_id: text(link.provider_client_link_id),
      tenant_id: text(link.tenant_id) || DEFAULT_TENANT_ID,
      client_id: text(link.client_id),
      provider: text(link.provider) || DEFAULT_PROVIDER,
      environment: text(link.environment) || DEFAULT_ENVIRONMENT,
      provider_client_uid: text(link.provider_client_uid || link.provider_client_id),
      provider_client_uid_present: Boolean(text(link.provider_client_uid || link.provider_client_id)) || link.provider_client_uid_present === true,
      sync_status: text(link.sync_status),
      provider_response_sanitized: link.provider_response_sanitized && typeof link.provider_response_sanitized === "object"
        ? link.provider_response_sanitized
        : {},
    }));
}

function missingFiscalFields(client = {}) {
  const missing = [];
  if (!text(client.rfc)) missing.push("rfc");
  if (!text(client.razon_social || client.legal_name || client.display_name)) missing.push("razon_social");
  if (!text(client.codigo_postal_fiscal || client.fiscal_zip)) missing.push("codigo_postal_fiscal");
  if (!text(client.regimen_fiscal || client.fiscal_regime)) missing.push("regimen_fiscal");
  if (!text(client.uso_cfdi_default || client.uso_cfdi || client.cfdi_use)) missing.push("uso_cfdi_default");
  return missing;
}

function emailStatus(client = {}, link = null) {
  const linkSummary = link?.provider_response_sanitized && typeof link.provider_response_sanitized === "object"
    ? link.provider_response_sanitized
    : {};
  const localStatus = text(client.provider_email_sync_status);
  return localStatus
    || text(linkSummary.provider_email_sync_status)
    || (normalizeEmail(client.email || client.correo) ? "UNKNOWN" : "NOT_PROVIDED");
}

function recommendedButtons(recommendedAction) {
  const common = [
    { label: "Ver datos fiscales del cliente", action: "CLIENT_FISCAL_STATUS" },
    { label: "Cancelar", action: "CANCEL" },
  ];
  const map = {
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.STAMP_SANDBOX]: [
      { label: "Continuar timbrado sandbox", action: "STAMP_SANDBOX" },
      ...common,
    ],
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.SYNC_PROVIDER_CLIENT]: [
      { label: "Sincronizar cliente proveedor", action: "PROVIDER_CLIENT_SYNC_PREPARE" },
      ...common,
    ],
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.UPDATE_PROVIDER_EMAIL]: [
      { label: "Actualizar email proveedor", action: "PROVIDER_CLIENT_EMAIL_SYNC_PREPARE" },
      ...common,
    ],
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.COMPLETE_CLIENT_DATA]: common,
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.HUMAN_VALIDATE_CLIENT]: common,
    [PROVIDER_CLIENT_RECOMMENDED_ACTIONS.RESOLVE_AMBIGUOUS_PROVIDER_MATCH]: [
      { label: "Resolver cliente proveedor", action: "PROVIDER_CLIENT_MATCH_REVIEW" },
      ...common,
    ],
  };
  return map[recommendedAction] || common;
}

function buildProviderClientReadiness(input = {}) {
  const client = input.client && typeof input.client === "object" ? input.client : null;
  const links = normalizeProviderLinks(input.provider_client_links || input.providerClientLinks || input.provider_client_link || input.providerClientLink);
  const link = links.find((item) => item.provider_client_uid_present) || links[0] || null;
  const tenantId = text(input.tenant_id || input.tenantId || client?.tenant_id || link?.tenant_id) || DEFAULT_TENANT_ID;
  const clientId = text(input.client_id || input.clientId || client?.client_id || link?.client_id);
  const provider = text(input.provider || link?.provider) || DEFAULT_PROVIDER;
  const environment = text(input.environment || link?.environment) || DEFAULT_ENVIRONMENT;
  const statuses = [];
  const blockers = [];
  const warnings = [];
  const localFound = Boolean(client && Object.keys(client).length);
  const fiscalMissing = localFound ? missingFiscalFields(client) : [];
  const fiscalComplete = localFound && fiscalMissing.length === 0;
  const validatedByHuman = localFound && bool(client.validated_by_human);
  const ambiguousLink = links.filter((item) => item.provider_client_uid_present).length > 1;
  const linkFound = Boolean(link && link.provider_client_uid_present && !ambiguousLink);
  const uidPresent = Boolean(link && link.provider_client_uid_present);
  const email = normalizeEmail(client?.email || client?.correo);
  const emailConfirmed = bool(client?.email_confirmed);
  const providerEmailSyncStatus = emailStatus(client || {}, link);

  if (!localFound) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.LOCAL_MISSING, PROVIDER_CLIENT_READINESS_STATUSES.PRECHECK_BLOCKED);
    blockers.push(PROVIDER_CLIENT_READINESS_STATUSES.LOCAL_MISSING);
  }
  if (localFound && !fiscalComplete) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.FISCAL_DATA_INCOMPLETE, PROVIDER_CLIENT_READINESS_STATUSES.PRECHECK_BLOCKED);
    blockers.push(PROVIDER_CLIENT_READINESS_STATUSES.FISCAL_DATA_INCOMPLETE);
  }
  if (localFound && !validatedByHuman) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.NOT_VALIDATED_BY_HUMAN, PROVIDER_CLIENT_READINESS_STATUSES.PRECHECK_BLOCKED);
    blockers.push(PROVIDER_CLIENT_READINESS_STATUSES.NOT_VALIDATED_BY_HUMAN);
  }
  if (ambiguousLink) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.LINK_AMBIGUOUS, PROVIDER_CLIENT_READINESS_STATUSES.PRECHECK_BLOCKED);
    blockers.push(PROVIDER_CLIENT_READINESS_STATUSES.LINK_AMBIGUOUS);
  } else if (linkFound) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.LINK_FOUND);
  } else {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.LINK_MISSING, PROVIDER_CLIENT_READINESS_STATUSES.PRECHECK_BLOCKED);
    blockers.push(PROVIDER_CLIENT_READINESS_STATUSES.LINK_MISSING);
  }

  if (!email) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NEEDS_SYNC);
    warnings.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NEEDS_SYNC);
  } else if (!emailConfirmed) {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NOT_CONFIRMED);
    warnings.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NOT_CONFIRMED);
  } else if (providerEmailSyncStatus === "SYNCED") {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_SYNCED);
  } else if (providerEmailSyncStatus === "NEEDS_SYNC" || providerEmailSyncStatus === "NOT_PROVIDED") {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NEEDS_SYNC);
    warnings.push(PROVIDER_CLIENT_READINESS_STATUSES.EMAIL_NEEDS_SYNC);
  } else {
    statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.SYNC_UNKNOWN);
    warnings.push(PROVIDER_CLIENT_READINESS_STATUSES.SYNC_UNKNOWN);
  }

  const readyForStamp = localFound && fiscalComplete && validatedByHuman && linkFound;
  const readyForEmail = readyForStamp && Boolean(email) && emailConfirmed && providerEmailSyncStatus === "SYNCED";
  if (readyForStamp) statuses.push(PROVIDER_CLIENT_READINESS_STATUSES.READY);

  let recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.STAMP_SANDBOX;
  if (blockers.includes(PROVIDER_CLIENT_READINESS_STATUSES.LOCAL_MISSING) || blockers.includes(PROVIDER_CLIENT_READINESS_STATUSES.FISCAL_DATA_INCOMPLETE)) {
    recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.COMPLETE_CLIENT_DATA;
  } else if (blockers.includes(PROVIDER_CLIENT_READINESS_STATUSES.NOT_VALIDATED_BY_HUMAN)) {
    recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.HUMAN_VALIDATE_CLIENT;
  } else if (blockers.includes(PROVIDER_CLIENT_READINESS_STATUSES.LINK_AMBIGUOUS)) {
    recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.RESOLVE_AMBIGUOUS_PROVIDER_MATCH;
  } else if (blockers.includes(PROVIDER_CLIENT_READINESS_STATUSES.LINK_MISSING)) {
    recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.SYNC_PROVIDER_CLIENT;
  } else if (!readyForEmail) {
    recommendedAction = PROVIDER_CLIENT_RECOMMENDED_ACTIONS.UPDATE_PROVIDER_EMAIL;
  }

  return {
    schema_version: PROVIDER_CLIENT_READINESS_SCHEMA_VERSION,
    client_id: clientId,
    tenant_id: tenantId,
    provider,
    environment,
    statuses: [...new Set(statuses)],
    ready_for_provider_stamp: readyForStamp,
    ready_for_provider_email: readyForEmail,
    client_local_found: localFound,
    fiscal_data_complete: fiscalComplete,
    fiscal_data_missing_fields: fiscalMissing,
    validated_by_human: validatedByHuman,
    provider_client_link_found: linkFound,
    provider_client_link_ambiguous: ambiguousLink,
    provider_client_uid_present: uidPresent,
    provider_link_sync_status: text(link?.sync_status),
    email_present: Boolean(email),
    email_confirmed: emailConfirmed,
    provider_email_sync_status: providerEmailSyncStatus,
    recommended_action: recommendedAction,
    recommended_buttons: recommendedButtons(recommendedAction),
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)],
    safe_summary: {
      client_id: clientId,
      client_display_name_present: Boolean(text(client?.display_name || client?.razon_social)),
      rfc_redacted: redactRfc(client?.rfc),
      email_redacted: redactEmail(email),
      provider_client_uid_redacted: redactUid(link?.provider_client_uid),
      provider_client_link_id_present: Boolean(text(link?.provider_client_link_id)),
    },
  };
}

function isProviderClientReadyForStamp(readiness = {}) {
  return readiness.ready_for_provider_stamp === true && Array.isArray(readiness.blockers) && readiness.blockers.length === 0;
}

function summarizeProviderClientReadiness(readiness = {}) {
  const ready = isProviderClientReadyForStamp(readiness);
  return {
    schema_version: readiness.schema_version || PROVIDER_CLIENT_READINESS_SCHEMA_VERSION,
    client_id: text(readiness.client_id),
    provider: text(readiness.provider) || DEFAULT_PROVIDER,
    environment: text(readiness.environment) || DEFAULT_ENVIRONMENT,
    ready_for_provider_stamp: ready,
    ready_for_provider_email: readiness.ready_for_provider_email === true,
    recommended_action: text(readiness.recommended_action) || PROVIDER_CLIENT_RECOMMENDED_ACTIONS.REVIEW_PROVIDER_SYNC,
    blockers: Array.isArray(readiness.blockers) ? readiness.blockers : [],
    warnings: Array.isArray(readiness.warnings) ? readiness.warnings : [],
    safe_summary: readiness.safe_summary || {},
  };
}

module.exports = {
  PROVIDER_CLIENT_READINESS_SCHEMA_VERSION,
  PROVIDER_CLIENT_READINESS_STATUSES,
  PROVIDER_CLIENT_RECOMMENDED_ACTIONS,
  buildProviderClientReadiness,
  isProviderClientReadyForStamp,
  redactEmail,
  summarizeProviderClientReadiness,
};

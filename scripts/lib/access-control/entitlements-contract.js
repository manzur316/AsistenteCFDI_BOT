const {
  SUBSCRIPTION_STATUSES,
  normalizeSubscriptionStatus,
} = require("./subscription-status-enums");

const ENTITLEMENTS = Object.freeze({
  VIEW_HISTORY: "VIEW_HISTORY",
  VIEW_INVOICE_SUMMARY: "VIEW_INVOICE_SUMMARY",
  CREATE_DRAFT: "CREATE_DRAFT",
  APPROVE_DRAFT: "APPROVE_DRAFT",
  STAMP_SANDBOX: "STAMP_SANDBOX",
  STAMP_PRODUCTION: "STAMP_PRODUCTION",
  DOWNLOAD_XML_PDF: "DOWNLOAD_XML_PDF",
  MARK_PAYMENT: "MARK_PAYMENT",
  MANAGE_CLIENTS: "MANAGE_CLIENTS",
  MANAGE_PROVIDER_LINKS: "MANAGE_PROVIDER_LINKS",
  RUN_REPORTS: "RUN_REPORTS",
  EXPORT_BASIC: "EXPORT_BASIC",
  RENEW_SUBSCRIPTION: "RENEW_SUBSCRIPTION",
  CONTACT_SUPPORT: "CONTACT_SUPPORT",
});

const READ_ONLY_ENTITLEMENTS = Object.freeze([
  ENTITLEMENTS.VIEW_HISTORY,
  ENTITLEMENTS.VIEW_INVOICE_SUMMARY,
  ENTITLEMENTS.EXPORT_BASIC,
  ENTITLEMENTS.RENEW_SUBSCRIPTION,
  ENTITLEMENTS.CONTACT_SUPPORT,
]);

const SUSPENDED_ENTITLEMENTS = Object.freeze([
  ENTITLEMENTS.EXPORT_BASIC,
  ENTITLEMENTS.RENEW_SUBSCRIPTION,
  ENTITLEMENTS.CONTACT_SUPPORT,
]);

const TRIAL_ENTITLEMENTS = Object.freeze([
  ENTITLEMENTS.VIEW_HISTORY,
  ENTITLEMENTS.VIEW_INVOICE_SUMMARY,
  ENTITLEMENTS.CREATE_DRAFT,
  ENTITLEMENTS.APPROVE_DRAFT,
  ENTITLEMENTS.STAMP_SANDBOX,
  ENTITLEMENTS.MANAGE_CLIENTS,
  ENTITLEMENTS.RENEW_SUBSCRIPTION,
  ENTITLEMENTS.CONTACT_SUPPORT,
]);

const ACTIVE_DEFAULT_ENTITLEMENTS = Object.freeze([
  ENTITLEMENTS.VIEW_HISTORY,
  ENTITLEMENTS.VIEW_INVOICE_SUMMARY,
  ENTITLEMENTS.CREATE_DRAFT,
  ENTITLEMENTS.APPROVE_DRAFT,
  ENTITLEMENTS.STAMP_SANDBOX,
  ENTITLEMENTS.DOWNLOAD_XML_PDF,
  ENTITLEMENTS.MARK_PAYMENT,
  ENTITLEMENTS.MANAGE_CLIENTS,
  ENTITLEMENTS.MANAGE_PROVIDER_LINKS,
  ENTITLEMENTS.RUN_REPORTS,
  ENTITLEMENTS.EXPORT_BASIC,
  ENTITLEMENTS.RENEW_SUBSCRIPTION,
  ENTITLEMENTS.CONTACT_SUPPORT,
]);

function values(enumObject) {
  return Object.values(enumObject);
}

function normalizeEntitlement(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return values(ENTITLEMENTS).includes(normalized) ? normalized : null;
}

function planEntitlements(plan = {}) {
  if (!plan || typeof plan !== "object") return null;
  const raw = Array.isArray(plan.entitlements) ? plan.entitlements : null;
  if (!raw) return null;
  return raw.map(normalizeEntitlement).filter(Boolean);
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function resolveEntitlementsForSubscriptionStatus(status, plan = {}) {
  const normalizedStatus = normalizeSubscriptionStatus(status);
  const explicitPlan = planEntitlements(plan);
  const activeBase = explicitPlan || ACTIVE_DEFAULT_ENTITLEMENTS;
  if (!normalizedStatus) return [];
  if (normalizedStatus === SUBSCRIPTION_STATUSES.ACTIVE) return unique(activeBase);
  if (normalizedStatus === SUBSCRIPTION_STATUSES.GRACE_PERIOD) return unique(activeBase);
  if (normalizedStatus === SUBSCRIPTION_STATUSES.READ_ONLY) return unique(READ_ONLY_ENTITLEMENTS);
  if (normalizedStatus === SUBSCRIPTION_STATUSES.SUSPENDED) return unique(SUSPENDED_ENTITLEMENTS);
  if (normalizedStatus === SUBSCRIPTION_STATUSES.TRIAL_ACTIVE) return unique(TRIAL_ENTITLEMENTS);
  if (normalizedStatus === SUBSCRIPTION_STATUSES.TRIAL_EXPIRED) {
    return unique([ENTITLEMENTS.VIEW_HISTORY, ENTITLEMENTS.RENEW_SUBSCRIPTION, ENTITLEMENTS.CONTACT_SUPPORT]);
  }
  if (normalizedStatus === SUBSCRIPTION_STATUSES.DELETION_REQUESTED) {
    return unique([ENTITLEMENTS.EXPORT_BASIC, ENTITLEMENTS.CONTACT_SUPPORT]);
  }
  return unique([ENTITLEMENTS.CONTACT_SUPPORT]);
}

function humanMessage(reasonCode) {
  const map = {
    ALLOWED: "Accion permitida por tu plan.",
    UNKNOWN_STATUS: "No pude validar el estado de tu suscripcion.",
    UNKNOWN_ENTITLEMENT: "No pude validar el permiso requerido.",
    PRODUCTION_BLOCKED_FOUNDATION: "Timbrado productivo sigue bloqueado en esta etapa.",
    TRIAL_PRODUCTION_BLOCKED: "El modo prueba solo permite sandbox/test; no produccion fiscal real.",
    READ_ONLY_BLOCKED: "Tu plan esta en modo solo lectura. Puedes consultar historial o renovar.",
    ENTITLEMENT_NOT_AVAILABLE: "Tu plan actual no permite esta accion.",
  };
  return map[reasonCode] || "Accion no permitida.";
}

function assertActionAllowed({ status, entitlement, action, plan } = {}) {
  const normalizedStatus = normalizeSubscriptionStatus(status);
  const required = normalizeEntitlement(entitlement);
  const actionName = String(action || entitlement || "").trim() || null;
  if (!normalizedStatus) {
    return { ok: false, status, action: actionName, entitlement_required: required, reason_code: "UNKNOWN_STATUS", human_message: humanMessage("UNKNOWN_STATUS") };
  }
  if (!required) {
    return { ok: false, status: normalizedStatus, action: actionName, entitlement_required: entitlement || null, reason_code: "UNKNOWN_ENTITLEMENT", human_message: humanMessage("UNKNOWN_ENTITLEMENT") };
  }
  if (required === ENTITLEMENTS.STAMP_PRODUCTION) {
    const reason = normalizedStatus === SUBSCRIPTION_STATUSES.TRIAL_ACTIVE
      ? "TRIAL_PRODUCTION_BLOCKED"
      : "PRODUCTION_BLOCKED_FOUNDATION";
    return { ok: false, status: normalizedStatus, action: actionName, entitlement_required: required, reason_code: reason, human_message: humanMessage(reason) };
  }
  const allowed = resolveEntitlementsForSubscriptionStatus(normalizedStatus, plan);
  if (!allowed.includes(required)) {
    const reason = normalizedStatus === SUBSCRIPTION_STATUSES.READ_ONLY ? "READ_ONLY_BLOCKED" : "ENTITLEMENT_NOT_AVAILABLE";
    return { ok: false, status: normalizedStatus, action: actionName, entitlement_required: required, reason_code: reason, human_message: humanMessage(reason) };
  }
  return { ok: true, status: normalizedStatus, action: actionName, entitlement_required: required, reason_code: "ALLOWED", human_message: humanMessage("ALLOWED") };
}

module.exports = {
  ACTIVE_DEFAULT_ENTITLEMENTS,
  ENTITLEMENTS,
  READ_ONLY_ENTITLEMENTS,
  SUSPENDED_ENTITLEMENTS,
  TRIAL_ENTITLEMENTS,
  assertActionAllowed,
  normalizeEntitlement,
  resolveEntitlementsForSubscriptionStatus,
  values,
};

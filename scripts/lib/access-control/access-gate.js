const { ENTITLEMENTS, assertActionAllowed } = require("./entitlements-contract");
const { normalizeSubscriptionStatus, SUBSCRIPTION_STATUSES } = require("./subscription-status-enums");

const ACTION_ENTITLEMENT_MAP = Object.freeze({
  VIEW_HISTORY: ENTITLEMENTS.VIEW_HISTORY,
  VIEW_INVOICE_SUMMARY: ENTITLEMENTS.VIEW_INVOICE_SUMMARY,
  CREATE_DRAFT: ENTITLEMENTS.CREATE_DRAFT,
  APPROVE_DRAFT: ENTITLEMENTS.APPROVE_DRAFT,
  STAMP_SANDBOX: ENTITLEMENTS.STAMP_SANDBOX,
  STAMP_PRODUCTION: ENTITLEMENTS.STAMP_PRODUCTION,
  DOWNLOAD_XML_PDF: ENTITLEMENTS.DOWNLOAD_XML_PDF,
  MARK_PAYMENT: ENTITLEMENTS.MARK_PAYMENT,
  MANAGE_CLIENTS: ENTITLEMENTS.MANAGE_CLIENTS,
  MANAGE_PROVIDER_LINKS: ENTITLEMENTS.MANAGE_PROVIDER_LINKS,
  RUN_REPORTS: ENTITLEMENTS.RUN_REPORTS,
  EXPORT_BASIC: ENTITLEMENTS.EXPORT_BASIC,
  RENEW_SUBSCRIPTION: ENTITLEMENTS.RENEW_SUBSCRIPTION,
  CONTACT_SUPPORT: ENTITLEMENTS.CONTACT_SUPPORT,
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function requiredEntitlementForAction(action) {
  const normalized = String(action || "").trim().toUpperCase();
  return ACTION_ENTITLEMENT_MAP[normalized] || null;
}

function evaluateAccess({ channelIdentity, tenantMembership, subscription, requestedAction } = {}) {
  const requiredEntitlement = requiredEntitlementForAction(requestedAction);
  const subscriptionStatus = normalizeSubscriptionStatus(subscription?.status)
    || normalizeSubscriptionStatus(tenantMembership?.status)
    || normalizeSubscriptionStatus(channelIdentity?.status);
  const base = {
    ok: false,
    access_status: subscriptionStatus || "UNKNOWN",
    requested_action: text(requestedAction),
    allowed: false,
    reason_code: null,
    required_entitlement: requiredEntitlement,
    human_message: null,
    read_only: [SUBSCRIPTION_STATUSES.READ_ONLY, SUBSCRIPTION_STATUSES.SUSPENDED, SUBSCRIPTION_STATUSES.TRIAL_EXPIRED].includes(subscriptionStatus),
    can_renew: [SUBSCRIPTION_STATUSES.ACTIVE, SUBSCRIPTION_STATUSES.GRACE_PERIOD, SUBSCRIPTION_STATUSES.READ_ONLY, SUBSCRIPTION_STATUSES.SUSPENDED, SUBSCRIPTION_STATUSES.TRIAL_ACTIVE, SUBSCRIPTION_STATUSES.TRIAL_EXPIRED].includes(subscriptionStatus),
  };

  if (!channelIdentity || !channelIdentity.user_id) {
    return {
      ...base,
      access_status: "UNREGISTERED",
      reason_code: "CHANNEL_IDENTITY_NOT_LINKED",
      human_message: "No encontre tu acceso a SATBOT. Pega tu codigo de invitacion o contacta al administrador.",
      can_renew: false,
    };
  }
  if (!tenantMembership || !tenantMembership.tenant_id) {
    return {
      ...base,
      reason_code: "TENANT_MEMBERSHIP_REQUIRED",
      human_message: "Tu usuario no tiene un tenant activo asignado.",
    };
  }
  if (!requiredEntitlement) {
    return {
      ...base,
      reason_code: "UNKNOWN_ACTION",
      human_message: "No pude validar esta accion.",
    };
  }

  const decision = assertActionAllowed({
    status: subscriptionStatus,
    entitlement: requiredEntitlement,
    action: requestedAction,
    plan: subscription?.plan || {},
  });
  return {
    ...base,
    ok: decision.ok,
    allowed: decision.ok,
    reason_code: decision.reason_code,
    human_message: decision.human_message,
  };
}

module.exports = {
  ACTION_ENTITLEMENT_MAP,
  evaluateAccess,
  requiredEntitlementForAction,
};

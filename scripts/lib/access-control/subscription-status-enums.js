const SUBSCRIPTION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  GRACE_PERIOD: "GRACE_PERIOD",
  READ_ONLY: "READ_ONLY",
  SUSPENDED: "SUSPENDED",
  ARCHIVED: "ARCHIVED",
  DELETION_REQUESTED: "DELETION_REQUESTED",
  TRIAL_ACTIVE: "TRIAL_ACTIVE",
  TRIAL_EXPIRED: "TRIAL_EXPIRED",
});

const SUBSCRIPTION_STATUS_BEHAVIOR = Object.freeze({
  ACTIVE: {
    read_only: false,
    can_renew: true,
    description: "Permite uso normal segun plan y entitlements.",
  },
  GRACE_PERIOD: {
    read_only: false,
    can_renew: true,
    warning: "Pago pendiente; uso casi normal con aviso.",
  },
  READ_ONLY: {
    read_only: true,
    can_renew: true,
    allows: ["VIEW_HISTORY", "VIEW_INVOICE_SUMMARY", "EXPORT_BASIC", "RENEW_SUBSCRIPTION", "CONTACT_SUPPORT"],
    blocks: ["CREATE_DRAFT", "APPROVE_DRAFT", "STAMP_SANDBOX", "STAMP_PRODUCTION", "MANAGE_PROVIDER_LINKS"],
  },
  SUSPENDED: {
    read_only: true,
    can_renew: true,
    allows: ["EXPORT_BASIC", "RENEW_SUBSCRIPTION", "CONTACT_SUPPORT"],
    blocks: ["CREATE_DRAFT", "APPROVE_DRAFT", "STAMP_SANDBOX", "STAMP_PRODUCTION", "DOWNLOAD_XML_PDF"],
  },
  ARCHIVED: {
    read_only: true,
    can_renew: false,
    allows: ["CONTACT_SUPPORT"],
  },
  DELETION_REQUESTED: {
    read_only: true,
    can_renew: false,
    allows: ["CONTACT_SUPPORT", "EXPORT_BASIC"],
  },
  TRIAL_ACTIVE: {
    read_only: false,
    can_renew: true,
    sandbox_only: true,
    description: "Permite prueba limitada solo sandbox/test, sin produccion fiscal real.",
  },
  TRIAL_EXPIRED: {
    read_only: true,
    can_renew: true,
    allows: ["VIEW_HISTORY", "RENEW_SUBSCRIPTION", "CONTACT_SUPPORT"],
    blocks: ["CREATE_DRAFT", "STAMP_SANDBOX", "STAMP_PRODUCTION"],
  },
});

function values(enumObject) {
  return Object.values(enumObject);
}

function normalizeSubscriptionStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return values(SUBSCRIPTION_STATUSES).includes(normalized) ? normalized : null;
}

module.exports = {
  SUBSCRIPTION_STATUSES,
  SUBSCRIPTION_STATUS_BEHAVIOR,
  normalizeSubscriptionStatus,
  values,
};

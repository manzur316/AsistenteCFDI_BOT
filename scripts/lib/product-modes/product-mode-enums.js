const PRODUCT_MODES = Object.freeze({
  DIRECT_BUSINESS: "DIRECT_BUSINESS",
  ACCOUNTING_FIRM: "ACCOUNTING_FIRM",
});

const APPROVAL_MODES = Object.freeze({
  SELF_APPROVAL: "SELF_APPROVAL",
  DELEGATED_ACCOUNTANT: "DELEGATED_ACCOUNTANT",
  CLIENT_APPROVAL_REQUIRED: "CLIENT_APPROVAL_REQUIRED",
});

const APPROVAL_OVERRIDES = Object.freeze({
  NONE: "NONE",
  SEND_TO_CLIENT_APPROVAL: "SEND_TO_CLIENT_APPROVAL",
  FORCE_DUAL_APPROVAL: "FORCE_DUAL_APPROVAL",
});

const CHANNELS = Object.freeze({
  TELEGRAM: "TELEGRAM",
  WHATSAPP: "WHATSAPP",
  WEB_APPROVAL: "WEB_APPROVAL",
  WEB_ADMIN: "WEB_ADMIN",
});

const APPROVAL_EVENTS = Object.freeze({
  DRAFT_CREATED: "draft_created",
  DRAFT_UPDATED: "draft_updated",
  APPROVAL_REQUESTED: "approval_requested",
  APPROVAL_LINK_GENERATED: "approval_link_generated",
  APPROVAL_LINK_REVOKED: "approval_link_revoked",
  APPROVAL_APPROVED: "approval_approved",
  APPROVAL_REJECTED: "approval_rejected",
  APPROVAL_CORRECTION_REQUESTED: "approval_correction_requested",
  INVOICE_STAMPED: "invoice_stamped",
  INVOICE_CANCEL_REQUESTED: "invoice_cancel_requested",
  INVOICE_CANCELLED: "invoice_cancelled",
});

function values(enumObject) {
  return Object.values(enumObject);
}

function isValidEnumValue(enumObject, value) {
  return values(enumObject).includes(value);
}

module.exports = {
  APPROVAL_EVENTS,
  APPROVAL_MODES,
  APPROVAL_OVERRIDES,
  CHANNELS,
  PRODUCT_MODES,
  isValidEnumValue,
  values,
};

const crypto = require("crypto");

const ROLES = Object.freeze({
  OWNER: "OWNER",
  ACCOUNTANT_READONLY: "ACCOUNTANT_READONLY",
  ASSISTANT_OPERATOR: "ASSISTANT_OPERATOR",
  ADMIN_FUTURE: "ADMIN_FUTURE",
});

const SECURITY_LEVELS = Object.freeze({
  LOCAL_DEV: "LOCAL_DEV",
  PRIVATE_SINGLE_USER: "PRIVATE_SINGLE_USER",
  MULTI_USER_FUTURE: "MULTI_USER_FUTURE",
  MULTI_EMITTER_FUTURE: "MULTI_EMITTER_FUTURE",
});

const ACTIONS = Object.freeze({
  VIEW_BASIC_HELP: "VIEW_BASIC_HELP",
  CREATE_DRAFT: "CREATE_DRAFT",
  CONFIRM_DRAFT: "CONFIRM_DRAFT",
  APPROVE_DRAFT: "APPROVE_DRAFT",
  STAMP_SANDBOX: "STAMP_SANDBOX",
  STAMP_PRODUCTION: "STAMP_PRODUCTION",
  CANCEL_DRAFT: "CANCEL_DRAFT",
  CANCEL_INVOICE: "CANCEL_INVOICE",
  VIEW_REPORTS: "VIEW_REPORTS",
  DOWNLOAD_XML: "DOWNLOAD_XML",
  DOWNLOAD_PDF: "DOWNLOAD_PDF",
  EXPORT_ACCOUNTANT_PACKAGE: "EXPORT_ACCOUNTANT_PACKAGE",
  VIEW_BANK_STATEMENTS: "VIEW_BANK_STATEMENTS",
  MANAGE_CLIENTS: "MANAGE_CLIENTS",
  CONFIGURE_PAC: "CONFIGURE_PAC",
});

const SENSITIVE_ACTIONS = new Set([
  ACTIONS.CONFIRM_DRAFT,
  ACTIONS.APPROVE_DRAFT,
  ACTIONS.STAMP_SANDBOX,
  ACTIONS.STAMP_PRODUCTION,
  ACTIONS.CANCEL_DRAFT,
  ACTIONS.CANCEL_INVOICE,
  ACTIONS.VIEW_REPORTS,
  ACTIONS.DOWNLOAD_XML,
  ACTIONS.DOWNLOAD_PDF,
  ACTIONS.EXPORT_ACCOUNTANT_PACKAGE,
  ACTIONS.VIEW_BANK_STATEMENTS,
  ACTIONS.MANAGE_CLIENTS,
  ACTIONS.CONFIGURE_PAC,
]);

const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.OWNER]: new Set(Object.values(ACTIONS).filter((action) => action !== ACTIONS.STAMP_PRODUCTION)),
  [ROLES.ACCOUNTANT_READONLY]: new Set([
    ACTIONS.VIEW_BASIC_HELP,
    ACTIONS.VIEW_REPORTS,
    ACTIONS.DOWNLOAD_XML,
    ACTIONS.DOWNLOAD_PDF,
    ACTIONS.EXPORT_ACCOUNTANT_PACKAGE,
  ]),
  [ROLES.ASSISTANT_OPERATOR]: new Set([
    ACTIONS.VIEW_BASIC_HELP,
    ACTIONS.CREATE_DRAFT,
    ACTIONS.CONFIRM_DRAFT,
    ACTIONS.CANCEL_DRAFT,
  ]),
  [ROLES.ADMIN_FUTURE]: new Set([]),
});

const SENSITIVE_KEYS = new Set([
  "api_key",
  "apikey",
  "secret",
  "secret_key",
  "client_secret",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "rfc",
  "bank_account",
  "bankaccount",
  "account_number",
  "clabe",
  "xml",
  "pdf",
  "certificate",
  "private_key",
  "key",
]);

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeRole(role) {
  const value = normalizeText(role).toUpperCase();
  return Object.values(ROLES).includes(value) ? value : null;
}

function normalizeAction(action) {
  const value = normalizeText(action).toUpperCase();
  return Object.values(ACTIONS).includes(value) ? value : null;
}

function isSensitiveAction(action) {
  const normalized = normalizeAction(action);
  return normalized ? SENSITIVE_ACTIONS.has(normalized) : false;
}

function validateAuthorizedUser(record) {
  const errors = [];
  if (!record || typeof record !== "object") {
    return { ok: false, errors: ["usuario_no_encontrado"], user: null };
  }
  const userId = normalizeText(record.user_id);
  const role = normalizeRole(record.role);
  if (!userId) errors.push("user_id requerido");
  if (!role) errors.push("role invalido");
  if (record.enabled !== true) errors.push("usuario deshabilitado");
  const user = {
    user_id: userId,
    telegram_chat_id: record.telegram_chat_id ? normalizeText(record.telegram_chat_id) : null,
    telegram_user_id: record.telegram_user_id ? normalizeText(record.telegram_user_id) : null,
    display_name: record.display_name ? normalizeText(record.display_name) : null,
    role,
    enabled: record.enabled === true,
  };
  return {
    ok: errors.length === 0,
    errors,
    user: errors.length === 0 ? user : null,
  };
}

function canPerformAction(user, action) {
  const normalizedAction = normalizeAction(action);
  if (!normalizedAction) {
    return { ok: false, allowed: false, reason: "accion_desconocida", action: null };
  }
  if (normalizedAction === ACTIONS.STAMP_PRODUCTION) {
    return { ok: false, allowed: false, reason: "produccion_bloqueada_por_ahora", action: normalizedAction };
  }

  const validation = validateAuthorizedUser(user);
  if (!validation.ok) {
    return {
      ok: false,
      allowed: false,
      reason: validation.errors.includes("usuario_no_encontrado") ? "usuario_requerido" : validation.errors.join("; "),
      action: normalizedAction,
    };
  }

  const permissions = ROLE_PERMISSIONS[validation.user.role] || new Set([]);
  const allowed = permissions.has(normalizedAction);
  return {
    ok: allowed,
    allowed,
    reason: allowed ? "permitido" : "rol_sin_permiso",
    action: normalizedAction,
    user: validation.user,
    sensitive: isSensitiveAction(normalizedAction),
  };
}

function isSensitiveKey(key) {
  const normalized = normalizeText(key).toLowerCase().replace(/[-\s]/g, "_");
  return SENSITIVE_KEYS.has(normalized)
    || normalized.endsWith("_token")
    || normalized.endsWith("_secret")
    || normalized.includes("api_key");
}

function sanitizeSensitivePayload(payload, seen = new WeakSet()) {
  if (payload === null || payload === undefined) return payload;
  if (Array.isArray(payload)) return payload.map((item) => sanitizeSensitivePayload(item, seen));
  if (typeof payload !== "object") return payload;
  if (seen.has(payload)) return "[Circular]";
  seen.add(payload);

  const sanitized = {};
  for (const [key, value] of Object.entries(payload)) {
    if (isSensitiveKey(key)) continue;
    sanitized[key] = sanitizeSensitivePayload(value, seen);
  }
  return sanitized;
}

function buildSecurityEvent(params = {}) {
  const eventId = params.event_id || `SEC-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  return {
    event_id: eventId,
    event_type: normalizeText(params.event_type || "SECURITY_DECISION"),
    telegram_chat_id: params.telegram_chat_id ? normalizeText(params.telegram_chat_id) : null,
    telegram_user_id: params.telegram_user_id ? normalizeText(params.telegram_user_id) : null,
    user_id: params.user_id ? normalizeText(params.user_id) : null,
    action: normalizeAction(params.action) || normalizeText(params.action || "UNKNOWN"),
    allowed: params.allowed === true,
    reason: normalizeText(params.reason || ""),
    metadata: sanitizeSensitivePayload(params.metadata || {}),
    created_at: params.created_at || new Date().toISOString(),
  };
}

module.exports = {
  ACTIONS,
  ROLE_PERMISSIONS,
  ROLES,
  SECURITY_LEVELS,
  SENSITIVE_ACTIONS,
  buildSecurityEvent,
  canPerformAction,
  isSensitiveAction,
  normalizeRole,
  sanitizeSensitivePayload,
  validateAuthorizedUser,
};

const crypto = require("crypto");

const CALLBACK_PREFIX = "cfdi:";
const CALLBACK_DATA_LIMIT = 64;
const TOKEN_RE = /^[A-Za-z0-9_-]{12,40}$/;
const ACTIONS = Object.freeze({
  CONFIRM: "CONFIRM",
  EDIT: "EDIT",
  CANCEL: "CANCEL",
  VIEW: "VIEW",
  MENU: "MENU",
  NEW_INVOICE: "NEW_INVOICE",
  LIST_PENDING: "LIST_PENDING",
  LIST_APPROVED: "LIST_APPROVED",
  LIST_CLIENTS: "LIST_CLIENTS",
  VIEW_DRAFT: "VIEW_DRAFT",
  APPROVE_DRAFT: "APPROVE_DRAFT",
  DISCARD_DRAFT: "DISCARD_DRAFT",
  BACK_PENDING: "BACK_PENDING",
  HELP: "HELP",
  CANCEL_EDIT: "CANCEL_EDIT",
  CANCEL_DRAFT: "CANCEL_DRAFT",
  CREATE_BASIC_CLIENT: "CREATE_BASIC_CLIENT",
  CONTINUE_UNVALIDATED_CLIENT: "CONTINUE_UNVALIDATED_CLIENT",
});
const ONE_TIME_ACTIONS = new Set([
  ACTIONS.CONFIRM,
  ACTIONS.APPROVE_DRAFT,
  ACTIONS.DISCARD_DRAFT,
  ACTIONS.CANCEL_DRAFT,
]);

function normalizeAction(action) {
  return String(action || "").trim().toUpperCase();
}

function generateActionToken(byteLength = 12) {
  return crypto.randomBytes(byteLength).toString("base64url").slice(0, 22);
}

function buildCallbackData(token) {
  const safeToken = String(token || "").trim();
  if (!TOKEN_RE.test(safeToken)) throw new Error("Token de accion invalido.");
  const callbackData = `${CALLBACK_PREFIX}${safeToken}`;
  if (callbackData.length > CALLBACK_DATA_LIMIT) throw new Error("callback_data excede el limite de Telegram.");
  return callbackData;
}

function parseCallbackData(callbackData) {
  const value = String(callbackData || "").trim();
  if (!value.startsWith(CALLBACK_PREFIX)) return null;
  const token = value.slice(CALLBACK_PREFIX.length);
  if (!TOKEN_RE.test(token)) return null;
  return token;
}

function isOneTimeAction(action) {
  return ONE_TIME_ACTIONS.has(normalizeAction(action));
}

function validateActionTokenRecord(record, { chatId, now = new Date() } = {}) {
  if (!record || typeof record !== "object") return { ok: false, reason: "token_no_encontrado" };
  const token = String(record.token || "").trim();
  const action = normalizeAction(record.action);
  if (!TOKEN_RE.test(token)) return { ok: false, reason: "token_invalido" };
  if (!Object.values(ACTIONS).includes(action)) return { ok: false, reason: "accion_invalida" };
  if (String(record.chat_id || "") !== String(chatId || "")) return { ok: false, reason: "chat_invalido" };
  const expiresAt = new Date(record.expires_at);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "token_expirado" };
  }
  if (isOneTimeAction(action) && record.used_at) return { ok: false, reason: "token_usado" };
  return { ok: true, token, action };
}

module.exports = {
  ACTIONS,
  CALLBACK_DATA_LIMIT,
  CALLBACK_PREFIX,
  TOKEN_RE,
  buildCallbackData,
  generateActionToken,
  isOneTimeAction,
  parseCallbackData,
  validateActionTokenRecord,
};

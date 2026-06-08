const { CHANNELS, isValidEnumValue } = require("../product-modes/product-mode-enums");
const { normalizeSubscriptionStatus } = require("./subscription-status-enums");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function safeChannelId(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.replace(/[^\w:.-]+/g, "_").slice(0, 120) : null;
}

function buildCanonicalChannelIdentity(input = {}) {
  return {
    channel: text(input.channel || CHANNELS.TELEGRAM),
    channel_user_id: safeChannelId(input.channel_user_id || input.telegram_user_id || input.user_channel_id),
    chat_id: safeChannelId(input.chat_id || input.telegram_chat_id),
    username: text(input.username),
    user_id: text(input.user_id),
    tenant_id: text(input.tenant_id),
    emitter_id: text(input.emitter_id || input.active_emitter_id),
    status: normalizeSubscriptionStatus(input.status) || text(input.status) || "ACTIVE",
    linked_at: text(input.linked_at) || null,
  };
}

function assertCanonicalChannelIdentity(identity = {}) {
  const errors = [];
  if (!identity || typeof identity !== "object") return { ok: false, errors: ["CanonicalChannelIdentity debe ser objeto"] };
  if (!isValidEnumValue(CHANNELS, identity.channel)) errors.push("channel invalido");
  if (!text(identity.channel_user_id)) errors.push("channel_user_id requerido");
  if (!text(identity.user_id)) errors.push("user_id requerido");
  if (text(identity.username) && identity.username === identity.channel_user_id) {
    errors.push("username no debe ser llave primaria");
  }
  if (text(identity.tenant_id) && identity.tenant_id === identity.channel_user_id) {
    errors.push("telegram_user_id no debe ser tenant_id");
  }
  return { ok: errors.length === 0, errors };
}

function redactedChannelIdentity(identity = {}) {
  const normalized = buildCanonicalChannelIdentity(identity);
  return {
    channel: normalized.channel,
    channel_user_id_present: Boolean(normalized.channel_user_id),
    chat_id_present: Boolean(normalized.chat_id),
    username_present: Boolean(normalized.username),
    user_id_present: Boolean(normalized.user_id),
    tenant_id_present: Boolean(normalized.tenant_id),
    emitter_id_present: Boolean(normalized.emitter_id),
    status: normalized.status,
  };
}

module.exports = {
  buildCanonicalChannelIdentity,
  assertCanonicalChannelIdentity,
  redactedChannelIdentity,
};

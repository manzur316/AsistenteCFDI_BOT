const crypto = require("crypto");
const { CHANNELS, PRODUCT_MODES, isValidEnumValue } = require("../product-modes/product-mode-enums");

const INVITATION_STATUSES = Object.freeze({
  ACTIVE: "ACTIVE",
  USED: "USED",
  EXPIRED: "EXPIRED",
  REVOKED: "REVOKED",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function values(enumObject) {
  return Object.values(enumObject);
}

function normalizeInvitationStatus(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return values(INVITATION_STATUSES).includes(normalized) ? normalized : null;
}

function hashInvitationToken(token, salt = "satbot-invite-v1") {
  const raw = text(token);
  if (!raw) return null;
  return crypto.createHash("sha256").update(`${salt}:${raw}`, "utf8").digest("hex");
}

function buildInvitationToken(input = {}) {
  const tokenHash = text(input.token_hash) || hashInvitationToken(input.token);
  return {
    invite_id: text(input.invite_id),
    tenant_id: text(input.tenant_id),
    product_mode: text(input.product_mode),
    emitter_id: text(input.emitter_id),
    target_channel: text(input.target_channel || CHANNELS.TELEGRAM),
    role_hint: text(input.role_hint),
    token_hash: tokenHash,
    status: normalizeInvitationStatus(input.status) || INVITATION_STATUSES.ACTIVE,
    expires_at: text(input.expires_at),
    max_uses: Number.isInteger(input.max_uses) ? input.max_uses : 1,
    used_count: Number.isInteger(input.used_count) ? input.used_count : 0,
    created_by: text(input.created_by),
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

function assertInvitationToken(invite = {}) {
  const errors = [];
  if (!invite || typeof invite !== "object") return { ok: false, errors: ["InvitationToken debe ser objeto"] };
  if (!text(invite.invite_id)) errors.push("invite_id requerido");
  if (!text(invite.tenant_id)) errors.push("tenant_id requerido");
  if (!isValidEnumValue(PRODUCT_MODES, invite.product_mode)) errors.push("product_mode invalido");
  if (!isValidEnumValue(CHANNELS, invite.target_channel)) errors.push("target_channel invalido");
  if (!normalizeInvitationStatus(invite.status)) errors.push("status invalido");
  if (!/^[a-f0-9]{64}$/i.test(String(invite.token_hash || ""))) errors.push("token_hash requerido");
  if (text(invite.token)) errors.push("token plano no debe guardarse");
  if (!Number.isInteger(invite.max_uses) || invite.max_uses < 1) errors.push("max_uses invalido");
  if (!Number.isInteger(invite.used_count) || invite.used_count < 0) errors.push("used_count invalido");
  return { ok: errors.length === 0, errors };
}

module.exports = {
  INVITATION_STATUSES,
  assertInvitationToken,
  buildInvitationToken,
  hashInvitationToken,
  normalizeInvitationStatus,
  values,
};

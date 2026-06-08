const { CHANNELS, isValidEnumValue } = require("./product-mode-enums");

function assertChannelCommand(command = {}) {
  const errors = [];
  if (!command || typeof command !== "object") errors.push("channel command requerido");
  if (!isValidEnumValue(CHANNELS, command.channel)) errors.push("channel invalido");
  if (!command.source_kind) errors.push("source_kind requerido");
  if (!command.command) errors.push("command requerido");
  if (!command.idempotency_key) errors.push("idempotency_key requerido");
  if (command.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  const payloadText = JSON.stringify(command.payload || {});
  if (/(bot)?\d{6,}:[A-Za-z0-9_-]{20,}/.test(payloadText)) errors.push("payload contiene token aparente");
  if (/<\?xml|<cfdi:Comprobante|%PDF/i.test(payloadText)) errors.push("payload contiene documento fiscal crudo");
  if (/[A-Za-z]:[\\/]/.test(payloadText)) errors.push("payload contiene ruta absoluta");
  return { ok: errors.length === 0, errors };
}

function buildChannelCommand(input = {}) {
  return {
    channel: input.channel || CHANNELS.TELEGRAM,
    source_kind: input.source_kind || "MESSAGE",
    tenant_id: input.tenant_id || null,
    emitter_id: input.emitter_id || null,
    operator_id: input.operator_id || null,
    command: input.command || "",
    payload: input.payload || {},
    idempotency_key: input.idempotency_key || "",
    requires_human_review: true,
  };
}

module.exports = {
  assertChannelCommand,
  buildChannelCommand,
};

const {
  APPROVAL_MODES,
  APPROVAL_OVERRIDES,
  PRODUCT_MODES,
  isValidEnumValue,
} = require("./product-mode-enums");

function assertApprovalPolicy(policy = {}) {
  const errors = [];
  if (!policy || typeof policy !== "object") errors.push("approval policy requerido");
  if (!isValidEnumValue(PRODUCT_MODES, policy.product_mode)) errors.push("product_mode invalido");
  if (!isValidEnumValue(APPROVAL_MODES, policy.approval_mode)) errors.push("approval_mode invalido");
  if (!isValidEnumValue(APPROVAL_OVERRIDES, policy.invoice_override || APPROVAL_OVERRIDES.NONE)) {
    errors.push("invoice_override invalido");
  }
  if (policy.requires_human_review !== true) errors.push("requires_human_review debe ser true");
  if (policy.approval_mode === APPROVAL_MODES.CLIENT_APPROVAL_REQUIRED && policy.link_policy?.enabled !== true) {
    errors.push("CLIENT_APPROVAL_REQUIRED requiere link_policy.enabled=true en fases futuras");
  }
  return { ok: errors.length === 0, errors };
}

function buildDefaultApprovalPolicy(productMode = PRODUCT_MODES.DIRECT_BUSINESS) {
  return {
    product_mode: productMode,
    approval_mode: productMode === PRODUCT_MODES.ACCOUNTING_FIRM
      ? APPROVAL_MODES.DELEGATED_ACCOUNTANT
      : APPROVAL_MODES.SELF_APPROVAL,
    invoice_override: APPROVAL_OVERRIDES.NONE,
    link_policy: {
      enabled: false,
      one_time_approval: true,
      revocable: true,
      expires_minutes: 60 * 24,
      one_active_token_per_approval_request: true,
      approval_snapshot_required: true,
    },
    requires_human_review: true,
  };
}

function buildClientApprovalPolicy(productMode = PRODUCT_MODES.ACCOUNTING_FIRM) {
  return {
    product_mode: productMode,
    approval_mode: APPROVAL_MODES.CLIENT_APPROVAL_REQUIRED,
    invoice_override: APPROVAL_OVERRIDES.NONE,
    link_policy: {
      enabled: true,
      one_time_approval: true,
      revocable: true,
      expires_minutes: 60 * 24,
      one_active_token_per_approval_request: true,
      approval_snapshot_required: true,
    },
    requires_human_review: true,
  };
}

function buildApprovalSnapshot(input = {}) {
  return {
    draft_id: String(input.draft_id || ""),
    snapshot_hash: String(input.snapshot_hash || ""),
    subtotal: Number(input.subtotal || 0),
    iva: Number(input.iva || 0),
    total: Number(input.total || 0),
    receptor: input.receptor || null,
    concepto: input.concepto || null,
    metodo_pago: input.metodo_pago || null,
    forma_pago: input.forma_pago || null,
    uso_cfdi: input.uso_cfdi || null,
    timestamp: input.timestamp || new Date().toISOString(),
  };
}

function assertApprovalSnapshot(snapshot = {}) {
  const errors = [];
  for (const field of ["draft_id", "snapshot_hash", "subtotal", "iva", "total", "receptor", "concepto", "metodo_pago", "forma_pago", "uso_cfdi", "timestamp"]) {
    if (snapshot[field] === undefined || snapshot[field] === null || snapshot[field] === "") errors.push(`${field} requerido`);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  assertApprovalPolicy,
  assertApprovalSnapshot,
  buildApprovalSnapshot,
  buildClientApprovalPolicy,
  buildDefaultApprovalPolicy,
};

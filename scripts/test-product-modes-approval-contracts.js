const assert = require("assert");
const {
  APPROVAL_EVENTS,
  APPROVAL_MODES,
  APPROVAL_OVERRIDES,
  CHANNELS,
  PRODUCT_MODES,
  values,
} = require("./lib/product-modes/product-mode-enums");
const {
  assertApprovalPolicy,
  assertApprovalSnapshot,
  buildApprovalSnapshot,
  buildClientApprovalPolicy,
  buildDefaultApprovalPolicy,
} = require("./lib/product-modes/approval-policy-contract");
const {
  assertChannelCommand,
  buildChannelCommand,
} = require("./lib/product-modes/channel-adapter-contract");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("product modes definidos", () => {
  assert.deepStrictEqual(values(PRODUCT_MODES).sort(), ["ACCOUNTING_FIRM", "DIRECT_BUSINESS"]);
  return values(PRODUCT_MODES).join(",");
});

test("approval modes y overrides definidos", () => {
  for (const value of ["SELF_APPROVAL", "DELEGATED_ACCOUNTANT", "CLIENT_APPROVAL_REQUIRED"]) {
    assert(values(APPROVAL_MODES).includes(value), value);
  }
  for (const value of ["NONE", "SEND_TO_CLIENT_APPROVAL", "FORCE_DUAL_APPROVAL"]) {
    assert(values(APPROVAL_OVERRIDES).includes(value), value);
  }
  return "approval enums";
});

test("channels definidos sin implementar WhatsApp", () => {
  assert.deepStrictEqual(values(CHANNELS).sort(), ["TELEGRAM", "WEB_ADMIN", "WEB_APPROVAL", "WHATSAPP"]);
  return "channels";
});

test("approval policy default valida", () => {
  const direct = buildDefaultApprovalPolicy(PRODUCT_MODES.DIRECT_BUSINESS);
  const firm = buildDefaultApprovalPolicy(PRODUCT_MODES.ACCOUNTING_FIRM);
  assert.strictEqual(direct.approval_mode, APPROVAL_MODES.SELF_APPROVAL);
  assert.strictEqual(firm.approval_mode, APPROVAL_MODES.DELEGATED_ACCOUNTANT);
  assert.strictEqual(assertApprovalPolicy(direct).ok, true);
  assert.strictEqual(assertApprovalPolicy(firm).ok, true);
  return "default policies";
});

test("client approval requiere link policy y snapshot", () => {
  const policy = buildClientApprovalPolicy();
  assert.strictEqual(policy.approval_mode, APPROVAL_MODES.CLIENT_APPROVAL_REQUIRED);
  assert.strictEqual(policy.link_policy.one_time_approval, true);
  assert.strictEqual(policy.link_policy.revocable, true);
  assert.strictEqual(policy.link_policy.approval_snapshot_required, true);
  assert.strictEqual(assertApprovalPolicy(policy).ok, true);
  const snapshot = buildApprovalSnapshot({
    draft_id: "DRAFT-1",
    snapshot_hash: "hash",
    subtotal: 100,
    iva: 16,
    total: 116,
    receptor: "Cliente",
    concepto: "Servicio",
    metodo_pago: "PUE",
    forma_pago: "03",
    uso_cfdi: "G03",
  });
  assert.strictEqual(assertApprovalSnapshot(snapshot).ok, true);
  return "client approval";
});

test("approval events incluyen auditoria invisible", () => {
  for (const value of [
    "draft_created",
    "draft_updated",
    "approval_requested",
    "approval_link_generated",
    "approval_link_revoked",
    "approval_approved",
    "approval_rejected",
    "approval_correction_requested",
    "invoice_stamped",
    "invoice_cancel_requested",
    "invoice_cancelled",
  ]) {
    assert(values(APPROVAL_EVENTS).includes(value), value);
  }
  return "events";
});

test("channel command contract valida seguridad basica", () => {
  const command = buildChannelCommand({
    channel: CHANNELS.TELEGRAM,
    source_kind: "MESSAGE",
    command: "CREATE_DRAFT",
    idempotency_key: "IDEMP-1",
    payload: { text: "servicio tecnico" },
  });
  assert.strictEqual(assertChannelCommand(command).ok, true);
  const unsafe = buildChannelCommand({
    channel: CHANNELS.WHATSAPP,
    source_kind: "MESSAGE",
    command: "SEND",
    idempotency_key: "IDEMP-2",
    payload: { token: "123456:abcdefghijklmnopqrstuvwxyzABCDE" },
  });
  assert.strictEqual(assertChannelCommand(unsafe).ok, false);
  return "safe command";
});

let pass = 0;
for (const item of tests) {
  try {
    const detail = item.fn();
    pass += 1;
    console.log(`PASS ${item.name}: ${detail}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`PASS total: ${pass}/${tests.length}`);

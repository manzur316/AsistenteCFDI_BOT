const assert = require("assert");

const {
  INVITATION_STATUSES,
  assertInvitationToken,
  buildInvitationToken,
  hashInvitationToken,
  values,
} = require("./lib/access-control/invitation-contract");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("invitation_statuses_definidos", () => {
  assert.deepStrictEqual(values(INVITATION_STATUSES).sort(), ["ACTIVE", "EXPIRED", "REVOKED", "USED"]);
  return "statuses";
});

test("invitation_guarda_hash_no_token_plano", () => {
  const invite = buildInvitationToken({
    invite_id: "INVITE-1",
    tenant_id: "TENANT-1",
    product_mode: "DIRECT_BUSINESS",
    target_channel: "TELEGRAM",
    token: "INVITE-SECRETO-123",
    role_hint: "OWNER",
  });
  assert.strictEqual(assertInvitationToken(invite).ok, true);
  assert.strictEqual(invite.token, undefined);
  assert(/^[a-f0-9]{64}$/.test(invite.token_hash));
  assert.notStrictEqual(invite.token_hash, "INVITE-SECRETO-123");
  return "hash";
});

test("invitation_rechaza_token_plano", () => {
  const invite = {
    ...buildInvitationToken({
      invite_id: "INVITE-2",
      tenant_id: "TENANT-1",
      product_mode: "ACCOUNTING_FIRM",
      target_channel: "TELEGRAM",
      token_hash: hashInvitationToken("INVITE-2"),
    }),
    token: "INVITE-2",
  };
  const validation = assertInvitationToken(invite);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("token plano no debe guardarse"));
  return "blocked";
});

test("invitation_modela_start_invite_future_flow", () => {
  const invite = buildInvitationToken({
    invite_id: "INVITE-START",
    tenant_id: "TENANT-1",
    product_mode: "DIRECT_BUSINESS",
    target_channel: "TELEGRAM",
    token: "INVITE-START",
    max_uses: 1,
    used_count: 0,
    metadata: { expected_flow: "/start INVITE-XXXX" },
  });
  assert.strictEqual(invite.target_channel, "TELEGRAM");
  assert.strictEqual(invite.max_uses, 1);
  assert.strictEqual(assertInvitationToken(invite).ok, true);
  return invite.metadata.expected_flow;
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

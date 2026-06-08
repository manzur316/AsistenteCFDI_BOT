const assert = require("assert");

const { evaluateAccess } = require("./lib/access-control/access-gate");

function baseInput(status, requestedAction) {
  return {
    channelIdentity: {
      channel: "TELEGRAM",
      channel_user_id: "TGUSER-1",
      user_id: "USER-1",
      tenant_id: "TENANT-1",
    },
    tenantMembership: {
      tenant_id: "TENANT-1",
      user_id: "USER-1",
      status: "ACTIVE",
    },
    subscription: {
      tenant_id: "TENANT-1",
      status,
      plan_code: "BASIC",
    },
    requestedAction,
  };
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("read_only_bloquea_crear", () => {
  const decision = evaluateAccess(baseInput("READ_ONLY", "CREATE_DRAFT"));
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.read_only, true);
  assert.strictEqual(decision.reason_code, "READ_ONLY_BLOCKED");
  return decision.human_message;
});

test("read_only_permite_historial", () => {
  const decision = evaluateAccess(baseInput("READ_ONLY", "VIEW_HISTORY"));
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.read_only, true);
  return decision.reason_code;
});

test("suspended_permite_renovar_soporte_export_basico", () => {
  for (const action of ["RENEW_SUBSCRIPTION", "CONTACT_SUPPORT", "EXPORT_BASIC"]) {
    const decision = evaluateAccess(baseInput("SUSPENDED", action));
    assert.strictEqual(decision.allowed, true, action);
  }
  return "SUSPENDED limited";
});

test("trial_active_bloquea_produccion", () => {
  const decision = evaluateAccess(baseInput("TRIAL_ACTIVE", "STAMP_PRODUCTION"));
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.reason_code, "TRIAL_PRODUCTION_BLOCKED");
  assert.strictEqual(decision.can_renew, true);
  return decision.reason_code;
});

test("active_permite_manage_provider_links_por_entitlement", () => {
  const decision = evaluateAccess(baseInput("ACTIVE", "MANAGE_PROVIDER_LINKS"));
  assert.strictEqual(decision.allowed, true);
  assert.strictEqual(decision.required_entitlement, "MANAGE_PROVIDER_LINKS");
  return "allowed";
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

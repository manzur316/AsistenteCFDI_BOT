const assert = require("assert");

const {
  ENTITLEMENTS,
  assertActionAllowed,
  resolveEntitlementsForSubscriptionStatus,
  values,
} = require("./lib/access-control/entitlements-contract");
const { SUBSCRIPTION_STATUSES } = require("./lib/access-control/subscription-status-enums");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("entitlements_minimos_definidos", () => {
  for (const key of [
    "VIEW_HISTORY",
    "VIEW_INVOICE_SUMMARY",
    "CREATE_DRAFT",
    "APPROVE_DRAFT",
    "STAMP_SANDBOX",
    "STAMP_PRODUCTION",
    "DOWNLOAD_XML_PDF",
    "MARK_PAYMENT",
    "MANAGE_CLIENTS",
    "MANAGE_PROVIDER_LINKS",
    "RUN_REPORTS",
    "EXPORT_BASIC",
    "RENEW_SUBSCRIPTION",
    "CONTACT_SUPPORT",
  ]) {
    assert(values(ENTITLEMENTS).includes(key), key);
  }
  return values(ENTITLEMENTS).length;
});

test("active_permite_crear_y_timbrar_sandbox", () => {
  const entitlements = resolveEntitlementsForSubscriptionStatus(SUBSCRIPTION_STATUSES.ACTIVE);
  assert(entitlements.includes(ENTITLEMENTS.CREATE_DRAFT));
  assert(entitlements.includes(ENTITLEMENTS.STAMP_SANDBOX));
  assert.strictEqual(assertActionAllowed({ status: "ACTIVE", entitlement: "CREATE_DRAFT", action: "CREATE_DRAFT" }).ok, true);
  return "ACTIVE";
});

test("stamp_production_siempre_bloqueado", () => {
  for (const status of ["ACTIVE", "GRACE_PERIOD", "TRIAL_ACTIVE"]) {
    const decision = assertActionAllowed({ status, entitlement: "STAMP_PRODUCTION", action: "STAMP_PRODUCTION" });
    assert.strictEqual(decision.ok, false);
    assert(/PRODUCTION_BLOCKED|TRIAL_PRODUCTION_BLOCKED/.test(decision.reason_code));
  }
  return "blocked";
});

test("trial_solo_sandbox_test", () => {
  const entitlements = resolveEntitlementsForSubscriptionStatus("TRIAL_ACTIVE");
  assert(entitlements.includes(ENTITLEMENTS.STAMP_SANDBOX));
  assert(!entitlements.includes(ENTITLEMENTS.STAMP_PRODUCTION));
  const decision = assertActionAllowed({ status: "TRIAL_ACTIVE", entitlement: "STAMP_PRODUCTION" });
  assert.strictEqual(decision.reason_code, "TRIAL_PRODUCTION_BLOCKED");
  return "TRIAL_ACTIVE";
});

test("read_only_nunca_crea_ni_timbra", () => {
  for (const entitlement of ["CREATE_DRAFT", "APPROVE_DRAFT", "STAMP_SANDBOX"]) {
    const decision = assertActionAllowed({ status: "READ_ONLY", entitlement });
    assert.strictEqual(decision.ok, false);
    assert.strictEqual(decision.reason_code, "READ_ONLY_BLOCKED");
  }
  return "READ_ONLY";
});

test("read_only_permite_historial_renovar_exportar_basico", () => {
  for (const entitlement of ["VIEW_HISTORY", "VIEW_INVOICE_SUMMARY", "EXPORT_BASIC", "RENEW_SUBSCRIPTION", "CONTACT_SUPPORT"]) {
    assert.strictEqual(assertActionAllowed({ status: "READ_ONLY", entitlement }).ok, true, entitlement);
  }
  return "limited";
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

const assert = require("assert");

const { buildProviderClientReadiness } = require("./lib/provider-client/provider-client-readiness-contract");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function client(overrides = {}) {
  return {
    client_id: "CLI-EMAIL",
    display_name: "Cliente Email",
    razon_social: "CLIENTE EMAIL SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    validated_by_human: true,
    email: "cliente.email@example.com",
    email_confirmed: true,
    provider_email_sync_status: "SYNCED",
    ...overrides,
  };
}

function link() {
  return { provider_client_uid: "UID-EMAIL-123", sync_status: "LINKED" };
}

check("email_synced_is_ready_for_email", () => {
  const readiness = buildProviderClientReadiness({ client: client(), provider_client_link: link() });
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, true);
  assert(readiness.statuses.includes("CLIENT_PROVIDER_EMAIL_SYNCED"));
  return readiness.provider_email_sync_status;
});

check("email_not_confirmed_warns_without_blocking_stamp", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ email_confirmed: false }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, false);
  assert(readiness.warnings.includes("CLIENT_PROVIDER_EMAIL_NOT_CONFIRMED"));
  return readiness.recommended_action;
});

check("email_needs_sync_warns_without_blocking_stamp", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ provider_email_sync_status: "NEEDS_SYNC" }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, false);
  assert(readiness.warnings.includes("CLIENT_PROVIDER_EMAIL_NEEDS_SYNC"));
  return readiness.provider_email_sync_status;
});

check("email_missing_is_not_provider_email_ready", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ email: "", email_confirmed: false, provider_email_sync_status: "NOT_PROVIDED" }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, false);
  assert(readiness.warnings.includes("CLIENT_PROVIDER_EMAIL_NEEDS_SYNC"));
  return readiness.provider_email_sync_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness Email State Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

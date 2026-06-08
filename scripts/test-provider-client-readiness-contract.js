const assert = require("assert");

const {
  PROVIDER_CLIENT_READINESS_SCHEMA_VERSION,
  buildProviderClientReadiness,
  isProviderClientReadyForStamp,
  summarizeProviderClientReadiness,
} = require("./lib/provider-client/provider-client-readiness-contract");

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
    client_id: "CLI-TEST-READY",
    display_name: "Cliente Test",
    razon_social: "CLIENTE TEST SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    validated_by_human: true,
    email: "cliente.test@example.com",
    email_confirmed: true,
    provider_email_sync_status: "SYNCED",
    ...overrides,
  };
}

function link(overrides = {}) {
  return {
    provider_client_link_id: "PCL-TEST",
    client_id: "CLI-TEST-READY",
    provider: "factura_com",
    environment: "SANDBOX",
    provider_client_uid: "UID-SECRET-CLIENT-123",
    sync_status: "LINKED",
    ...overrides,
  };
}

check("ready_client_has_schema_and_stamp_ready", () => {
  const readiness = buildProviderClientReadiness({ client: client(), provider_client_link: link() });
  assert.strictEqual(readiness.schema_version, PROVIDER_CLIENT_READINESS_SCHEMA_VERSION);
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, true);
  assert.strictEqual(readiness.recommended_action, "STAMP_SANDBOX");
  assert.strictEqual(isProviderClientReadyForStamp(readiness), true);
  assert.deepStrictEqual(readiness.blockers, []);
  return readiness.recommended_action;
});

check("missing_link_blocks_stamp", () => {
  const readiness = buildProviderClientReadiness({ client: client(), provider_client_links: [] });
  assert.strictEqual(readiness.ready_for_provider_stamp, false);
  assert(readiness.blockers.includes("CLIENT_PROVIDER_LINK_MISSING"));
  assert.strictEqual(readiness.recommended_action, "SYNC_PROVIDER_CLIENT");
  return readiness.blockers.join("|");
});

check("incomplete_fiscal_data_blocks_before_sync", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ rfc: "", codigo_postal_fiscal: "" }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, false);
  assert(readiness.blockers.includes("CLIENT_FISCAL_DATA_INCOMPLETE"));
  assert.strictEqual(readiness.recommended_action, "COMPLETE_CLIENT_DATA");
  assert(readiness.fiscal_data_missing_fields.includes("rfc"));
  return readiness.recommended_action;
});

check("not_validated_blocks_with_human_review_action", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ validated_by_human: false }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, false);
  assert(readiness.blockers.includes("CLIENT_NOT_VALIDATED_BY_HUMAN"));
  assert.strictEqual(readiness.recommended_action, "HUMAN_VALIDATE_CLIENT");
  return readiness.recommended_action;
});

check("email_needs_sync_does_not_block_stamp", () => {
  const readiness = buildProviderClientReadiness({
    client: client({ provider_email_sync_status: "NEEDS_SYNC" }),
    provider_client_link: link(),
  });
  assert.strictEqual(readiness.ready_for_provider_stamp, true);
  assert.strictEqual(readiness.ready_for_provider_email, false);
  assert(readiness.warnings.includes("CLIENT_PROVIDER_EMAIL_NEEDS_SYNC"));
  assert.strictEqual(readiness.recommended_action, "UPDATE_PROVIDER_EMAIL");
  return readiness.recommended_action;
});

check("summary_has_no_raw_rfc_uid_or_email", () => {
  const readiness = buildProviderClientReadiness({ client: client(), provider_client_link: link() });
  const summary = summarizeProviderClientReadiness(readiness);
  const raw = JSON.stringify(summary);
  assert(!raw.includes("ABC010203AB1"));
  assert(!raw.includes("UID-SECRET-CLIENT-123"));
  assert(!raw.includes("cliente.test@example.com"));
  return "redacted";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness Contract Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

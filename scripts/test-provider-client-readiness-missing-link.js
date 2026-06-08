const assert = require("assert");

const { runSandboxAction } = require("./lib/sandbox-action-runner");

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

check("readiness_missing_link_returns_sync_provider_client", async () => {
  const result = await runSandboxAction("sandbox.provider.client.readiness", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-TEST-NO-LINK",
    client: {
      client_id: "CLI-TEST-NO-LINK",
      display_name: "Cliente Sin Link",
      razon_social: "CLIENTE SIN LINK SA DE CV",
      rfc: "ABC010203AB1",
      codigo_postal_fiscal: "77500",
      regimen_fiscal: "601",
      uso_cfdi_default: "G03",
      validated_by_human: true,
      email: "cliente.sinlink@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    providerClientLinks: [],
  });
  assert.strictEqual(result.status, "NEEDS_SOURCE");
  assert.strictEqual(result.output.ready_for_provider_stamp, false);
  assert.strictEqual(result.output.provider_client_link_found, false);
  assert.strictEqual(result.output.recommended_action, "SYNC_PROVIDER_CLIENT");
  assert(result.output.blockers.includes("CLIENT_PROVIDER_LINK_MISSING"));
  return result.output.recommended_action;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness Missing Link Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

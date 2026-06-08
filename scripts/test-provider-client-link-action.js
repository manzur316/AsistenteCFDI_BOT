const assert = require("assert");

const { runSandboxAction, ACTIONS } = require("./lib/sandbox-action-runner");
const { buildProviderClientLinkUpsertSql } = require("./lib/provider-client-link-store");

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

check("runner_exposes_provider_client_link_action", () => {
  assert(ACTIONS.includes("sandbox.provider.client.link"));
  return "registered";
});

check("manual_link_saves_provider_uid_without_output_leak", async () => {
  let savedInput = null;
  const result = await runSandboxAction("sandbox.provider.client.link", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLIENT-1",
    providerClientUid: "CLIENTUID-SECRET-999",
    rfc: "ABC010203AB1",
    linkStore: {
      save: async (input) => {
        savedInput = input;
        return { provider_client_link_id: "PCL-1" };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(savedInput.provider_client_uid, "CLIENTUID-SECRET-999");
  const raw = JSON.stringify(result);
  assert(!raw.includes("CLIENTUID-SECRET-999"));
  assert(!raw.includes("ABC010203AB1"));
  assert(result.output.provider_client_link.provider_client_uid_present);
  return result.output.link_status;
});

check("upsert_sql_targets_unique_local_link", () => {
  const sql = buildProviderClientLinkUpsertSql({
    tenant_id: "TENANT_PERSONAL_DEFAULT",
    client_id: "CLIENT-1",
    provider_client_uid: "CLIENTUID-1",
  });
  assert(sql.includes("ON CONFLICT (tenant_id, client_id, provider, environment)"));
  assert(sql.includes("provider_client_links"));
  return "sql";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Link Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

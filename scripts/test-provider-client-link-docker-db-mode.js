const assert = require("assert");

const { saveProviderClientLink } = require("./lib/provider-client-link-store");
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

check("provider_client_link_store_uses_common_docker_runner", async () => {
  const seen = {};
  const saved = saveProviderClientLink({
    tenant_id: "TENANT_PERSONAL_DEFAULT",
    client_id: "CLI-REAL-BILBAO",
    provider_client_uid: "UID-REAL-BILBAO-SECRET",
    sync_status: "MANUAL_LINKED",
  }, {
    env: {
      CFDI_DB_EXEC_MODE: "docker",
      CFDI_PG_DOCKER_CONTAINER: "cfdi-postgres",
      CFDI_PGDATABASE: "cfdi_bot",
      CFDI_PGUSER: "cfdi_bot_user",
      CFDI_PGPASSWORD: "BAD_PASSWORD_SHOULD_NOT_BE_USED",
    },
    execFileSync: (command, args, options) => {
      seen.command = command;
      seen.args = args;
      seen.env = options.env;
      return JSON.stringify({
        provider_client_link_id: "PCL-1",
        tenant_id: "TENANT_PERSONAL_DEFAULT",
        client_id: "CLI-REAL-BILBAO",
        provider: "factura_com",
        environment: "SANDBOX",
        provider_client_uid_present: true,
        sync_status: "MANUAL_LINKED",
      });
    },
  });
  assert.strictEqual(seen.command, "docker");
  assert.deepStrictEqual(seen.args.slice(0, 4), ["exec", "-i", "cfdi-postgres", "psql"]);
  assert(!seen.args.includes("-h"));
  assert(!seen.args.includes("127.0.0.1"));
  assert(!seen.env.PGPASSWORD);
  assert.strictEqual(saved.provider_client_uid_present, true);
  assert.strictEqual(saved.sync_status, "MANUAL_LINKED");
  return saved.sync_status;
});

check("provider_client_link_action_does_not_leak_full_uid", async () => {
  const result = await runSandboxAction("sandbox.provider.client.link", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-REAL-BILBAO",
    providerClientUid: "UID-REAL-BILBAO-SECRET",
    dbExecMode: "docker",
    linkStore: {
      save: async () => ({
        provider_client_link_id: "PCL-1",
        provider_client_uid_present: true,
        sync_status: "MANUAL_LINKED",
      }),
    },
  });
  assert.strictEqual(result.status, "OK");
  const raw = JSON.stringify(result);
  assert(!raw.includes("UID-REAL-BILBAO-SECRET"));
  assert.strictEqual(result.output.provider_client_link.provider_client_uid_present, true);
  return result.output.link_status;
});

check("docker_db_failure_does_not_leak_full_uid", async () => {
  const result = await runSandboxAction("sandbox.provider.client.link", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-REAL-BILBAO",
    providerClientUid: "UID-REAL-BILBAO-SECRET",
    dbExecMode: "docker",
    env: { CFDI_DB_EXEC_MODE: "docker" },
    execFileSync: () => {
      throw new Error("simulated docker failure with command text");
    },
  });
  const raw = JSON.stringify(result);
  assert(!raw.includes("UID-REAL-BILBAO-SECRET"));
  assert(raw.includes("LOCAL_DB_PSQL_FAILED"));
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Provider client link Docker DB mode tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

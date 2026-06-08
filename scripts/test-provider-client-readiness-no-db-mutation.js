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

function psqlRows() {
  return {
    client: {
      client_id: "CLI-NO-MUTATION",
      display_name: "Cliente No Mutation",
      razon_social: "CLIENTE NO MUTATION SA DE CV",
      rfc: "ABC010203AB1",
      codigo_postal_fiscal: "77500",
      regimen_fiscal: "601",
      uso_cfdi_default: "G03",
      validated_by_human: true,
      email: "cliente.nomutation@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    provider_client_links: [{
      client_id: "CLI-NO-MUTATION",
      provider_client_uid: "UID-NO-MUTATION-123",
      sync_status: "LINKED",
    }],
  };
}

check("readiness_runner_uses_no_mutating_sql", async () => {
  const sqlSeen = [];
  const result = await runSandboxAction("sandbox.provider.client.readiness", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-NO-MUTATION",
    dbExecMode: "docker",
    execFileSync: (_cmd, args) => {
      const sql = args[args.length - 1];
      sqlSeen.push(sql);
      if (/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP|ALTER)\b/i.test(sql)) {
        throw new Error(`mutating SQL detected: ${sql}`);
      }
      return `${JSON.stringify(psqlRows())}\n`;
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(sqlSeen.length, 1);
  assert(sqlSeen[0].includes("cfdi_clients"));
  assert(sqlSeen[0].includes("provider_client_links"));
  return "select_only";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Readiness No DB Mutation Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

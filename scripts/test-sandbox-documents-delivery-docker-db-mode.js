const assert = require("assert");

const {
  runSandboxDocumentDeliveryDiagnose,
  runSandboxDocumentDeliverySend,
} = require("./lib/sandbox-document-delivery-action");

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

function draftRow() {
  return JSON.stringify({
    draft_id: "DRAFT-DOCKER-DB",
    invoice_status: "SANDBOX_TIMBRADO",
    status: "APROBADO",
    client_id: "CLI-REAL-BILBAO",
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email: "cliente.real@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    sandbox_pac_summary: { artifact_status: "PARTIAL_DOWNLOAD" },
  }) + "\n";
}

function execRecorder(seen) {
  return (command, args, options) => {
    seen.command = command;
    seen.args = args;
    seen.env = options.env;
    return draftRow();
  };
}

function assertDockerExecution(seen) {
  assert.strictEqual(seen.command, "docker");
  assert.deepStrictEqual(seen.args.slice(0, 4), ["exec", "-i", "cfdi-postgres", "psql"]);
  assert(!seen.args.includes("-h"));
  assert(!seen.args.includes("127.0.0.1"));
  assert(!Object.prototype.hasOwnProperty.call(seen.env, "PGPASSWORD"));
  assert(!Object.prototype.hasOwnProperty.call(seen.env, "CFDI_PGPASSWORD"));
}

check("delivery_diagnose_uses_docker_db_mode", () => {
  const seen = {};
  const result = runSandboxDocumentDeliveryDiagnose({
    draftId: "DRAFT-DOCKER-DB",
    channel: "PROVIDER_EMAIL",
    dbExecMode: "docker",
    env: { CFDI_PGPASSWORD: "MUST_NOT_LEAK" },
    execFileSync: execRecorder(seen),
  });
  assertDockerExecution(seen);
  assert.strictEqual(result.output.channel, "PROVIDER_EMAIL");
  return seen.command;
});

check("delivery_send_uses_docker_db_mode", async () => {
  const seen = {};
  const result = await runSandboxDocumentDeliverySend({
    draftId: "DRAFT-DOCKER-DB",
    channel: "PROVIDER_EMAIL",
    dbExecMode: "docker",
    env: { CFDI_PGPASSWORD: "MUST_NOT_LEAK" },
    execFileSync: execRecorder(seen),
  });
  assertDockerExecution(seen);
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  return seen.command;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Documents Delivery Docker DB Mode Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

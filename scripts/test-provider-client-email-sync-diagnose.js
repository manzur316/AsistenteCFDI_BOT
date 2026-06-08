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

check("provider_client_email_diagnose_reports_redacted_ready_state", async () => {
  const result = await runSandboxAction("sandbox.provider.client.email.diagnose", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-REAL-BILBAO",
    clientStore: {
      load: () => ({
        client_id: "CLI-REAL-BILBAO",
        email: "cliente.real@example.com",
        email_confirmed: true,
        provider_email_sync_status: "SYNCED",
      }),
    },
    linkStore: {
      load: () => ({
        client_id: "CLI-REAL-BILBAO",
        provider_client_uid: "PROVIDER-UID-123",
        provider_response_sanitized: { provider_email_present: true, provider_email_sync_status: "SYNCED" },
      }),
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.local_email_present, true);
  assert.strictEqual(result.output.provider_client_link_found, true);
  assert.strictEqual(result.output.safe_email_redacted, "c***@example.com");
  assert(!JSON.stringify(result).includes("cliente.real@example.com"));
  assert(!JSON.stringify(result).includes("PROVIDER-UID-123"));
  return result.output.provider_email_sync_status;
});

check("provider_client_email_diagnose_marks_needs_sync", async () => {
  const result = await runSandboxAction("sandbox.provider.client.email.diagnose", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLI-REAL-BILBAO",
    client: {
      client_id: "CLI-REAL-BILBAO",
      email: "cliente.real@example.com",
      email_confirmed: true,
      provider_email_sync_status: "NEEDS_SYNC",
    },
    linkStore: { load: () => ({ provider_client_uid: "PROVIDER-UID-123", provider_response_sanitized: {} }) },
  });
  assert.strictEqual(result.status, "NEEDS_SOURCE");
  assert(result.warnings.includes("PROVIDER_EMAIL_SYNC_REQUIRED"));
  return result.output.provider_email_sync_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Email Sync Diagnose Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

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

function client() {
  return {
    client_id: "CLIENT-AMBIGUOUS",
    razon_social: "CLIENTE AMBIGUO SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    validated_by_human: true,
  };
}

check("ambiguous_provider_matches_require_human_selection", async () => {
  let saved = false;
  const result = await runSandboxAction("sandbox.provider.client.sync", {
    writeResult: false,
    writeAudit: false,
    client: client(),
    adapter: {
      getClientByRfc: async () => ({
        status: "AMBIGUOUS",
        matches_count: 2,
        safe_matches: [
          { provider_client_uid_present: true, provider_client_uid_redacted: "[REDACTED_UID len=8]" },
          { provider_client_uid_present: true, provider_client_uid_redacted: "[REDACTED_UID len=8]" },
        ],
      }),
    },
    linkStore: { save: async () => { saved = true; } },
  });
  assert.strictEqual(result.status, "NEEDS_SOURCE");
  assert.strictEqual(result.output.sync_status, "AMBIGUOUS");
  assert.strictEqual(saved, false);
  assert(result.errors.includes("PROVIDER_CLIENT_MATCH_AMBIGUOUS"));
  return result.output.sync_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Sync Ambiguous Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

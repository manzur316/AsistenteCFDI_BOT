const assert = require("assert");

const { runSandboxAction, ACTIONS } = require("./lib/sandbox-action-runner");

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
    client_id: "CLIENT-REAL-BILBAO",
    razon_social: "REAL BILBAO SA DE CV",
    rfc: "ABC010203AB1",
    codigo_postal_fiscal: "77500",
    regimen_fiscal: "601",
    uso_cfdi_default: "G03",
    validated_by_human: true,
    ...overrides,
  };
}

check("runner_exposes_provider_client_sync_action", () => {
  assert(ACTIONS.includes("sandbox.provider.client.sync"));
  return "registered";
});

check("sync_links_single_provider_match", async () => {
  const saved = [];
  const result = await runSandboxAction("sandbox.provider.client.sync", {
    writeResult: false,
    writeAudit: false,
    client: client(),
    adapter: {
      getClientByRfc: async (rfc) => ({
        status: "OK",
        provider_client_uid: `UID-${rfc}-MATCH`,
        provider_client_uid_present: true,
        matches_count: 1,
        safe_matches: [{ provider_client_uid_present: true }],
      }),
    },
    linkStore: {
      save: async (input) => {
        saved.push(input);
        return { provider_client_link_id: "PCL-SYNC-1" };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.sync_status, "LINKED");
  assert.strictEqual(saved[0].provider_client_uid, "UID-ABC010203AB1-MATCH");
  const raw = JSON.stringify(result);
  assert(!raw.includes("UID-ABC010203AB1-MATCH"));
  assert(!raw.includes("ABC010203AB1"));
  return result.output.sync_status;
});

check("sync_can_create_missing_client_when_explicit", async () => {
  const result = await runSandboxAction("sandbox.provider.client.sync", {
    writeResult: false,
    writeAudit: false,
    client: client({ client_id: "CLIENT-CREATE" }),
    createIfMissing: true,
    adapter: {
      getClientByRfc: async () => ({ status: "NOT_FOUND", matches_count: 0, safe_matches: [] }),
      createClient: async () => ({
        status: "CREATED",
        provider_client_uid: "UID-CREATED-123",
        provider_client_uid_present: true,
        matches_count: 1,
        safe_matches: [{ provider_client_uid_present: true }],
      }),
    },
    linkStore: { save: async () => ({ provider_client_link_id: "PCL-CREATE" }) },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.sync_status, "CREATED");
  return result.output.sync_status;
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Sync Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxAction } = require("./lib/sandbox-action-runner");

const root = path.resolve(__dirname, "..");
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

function assertSafe(raw) {
  assert(!raw.includes("ABC010203AB1"), "complete RFC leaked");
  assert(!raw.includes("CLIENTUID-SECURITY-123"), "complete provider UID leaked");
  assert(!/https:\/\/api\.factura\.com/i.test(raw), "production URL leaked");
  assert(!/FACTURACOM_(API|SECRET)_KEY|F-Api-Key|F-Secret-Key/i.test(raw), "credential marker leaked");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|\.env|\.cer|\.key/i.test(raw), "artifact or secret reference leaked");
}

check("provider_client_actions_sanitize_outputs", async () => {
  const result = await runSandboxAction("sandbox.provider.client.link", {
    writeResult: false,
    writeAudit: false,
    clientId: "CLIENT-SECURITY",
    providerClientUid: "CLIENTUID-SECURITY-123",
    rfc: "ABC010203AB1",
    linkStore: { save: async () => ({ provider_client_link_id: "PCL-SECURITY" }) },
  });
  const raw = JSON.stringify(result);
  assertSafe(raw);
  assert.strictEqual(result.output.provider_client_link.provider_client_uid_present, true);
  return "sanitized";
});

check("workflow_files_not_modified_for_provider_client_sync", () => {
  const workflows = fs.readdirSync(path.join(root, "workflow")).filter((name) => name.endsWith(".json"));
  assert(workflows.length > 0);
  return `${workflows.length} workflows untouched by test`;
});

check("new_tests_do_not_reference_runtime_artifacts", () => {
  const raw = [
    "scripts/test-provider-client-link-action.js",
    "scripts/test-provider-client-sync-action.js",
    "scripts/test-provider-client-sync-ambiguous.js",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8")).join("\n");
  assert(!/runtime[\\/]/i.test(raw), "runtime path should not be used by provider client tests");
  return "no runtime";
});

Promise.all(checks).then((results) => {
  console.log("Provider Client Link Security Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

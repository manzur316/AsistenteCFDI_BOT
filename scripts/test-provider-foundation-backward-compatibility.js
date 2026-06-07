const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { listSandboxActions } = require("./lib/sandbox-action-runner");
const { getProviderCapabilities } = require("./lib/provider-capabilities-registry");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = path.join(root, "data", "concepts.normalized.json");
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

check("existing_sandbox_actions_remain_allowlisted", () => {
  const actions = listSandboxActions();
  for (const action of [
    "sandbox.draft.stamp",
    "sandbox.draft.download-artifacts",
    "sandbox.facturacom.config.diagnose",
  ]) {
    assert(actions.includes(action), `${action} missing`);
  }
  return actions.length;
});

check("factura_com_sandbox_current_provider_still_registered", () => {
  const capabilities = getProviderCapabilities("factura_com", "SANDBOX");
  assert(capabilities);
  assert.strictEqual(capabilities.supports_invoice_stamp, true);
  assert.strictEqual(capabilities.supports_download_xml, true);
  assert.strictEqual(capabilities.supports_download_pdf, true);
  return "factura_com";
});

check("facturapi_is_capability_ready_not_implemented", () => {
  const capabilities = getProviderCapabilities("facturapi", "TEST");
  assert(capabilities);
  assert.strictEqual(capabilities.supports_multi_org, true);
  const allTrackedText = fs.readFileSync(path.join(root, "scripts", "lib", "provider-capabilities-registry.js"), "utf8");
  assert(!/class\s+Facturapi|facturapiRequest|FACTURAPI_API_KEY/i.test(allTrackedText), "Facturapi implementation leaked into foundation");
  return "capability-only";
});

check("workflow_has_no_pac_credentials_or_file_sends", () => {
  const text = fs.readFileSync(workflowPath, "utf8");
  assert(!/FACTURACOM_API_KEY\s*=|FACTURACOM_SECRET_KEY\s*=|FACTURACOM_PLUGIN\s*=|FACTURAPI_API_KEY/i.test(text), "workflow credential assignment found");
  assert(!/sendDocument|sendMediaGroup/i.test(text), "Telegram file send found");
  assert(!/stampProduction|https:\/\/api\.factura\.com/i.test(text), "production reference found");
  return "workflow safe";
});

check("catalog_was_not_modified", () => {
  assert(fs.existsSync(catalogPath));
  const diff = require("child_process").spawnSync("git", ["diff", "--name-only", "--", "data/concepts.normalized.json"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.strictEqual(diff.status, 0);
  assert.strictEqual(diff.stdout.trim(), "");
  return "catalog unchanged";
});

console.log("Provider Foundation Backward Compatibility Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

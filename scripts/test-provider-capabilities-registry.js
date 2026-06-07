const assert = require("assert");

const {
  assertProviderSupports,
  getProviderCapabilities,
  listSupportedProviders,
  validateProviderCapabilitiesRegistry,
} = require("./lib/provider-capabilities-registry");

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

check("registry_contract_validates", () => {
  const validation = validateProviderCapabilitiesRegistry();
  assert.strictEqual(validation.ok, true, validation.errors.join("; "));
  return "valid";
});

check("supported_providers_are_factura_com_and_facturapi", () => {
  const providers = listSupportedProviders().sort();
  assert.deepStrictEqual(providers, ["factura_com", "facturapi"]);
  return providers.join(",");
});

check("factura_com_sandbox_capabilities_match_current_provider", () => {
  const capabilities = getProviderCapabilities("factura_com", "SANDBOX");
  assert(capabilities);
  assert.strictEqual(capabilities.supports_clients, true);
  assert.strictEqual(capabilities.supports_client_create, true);
  assert.strictEqual(capabilities.supports_invoice_stamp, true);
  assert.strictEqual(capabilities.supports_download_xml, true);
  assert.strictEqual(capabilities.supports_download_pdf, true);
  assert.strictEqual(capabilities.supports_partner_clients, true);
  assert.strictEqual(capabilities.supports_payment_status, false);
  assert.strictEqual(capabilities.supports_webhooks, false);
  assert.strictEqual(capabilities.supports_multi_org, false);
  return "factura_com/SANDBOX";
});

check("facturapi_test_capabilities_are_saas_ready", () => {
  const capabilities = getProviderCapabilities("facturapi", "TEST");
  assert(capabilities);
  assert.strictEqual(capabilities.supports_clients, true);
  assert.strictEqual(capabilities.supports_client_validation, true);
  assert.strictEqual(capabilities.supports_client_edit_link, true);
  assert.strictEqual(capabilities.supports_invoice_draft, true);
  assert.strictEqual(capabilities.supports_invoice_stamp, true);
  assert.strictEqual(capabilities.supports_download_zip, true);
  assert.strictEqual(capabilities.supports_payment_status, true);
  assert.strictEqual(capabilities.supports_payment_complement, true);
  assert.strictEqual(capabilities.supports_multi_org, true);
  assert.strictEqual(capabilities.supports_webhooks, true);
  assert.strictEqual(capabilities.supports_self_invoice, true);
  assert.strictEqual(capabilities.supports_stripe_app, true);
  return "facturapi/TEST";
});

check("assert_provider_supports_works", () => {
  assert.strictEqual(assertProviderSupports("facturapi", "supports_webhooks", "TEST").ok, true);
  assert.strictEqual(assertProviderSupports("factura_com", "supports_webhooks", "SANDBOX").ok, false);
  assert.strictEqual(assertProviderSupports("factura_com", "supports_download_pdf", "SANDBOX").ok, true);
  return "supports";
});

console.log("Provider Capabilities Registry Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

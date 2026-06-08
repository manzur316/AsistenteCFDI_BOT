const assert = require("assert");

const {
  getProviderCapabilities,
  validateProviderCapabilitiesRegistry,
} = require("./lib/provider-capabilities-registry");
const { DOCUMENT_DELIVERY_CHANNELS } = require("./lib/document-delivery/canonical-document-delivery-contract");

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

check("provider_capabilities_registry_still_valid", () => {
  const result = validateProviderCapabilitiesRegistry();
  assert.strictEqual(result.ok, true);
  return "valid";
});

check("facturacom_sandbox_supports_provider_email_delivery", () => {
  const capabilities = getProviderCapabilities("factura_com", "SANDBOX");
  assert.strictEqual(capabilities.document_delivery.provider_email, true);
  assert.strictEqual(capabilities.document_delivery.smtp_future_optional, false);
  return DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL;
});

check("facturapi_future_capability_is_declared_without_adapter", () => {
  const capabilities = getProviderCapabilities("facturapi", "TEST");
  assert.strictEqual(capabilities.document_delivery.provider_email, true);
  assert.strictEqual(capabilities.document_delivery.telegram_document_channel, false);
  return "facturapi";
});

console.log("Provider Email Delivery Contract Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

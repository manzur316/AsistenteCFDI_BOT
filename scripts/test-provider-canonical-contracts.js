const assert = require("assert");

const {
  PROVIDER_ENVIRONMENTS,
  PROVIDERS,
  assertCanonicalProviderAccount,
  assertCanonicalProviderCapabilities,
  assertCanonicalProviderClient,
  assertCanonicalProviderInvoice,
  assertCanonicalProviderPaymentState,
  assertCanonicalProviderWebhookEvent,
  buildCapabilities,
  buildCanonicalProviderAccount,
  buildCanonicalProviderClient,
  buildCanonicalProviderInvoice,
  buildCanonicalProviderPaymentState,
  buildCanonicalProviderWebhookEvent,
  normalizeProviderEnvironment,
  normalizeProviderName,
} = require("./lib/provider-contracts/provider-contract-index");

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

function capabilities(provider = PROVIDERS.FACTURA_COM, environment = PROVIDER_ENVIRONMENTS.SANDBOX) {
  return buildCapabilities({
    provider,
    environment,
    supports_clients: true,
    supports_client_create: true,
    supports_client_update: true,
    supports_client_delete: true,
    supports_client_validation: false,
    supports_client_edit_link: false,
    supports_products: true,
    supports_invoice_create: true,
    supports_invoice_draft: false,
    supports_invoice_stamp: true,
    supports_invoice_list: true,
    supports_invoice_get: true,
    supports_invoice_cancel: true,
    supports_cancel_status: true,
    supports_download_xml: true,
    supports_download_pdf: true,
    supports_download_zip: false,
    supports_payment_status: false,
    supports_payment_complement: false,
    supports_multi_org: false,
    supports_webhooks: false,
    supports_self_invoice: false,
    supports_stripe_app: false,
    supports_partner_clients: true,
  });
}

check("provider_names_and_environments_normalize", () => {
  assert.strictEqual(normalizeProviderName("Factura.com"), "factura_com");
  assert.strictEqual(normalizeProviderName("facturapi"), "facturapi");
  assert.strictEqual(normalizeProviderEnvironment("Factura_Com_Sandbox"), "SANDBOX");
  assert.strictEqual(normalizeProviderEnvironment("facturapi_test"), "TEST");
  assert.strictEqual(normalizeProviderEnvironment("LIVE"), "LIVE");
  assert.strictEqual(normalizeProviderEnvironment("PRODUCTION"), "PRODUCTION");
  return "normalized";
});

check("capabilities_contract_validates", () => {
  const validation = assertCanonicalProviderCapabilities(capabilities());
  assert.strictEqual(validation.ok, true, validation.errors.join("; "));
  return "CanonicalProviderCapabilities";
});

check("account_contract_validates", () => {
  const account = buildCanonicalProviderAccount({
    provider: "factura_com",
    environment: "SANDBOX",
    tenant_id: "TENANT_PERSONAL_DEFAULT",
    provider_account_id: "PACC-1",
    auth_type: "api_key",
    credentials_ref: "local-secret-ref",
    status: "ACTIVE",
    capabilities: capabilities(),
  });
  const validation = assertCanonicalProviderAccount(account);
  assert.strictEqual(validation.ok, true, validation.errors.join("; "));
  return "CanonicalProviderAccount";
});

check("client_contract_supports_provider_ids", () => {
  const client = buildCanonicalProviderClient({
    local_client_id: "CLIENT-1",
    provider: "factura_com",
    environment: "SANDBOX",
    provider_client_uid: "UID-PRESENT-BUT-NOT-SECRET",
    legal_name: "Cliente Demo",
    fiscal_zip: "77723",
    fiscal_regime: "601",
    cfdi_use: "G03",
    sync_status: "SYNCED",
    sat_validated: true,
    raw_provider_response_sanitized: {},
  });
  const validation = assertCanonicalProviderClient(client);
  assert.strictEqual(validation.ok, true, validation.errors.join("; "));
  return client.provider_client_uid;
});

check("invoice_contract_supports_provider_identity_and_payment_statuses", () => {
  const invoice = buildCanonicalProviderInvoice({
    local_draft_id: "DRAFT-1",
    local_invoice_id: "INV-1",
    provider: "facturapi",
    environment: "TEST",
    provider_invoice_id: "PROV-INV-1",
    provider_invoice_uid: "PROV-UID-1",
    uuid: "00000000-0000-4000-8000-000000000001",
    subtotal: 100,
    total: 116,
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status_provider: "unpaid",
    payment_status_local: "UNPAID",
    xml_available: true,
    pdf_available: true,
    raw_provider_response_sanitized: {},
  });
  const validation = assertCanonicalProviderInvoice(invoice);
  assert.strictEqual(validation.ok, true, validation.errors.join("; "));
  assert.strictEqual(invoice.payment_status_provider, "unpaid");
  assert.strictEqual(invoice.payment_status_local, "UNPAID");
  return "CanonicalProviderInvoice";
});

check("payment_and_webhook_contracts_validate", () => {
  const payment = buildCanonicalProviderPaymentState({
    local_invoice_id: "INV-1",
    provider: "facturapi",
    environment: "TEST",
    provider_invoice_id: "PROV-INV-1",
    payment_status_local: "UNPAID",
    payment_status_provider: "unpaid",
    paid_amount: 0,
    remaining_amount: 116,
    complement_required: false,
  });
  const event = buildCanonicalProviderWebhookEvent({
    event_id: "EVT-1",
    provider: "facturapi",
    environment: "TEST",
    event_type: "invoice.updated",
    payload_sanitized: {},
  });
  assert.strictEqual(assertCanonicalProviderPaymentState(payment).ok, true);
  assert.strictEqual(assertCanonicalProviderWebhookEvent(event).ok, true);
  return "payment+webhook";
});

check("contracts_reject_missing_provider_environment", () => {
  const badClient = buildCanonicalProviderClient({
    local_client_id: "CLIENT-1",
    provider_client_id: "PCLIENT-1",
    sync_status: "SYNCED",
    raw_provider_response_sanitized: {},
  });
  const validation = assertCanonicalProviderClient(badClient);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("provider requerido"));
  assert(validation.errors.includes("environment requerido"));
  return "rejected";
});

console.log("Provider Canonical Contracts Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

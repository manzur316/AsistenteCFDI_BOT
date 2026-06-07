const {
  PROVIDER_ENVIRONMENTS,
  PROVIDERS,
  assertCanonicalProviderCapabilities,
  buildCapabilities,
  normalizeProviderEnvironment,
  normalizeProviderName,
} = require("./provider-contracts/provider-contract-index");

const REGISTRY = Object.freeze({
  [PROVIDERS.FACTURA_COM]: {
    [PROVIDER_ENVIRONMENTS.SANDBOX]: buildCapabilities({
      provider: PROVIDERS.FACTURA_COM,
      environment: PROVIDER_ENVIRONMENTS.SANDBOX,
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
    }),
    [PROVIDER_ENVIRONMENTS.PRODUCTION]: buildCapabilities({
      provider: PROVIDERS.FACTURA_COM,
      environment: PROVIDER_ENVIRONMENTS.PRODUCTION,
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
    }),
  },
  [PROVIDERS.FACTURAPI]: {
    [PROVIDER_ENVIRONMENTS.TEST]: buildCapabilities({
      provider: PROVIDERS.FACTURAPI,
      environment: PROVIDER_ENVIRONMENTS.TEST,
      supports_clients: true,
      supports_client_create: true,
      supports_client_update: true,
      supports_client_delete: true,
      supports_client_validation: true,
      supports_client_edit_link: true,
      supports_products: true,
      supports_invoice_create: true,
      supports_invoice_draft: true,
      supports_invoice_stamp: true,
      supports_invoice_list: true,
      supports_invoice_get: true,
      supports_invoice_cancel: true,
      supports_cancel_status: true,
      supports_download_xml: true,
      supports_download_pdf: true,
      supports_download_zip: true,
      supports_payment_status: true,
      supports_payment_complement: true,
      supports_multi_org: true,
      supports_webhooks: true,
      supports_self_invoice: true,
      supports_stripe_app: true,
      supports_partner_clients: false,
    }),
    [PROVIDER_ENVIRONMENTS.LIVE]: buildCapabilities({
      provider: PROVIDERS.FACTURAPI,
      environment: PROVIDER_ENVIRONMENTS.LIVE,
      supports_clients: true,
      supports_client_create: true,
      supports_client_update: true,
      supports_client_delete: true,
      supports_client_validation: true,
      supports_client_edit_link: true,
      supports_products: true,
      supports_invoice_create: true,
      supports_invoice_draft: true,
      supports_invoice_stamp: true,
      supports_invoice_list: true,
      supports_invoice_get: true,
      supports_invoice_cancel: true,
      supports_cancel_status: true,
      supports_download_xml: true,
      supports_download_pdf: true,
      supports_download_zip: true,
      supports_payment_status: true,
      supports_payment_complement: true,
      supports_multi_org: true,
      supports_webhooks: true,
      supports_self_invoice: true,
      supports_stripe_app: true,
      supports_partner_clients: false,
    }),
  },
});

function getProviderCapabilities(provider, environment) {
  const normalizedProvider = normalizeProviderName(provider);
  const normalizedEnvironment = normalizeProviderEnvironment(environment);
  const capabilities = REGISTRY[normalizedProvider]?.[normalizedEnvironment] || null;
  if (!capabilities) return null;
  return { ...capabilities };
}

function assertProviderSupports(provider, capability, environment = null) {
  const normalizedProvider = normalizeProviderName(provider);
  const environments = environment
    ? [normalizeProviderEnvironment(environment)]
    : Object.keys(REGISTRY[normalizedProvider] || {});
  const found = environments
    .map((env) => getProviderCapabilities(normalizedProvider, env))
    .filter(Boolean)
    .some((capabilities) => capabilities[capability] === true);
  return {
    ok: found,
    provider: normalizedProvider,
    capability,
    environment: environment ? normalizeProviderEnvironment(environment) : null,
    error: found ? null : "PROVIDER_CAPABILITY_NOT_SUPPORTED",
  };
}

function listSupportedProviders() {
  return Object.keys(REGISTRY);
}

function validateProviderCapabilitiesRegistry() {
  const errors = [];
  for (const [provider, environments] of Object.entries(REGISTRY)) {
    for (const [environment, capabilities] of Object.entries(environments)) {
      const validation = assertCanonicalProviderCapabilities(capabilities);
      if (!validation.ok) errors.push(`${provider}.${environment}: ${validation.errors.join("; ")}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  REGISTRY,
  assertProviderSupports,
  getProviderCapabilities,
  listSupportedProviders,
  validateProviderCapabilitiesRegistry,
};

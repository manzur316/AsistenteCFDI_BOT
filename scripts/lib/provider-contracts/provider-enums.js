const PROVIDERS = Object.freeze({
  FACTURA_COM: "factura_com",
  FACTURAPI: "facturapi",
});

const PROVIDER_ENVIRONMENTS = Object.freeze({
  SANDBOX: "SANDBOX",
  TEST: "TEST",
  LIVE: "LIVE",
  PRODUCTION: "PRODUCTION",
});

const PROVIDER_STATUSES = Object.freeze({
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  DISABLED: "DISABLED",
  NEEDS_CONFIG: "NEEDS_CONFIG",
  ERROR: "ERROR",
});

const PROVIDER_SYNC_STATUSES = Object.freeze({
  NEEDS_SYNC: "NEEDS_SYNC",
  SYNCED: "SYNCED",
  ERROR: "ERROR",
  MANUAL_REVIEW: "MANUAL_REVIEW",
});

function values(object) {
  return Object.values(object);
}

function normalizeProviderName(value) {
  const text = String(value || "").trim().toLowerCase().replace(/[-\s.]+/g, "_");
  if (["factura_com", "facturacom", "factura"].includes(text)) return PROVIDERS.FACTURA_COM;
  if (["facturapi", "factura_api"].includes(text)) return PROVIDERS.FACTURAPI;
  return "";
}

function normalizeProviderEnvironment(value) {
  const text = String(value || "").trim().toUpperCase();
  if (text === "FACTURA_COM_SANDBOX") return PROVIDER_ENVIRONMENTS.SANDBOX;
  if (text === "FACTURAPI_TEST") return PROVIDER_ENVIRONMENTS.TEST;
  if (values(PROVIDER_ENVIRONMENTS).includes(text)) return text;
  return "";
}

function isKnownProvider(value) {
  return values(PROVIDERS).includes(normalizeProviderName(value));
}

function isKnownProviderEnvironment(value) {
  return values(PROVIDER_ENVIRONMENTS).includes(normalizeProviderEnvironment(value));
}

module.exports = {
  PROVIDERS,
  PROVIDER_ENVIRONMENTS,
  PROVIDER_STATUSES,
  PROVIDER_SYNC_STATUSES,
  isKnownProvider,
  isKnownProviderEnvironment,
  normalizeProviderEnvironment,
  normalizeProviderName,
};

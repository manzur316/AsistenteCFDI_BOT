const PAC_ADAPTER_METHODS = Object.freeze([
  "createDraftPayload",
  "validatePayload",
  "stampSandbox",
  "downloadXml",
  "downloadPdf",
  "getStatus",
  "normalizeError",
]);

const PAC_ENVIRONMENTS = Object.freeze({
  SANDBOX: "SANDBOX",
  PRODUCTION: "PRODUCTION",
});

class PacAdapterContractError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "PacAdapterContractError";
    this.code = details.code || "PAC_ADAPTER_CONTRACT_ERROR";
    this.details = details;
  }
}

function methodNameList(adapter) {
  return PAC_ADAPTER_METHODS.filter((method) => typeof adapter?.[method] === "function");
}

function assertPacAdapter(adapter, options = {}) {
  const adapterName = options.adapterName || adapter?.adapterName || "PAC_ADAPTER";
  const missing = PAC_ADAPTER_METHODS.filter((method) => typeof adapter?.[method] !== "function");
  if (missing.length > 0) {
    throw new PacAdapterContractError(`Adapter ${adapterName} no cumple el contrato PAC.`, {
      adapterName,
      missing_methods: missing,
    });
  }
  return {
    ok: true,
    adapterName,
    methods: methodNameList(adapter),
  };
}

function normalizeGenericPacError(error, defaults = {}) {
  const original = error || {};
  const response = original.response || {};
  const data = response.data || original.data || null;
  return {
    ok: false,
    provider: defaults.provider || "UNKNOWN_PAC",
    environment: defaults.environment || PAC_ENVIRONMENTS.SANDBOX,
    code: original.code || response.statusText || defaults.code || "PAC_ERROR",
    message: original.message || defaults.message || "Error de PAC.",
    http_status: response.status || original.status || null,
    retryable: Boolean(defaults.retryable),
    raw: data,
  };
}

module.exports = {
  PAC_ADAPTER_METHODS,
  PAC_ENVIRONMENTS,
  PacAdapterContractError,
  assertPacAdapter,
  methodNameList,
  normalizeGenericPacError,
};

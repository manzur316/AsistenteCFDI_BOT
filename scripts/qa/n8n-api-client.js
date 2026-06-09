const { sanitizeString } = require("./sanitize-report");

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function envConfig(env = process.env) {
  return {
    baseUrl: env.N8N_BASE_URL || "http://localhost:5678/api/v1",
    apiKey: env.N8N_API_KEY || "",
    allowRemote: env.QA_ALLOW_REMOTE_N8N === "1",
  };
}

function assertN8nApiConfig(config) {
  if (!config.apiKey) {
    const error = new Error("NEEDS_CONFIG: N8N_API_KEY no configurado.");
    error.code = "NEEDS_CONFIG";
    throw error;
  }
  const url = new URL(config.baseUrl || "http://localhost:5678/api/v1");
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!localHosts.has(url.hostname) && config.allowRemote !== true) {
    const error = new Error("NEEDS_CONFIG: N8N_BASE_URL debe ser local o usar QA_ALLOW_REMOTE_N8N=1.");
    error.code = "NEEDS_CONFIG";
    throw error;
  }
}

function createN8nApiClient(options = {}) {
  const config = {
    ...envConfig(options.env || process.env),
    ...options,
  };
  config.baseUrl = trimTrailingSlash(config.baseUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible en este runtime Node.");

  async function request(path, query = {}) {
    assertN8nApiConfig(config);
    const url = new URL(config.baseUrl + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, {
      method: "GET",
      headers: {
        "X-N8N-API-KEY": config.apiKey,
        Accept: "application/json",
      },
    });
    const bodyText = await response.text();
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch (_error) {
      body = { raw: sanitizeString(bodyText).slice(0, 1000) };
    }
    if (!response.ok) {
      const error = new Error(`N8N_API_HTTP_ERROR:${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  return {
    config: { baseUrl: config.baseUrl, apiKeyPresent: Boolean(config.apiKey), allowRemote: config.allowRemote === true },
    listExecutions: ({ limit = 20 } = {}) => request("/executions", { limit }),
    getExecution: ({ executionId, includeData = true }) => request(`/executions/${encodeURIComponent(String(executionId))}`, { includeData: includeData ? "true" : "false" }),
    listWorkflows: () => request("/workflows"),
    getWorkflow: ({ workflowId }) => request(`/workflows/${encodeURIComponent(String(workflowId))}`),
  };
}

module.exports = {
  assertN8nApiConfig,
  createN8nApiClient,
  envConfig,
};

const { sanitizeString } = require("./sanitize-report");

const WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API = "WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API";
const MULTIPLE_WORKFLOWS_MATCH = "MULTIPLE_WORKFLOWS_MATCH";
const WORKFLOW_NOT_FOUND = "WORKFLOW_NOT_FOUND";

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseBool(value) {
  return value === true || value === "1" || value === 1 || String(value || "").toLowerCase() === "true";
}

function normalizeListWorkflowsArgs(arg) {
  return arg && typeof arg === "object" && !Array.isArray(arg) ? arg : {};
}

function normalizeWorkflowRef(arg) {
  if (arg && typeof arg === "object" && !Array.isArray(arg)) {
    return arg.workflowId || arg.workflow_id || arg.id;
  }
  return arg;
}

function normalizeUpdateWorkflowArgs(first, second) {
  if (first && typeof first === "object" && !Array.isArray(first)) {
    return {
      workflowId: normalizeWorkflowRef(first),
      workflow: first.workflow || first.body || first.payload,
    };
  }
  return {
    workflowId: first,
    workflow: second,
  };
}

function coerceWorkflowNameErrorPayload(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.results)) return payload.results;
  return Array.isArray(payload) ? payload : [];
}

function getSingleWorkflowByNamePayloads(payload, expectedName) {
  const workflows = coerceWorkflowNameErrorPayload(payload);
  const normalizedTarget = String(expectedName || "").trim();
  const matches = workflows.filter((workflow) => String(workflow?.name || "").trim() === normalizedTarget);
  if (matches.length > 1) {
    const error = new Error(`MULTIPLE_WORKFLOWS_MATCH: ${normalizedTarget} (${matches.length})`);
    error.code = MULTIPLE_WORKFLOWS_MATCH;
    error.name = normalizedTarget;
    error.matches = matches.length;
    throw error;
  }
  return matches[0] || null;
}

function maybeMapUnsupportedApiError(error, method) {
  const status = Number(error?.status);
  if ([404, 405, 501].includes(status)) {
    const wrapped = new Error(`${WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API}: ${method}`);
    wrapped.code = WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API;
    wrapped.status = status;
    wrapped.method = method;
    wrapped.innerError = error;
    return wrapped;
  }
  return error;
}

function envConfig(env = process.env) {
  return {
    baseUrl: env.N8N_BASE_URL || "http://localhost:5678/api/v1",
    apiKey: env.N8N_API_KEY || "",
    allowRemote: parseBool(env.QA_ALLOW_REMOTE_N8N) || parseBool(env.ALLOW_REMOTE_N8N),
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
    const error = new Error("REMOTE_N8N_BLOCKED_BY_DEFAULT: N8N_BASE_URL debe ser local o usar --allow-remote-n8n=1.");
    error.code = "REMOTE_N8N_BLOCKED_BY_DEFAULT";
    throw error;
  }
}

function normalizeRequestMethod(method) {
  return String(method || "GET").toUpperCase();
}

function createN8nApiClient(options = {}) {
  const config = {
    ...envConfig(options.env || process.env),
    ...options,
  };
  config.baseUrl = trimTrailingSlash(config.baseUrl);
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible en este runtime Node.");

  async function request(path, options = {}) {
    const method = normalizeRequestMethod(options.method);
    const query = options.query || {};
    assertN8nApiConfig(config);
    const url = new URL(config.baseUrl + path);
    for (const [key, value] of Object.entries(query || {})) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
    const response = await fetchImpl(url, {
      method,
      headers: {
        "X-N8N-API-KEY": config.apiKey,
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(options.body !== undefined ? { body: typeof options.body === "string" ? options.body : JSON.stringify(options.body) } : {}),
    });
    const bodyText = await response.text();
    let bodyParsed = null;
    try {
      bodyParsed = bodyText ? JSON.parse(bodyText) : null;
    } catch (_error) {
      bodyParsed = { raw: sanitizeString(bodyText).slice(0, 1000) };
    }
    if (!response.ok) {
      const error = new Error(`N8N_API_HTTP_ERROR:${response.status}`);
      error.status = response.status;
      error.body = bodyParsed;
      throw error;
    }
    return bodyParsed;
  }

  return {
    config: {
      baseUrl: config.baseUrl,
      apiKeyPresent: Boolean(config.apiKey),
      allowRemote: config.allowRemote === true,
      webhookUrl: config.webhookUrl || "",
    },
    listExecutions: ({ limit = 20 } = {}) => request("/executions", { query: { limit } }),
    getExecution: ({ executionId, includeData = true }) => request(`/executions/${encodeURIComponent(String(executionId))}`, {
      query: { includeData: includeData ? "true" : "false" },
    }),
    listWorkflows: (options = {}) => request("/workflows", {
      query: {
        limit: normalizeListWorkflowsArgs(options).limit ?? 200,
        ...normalizeListWorkflowsArgs(options),
      },
    }).catch((error) => { throw maybeMapUnsupportedApiError(error, "listWorkflows"); }),
    getWorkflow: (input) => request(`/workflows/${encodeURIComponent(String(normalizeWorkflowRef(input)))}`).catch((error) => { throw maybeMapUnsupportedApiError(error, "getWorkflow"); }),
    findWorkflowByName: async (name) => {
      const workflows = await request("/workflows", { query: { limit: 200 } }).catch((error) => { throw maybeMapUnsupportedApiError(error, "findWorkflowByName"); });
      const found = getSingleWorkflowByNamePayloads(workflows, name);
      if (!found) {
        const error = new Error(`WORKFLOW_NOT_FOUND: ${String(name || "").trim()}`);
        error.code = WORKFLOW_NOT_FOUND;
        throw error;
      }
      return found;
    },
    createWorkflow: ({ workflow }) => request("/workflows", { method: "POST", body: workflow }),
    updateWorkflow: (input, body) => {
      const args = normalizeUpdateWorkflowArgs(input, body);
      return request(`/workflows/${encodeURIComponent(String(args.workflowId))}`, {
        method: "PUT",
        body: args.workflow,
      }).catch((error) => { throw maybeMapUnsupportedApiError(error, "updateWorkflow"); });
    },
    activateWorkflow: (input) => {
      const workflowId = normalizeWorkflowRef(input);
      return request(`/workflows/${encodeURIComponent(String(workflowId))}/activate`, { method: "POST" })
        .catch((error) => { throw maybeMapUnsupportedApiError(error, "activateWorkflow"); });
    },
    deactivateWorkflow: (input) => {
      const workflowId = normalizeWorkflowRef(input);
      return request(`/workflows/${encodeURIComponent(String(workflowId))}/deactivate`, { method: "POST" })
        .catch((error) => { throw maybeMapUnsupportedApiError(error, "deactivateWorkflow"); });
    },
  };
}

module.exports = {
  WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API,
  WORKFLOW_NOT_FOUND,
  MULTIPLE_WORKFLOWS_MATCH,
  assertN8nApiConfig,
  createN8nApiClient,
  envConfig,
};

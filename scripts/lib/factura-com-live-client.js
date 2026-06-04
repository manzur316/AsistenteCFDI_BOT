const https = require("https");

const SANDBOX_HOST = "sandbox.factura.com";
const PRODUCTION_HOST = "api.factura.com";
const DEFAULT_TIMEOUT_MS = 30000;

class FacturaComLiveClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "FacturaComLiveClientError";
    this.code = details.code || "FACTURA_COM_LIVE_CLIENT_ERROR";
    this.details = details;
  }
}

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function fail(message, code, details = {}) {
  throw new FacturaComLiveClientError(message, { code, ...details });
}

function parseUrl(value, field = "FACTURACOM_BASE_URL") {
  const raw = text(value);
  if (!raw) fail(`${field} requerido`, "FACTURA_COM_BASE_URL_REQUIRED", { field });
  try {
    return new URL(raw);
  } catch (_error) {
    fail(`${field} invalido`, "FACTURA_COM_BASE_URL_INVALID", { field });
  }
}

function envValue(env = {}, names = []) {
  for (const name of names) {
    const value = text(env[name]);
    if (value) return value;
  }
  return null;
}

function isPlaceholder(value) {
  return /^(REEMPLAZAR|CHANGE|PLACEHOLDER|LOCAL_ONLY|TEST_)/i.test(String(value || ""));
}

function assertRealValue(value, field) {
  const cleaned = text(value);
  if (!cleaned || isPlaceholder(cleaned)) {
    fail(`${field} requerido para smoke sandbox live`, "FACTURA_COM_ENV_REQUIRED", { field });
  }
  return cleaned;
}

function assertSandboxBaseUrl(baseUrl) {
  const parsed = parseUrl(baseUrl);
  if (parsed.protocol !== "https:") {
    fail("FACTURACOM_BASE_URL debe usar https", "FACTURA_COM_BASE_URL_NOT_HTTPS", { host: parsed.host });
  }
  if (parsed.hostname === PRODUCTION_HOST) {
    fail("Produccion Factura.com bloqueada", "FACTURA_COM_PRODUCTION_BLOCKED", { host: parsed.hostname });
  }
  if (parsed.hostname !== SANDBOX_HOST) {
    fail("FACTURACOM_BASE_URL debe apuntar a sandbox.factura.com", "FACTURA_COM_SANDBOX_REQUIRED", { host: parsed.hostname });
  }
  return parsed;
}

function assertFacturaComSandboxEnv(env = {}) {
  if (String(env.FACTURACOM_SANDBOX_LIVE || "") !== "1") {
    fail("FACTURACOM_SANDBOX_LIVE distinto de 1", "FACTURA_COM_LIVE_DISABLED");
  }
  const baseUrl = envValue(env, ["FACTURACOM_BASE_URL", "FACTURACOM_SANDBOX_BASE_URL"]);
  const parsedBaseUrl = assertSandboxBaseUrl(baseUrl);
  const apiKey = assertRealValue(envValue(env, ["FACTURACOM_API_KEY", "FACTURACOM_SANDBOX_API_KEY"]), "FACTURACOM_API_KEY");
  const secretKey = assertRealValue(envValue(env, ["FACTURACOM_SECRET_KEY", "FACTURACOM_SANDBOX_SECRET_KEY"]), "FACTURACOM_SECRET_KEY");
  const plugin = assertRealValue(envValue(env, ["FACTURACOM_PLUGIN", "FACTURACOM_SANDBOX_PLUGIN"]), "FACTURACOM_PLUGIN");
  const timeoutMs = Number(env.FACTURACOM_SANDBOX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  return {
    live: true,
    baseUrl: parsedBaseUrl.origin + parsedBaseUrl.pathname.replace(/\/+$/, ""),
    apiKey,
    secretKey,
    plugin,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
  };
}

function buildFacturaComHeaders(env = {}) {
  const config = assertFacturaComSandboxEnv(env);
  return {
    "Content-Type": "application/json",
    "F-PLUGIN": config.plugin,
    "F-Api-Key": config.apiKey,
    "F-Secret-Key": config.secretKey,
  };
}

function sensitiveValues(env = {}) {
  return [
    envValue(env, ["FACTURACOM_API_KEY", "FACTURACOM_SANDBOX_API_KEY"]),
    envValue(env, ["FACTURACOM_SECRET_KEY", "FACTURACOM_SANDBOX_SECRET_KEY"]),
    envValue(env, ["FACTURACOM_PLUGIN", "FACTURACOM_SANDBOX_PLUGIN"]),
  ].filter(Boolean);
}

function redactString(value, env = {}) {
  let output = String(value);
  for (const secret of sensitiveValues(env)) {
    if (!secret) continue;
    output = output.split(secret).join("[REDACTED_FACTURACOM_SECRET]");
  }
  output = output.replace(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[REDACTED_RFC]");
  output = output.replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]");
  output = output.replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]");
  return output;
}

function compactString(value, env = {}, maxLength = 280) {
  const cleaned = redactString(value, env)
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  if (/^<\?xml|^<cfdi:|^<[^>]+>/i.test(cleaned)) return `[REDACTED_XML_TEXT len=${cleaned.length}]`;
  if (/^%PDF/i.test(cleaned)) return `[REDACTED_PDF_TEXT len=${cleaned.length}]`;
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength)}...` : cleaned;
}

function sanitizeValue(value, env = {}) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, env);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Buffer.isBuffer(value)) return "[REDACTED_BINARY]";
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item, env));
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(key)) {
        out[key] = "[REDACTED]";
      } else if (/rfc/i.test(key)) {
        out[key] = "[REDACTED_RFC]";
      } else {
        out[key] = sanitizeValue(item, env);
      }
    }
    return out;
  }
  return null;
}

function sanitizeFacturaComResponse(response = {}, env = {}) {
  return sanitizeValue(response, env);
}

function sanitizeFacturaComError(error = {}, env = {}) {
  const source = error instanceof Error ? {
    name: error.name,
    code: error.code,
    message: error.message,
    details: error.details,
    response: error.response,
  } : error;
  return sanitizeValue(source, env);
}

function normalizeResponseHeaders(headers = {}, env = {}) {
  const out = {};
  if (headers && typeof headers.forEach === "function") {
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = sanitizeValue(value, env);
    });
    return out;
  }
  for (const [key, value] of Object.entries(headers || {})) {
    out[String(key).toLowerCase()] = sanitizeValue(Array.isArray(value) ? value.join(", ") : value, env);
  }
  return out;
}

function semanticStatusValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "success" : "error";
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function nestedObjectCandidates(data) {
  const candidates = [data];
  if (data && typeof data === "object" && !Array.isArray(data)) {
    for (const key of ["data", "Data", "response", "Response", "respuestaapi", "RespuestaApi"]) {
      const value = data[key];
      if (value && typeof value === "object" && !Array.isArray(value)) candidates.push(value);
    }
  }
  return candidates;
}

function extractFacturaComApiStatus(data) {
  for (const candidate of nestedObjectCandidates(data)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const key of ["response", "Response", "status", "Status"]) {
      const value = semanticStatusValue(candidate[key]);
      if (value) return value;
    }
  }
  return null;
}

function summarizeApiField(value, env = {}) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return compactString(value, env);
  }
  try {
    return compactString(JSON.stringify(sanitizeValue(value, env)), env);
  } catch (_error) {
    return "[UNSERIALIZABLE]";
  }
}

function extractFacturaComApiMessage(data) {
  for (const candidate of nestedObjectCandidates(data)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const key of ["message", "Message", "mensaje", "Mensaje", "error", "Error", "errors", "Errors"]) {
      const value = summarizeApiField(candidate[key]);
      if (value) return value;
    }
  }
  return null;
}

function normalizedApiStatus(data) {
  const status = extractFacturaComApiStatus(data);
  return status ? status.trim().toLowerCase() : null;
}

function isFacturaComApiError(data) {
  const status = normalizedApiStatus(data);
  if (!status) return false;
  return /^(error|errores|failed|failure|fail|invalid|false|0)$/i.test(status)
    || /\berror\b/i.test(status);
}

function isFacturaComApiSuccess(data) {
  const status = normalizedApiStatus(data);
  if (!status) return false;
  return /^(success|successful|ok|created|true|1|200|201)$/i.test(status)
    || /\b(success|ok|created)\b/i.test(status);
}

function collectApiErrorFields(data, env = {}) {
  const fields = {};
  for (const candidate of nestedObjectCandidates(data)) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    for (const key of ["response", "Response", "status", "Status", "message", "Message", "mensaje", "Mensaje", "error", "Error", "errors", "Errors"]) {
      if (candidate[key] === undefined) continue;
      const value = summarizeApiField(candidate[key], env);
      if (value !== null) fields[key] = value;
    }
  }
  return fields;
}

function normalizeFacturaComHttpResponse(response = {}, env = {}) {
  const data = sanitizeFacturaComResponse(response.data, env);
  const httpOk = typeof response.http_ok === "boolean" ? response.http_ok : Boolean(response.ok);
  const apiStatus = extractFacturaComApiStatus(data);
  const apiStatusUnknown = !apiStatus;
  const apiOk = isFacturaComApiError(data) ? false : (isFacturaComApiSuccess(data) ? true : null);
  const responseHeaders = sanitizeValue(response.responseHeaders || {}, env);
  return {
    ...response,
    http_ok: httpOk,
    api_ok: apiOk,
    ok: httpOk && apiOk !== false,
    api_status: apiStatus,
    api_status_unknown: apiStatusUnknown,
    api_message_summary: summarizeApiField(extractFacturaComApiMessage(data), env),
    api_error_fields: collectApiErrorFields(data, env),
    status: response.status ?? null,
    statusText: response.statusText ?? null,
    contentType: response.contentType || "",
    responseHeaders,
    location: sanitizeValue(response.location || responseHeaders.location || null, env),
    data,
    rawText: redactString(response.rawText || "", env),
  };
}

async function requestWithFetch({ url, method, headers, body, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const responseHeaders = normalizeResponseHeaders(response.headers);
    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();
    let data = rawText;
    if (contentType.includes("application/json") || /^[\s\r\n]*[{[]/.test(rawText)) {
      try {
        data = JSON.parse(rawText);
      } catch (_error) {
        data = rawText;
      }
    }
    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      contentType,
      responseHeaders,
      location: responseHeaders.location || null,
      data,
      rawText,
    };
  } finally {
    clearTimeout(timer);
  }
}

function requestWithHttps({ url, method, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const payload = body === undefined ? null : JSON.stringify(body);
    const request = https.request({
      method,
      hostname: parsed.hostname,
      port: parsed.port || 443,
      path: `${parsed.pathname}${parsed.search}`,
      headers: payload ? { ...headers, "Content-Length": Buffer.byteLength(payload) } : headers,
      timeout: timeoutMs,
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const rawText = Buffer.concat(chunks).toString("utf8");
        const contentType = response.headers["content-type"] || "";
        const responseHeaders = normalizeResponseHeaders(response.headers);
        let data = rawText;
        if (String(contentType).includes("application/json") || /^[\s\r\n]*[{[]/.test(rawText)) {
          try {
            data = JSON.parse(rawText);
          } catch (_error) {
            data = rawText;
          }
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode,
          statusText: response.statusMessage,
          contentType,
          responseHeaders,
          location: responseHeaders.location || null,
          data,
          rawText,
        });
      });
    });
    request.on("timeout", () => {
      request.destroy(new Error("Factura.com sandbox request timeout"));
    });
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function buildRequestUrl(baseUrl, requestPath) {
  const base = assertSandboxBaseUrl(baseUrl);
  const cleanedPath = text(requestPath);
  if (!cleanedPath || !cleanedPath.startsWith("/")) {
    fail("path debe ser relativo y empezar con /", "FACTURA_COM_REQUEST_PATH_INVALID", { path: requestPath });
  }
  if (/^https?:\/\//i.test(cleanedPath)) {
    fail("path absoluto bloqueado", "FACTURA_COM_ABSOLUTE_PATH_BLOCKED", { path: requestPath });
  }
  return `${base.origin}${base.pathname.replace(/\/+$/, "")}${cleanedPath}`;
}

async function facturaComRequest({ method, path, body, env } = {}) {
  const config = assertFacturaComSandboxEnv(env || {});
  const url = buildRequestUrl(config.baseUrl, path);
  const headers = buildFacturaComHeaders(env);
  const httpMethod = text(method || "GET").toUpperCase();
  const response = typeof fetch === "function"
    ? await requestWithFetch({ url, method: httpMethod, headers, body, timeoutMs: config.timeoutMs })
    : await requestWithHttps({ url, method: httpMethod, headers, body, timeoutMs: config.timeoutMs });
  const normalized = normalizeFacturaComHttpResponse(response, env);

  return {
    ...normalized,
    request: sanitizeValue({ method: httpMethod, url, body }, env),
    responseHeaders: normalized.responseHeaders,
    location: normalized.location,
  };
}

module.exports = {
  FacturaComLiveClientError,
  assertFacturaComSandboxEnv,
  buildFacturaComHeaders,
  extractFacturaComApiMessage,
  extractFacturaComApiStatus,
  facturaComRequest,
  isFacturaComApiError,
  isFacturaComApiSuccess,
  normalizeFacturaComHttpResponse,
  normalizeResponseHeaders,
  sanitizeFacturaComError,
  sanitizeFacturaComResponse,
  sanitizeValue,
};

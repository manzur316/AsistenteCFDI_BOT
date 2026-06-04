const fs = require("fs");
const path = require("path");
const {
  assertFacturaComSandboxEnv,
  classifyFacturaComAuthError,
  facturaComRequest,
  normalizeFacturaComHttpResponse,
  safeApiMessagePreview,
  sanitizeFacturaComError,
  sanitizeValue,
} = require("./lib/factura-com-live-client");

const root = path.resolve(__dirname, "..");
const DEFAULT_RUNTIME_DIR = path.join(root, "runtime", "facturacom-sandbox");
const PREFLIGHT_PATH = "/v1/clients?per_page=1";

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function ensureRuntimeDir(runtimeDir) {
  const resolved = path.resolve(runtimeDir || DEFAULT_RUNTIME_DIR);
  const allowedRoot = path.join(root, "runtime");
  if (!isInside(allowedRoot, resolved)) {
    throw new Error(`Runtime fuera de runtime/: ${resolved}`);
  }
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function writeJson(runtimeDir, fileName, value, env = {}) {
  const resolvedRuntime = ensureRuntimeDir(runtimeDir);
  const target = path.join(resolvedRuntime, fileName);
  if (!isInside(resolvedRuntime, target)) {
    throw new Error(`Salida fuera de runtime sandbox: ${fileName}`);
  }
  fs.writeFileSync(target, `${JSON.stringify(sanitizeValue(value, env), null, 2)}\n`, "utf8");
  return target;
}

function envErrorStatus(error = {}) {
  const code = error.code || error.details?.code || "";
  if (/PRODUCTION|SANDBOX|BASE_URL|ENVIRONMENT/i.test(code)) return "AUTH_ENVIRONMENT_MISMATCH";
  if (/ENV_REQUIRED|LIVE_DISABLED/i.test(code)) return "AUTH_INVALID_KEYS";
  return "AUTH_UNKNOWN_API_ERROR";
}

function buildSyntheticErrorResponse(error, env = {}) {
  const message = safeApiMessagePreview(error?.message || "Factura.com auth preflight failed", env);
  return normalizeFacturaComHttpResponse({
    ok: false,
    http_ok: true,
    status: null,
    statusText: error?.code || "PREFLIGHT_ENV_ERROR",
    data: {
      response: "error",
      message,
    },
  }, env);
}

async function runFacturaComAuthPreflight(env = process.env, options = {}) {
  const runtimeDir = ensureRuntimeDir(env.FACTURACOM_SANDBOX_RUNTIME_PATH || DEFAULT_RUNTIME_DIR);
  if (String(env.FACTURACOM_SANDBOX_LIVE || "") !== "1") {
    return {
      ok: true,
      skipped: true,
      status: "AUTH_SKIPPED_LIVE_DISABLED",
      message: "FACTURACOM_SANDBOX_LIVE distinto de 1",
      response: null,
      artifact_path: null,
    };
  }

  let config;
  try {
    config = assertFacturaComSandboxEnv(env);
  } catch (error) {
    const response = buildSyntheticErrorResponse(error, env);
    const status = envErrorStatus(error);
    const artifactPath = writeJson(runtimeDir, "preflight-auth-response.json", {
      method: "GET",
      path: PREFLIGHT_PATH,
      auth_status: status,
      auth_ok: false,
      response,
      error: sanitizeFacturaComError(error, env),
    }, env);
    return {
      ok: false,
      status,
      message: response.api_message_summary || error.message,
      response,
      artifact_path: artifactPath,
      config: sanitizeValue(config || {}, env),
    };
  }

  const requestFn = options.requestFn || facturaComRequest;
  let response;
  try {
    response = normalizeFacturaComHttpResponse(
      await requestFn({ method: "GET", path: PREFLIGHT_PATH, env }),
      env,
    );
  } catch (error) {
    response = normalizeFacturaComHttpResponse({
      ok: false,
      http_ok: false,
      status: null,
      statusText: error?.code || "PREFLIGHT_HTTP_ERROR",
      data: {
        response: "error",
        message: error?.message || "Factura.com auth preflight HTTP error",
      },
    }, env);
  }

  const auth = classifyFacturaComAuthError(response);
  const artifactPath = writeJson(runtimeDir, "preflight-auth-response.json", {
    method: "GET",
    path: PREFLIGHT_PATH,
    auth_status: auth.status,
    auth_ok: auth.ok,
    response,
  }, env);
  return {
    ok: auth.ok,
    status: auth.status,
    message: auth.message || response.api_message_summary || null,
    response,
    artifact_path: artifactPath,
    config: sanitizeValue({ baseUrl: config.baseUrl, live: config.live }, env),
  };
}

function printPreflightResult(result = {}) {
  console.log("Factura.com auth preflight");
  console.log(`Status: ${result.status || "UNKNOWN"}`);
  console.log(`OK: ${result.ok === true ? "true" : "false"}`);
  console.log(`Message: ${result.message || "none"}`);
  if (result.artifact_path) {
    console.log(`Artifact: ${path.relative(root, result.artifact_path).replace(/\\/g, "/")}`);
  }
}

if (require.main === module) {
  runFacturaComAuthPreflight(process.env)
    .then((result) => {
      printPreflightResult(result);
      if (result.ok === false) process.exit(1);
    })
    .catch((error) => {
      console.error("FACTURACOM_AUTH_PREFLIGHT_ERROR", JSON.stringify(sanitizeFacturaComError(error, process.env), null, 2));
      process.exit(1);
    });
}

module.exports = {
  PREFLIGHT_PATH,
  printPreflightResult,
  runFacturaComAuthPreflight,
};

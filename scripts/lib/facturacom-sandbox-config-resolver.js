const fs = require("fs");
const path = require("path");

const PROVIDER = "factura_com";
const ENVIRONMENT = "SANDBOX";
const SANDBOX_BASE_URL = "https://sandbox.factura.com/api";
const SANDBOX_HOST = "sandbox.factura.com";
const PRODUCTION_HOST = "api.factura.com";

const REPO_ROOT = path.resolve(__dirname, "../..");
const DEFAULT_LOCAL_ENV_PATH = path.join(REPO_ROOT, ".env.pac.sandbox.local");

const FIELD_DEFINITIONS = Object.freeze({
  mode: ["FACTURACOM_SANDBOX_MODE"],
  live: ["FACTURACOM_SANDBOX_LIVE"],
  baseUrl: ["FACTURACOM_BASE_URL", "FACTURACOM_SANDBOX_BASE_URL"],
  apiKey: ["FACTURACOM_API_KEY", "FACTURACOM_SANDBOX_API_KEY"],
  secretKey: ["FACTURACOM_SECRET_KEY", "FACTURACOM_SANDBOX_SECRET_KEY"],
  plugin: ["FACTURACOM_PLUGIN", "FACTURACOM_SANDBOX_PLUGIN"],
  receiverUid: ["FACTURACOM_SANDBOX_RECEIVER_UID"],
  serie: ["FACTURACOM_SANDBOX_SERIE"],
  usoCfdi: ["FACTURACOM_SANDBOX_USO_CFDI"],
  formaPago: ["FACTURACOM_SANDBOX_FORMA_PAGO"],
  metodoPago: ["FACTURACOM_SANDBOX_METODO_PAGO"],
  moneda: ["FACTURACOM_SANDBOX_MONEDA"],
  lugarExpedicion: ["FACTURACOM_SANDBOX_LUGAR_EXPEDICION"],
  tipoDocumento: ["FACTURACOM_SANDBOX_TIPO_DOCUMENTO"],
  emitterRegimen: ["FACTURACOM_SANDBOX_EMITTER_REGIMEN"],
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function parseEnvFile(content = "") {
  const out = {};
  const lines = String(content || "").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[match[1]] = value;
  }
  return out;
}

function loadLocalEnvFile(filePath = DEFAULT_LOCAL_ENV_PATH) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      exists: false,
      values: {},
    };
  }
  return {
    exists: true,
    values: parseEnvFile(fs.readFileSync(filePath, "utf8")),
  };
}

function pickField(processEnv = {}, localEnv = {}, names = []) {
  for (const name of names) {
    const value = text(processEnv[name]);
    if (value) return { value, source: "process.env", name };
  }
  for (const name of names) {
    const value = text(localEnv[name]);
    if (value) return { value, source: ".env.pac.sandbox.local", name };
  }
  return { value: null, source: null, name: names[0] || null };
}

function normalizeBaseUrl(value) {
  const raw = text(value);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "";
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}${pathname}`;
  } catch (_error) {
    return raw.replace(/\/+$/, "");
  }
}

function inspectBaseUrl(value) {
  const raw = text(value);
  if (!raw) {
    return { normalized: null, host: null, isSandbox: false, isProduction: false, valid: false };
  }
  try {
    const parsed = new URL(raw);
    const normalized = normalizeBaseUrl(raw);
    return {
      normalized,
      host: parsed.hostname,
      isSandbox: parsed.protocol === "https:" && parsed.hostname === SANDBOX_HOST && normalized === SANDBOX_BASE_URL,
      isProduction: parsed.hostname === PRODUCTION_HOST,
      valid: true,
    };
  } catch (_error) {
    return {
      normalized: raw.replace(/\/+$/, ""),
      host: null,
      isSandbox: false,
      isProduction: /api\.factura\.com/i.test(raw),
      valid: false,
    };
  }
}

function sourceSummary(sources = []) {
  const unique = [...new Set(sources.filter(Boolean))];
  if (unique.length === 0) return "missing";
  if (unique.length === 1) return unique[0];
  return "mixed";
}

function yesNo(value) {
  return value ? "si" : "no";
}

function buildResolvedEnv(fields = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: fields.mode.value || "",
    FACTURACOM_SANDBOX_LIVE: fields.live.value || "",
    FACTURACOM_BASE_URL: normalizeBaseUrl(fields.baseUrl.value) || "",
    FACTURACOM_API_KEY: fields.apiKey.value || "",
    FACTURACOM_SECRET_KEY: fields.secretKey.value || "",
    FACTURACOM_PLUGIN: fields.plugin.value || "",
    FACTURACOM_SANDBOX_RECEIVER_UID: fields.receiverUid.value || "",
    FACTURACOM_SANDBOX_SERIE: fields.serie.value || "",
    FACTURACOM_SANDBOX_USO_CFDI: fields.usoCfdi.value || "",
    FACTURACOM_SANDBOX_FORMA_PAGO: fields.formaPago.value || "",
    FACTURACOM_SANDBOX_METODO_PAGO: fields.metodoPago.value || "",
    FACTURACOM_SANDBOX_MONEDA: fields.moneda.value || "",
    FACTURACOM_SANDBOX_LUGAR_EXPEDICION: fields.lugarExpedicion.value || "",
    FACTURACOM_SANDBOX_TIPO_DOCUMENTO: fields.tipoDocumento.value || "",
    FACTURACOM_SANDBOX_EMITTER_REGIMEN: fields.emitterRegimen.value || "",
  };
}

function safeFieldDiagnostics(fields = {}, baseInfo = {}) {
  return {
    mode_live: String(fields.mode.value || "").toLowerCase() === "live",
    live_enabled: fields.live.value === "1",
    base_url_ok: baseInfo.isSandbox === true,
    api_key_present: Boolean(fields.apiKey.value),
    secret_key_present: Boolean(fields.secretKey.value),
    plugin_present: Boolean(fields.plugin.value),
    receiver_uid_present: Boolean(fields.receiverUid.value),
    serie_present: Boolean(fields.serie.value),
    detected_host: baseInfo.isProduction ? "[BLOCKED_FACTURACOM_PRODUCTION_URL]" : (baseInfo.host === SANDBOX_HOST ? SANDBOX_HOST : null),
    values: {
      "Modo live": yesNo(String(fields.mode.value || "").toLowerCase() === "live"),
      "Live habilitado": yesNo(fields.live.value === "1"),
      "URL sandbox": yesNo(baseInfo.isSandbox === true),
      "API key": fields.apiKey.value ? "presente" : "faltante",
      "Secret key": fields.secretKey.value ? "presente" : "faltante",
      "Plugin": fields.plugin.value ? "presente" : "faltante",
      "Receiver UID": fields.receiverUid.value ? "presente" : "faltante",
      "Serie": fields.serie.value ? "presente" : "faltante",
    },
  };
}

function resolveFacturaComSandboxConfig(options = {}) {
  const processEnv = options.env || process.env;
  const localEnvPath = options.localEnvPath === undefined
    ? (text(processEnv.FACTURACOM_SANDBOX_ENV_FILE) || DEFAULT_LOCAL_ENV_PATH)
    : options.localEnvPath;
  const local = options.loadLocalEnv === false
    ? { exists: false, values: {} }
    : loadLocalEnvFile(localEnvPath);

  const fields = {};
  for (const [field, names] of Object.entries(FIELD_DEFINITIONS)) {
    fields[field] = pickField(processEnv, local.values, names);
  }

  const baseInfo = inspectBaseUrl(fields.baseUrl.value);
  const errors = [];
  if (String(fields.mode.value || "").toLowerCase() !== "live") errors.push("FACTURACOM_SANDBOX_MODE_REQUIRED");
  if (fields.live.value !== "1") errors.push("FACTURACOM_SANDBOX_LIVE_REQUIRED");
  if (!fields.baseUrl.value || baseInfo.isSandbox !== true) errors.push("FACTURACOM_SANDBOX_BASE_URL_REQUIRED");
  if (!fields.apiKey.value) errors.push("FACTURACOM_SANDBOX_API_KEY_REQUIRED");
  if (!fields.secretKey.value) errors.push("FACTURACOM_SANDBOX_SECRET_KEY_REQUIRED");
  if (!fields.plugin.value) errors.push("FACTURACOM_SANDBOX_PLUGIN_REQUIRED");
  if (!fields.receiverUid.value) errors.push("FACTURACOM_SANDBOX_RECEIVER_UID_REQUIRED");
  if (!fields.serie.value) errors.push("FACTURACOM_SANDBOX_SERIE_REQUIRED");
  if (baseInfo.isProduction) errors.push("FACTURACOM_SANDBOX_PRODUCTION_URL_BLOCKED");

  const fieldSources = Object.values(fields).map((field) => field.source);
  const configSource = sourceSummary(fieldSources);
  const diagnostics = safeFieldDiagnostics(fields, baseInfo);
  const uniqueErrors = [...new Set(errors)];
  const ok = uniqueErrors.length === 0;

  return {
    provider: PROVIDER,
    environment: ENVIRONMENT,
    mode: String(fields.mode.value || "").toLowerCase() || "missing",
    live_enabled: fields.live.value === "1",
    base_url: baseInfo.isSandbox ? SANDBOX_BASE_URL : null,
    credentials_present: Boolean(fields.apiKey.value && fields.secretKey.value),
    plugin_present: Boolean(fields.plugin.value),
    receiver_uid_present: Boolean(fields.receiverUid.value),
    serie_present: Boolean(fields.serie.value),
    config_source: configSource,
    status: ok ? "OK" : "NEEDS_CONFIG",
    ok,
    missing: uniqueErrors,
    errors: uniqueErrors,
    production_blocked: baseInfo.isProduction !== true,
    local_env_file_present: local.exists,
    safe_diagnostics: diagnostics,
    resolved_env: buildResolvedEnv(fields),
  };
}

function safeFacturaComSandboxConfig(config = {}) {
  return {
    provider: config.provider || PROVIDER,
    environment: config.environment || ENVIRONMENT,
    mode: config.mode || "missing",
    live_enabled: config.live_enabled === true,
    base_url_ok: config.safe_diagnostics?.base_url_ok === true,
    credentials_present: config.credentials_present === true,
    plugin_present: config.plugin_present === true,
    receiver_uid_present: config.receiver_uid_present === true,
    serie_present: config.serie_present === true,
    config_source: config.config_source || "missing",
    status: config.status || "NEEDS_CONFIG",
    missing: Array.isArray(config.missing) ? config.missing : [],
    production_blocked: config.production_blocked !== false,
    local_env_file_present: config.local_env_file_present === true,
    safe_diagnostics: config.safe_diagnostics || {},
  };
}

module.exports = {
  DEFAULT_LOCAL_ENV_PATH,
  SANDBOX_BASE_URL,
  resolveFacturaComSandboxConfig,
  safeFacturaComSandboxConfig,
  parseEnvFile,
};

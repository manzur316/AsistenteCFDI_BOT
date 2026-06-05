const fs = require("fs");
const path = require("path");
const { runFacturaComAuthPreflight } = require("../preflight-facturacom-auth");
const { runSmoke } = require("../smoke-factura-com-sandbox");
const { storeArtifacts } = require("../store-facturacom-sandbox-artifacts");
const { generateReports, DEFAULT_REPORT_ROOT } = require("../generate-sandbox-monthly-report");
const { generateAccountantPackage } = require("../generate-sandbox-accountant-package");
const { generateAccountantExcel } = require("../generate-sandbox-accountant-excel");
const { generateAccountantChecklist } = require("../generate-sandbox-accountant-checklist");
const { analyze: analyzePackage } = require("../analyze-sandbox-accountant-package");
const { analyzeAudit } = require("../analyze-sandbox-action-audit");
const { runSandboxDraftStamp } = require("./sandbox-draft-stamp-action");
const { DEFAULT_STORAGE_ROOT, scanSensitiveFiles } = require("./sandbox-storage-engine");
const { DEFAULT_PACKAGE_ROOT } = require("./sandbox-accountant-package");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const DEFAULT_SMOKE_RUNTIME = path.join(runtimeRoot, "facturacom-sandbox");
const DEFAULT_ACTION_RESULTS_ROOT = path.join(runtimeRoot, "action-results-sandbox");
const DEFAULT_ACTION_AUDIT_ROOT = path.join(runtimeRoot, "sandbox-action-audit");
const ACTION_SCHEMA_VERSION = "sandbox_action_result.v1";
const ACTION_AUDIT_SCHEMA_VERSION = "sandbox_action_audit.v1";
const ACTION_STATUSES = ["OK", "ERROR", "SKIPPED", "NEEDS_RUNTIME", "NEEDS_CONFIG", "PACKAGE_SAFETY_ERROR"];

const ACTIONS = [
  "sandbox.preflight",
  "sandbox.smoke.create",
  "sandbox.smoke.download",
  "sandbox.smoke.cancel",
  "sandbox.storage.refresh",
  "sandbox.report.generate",
  "sandbox.package.generate",
  "sandbox.excel.generate",
  "sandbox.checklist.generate",
  "sandbox.full.monthly.package",
  "sandbox.latest.result",
  "sandbox.audit.summary",
  "sandbox.draft.stamp",
];

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function rel(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return "[BLOCKED_PATH]";
}

function nowIso() {
  return new Date().toISOString();
}

function sanitizeString(value) {
  return String(value ?? "")
    .replace(/<\?xml[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<cfdi:Comprobante[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<tfd:TimbreFiscalDigital[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/%PDF[\s\S]*$/i, "[REDACTED_PDF_TEXT]")
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]")
    .replace(/(FACTURACOM_(?:API|SECRET)_KEY|FACTURACOM_PLUGIN)\s*=\s*[^\s,'"{}]+/gi, "$1=[REDACTED]");
}

function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    const resolved = path.isAbsolute(value) ? path.resolve(value) : null;
    if (resolved && isInside(repoRoot, resolved)) return rel(resolved);
    if (resolved) return "[BLOCKED_ABSOLUTE_PATH]";
    return sanitizeString(value).replace(/\\/g, "/");
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (/api[-_ ]?key|secret|plugin|token|authorization|password|f-api-key|f-secret-key|f-plugin/i.test(key)) {
        out[key] = "[REDACTED]";
      } else {
        out[key] = sanitizeValue(item);
      }
    }
    return out;
  }
  return null;
}

function findSensitiveFindings(value) {
  const text = JSON.stringify(value);
  const findings = [];
  if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text)) {
    findings.push("secret_like_value");
  }
  if (/https:\/\/api\.factura\.com/i.test(text)) findings.push("production_url");
  if (/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text)) findings.push("xml_content");
  if (/%PDF/i.test(text)) findings.push("pdf_content");
  if (/\.env(?:\.|$)/i.test(text)) findings.push("env_reference");
  if (/\.(cer|key|pfx|p12)\b/i.test(text)) findings.push("csd_or_key_reference");
  return findings;
}

function productionRequested(env = {}) {
  const combined = [
    env.FACTURACOM_BASE_URL,
    env.FACTURACOM_SANDBOX_BASE_URL,
    env.FACTURACOM_API_BASE_URL,
  ].filter(Boolean).join(" ");
  return /https:\/\/api\.factura\.com/i.test(combined);
}

function actionResultsRoot(options = {}) {
  return assertRuntimePath(options.actionResultsRoot || DEFAULT_ACTION_RESULTS_ROOT, "actionResultsRoot");
}

function defaultPaths(options = {}) {
  return {
    smokeRuntime: assertRuntimePath(options.smokeRuntime || DEFAULT_SMOKE_RUNTIME, "smokeRuntime"),
    storageRoot: assertRuntimePath(options.storageRoot || DEFAULT_STORAGE_ROOT, "storageRoot"),
    reportRoot: assertRuntimePath(options.reportRoot || DEFAULT_REPORT_ROOT, "reportRoot"),
    packageRoot: assertRuntimePath(options.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot"),
    actionResultsRoot: actionResultsRoot(options),
    actionAuditRoot: actionAuditRoot(options),
    period: options.period,
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(sanitizeValue(value), null, 2)}\n`, "utf8");
}

function writeActionResult(result, options = {}) {
  if (options.writeResult === false) return null;
  const root = actionResultsRoot(options);
  fs.mkdirSync(root, { recursive: true });
  const safeAction = String(result.action || "unknown").replace(/[^A-Za-z0-9._-]+/g, "_");
  const stamp = String(result.started_at || nowIso()).replace(/[:.]/g, "-");
  const resultPath = path.join(root, `${stamp}-${safeAction}.json`);
  const latestPath = path.join(root, "latest.json");
  writeJson(resultPath, result);
  writeJson(latestPath, result);
  return {
    result_path: rel(resultPath),
    latest_path: rel(latestPath),
  };
}

function actionAuditRoot(options = {}) {
  return assertRuntimePath(options.actionAuditRoot || options.auditRoot || DEFAULT_ACTION_AUDIT_ROOT, "auditRoot");
}

function safeAuditText(value, maxLength = 96) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.replace(/[^A-Za-z0-9_:/.-]+/g, "_").slice(0, maxLength);
}

function normalizeAuditContext(context = {}) {
  const sourceKind = safeAuditText(context.source_kind || context.sourceKind || "LOCAL_CLI", 32);
  return {
    source_kind: sourceKind || "LOCAL_CLI",
    chat_id_redacted: safeAuditText(context.chat_id_redacted || context.chatIdRedacted || null, 80),
    user_id_redacted: safeAuditText(context.user_id_redacted || context.userIdRedacted || null, 80),
    callback_data: safeAuditText(context.callback_data || context.callbackData || null, 64),
    command_token: safeAuditText(context.command_token || context.commandToken || null, 64),
    workflow_version: safeAuditText(context.workflow_version || context.workflowVersion || null, 80),
  };
}

function buildAuditRecord(result = {}, context = {}) {
  const normalizedContext = normalizeAuditContext(context);
  return {
    schema_version: ACTION_AUDIT_SCHEMA_VERSION,
    timestamp: result.finished_at || nowIso(),
    source_kind: normalizedContext.source_kind,
    chat_id_redacted: normalizedContext.chat_id_redacted,
    user_id_redacted: normalizedContext.user_id_redacted,
    callback_data: normalizedContext.callback_data,
    command_token: normalizedContext.command_token,
    action: safeAuditText(result.action || "UNKNOWN", 96) || "UNKNOWN",
    status: safeAuditText(result.status || "ERROR", 48) || "ERROR",
    ok: result.ok === true,
    duration_ms: Number.isFinite(result.duration_ms) ? result.duration_ms : null,
    artifacts_count: Array.isArray(result.artifacts) ? result.artifacts.length : 0,
    warnings_count: Array.isArray(result.warnings) ? result.warnings.length : 0,
    errors_count: Array.isArray(result.errors) ? result.errors.length : 0,
    sensitive_findings_count: Array.isArray(result.sensitive_findings) ? result.sensitive_findings.length : 0,
    workflow_version: normalizedContext.workflow_version,
  };
}

function writeAuditRecord(result, options = {}) {
  if (options.writeAudit === false) return null;
  const root = actionAuditRoot(options);
  fs.mkdirSync(root, { recursive: true });
  const filePath = path.join(root, "actions.jsonl");
  const record = sanitizeValue(buildAuditRecord(result, options.auditContext || {}));
  fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, "utf8");
  return {
    audit_path: rel(filePath),
    record,
  };
}

function collectArtifacts(value, prefix = "") {
  const out = [];
  function visit(node, keyPath) {
    if (!node) return;
    if (typeof node === "string") {
      if (/(^|_)(path|file|dir|root)$|_path$|_dir$|_root$/i.test(keyPath) && node && !node.includes("[BLOCKED")) {
        out.push({ key: keyPath, path: sanitizeValue(node) });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${keyPath}[${index}]`));
      return;
    }
    if (typeof node === "object") {
      for (const [key, item] of Object.entries(node)) visit(item, keyPath ? `${keyPath}.${key}` : key);
    }
  }
  visit(value, prefix);
  return out.filter((item, index, arr) => arr.findIndex((other) => other.path === item.path && other.key === item.key) === index);
}

async function silenceConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const captured = [];
  console.log = (...args) => captured.push(args.map(String).join(" "));
  console.error = (...args) => captured.push(args.map(String).join(" "));
  try {
    const result = await fn();
    return { result, captured };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

function statusFromSkipped(result, fallbackReason = "SKIPPED") {
  if (!result || result.skipped !== true) return null;
  if (/MISSING|FALTA|REQUIRED|STORAGE|REPORT|PACKAGE|RUNTIME/i.test(result.reason || result.message || "")) return "NEEDS_RUNTIME";
  return fallbackReason;
}

function isPackageSafetyErrorMessage(message) {
  return /Paquete contador sandbox inseguro|Excel sandbox inseguro|absolute_path|Sensitive findings|package safety|sandbox inseguro/i.test(String(message || ""));
}

function stableStep(action, status, output = {}, warnings = [], errors = []) {
  return sanitizeValue({
    action,
    status,
    output,
    warnings,
    errors,
    artifacts: collectArtifacts(output),
  });
}

function smokeEnv(baseEnv = {}, mode, paths = {}) {
  const env = {
    ...baseEnv,
    FACTURACOM_SANDBOX_RUNTIME_PATH: paths.smokeRuntime,
    FACTURACOM_SANDBOX_BATCH_SIZE: baseEnv.FACTURACOM_SANDBOX_BATCH_SIZE || "1",
  };
  if (mode === "create") {
    env.FACTURACOM_SANDBOX_DOWNLOAD_TEST = "0";
    env.FACTURACOM_SANDBOX_CANCEL_TEST = "0";
  }
  if (mode === "download") {
    env.FACTURACOM_SANDBOX_DOWNLOAD_TEST = "1";
    env.FACTURACOM_SANDBOX_CANCEL_TEST = "0";
  }
  if (mode === "cancel") {
    env.FACTURACOM_SANDBOX_DOWNLOAD_TEST = "0";
    env.FACTURACOM_SANDBOX_CANCEL_TEST = "1";
  }
  return env;
}

function hasSmokeRuntime(smokeRuntime) {
  return fs.existsSync(path.join(smokeRuntime, "manifest.json")) && fs.existsSync(path.join(smokeRuntime, "summary.json"));
}

function hasStorageRuntime(storageRoot) {
  return fs.existsSync(path.join(storageRoot, "reports", "storage-index.json"));
}

function normalizePeriod(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function latestPackageDir(packageRoot, period) {
  if (period) return path.join(packageRoot, period, "package");
  if (!fs.existsSync(packageRoot)) throw new Error(`Falta packageRoot: ${packageRoot}`);
  const periods = fs.readdirSync(packageRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePeriod(entry.name))
    .filter(Boolean)
    .sort();
  const latest = periods[periods.length - 1];
  if (!latest) throw new Error(`Falta paquete mensual en packageRoot: ${packageRoot}`);
  return path.join(packageRoot, latest, "package");
}

async function runPreflight(env, paths) {
  if (productionRequested(env)) {
    return stableStep("sandbox.preflight", "ERROR", {}, [], ["PRODUCTION_BLOCKED"]);
  }
  if (String(env.FACTURACOM_SANDBOX_LIVE || "") !== "1") {
    return stableStep("sandbox.preflight", "NEEDS_CONFIG", {}, ["FACTURACOM_SANDBOX_LIVE distinto de 1"], []);
  }
  const preflightEnv = { ...env, FACTURACOM_SANDBOX_RUNTIME_PATH: paths.smokeRuntime };
  const { result } = await silenceConsole(() => runFacturaComAuthPreflight(preflightEnv));
  const status = result.ok === true ? "OK" : "NEEDS_CONFIG";
  return stableStep("sandbox.preflight", status, result, result.skipped ? [result.message] : [], result.ok === false ? [result.status || "AUTH_ERROR"] : []);
}

async function runSmokeAction(action, mode, env, paths) {
  if (productionRequested(env)) {
    return stableStep(action, "ERROR", {}, [], ["PRODUCTION_BLOCKED"]);
  }
  if (String(env.FACTURACOM_SANDBOX_LIVE || "") !== "1") {
    return stableStep(action, "NEEDS_CONFIG", {}, ["FACTURACOM_SANDBOX_LIVE debe ser 1 para acciones smoke"], []);
  }
  const { result } = await silenceConsole(() => runSmoke(smokeEnv(env, mode, paths)));
  if (result?.skipped) return stableStep(action, "NEEDS_CONFIG", result, ["FACTURACOM_SANDBOX_LIVE distinto de 1"], []);
  return stableStep(action, result?.ok === true ? "OK" : "ERROR", result, [], result?.ok === true ? [] : ["SMOKE_ERROR"]);
}

function runStorageRefresh(paths) {
  if (!hasSmokeRuntime(paths.smokeRuntime)) {
    return stableStep("sandbox.storage.refresh", "NEEDS_RUNTIME", {
      smoke_runtime: rel(paths.smokeRuntime),
    }, ["No hay runtime smoke valido."], []);
  }
  const output = storeArtifacts({ smokeRuntime: paths.smokeRuntime, storageRoot: paths.storageRoot });
  return stableStep("sandbox.storage.refresh", "OK", output);
}

function runReportGenerate(paths) {
  const output = generateReports({ storageRoot: paths.storageRoot, reportRoot: paths.reportRoot, period: paths.period });
  const skippedStatus = statusFromSkipped(output);
  return stableStep("sandbox.report.generate", skippedStatus || "OK", output, output.skipped ? [output.message] : []);
}

function runPackageGenerate(paths) {
  const output = generateAccountantPackage({
    reportRoot: paths.reportRoot,
    storageRoot: paths.storageRoot,
    packageRoot: paths.packageRoot,
    period: paths.period,
  });
  const skippedStatus = statusFromSkipped(output);
  return stableStep("sandbox.package.generate", skippedStatus || "OK", output, output.skipped ? [output.message] : []);
}

function runExcelGenerate(paths) {
  const output = generateAccountantExcel({ packageRoot: paths.packageRoot, period: paths.period });
  const skippedStatus = statusFromSkipped(output);
  return stableStep("sandbox.excel.generate", skippedStatus || "OK", output, output.skipped ? [output.message] : []);
}

function runChecklistGenerate(paths) {
  const output = generateAccountantChecklist({ packageRoot: paths.packageRoot, period: paths.period });
  return stableStep("sandbox.checklist.generate", "OK", output);
}

function runPackageAnalyze(paths) {
  const packageArg = latestPackageDir(paths.packageRoot, paths.period);
  const output = analyzePackage(packageArg);
  return stableStep("sandbox.package.analyze", "OK", output);
}

function runLatestResult(paths) {
  const analysis = analyzeLatestActionResult({ actionResultsRoot: paths.actionResultsRoot });
  return stableStep(
    "sandbox.latest.result",
    analysis.exists && (analysis.sensitive_findings || []).length === 0 ? "OK" : analysis.exists ? "ERROR" : "NEEDS_RUNTIME",
    {
      exists: analysis.exists,
      action: analysis.action || null,
      status: analysis.status || null,
      duration_ms: analysis.duration_ms ?? null,
      artifacts_count: Array.isArray(analysis.artifacts) ? analysis.artifacts.length : 0,
      warnings_count: Array.isArray(analysis.warnings) ? analysis.warnings.length : 0,
      errors_count: Array.isArray(analysis.errors) ? analysis.errors.length : 0,
      sensitive_findings_count: Array.isArray(analysis.sensitive_findings) ? analysis.sensitive_findings.length : 0,
    },
    analysis.exists ? [] : ["No hay ultimo resultado sandbox en runtime local."],
    analysis.exists && (analysis.sensitive_findings || []).length ? ["SENSITIVE_FINDINGS"] : [],
  );
}

function runAuditSummary(paths) {
  const analysis = analyzeAudit(path.join(paths.actionAuditRoot, "actions.jsonl"));
  return stableStep(
    "sandbox.audit.summary",
    analysis.ok ? "OK" : "ERROR",
    {
      ok: analysis.ok,
      total_records: analysis.total_records || 0,
      by_action: analysis.by_action || {},
      by_status: analysis.by_status || {},
      by_source_kind: analysis.by_source_kind || {},
      latest_action: analysis.latest?.action || null,
      latest_status: analysis.latest?.status || null,
      latest_artifacts_count: analysis.latest?.artifacts_count ?? null,
      latest_warnings_count: analysis.latest?.warnings_count ?? null,
      latest_errors_count: analysis.latest?.errors_count ?? null,
      latest_sensitive_findings_count: analysis.latest?.sensitive_findings_count ?? null,
    },
    analysis.ok ? [] : (analysis.errors || ["Audit sandbox requiere revision."]),
    analysis.ok ? [] : (analysis.errors || ["AUDIT_ANALYSIS_ERROR"]),
  );
}

async function runDraftStamp(paths, env, options = {}) {
  const result = await runSandboxDraftStamp({
    ...options,
    env,
    storageRoot: paths.storageRoot,
  });
  return stableStep("sandbox.draft.stamp", result.status, result.output, result.warnings, result.errors);
}

function finalStatusFromSteps(steps) {
  if (steps.some((step) => step.status === "PACKAGE_SAFETY_ERROR")) return "PACKAGE_SAFETY_ERROR";
  if (steps.some((step) => step.status === "ERROR")) return "ERROR";
  if (steps.some((step) => step.status === "NEEDS_CONFIG")) return "NEEDS_CONFIG";
  if (steps.some((step) => step.status === "NEEDS_RUNTIME")) return "NEEDS_RUNTIME";
  if (steps.every((step) => step.status === "SKIPPED")) return "SKIPPED";
  return "OK";
}

async function runFullMonthlyPackage(paths) {
  const steps = [];
  if (hasSmokeRuntime(paths.smokeRuntime)) {
    steps.push(runStorageRefresh(paths));
  } else if (!hasStorageRuntime(paths.storageRoot)) {
    steps.push(stableStep("sandbox.storage.refresh", "NEEDS_RUNTIME", {
      smoke_runtime: rel(paths.smokeRuntime),
      storage_root: rel(paths.storageRoot),
    }, ["No hay smoke runtime ni storage index para generar paquete mensual."], []));
    return stableStep("sandbox.full.monthly.package", "NEEDS_RUNTIME", { steps }, ["Runtime mensual incompleto."], []);
  } else {
    steps.push(stableStep("sandbox.storage.refresh", "SKIPPED", {
      storage_root: rel(paths.storageRoot),
    }, ["No hay smoke runtime; se reutiliza storage existente."], []));
  }

  steps.push(runReportGenerate(paths));
  if (steps.at(-1).status !== "OK") return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
  steps.push(runPackageGenerate(paths));
  if (steps.at(-1).status !== "OK") return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
  steps.push(runExcelGenerate(paths));
  if (steps.at(-1).status !== "OK") return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
  steps.push(runChecklistGenerate(paths));
  if (steps.at(-1).status !== "OK") return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
  steps.push(runPackageGenerate(paths));
  if (steps.at(-1).status !== "OK") return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
  steps.push(runPackageAnalyze(paths));
  return stableStep("sandbox.full.monthly.package", finalStatusFromSteps(steps), { steps });
}

function classifyCaughtError(error = {}) {
  const message = String(error.message || error);
  if (isPackageSafetyErrorMessage(message)) return "PACKAGE_SAFETY_ERROR";
  if (/FACTURACOM_SANDBOX_LIVE|FACTURA_COM_ENV_REQUIRED|ENV_REQUIRED|LIVE_DISABLED|API_KEY|SECRET/i.test(message)) return "NEEDS_CONFIG";
  if (/No existe|Falta|MISSING|runtime|storage|report|package|manifest|summary/i.test(message)) return "NEEDS_RUNTIME";
  if (/Produccion|production|api\.factura\.com/i.test(message)) return "ERROR";
  return "ERROR";
}

async function executeAction(action, env = process.env, options = {}) {
  const paths = defaultPaths(options);
  if (!ACTIONS.includes(action)) {
    return stableStep(action || "UNKNOWN", "ERROR", {}, [], ["UNKNOWN_ACTION"]);
  }
  if (action === "sandbox.preflight") return runPreflight(env, paths);
  if (action === "sandbox.smoke.create") return runSmokeAction(action, "create", env, paths);
  if (action === "sandbox.smoke.download") return runSmokeAction(action, "download", env, paths);
  if (action === "sandbox.smoke.cancel") return runSmokeAction(action, "cancel", env, paths);
  if (action === "sandbox.storage.refresh") return runStorageRefresh(paths);
  if (action === "sandbox.report.generate") return runReportGenerate(paths);
  if (action === "sandbox.package.generate") return runPackageGenerate(paths);
  if (action === "sandbox.excel.generate") return runExcelGenerate(paths);
  if (action === "sandbox.checklist.generate") return runChecklistGenerate(paths);
  if (action === "sandbox.full.monthly.package") return runFullMonthlyPackage(paths);
  if (action === "sandbox.latest.result") return runLatestResult(paths);
  if (action === "sandbox.audit.summary") return runAuditSummary(paths);
  if (action === "sandbox.draft.stamp") return runDraftStamp(paths, env, options);
  return stableStep(action, "ERROR", {}, [], ["UNHANDLED_ACTION"]);
}

async function runSandboxAction(action, options = {}) {
  const startedAt = nowIso();
  const started = Date.now();
  let step;
  try {
    step = await executeAction(action, options.env || process.env, options);
  } catch (error) {
    step = stableStep(action || "UNKNOWN", classifyCaughtError(error), {}, [], [error.message || String(error)]);
  }
  const finishedAt = nowIso();
  const base = {
    schema_version: ACTION_SCHEMA_VERSION,
    action: action || "UNKNOWN",
    status: step.status,
    ok: step.status === "OK",
    started_at: startedAt,
    finished_at: finishedAt,
    duration_ms: Date.now() - started,
    artifacts: step.artifacts || collectArtifacts(step.output),
    warnings: step.warnings || [],
    errors: step.errors || [],
    output: step.output || {},
    sensitive_findings: [],
  };
  const sanitized = sanitizeValue(base);
  if (sanitized.status === "PACKAGE_SAFETY_ERROR") {
    sanitized.error_classification = "PACKAGE_SAFETY_ERROR";
    sanitized.needs_runtime = false;
    sanitized.safety_blocked = true;
  }
  const sensitiveFindings = findSensitiveFindings(sanitized);
  sanitized.sensitive_findings = sensitiveFindings;
  if (sensitiveFindings.length && sanitized.status === "OK") {
    sanitized.status = "ERROR";
    sanitized.ok = false;
    sanitized.errors = [...(sanitized.errors || []), "SENSITIVE_FINDINGS"];
  }
  const paths = writeActionResult(sanitized, options);
  if (paths) {
    sanitized.result_path = paths.result_path;
    sanitized.latest_path = paths.latest_path;
    writeJson(path.resolve(repoRoot, paths.result_path), sanitized);
    writeJson(path.resolve(repoRoot, paths.latest_path), sanitized);
  }
  const audit = writeAuditRecord(sanitized, options);
  if (audit) sanitized.audit_path = audit.audit_path;
  return sanitized;
}

function listSandboxActions() {
  return [...ACTIONS];
}

function latestActionResultPath(options = {}) {
  return path.join(actionResultsRoot(options), "latest.json");
}

function analyzeLatestActionResult(options = {}) {
  const latestPath = latestActionResultPath(options);
  if (!fs.existsSync(latestPath)) {
    return {
      exists: false,
      latest_path: rel(latestPath),
      sensitive_findings: [],
    };
  }
  const result = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  return {
    exists: true,
    latest_path: rel(latestPath),
    action: result.action,
    status: result.status,
    started_at: result.started_at,
    finished_at: result.finished_at,
    duration_ms: result.duration_ms,
    artifacts: result.artifacts || [],
    warnings: result.warnings || [],
    errors: result.errors || [],
    sensitive_findings: [
      ...(result.sensitive_findings || []),
      ...scanRuntimeActionFindings(path.dirname(latestPath)),
    ],
    result,
  };
}

function scanRuntimeActionFindings(dir) {
  try {
    return scanSensitiveFiles(dir);
  } catch (_error) {
    return [];
  }
}

module.exports = {
  ACTIONS,
  ACTION_AUDIT_SCHEMA_VERSION,
  ACTION_SCHEMA_VERSION,
  ACTION_STATUSES,
  DEFAULT_ACTION_AUDIT_ROOT,
  DEFAULT_ACTION_RESULTS_ROOT,
  analyzeLatestActionResult,
  buildAuditRecord,
  listSandboxActions,
  runSandboxAction,
  sanitizeValue,
  writeAuditRecord,
};

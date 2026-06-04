const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadEmitterActivityScope } = require("./lib/emitter-activity-scope-loader");
const { POLICY } = require("./lib/emitter-activity-scope-evaluator");
const {
  DIVERGENCE,
  buildShadowActivityScopeReport,
  currentHasSemanticContamination,
  writeShadowActivityScopeLog,
} = require("./lib/emitter-activity-shadow-logger");

const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "data", "concepts.normalized.json");

const CASES = [
  { input_text: "venta de camara CCTV", expected_policy: POLICY.ALLOW, kind: "semantic_camera_not_dvr" },
  { input_text: "venta de DVR", expected_policy: POLICY.ALLOW, kind: "semantic_dvr_not_camera" },
  { input_text: "venta de NVR", expected_policy: POLICY.ALLOW, kind: "semantic_dvr_not_camera" },
  { input_text: "sistema CCTV completo", expected_policy: POLICY.ALLOW, kind: "broad_cctv" },
  { input_text: "fuente de poder para camara", expected_policy: POLICY.ASK, kind: "clarification" },
  { input_text: "disco duro para DVR", expected_policy: POLICY.ASK, kind: "clarification" },
  { input_text: "servicio tecnico", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "revision de sistema", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "mantenimiento general", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "trabajo en caseta", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "venta de router", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "venta de switch", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "venta de computadora", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "reparacion de computadora", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "instalacion de control de acceso", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "mantenimiento de barrera vehicular", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "desarrollo de app movil", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "pagina web", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "automatizacion n8n", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "servicio de IA", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "marketing digital", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "plomeria", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "pintura", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "renta de equipo", expected_policy: POLICY.BLOCK, kind: "blocked" },
];

const INVARIANCE_FIELDS = [
  "accion_n8n",
  "matched_id",
  "concepto_id",
  "concepto_sugerido",
  "clave_prod_serv",
  "clave_unidad",
  "unidad",
  "operation_type",
];

const PROTECTED_PATHS = [
  "data/concepts.normalized.json",
  "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
];

function loadCurrentScoring() {
  try {
    const scoring = require("./scoring.js");
    if (typeof scoring.classifyMessage !== "function" || typeof scoring.buildN8nResponse !== "function") {
      return { importable: false, reason: "classifyMessage/buildN8nResponse no disponibles" };
    }
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return { importable: true, scoring, catalog };
  } catch (error) {
    return { importable: false, reason: error.message };
  }
}

function withShadowEnv(enabled, callback) {
  const oldShadow = process.env.CFDI_ACTIVITY_SCOPE_SHADOW;
  const oldLog = process.env.CFDI_ACTIVITY_SCOPE_SHADOW_LOG;
  try {
    if (enabled) {
      process.env.CFDI_ACTIVITY_SCOPE_SHADOW = "1";
    } else {
      delete process.env.CFDI_ACTIVITY_SCOPE_SHADOW;
    }
    delete process.env.CFDI_ACTIVITY_SCOPE_SHADOW_LOG;
    return callback();
  } finally {
    if (oldShadow === undefined) {
      delete process.env.CFDI_ACTIVITY_SCOPE_SHADOW;
    } else {
      process.env.CFDI_ACTIVITY_SCOPE_SHADOW = oldShadow;
    }
    if (oldLog === undefined) {
      delete process.env.CFDI_ACTIVITY_SCOPE_SHADOW_LOG;
    } else {
      process.env.CFDI_ACTIVITY_SCOPE_SHADOW_LOG = oldLog;
    }
  }
}

function classifyRaw(current, inputText, shadowEnabled = false) {
  if (!current.importable) return null;
  return withShadowEnv(shadowEnabled, () => current.scoring.classifyMessage(inputText, current.catalog));
}

function classifyWithCurrentScoring(current, inputText) {
  if (!current.importable) {
    return {
      raw: null,
      response: null,
      current_scoring_action: null,
      current_scoring_concept_id: null,
      current_scoring_family: null,
      current_scoring_reason: current.reason || "CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE",
    };
  }

  const raw = classifyRaw(current, inputText, false);
  const response = current.scoring.buildN8nResponse(raw, inputText);
  const concept = response.concept || {};
  return {
    raw,
    response,
    current_scoring_action: response.action || null,
    current_scoring_concept_id: concept.id || null,
    current_scoring_family: concept.familia || null,
    current_scoring_reason: raw.reason || response.json_debug?.reason || null,
  };
}

function sameProductiveFields(offResult, onResult) {
  return INVARIANCE_FIELDS.every((field) => offResult?.[field] === onResult?.[field]);
}

function gitDiffNameOnly(repoPath) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const scope = loadEmitterActivityScope();
const current = loadCurrentScoring();
const checks = [];
const results = CASES.map((testCase) => {
  const currentResult = classifyWithCurrentScoring(current, testCase.input_text);
  const shadowReport = buildShadowActivityScopeReport(testCase.input_text, currentResult.raw || {}, {
    enabled: true,
    scope,
  });

  return {
    input_text: testCase.input_text,
    expected_policy: testCase.expected_policy,
    current_scoring_action: currentResult.current_scoring_action,
    current_scoring_concept_id: currentResult.current_scoring_concept_id,
    current_scoring_family: currentResult.current_scoring_family,
    current_scoring_reason: currentResult.current_scoring_reason,
    activity_scope_result: shadowReport.activity_scope_result,
    activity_scope_detected_activity_ids: shadowReport.detected_activity_ids,
    activity_scope_requires_clarification: shadowReport.requires_clarification,
    activity_scope_blocked_matches: shadowReport.blocked_scope_matches.map((match) => match.id),
    activity_scope_semantic_flags: shadowReport.semantic_flags,
    divergence_type: shadowReport.divergence_type,
    kind: testCase.kind,
  };
});

console.log("Emitter activity shadow comparator");
console.log(`Current scoring importable: ${current.importable ? "yes" : "no"}`);
if (!current.importable) console.log(`Current scoring import reason: ${current.reason}`);
console.log(`Total casos: ${results.length}`);

for (const result of results) {
  console.log(JSON.stringify({
    input_text: result.input_text,
    current_scoring_action: result.current_scoring_action,
    current_scoring_concept_id: result.current_scoring_concept_id,
    current_scoring_family: result.current_scoring_family,
    current_scoring_reason: result.current_scoring_reason,
    activity_scope_result: result.activity_scope_result,
    activity_scope_detected_activity_ids: result.activity_scope_detected_activity_ids,
    activity_scope_requires_clarification: result.activity_scope_requires_clarification,
    activity_scope_blocked_matches: result.activity_scope_blocked_matches,
    divergence_type: result.divergence_type,
  }, null, 2));

  const expectedPass = result.activity_scope_result === result.expected_policy;
  const blockedNotAllowedByScope = result.kind !== "blocked" || result.activity_scope_result !== POLICY.ALLOW;
  const blockedNotAllowedByCurrent = result.kind !== "blocked" || result.current_scoring_action !== "SUGERIR";
  const genericNotAllowedByScope = result.kind !== "generic" || result.activity_scope_result === POLICY.ASK;
  const genericNotAllowedByCurrent = result.kind !== "generic" || result.current_scoring_action !== "SUGERIR";
  const semanticContaminationIsLabeled =
    !currentHasSemanticContamination(result.input_text, {
      accion_n8n: result.current_scoring_action,
      concepto_id: result.current_scoring_concept_id,
      concept: { familia: result.current_scoring_family },
    }) ||
    result.divergence_type === DIVERGENCE.CURRENT_SCORING_SEMANTIC_CONTAMINATION;
  const softwareNotPermitted = result.kind !== "blocked" || result.activity_scope_result !== POLICY.ALLOW;
  const divergenceAllowed = Object.values(DIVERGENCE).includes(result.divergence_type);
  const divergenceNone = result.divergence_type === DIVERGENCE.NONE;

  checks.push({ name: `expected_policy:${result.input_text}`, pass: expectedPass, value: `${result.activity_scope_result} expected ${result.expected_policy}` });
  checks.push({ name: `blocked_scope_not_allowed:${result.input_text}`, pass: blockedNotAllowedByScope, value: result.kind });
  checks.push({ name: `blocked_current_not_allowed:${result.input_text}`, pass: blockedNotAllowedByCurrent, value: result.current_scoring_action || "not-imported" });
  checks.push({ name: `generic_scope_requires_clarification:${result.input_text}`, pass: genericNotAllowedByScope, value: String(result.activity_scope_requires_clarification) });
  checks.push({ name: `generic_current_not_allowed:${result.input_text}`, pass: genericNotAllowedByCurrent, value: result.current_scoring_action || "not-imported" });
  checks.push({ name: `semantic_contamination_labeled:${result.input_text}`, pass: semanticContaminationIsLabeled, value: result.divergence_type });
  checks.push({ name: `software_web_ia_n8n_not_permitted:${result.input_text}`, pass: softwareNotPermitted, value: result.kind });
  checks.push({ name: `divergence_type_valid:${result.input_text}`, pass: divergenceAllowed, value: result.divergence_type });
  checks.push({ name: `divergence_is_none:${result.input_text}`, pass: divergenceNone, value: result.divergence_type });
}

for (const testCase of CASES) {
  if (!current.importable) {
    checks.push({ name: `shadow_invariance:${testCase.input_text}`, pass: false, value: current.reason || "not-importable" });
    continue;
  }
  const off = classifyRaw(current, testCase.input_text, false);
  const on = classifyRaw(current, testCase.input_text, true);
  checks.push({
    name: `shadow_off_has_no_report:${testCase.input_text}`,
    pass: off && off.shadow_activity_scope === undefined,
    value: "default off",
  });
  checks.push({
    name: `shadow_on_has_report:${testCase.input_text}`,
    pass: on && on.shadow_activity_scope?.enabled === true && on.shadow_activity_scope.non_productive === true,
    value: on?.shadow_activity_scope?.divergence_type || "no-report",
  });
  checks.push({
    name: `shadow_invariance:${testCase.input_text}`,
    pass: sameProductiveFields(off, on),
    value: INVARIANCE_FIELDS.join(","),
  });
}

if (current.importable) {
  const logPath = path.join(root, "runtime", "test-activity-scope-shadow.jsonl");
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  const sampleRaw = classifyRaw(current, "venta de camara CCTV", true);
  const sampleReport = buildShadowActivityScopeReport("venta de camara CCTV", sampleRaw, {
    enabled: true,
    scope,
  });
  const offWrite = writeShadowActivityScopeLog(sampleReport, { logEnabled: false, logPath });
  const offExists = fs.existsSync(logPath);
  const onWrite = writeShadowActivityScopeLog(sampleReport, { logEnabled: true, logPath });
  const onText = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "";
  if (fs.existsSync(logPath)) fs.unlinkSync(logPath);
  checks.push({
    name: "shadow_log_disabled_does_not_write",
    pass: offWrite === false && offExists === false,
    value: "log off",
  });
  checks.push({
    name: "shadow_log_enabled_writes_runtime_jsonl",
    pass: onWrite === true && onText.includes("\"non_productive\":true") && onText.includes("\"divergence_type\":\"NONE\""),
    value: "runtime/activity-scope-shadow.jsonl compatible",
  });
}

for (const repoPath of PROTECTED_PATHS) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const divergenceSummary = results.reduce((acc, result) => {
  acc[result.divergence_type] = (acc[result.divergence_type] || 0) + 1;
  return acc;
}, {});

const passed = checks.filter((check) => check.pass).length;
console.log("");
console.log("Divergencias");
for (const [type, count] of Object.entries(divergenceSummary).sort()) {
  console.log(` - ${type}: ${count}`);
}
console.log("");
console.log("Validaciones");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

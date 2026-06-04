const fs = require("fs");
const path = require("path");
const { loadEmitterActivityScope } = require("./emitter-activity-scope-loader");
const {
  POLICY,
  evaluateEmitterActivityScope,
  normalizeText,
  tokenize,
  termsMatched,
} = require("./emitter-activity-scope-evaluator");

const DIVERGENCE = {
  NONE: "NONE",
  SHADOW_MORE_STRICT: "SHADOW_MORE_STRICT",
  SHADOW_MORE_PERMISSIVE: "SHADOW_MORE_PERMISSIVE",
  CURRENT_SCORING_SEMANTIC_CONTAMINATION: "CURRENT_SCORING_SEMANTIC_CONTAMINATION",
  CURRENT_SCORING_BLOCKS_VALID_SCOPE: "CURRENT_SCORING_BLOCKS_VALID_SCOPE",
  CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE: "CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE",
  NEEDS_POLICY_REVIEW: "NEEDS_POLICY_REVIEW",
  CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE: "CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE",
};

const root = path.resolve(__dirname, "..", "..");

function envFlag(name) {
  if (typeof process === "undefined" || !process.env) return false;
  return String(process.env[name] || "").trim() === "1";
}

function getCurrentAction(currentScoringResult) {
  return currentScoringResult?.accion_n8n || currentScoringResult?.action || null;
}

function getCurrentConceptId(currentScoringResult) {
  return (
    currentScoringResult?.concepto_id ||
    currentScoringResult?.matched_id ||
    currentScoringResult?.concept?.id ||
    null
  );
}

function getCurrentFamily(currentScoringResult) {
  return (
    currentScoringResult?.family ||
    currentScoringResult?.concept?.familia ||
    currentScoringResult?.concept?.family ||
    null
  );
}

function getCurrentReason(currentScoringResult) {
  return (
    currentScoringResult?.reason ||
    currentScoringResult?.json_debug?.reason ||
    null
  );
}

function currentPolicyFromAction(action) {
  if (action === "SUGERIR") return POLICY.ALLOW;
  if (action === "PEDIR_ACLARACION") return POLICY.ASK;
  if (action === "BLOQUEAR" || action === "AGREGAR_ACTIVIDAD") return POLICY.BLOCK;
  return null;
}

function currentConceptText(currentScoringResult) {
  const concept = currentScoringResult?.concept || {};
  return normalizeText([
    getCurrentConceptId(currentScoringResult),
    currentScoringResult?.concepto_factura,
    currentScoringResult?.concepto_sugerido,
    concept.invoice_concept,
    concept.concepto_factura,
    concept.concepto_factura_recomendado,
    concept.concepto_factura,
    concept.familia,
    concept.family,
    currentScoringResult?.family,
    currentScoringResult?.concept_type,
    currentScoringResult?.operation_type,
  ].filter(Boolean).join(" "));
}

function currentHasSemanticContamination(inputText, currentScoringResult) {
  if (getCurrentAction(currentScoringResult) !== "SUGERIR") return false;
  const input = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const concept = currentConceptText(currentScoringResult);
  const hasCamera = termsMatched(input, tokens, ["camara", "camaras", "cctv"]).length > 0;
  const hasDvrNvr = termsMatched(input, tokens, ["dvr", "nvr", "grabador"]).length > 0;
  const hasPower = termsMatched(input, tokens, ["fuente", "fuente de poder", "adaptador", "transformador"]).length > 0;
  const hasDisk = termsMatched(input, tokens, ["disco", "disco duro", "hdd", "ssd", "almacenamiento"]).length > 0;
  const broadCctv = input.includes("sistema cctv completo");

  if (broadCctv) return false;
  if (hasCamera && !hasDvrNvr && /\b(dvr|nvr|grabador|disco|almacenamiento)\b/.test(concept)) return true;
  if (hasDvrNvr && !hasCamera && /\b(camara|camaras)\b/.test(concept)) return true;
  if (hasPower && hasCamera && !hasDisk && /\b(dvr|nvr|grabador|disco|almacenamiento)\b/.test(concept)) return true;
  return false;
}

function decideDivergence(inputText, currentScoringResult, activityScopeResult) {
  const currentPolicy = currentPolicyFromAction(getCurrentAction(currentScoringResult));
  if (!currentPolicy) return DIVERGENCE.CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE;
  if (currentHasSemanticContamination(inputText, currentScoringResult)) {
    return DIVERGENCE.CURRENT_SCORING_SEMANTIC_CONTAMINATION;
  }

  const shadowPolicy = activityScopeResult.offline_policy_result;
  if (currentPolicy === shadowPolicy) return DIVERGENCE.NONE;
  if (currentPolicy === POLICY.ALLOW && shadowPolicy === POLICY.BLOCK) return DIVERGENCE.CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE;
  if (currentPolicy === POLICY.BLOCK && shadowPolicy === POLICY.ALLOW) return DIVERGENCE.CURRENT_SCORING_BLOCKS_VALID_SCOPE;
  if (currentPolicy === POLICY.ALLOW && shadowPolicy === POLICY.ASK) return DIVERGENCE.SHADOW_MORE_STRICT;
  if ((currentPolicy === POLICY.ASK || currentPolicy === POLICY.BLOCK) && shadowPolicy === POLICY.ALLOW) {
    return DIVERGENCE.SHADOW_MORE_PERMISSIVE;
  }
  return DIVERGENCE.NEEDS_POLICY_REVIEW;
}

function resolveScope(options = {}) {
  if (options.scope) return options.scope;
  return loadEmitterActivityScope(options.scopePath);
}

function buildDisabledReport(inputText, currentScoringResult) {
  return {
    enabled: false,
    non_productive: true,
    current_action: getCurrentAction(currentScoringResult),
    current_concept_id: getCurrentConceptId(currentScoringResult),
    activity_scope_result: null,
    detected_activity_ids: [],
    requires_clarification: null,
    blocked_scope_matches: [],
    semantic_flags: [],
    divergence_type: DIVERGENCE.NONE,
    reasons: ["shadow_disabled", `input:${normalizeText(inputText)}`],
  };
}

function buildShadowActivityScopeReport(inputText, currentScoringResult, options = {}) {
  const enabled = options.enabled !== undefined ? Boolean(options.enabled) : envFlag("CFDI_ACTIVITY_SCOPE_SHADOW");
  if (!enabled) return buildDisabledReport(inputText, currentScoringResult);

  const activityResult = evaluateEmitterActivityScope(inputText, resolveScope(options));
  const divergence_type = decideDivergence(inputText, currentScoringResult, activityResult);

  return {
    enabled: true,
    non_productive: true,
    current_action: getCurrentAction(currentScoringResult),
    current_concept_id: getCurrentConceptId(currentScoringResult),
    current_family: getCurrentFamily(currentScoringResult),
    current_reason: getCurrentReason(currentScoringResult),
    activity_scope_result: activityResult.offline_policy_result,
    detected_activity_ids: activityResult.detected_activity_ids,
    detected_operation_type: activityResult.detected_operation_type,
    matched_scope_categories: activityResult.matched_scope_categories,
    requires_clarification: activityResult.requires_clarification,
    blocked_scope_matches: activityResult.blocked_scope_matches,
    semantic_flags: activityResult.semantic_contamination_flags,
    divergence_type,
    reasons: activityResult.reasons,
  };
}

function resolveRuntimePath(options = {}) {
  if (options.runtimePath) return path.resolve(options.runtimePath);
  if (typeof process !== "undefined" && process.env?.CFDI_RUNTIME_PATH) {
    return path.resolve(process.env.CFDI_RUNTIME_PATH);
  }
  return path.join(root, "runtime");
}

function writeShadowActivityScopeLog(report, options = {}) {
  const enabled = options.logEnabled !== undefined ? Boolean(options.logEnabled) : envFlag("CFDI_ACTIVITY_SCOPE_SHADOW_LOG");
  if (!enabled || !report?.enabled) return false;
  const runtimePath = resolveRuntimePath(options);
  const logPath = options.logPath ? path.resolve(options.logPath) : path.join(runtimePath, "activity-scope-shadow.jsonl");
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify({
    timestamp: new Date().toISOString(),
    ...report,
  })}\n`, "utf8");
  return true;
}

module.exports = {
  DIVERGENCE,
  buildShadowActivityScopeReport,
  currentHasSemanticContamination,
  currentPolicyFromAction,
  decideDivergence,
  writeShadowActivityScopeLog,
};

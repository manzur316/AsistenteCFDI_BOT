const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const DEFAULT_SCOPE_PATH = path.join(root, "data", "knowledge_base", "emitter_activity_scope.proposed.json");
const REQUIRED_ACTIVITY_IDS = ["A1", "A2", "A3", "A4", "A5"];

function assertCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function validateActivationPolicy(policy) {
  assertCondition(policy && typeof policy === "object", "activation_policy debe existir.");
  assertCondition(policy.requires_human_approval === true, "activation_policy.requires_human_approval debe ser true.");
  assertCondition(policy.does_not_modify_active_catalog === true, "activation_policy.does_not_modify_active_catalog debe ser true.");
  assertCondition(policy.does_not_enable_new_concepts === true, "activation_policy.does_not_enable_new_concepts debe ser true.");
  assertCondition(policy.does_not_stamp_cfdi === true, "activation_policy.does_not_stamp_cfdi debe ser true.");
  assertCondition(policy.does_not_generate_xml_or_pdf === true, "activation_policy.does_not_generate_xml_or_pdf debe ser true.");
}

function validateActivities(scope) {
  assertCondition(Array.isArray(scope.activities), "activities debe ser arreglo.");
  const ids = new Set(scope.activities.map((activity) => activity.id));
  for (const id of REQUIRED_ACTIVITY_IDS) {
    assertCondition(ids.has(id), `activities debe incluir ${id}.`);
  }
  for (const activity of scope.activities) {
    assertCondition(activity.activity, `activity ${activity.id || "(sin id)"} debe tener descripcion.`);
    assertCondition(Array.isArray(activity.allowed_operation_types), `activity ${activity.id} debe tener allowed_operation_types.`);
  }
}

function validateFiscalScopeCategories(scope) {
  assertCondition(Array.isArray(scope.fiscal_scope_categories), "fiscal_scope_categories debe ser arreglo.");
  assertCondition(scope.fiscal_scope_categories.length >= 5, "fiscal_scope_categories debe cubrir mas que CCTV.");
  for (const category of scope.fiscal_scope_categories) {
    assertCondition(category.id, "Cada fiscal_scope_category debe tener id.");
    assertCondition(Array.isArray(category.activity_ids) && category.activity_ids.length > 0, `Categoria ${category.id} debe tener activity_ids.`);
    assertCondition(Array.isArray(category.candidate_sat_keys_from_active_catalog), `Categoria ${category.id} debe tener candidate_sat_keys_from_active_catalog.`);
    assertCondition(Array.isArray(category.candidate_topics), `Categoria ${category.id} debe tener candidate_topics.`);
    assertCondition(category.suggestion_policy, `Categoria ${category.id} debe tener suggestion_policy.`);
  }
}

function validateBlockedScope(scope) {
  assertCondition(Array.isArray(scope.blocked_scope), "blocked_scope debe ser arreglo.");
  assertCondition(scope.blocked_scope.length >= 4, "blocked_scope debe incluir bloqueos explicitos.");
  for (const blocked of scope.blocked_scope) {
    assertCondition(blocked.id, "Cada blocked_scope debe tener id.");
    assertCondition(["BLOQUEAR", "AGREGAR_ACTIVIDAD"].includes(blocked.decision), `blocked_scope ${blocked.id} debe decidir BLOQUEAR o AGREGAR_ACTIVIDAD.`);
    assertCondition(Array.isArray(blocked.terms) && blocked.terms.length > 0, `blocked_scope ${blocked.id} debe tener terms.`);
  }
}

function validateScoringLayers(scope) {
  assertCondition(Array.isArray(scope.proposed_scoring_layers), "proposed_scoring_layers debe ser arreglo.");
  const layerIds = scope.proposed_scoring_layers.map((layer) => layer.id);
  for (const required of [
    "emitter_activity_scope",
    "cfdi40_filling_rules",
    "sat_master_catalog_validation",
    "operation_type",
    "active_catalog_concept",
    "manual_keywords_current",
    "semantic_exclusions_and_ambiguity",
  ]) {
    assertCondition(layerIds.includes(required), `proposed_scoring_layers debe incluir ${required}.`);
  }
  assertCondition(
    layerIds.indexOf("manual_keywords_current") > layerIds.indexOf("emitter_activity_scope"),
    "manual_keywords_current debe ser evidencia secundaria despues de emitter_activity_scope."
  );
}

function validateSemanticRules(scope) {
  const semanticRules = scope.semantic_contamination_rules || scope.semantic_disambiguation_rules;
  if (semanticRules === undefined) return;
  assertCondition(Array.isArray(semanticRules), "semantic_contamination_rules/semantic_disambiguation_rules debe ser arreglo si existe.");
  const ids = new Set(semanticRules.map((rule) => rule.id));
  for (const id of ["CAMERA_NOT_DVR", "DVR_NOT_CAMERA", "POWER_SOURCE_NOT_DVR", "SYSTEM_GENERIC_NEEDS_EQUIPMENT"]) {
    assertCondition(ids.has(id), `semantic rules debe incluir ${id}.`);
  }
}

function validateTestMatrix(scope) {
  if (scope.test_matrix === undefined) return;
  assertCondition(Array.isArray(scope.test_matrix), "test_matrix debe ser arreglo si existe.");
}

function validateEmitterActivityScope(scope) {
  assertCondition(scope && typeof scope === "object", "emitter_activity_scope debe ser objeto JSON.");
  assertCondition(scope.schema_version === "emitter_activity_scope.proposed.v1", "schema_version invalido.");
  assertCondition(scope.status === "PROPOSED_NOT_ACTIVE", "status debe ser PROPOSED_NOT_ACTIVE.");
  validateActivationPolicy(scope.activation_policy);
  validateActivities(scope);
  validateFiscalScopeCategories(scope);
  validateBlockedScope(scope);
  validateScoringLayers(scope);
  validateSemanticRules(scope);
  validateTestMatrix(scope);
  return scope;
}

function loadEmitterActivityScope(filePath = DEFAULT_SCOPE_PATH) {
  const resolved = path.resolve(filePath);
  const raw = fs.readFileSync(resolved, "utf8");
  const scope = JSON.parse(raw);
  validateEmitterActivityScope(scope);
  return Object.freeze(scope);
}

module.exports = {
  DEFAULT_SCOPE_PATH,
  REQUIRED_ACTIVITY_IDS,
  loadEmitterActivityScope,
  validateEmitterActivityScope,
};

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function assertFiscalActivity(activity) {
  const errors = [];
  if (!activity || typeof activity !== "object") errors.push("FiscalActivity requerido");
  if (!activity?.activity_code) errors.push("activity_code requerido");
  if (!activity?.activity_name) errors.push("activity_name requerido");
  if (!activity?.activity_source) errors.push("activity_source requerido");
  if (!asArray(activity?.applies_to_regimen).length) errors.push("applies_to_regimen requerido");
  if (!asArray(activity?.applies_to_person_type).length) errors.push("applies_to_person_type requerido");
  return { ok: errors.length === 0, errors };
}

function assertConceptRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== "object") errors.push("ConceptRule requerido");
  if (!rule?.rule_id) errors.push("rule_id requerido");
  if (!rule?.activity_code) errors.push("activity_code requerido");
  if (!rule?.concept_family) errors.push("concept_family requerido");
  if (!Array.isArray(rule?.allowed_clave_prod_serv)) errors.push("allowed_clave_prod_serv debe ser array");
  if (!Array.isArray(rule?.suggested_clave_unidad)) errors.push("suggested_clave_unidad debe ser array");
  if (!rule?.default_objeto_imp) errors.push("default_objeto_imp requerido");
  if (rule?.human_review_required !== true) errors.push("human_review_required debe ser true");
  return { ok: errors.length === 0, errors };
}

function assertFiscalActivityRulesDocument(doc) {
  const errors = [];
  if (doc?.non_productive !== true) errors.push("non_productive debe ser true en foundation");
  for (const activity of asArray(doc?.activities)) {
    const validation = assertFiscalActivity(activity);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `${activity?.activity_code || "UNKNOWN"}:${error}`));
  }
  for (const rule of asArray(doc?.concept_rules)) {
    const validation = assertConceptRule(rule);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `${rule?.rule_id || "UNKNOWN"}:${error}`));
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  assertConceptRule,
  assertFiscalActivity,
  assertFiscalActivityRulesDocument,
};

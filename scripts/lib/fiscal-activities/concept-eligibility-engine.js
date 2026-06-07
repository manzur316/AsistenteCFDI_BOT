function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function evaluateConceptEligibility(input = {}, rulesDoc = {}) {
  const tenantActivities = new Set(asArray(input.tenant_activity_codes || input.activities).map(String));
  const concept = input.concept || {};
  const messageText = normalize(input.message || input.original_text || concept.description || "");
  const blockedTerms = asArray(rulesDoc.global_blocked_terms);
  const blockedMatch = blockedTerms.find((term) => messageText.includes(normalize(term)));
  if (blockedMatch) {
    return {
      allowed: false,
      suggested: false,
      needs_review: true,
      blocked: true,
      reason_codes: ["BLOCKED_TERM_MATCH"],
      candidate_concepts: [],
      blocked_matches: [blockedMatch],
      human_review_required: true,
    };
  }

  const matchingRules = asArray(rulesDoc.concept_rules).filter((rule) => {
    if (!tenantActivities.has(String(rule.activity_code))) return false;
    if (concept.clave_prod_serv && asArray(rule.allowed_clave_prod_serv).includes(String(concept.clave_prod_serv))) return true;
    if (concept.familia && normalize(rule.concept_family) === normalize(concept.familia)) return true;
    return false;
  });

  if (!matchingRules.length) {
    return {
      allowed: false,
      suggested: false,
      needs_review: true,
      blocked: false,
      reason_codes: ["NO_ACTIVITY_RULE_MATCH"],
      candidate_concepts: [],
      human_review_required: true,
    };
  }

  return {
    allowed: true,
    suggested: true,
    needs_review: true,
    blocked: false,
    reason_codes: ["ACTIVITY_RULE_MATCH", "HUMAN_REVIEW_REQUIRED"],
    candidate_concepts: matchingRules.map((rule) => ({
      rule_id: rule.rule_id,
      activity_code: rule.activity_code,
      concept_family: rule.concept_family,
      allowed_clave_prod_serv: rule.allowed_clave_prod_serv,
      suggested_clave_unidad: rule.suggested_clave_unidad,
      default_objeto_imp: rule.default_objeto_imp,
      confidence: rule.confidence,
    })),
    human_review_required: true,
  };
}

module.exports = {
  evaluateConceptEligibility,
};

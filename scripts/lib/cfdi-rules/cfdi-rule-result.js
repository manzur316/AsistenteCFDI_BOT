function createRuleResult(rule, type, message, details = {}) {
  return {
    rule_id: rule.rule_id,
    rule_set: rule.rule_set,
    severity: rule.severity,
    type,
    message,
    developer_message: rule.developer_message,
    details,
  };
}

function emptyRuleEngineResult() {
  return {
    ok: true,
    blockers: [],
    warnings: [],
    suggestions: [],
    evaluated_rules: [],
    requires_human_review: true,
  };
}

module.exports = {
  createRuleResult,
  emptyRuleEngineResult,
};

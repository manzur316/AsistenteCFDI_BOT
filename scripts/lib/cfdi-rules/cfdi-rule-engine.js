const { CFDI_RULE_RESULT_TYPES } = require("./cfdi-rule-enums");
const { evaluateSingleRule } = require("./cfdi-rule-evaluator");
const { getCfdi40CoreRules } = require("./cfdi-rule-registry");
const { emptyRuleEngineResult } = require("./cfdi-rule-result");

function evaluateCfdi40Rules(invoiceDraftOrDocument = {}, options = {}) {
  const rules = options.rules || getCfdi40CoreRules();
  const result = emptyRuleEngineResult();
  for (const rule of rules) {
    const evaluation = evaluateSingleRule(rule, invoiceDraftOrDocument, options);
    result.evaluated_rules.push({
      rule_id: evaluation.rule_id,
      type: evaluation.type,
      severity: evaluation.severity,
    });
    if (evaluation.type === CFDI_RULE_RESULT_TYPES.BLOCKER) result.blockers.push(evaluation);
    else if (evaluation.type === CFDI_RULE_RESULT_TYPES.WARNING) result.warnings.push(evaluation);
    else if (evaluation.type === CFDI_RULE_RESULT_TYPES.SUGGESTION) result.suggestions.push(evaluation);
  }
  result.ok = result.blockers.length === 0;
  result.requires_human_review = true;
  return result;
}

module.exports = {
  evaluateCfdi40Rules,
};

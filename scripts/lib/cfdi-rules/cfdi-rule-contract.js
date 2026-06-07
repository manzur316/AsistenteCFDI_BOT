const { CFDI_RULE_SETS, CFDI_RULE_SEVERITIES } = require("./cfdi-rule-enums");

function assertCfdiRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== "object") errors.push("rule requerido");
  if (!rule?.rule_id) errors.push("rule_id requerido");
  if (!Object.values(CFDI_RULE_SETS).includes(rule?.rule_set)) errors.push("rule_set invalido");
  if (!rule?.version) errors.push("version requerida");
  if (!rule?.source_document) errors.push("source_document requerido");
  if (!rule?.applies_to) errors.push("applies_to requerido");
  if (!rule?.condition) errors.push("condition requerida");
  if (!rule?.expected) errors.push("expected requerido");
  if (!Object.values(CFDI_RULE_SEVERITIES).includes(rule?.severity)) errors.push("severity invalida");
  if (!rule?.human_message) errors.push("human_message requerido");
  if (!rule?.developer_message) errors.push("developer_message requerido");
  if (rule?.provider_independent !== true) errors.push("provider_independent debe ser true");
  return { ok: errors.length === 0, errors };
}

function assertCfdiRuleRegistry(rules = []) {
  const errors = [];
  const ids = new Set();
  for (const rule of rules) {
    const validation = assertCfdiRule(rule);
    if (!validation.ok) errors.push(...validation.errors.map((error) => `${rule?.rule_id || "UNKNOWN"}:${error}`));
    if (ids.has(rule.rule_id)) errors.push(`duplicate_rule_id:${rule.rule_id}`);
    ids.add(rule.rule_id);
  }
  return { ok: errors.length === 0, errors };
}

module.exports = {
  assertCfdiRule,
  assertCfdiRuleRegistry,
};

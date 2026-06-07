const CFDI_RULE_SETS = Object.freeze({
  CFDI_40_CORE: "CFDI_40_CORE",
});

const CFDI_RULE_SEVERITIES = Object.freeze({
  BLOCKER: "BLOCKER",
  WARNING: "WARNING",
  WARNING_OR_BLOCKER: "WARNING_OR_BLOCKER",
  SUGGESTION: "SUGGESTION",
});

const CFDI_RULE_RESULT_TYPES = Object.freeze({
  BLOCKER: "blocker",
  WARNING: "warning",
  SUGGESTION: "suggestion",
  PASS: "pass",
});

module.exports = {
  CFDI_RULE_RESULT_TYPES,
  CFDI_RULE_SETS,
  CFDI_RULE_SEVERITIES,
};

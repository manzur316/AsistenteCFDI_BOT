const {
  analyzeChecklist,
} = require("./lib/sandbox-accountant-checklist");

function printAnalysis(result) {
  console.log("Sandbox accountant validation checklist analysis");
  console.log(`Periodo: ${result.period}`);
  console.log(`Existe: ${result.exists}`);
  console.log(`Package: ${result.package_dir}`);
  console.log(`Total checks: ${result.total_checks}`);
  console.log(`PASS: ${result.pass}`);
  console.log(`WARNING: ${result.warning}`);
  console.log(`FAIL: ${result.fail}`);
  console.log(`PENDING_REVIEW: ${result.pending_review}`);
  console.log(`Ready for human review: ${result.ready_for_human_review}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = analyzeChecklist(process.argv[2] ? { packageDir: process.argv[2] } : {});
    printAnalysis(result);
    if (!result.exists || result.sensitive_findings.length || result.fail > 0) process.exit(1);
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_CHECKLIST_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyzeChecklist,
};

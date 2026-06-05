const {
  analyzeLatestActionResult,
} = require("./lib/sandbox-action-runner");

function printAnalysis(analysis) {
  console.log("Sandbox action result analysis");
  console.log(`Existe: ${analysis.exists}`);
  console.log(`Latest: ${analysis.latest_path}`);
  if (!analysis.exists) return;
  console.log(`Action: ${analysis.action}`);
  console.log(`Status: ${analysis.status}`);
  console.log(`Started at: ${analysis.started_at}`);
  console.log(`Finished at: ${analysis.finished_at}`);
  console.log(`Duration ms: ${analysis.duration_ms}`);
  console.log(`Artifacts: ${(analysis.artifacts || []).length}`);
  for (const artifact of analysis.artifacts || []) {
    console.log(` - ${artifact.key}: ${artifact.path}`);
  }
  console.log(`Warnings: ${(analysis.warnings || []).join(" | ") || "none"}`);
  console.log(`Errors: ${(analysis.errors || []).join(" | ") || "none"}`);
  console.log(`Sensitive findings: ${(analysis.sensitive_findings || []).length ? analysis.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const analysis = analyzeLatestActionResult();
    printAnalysis(analysis);
    if (!analysis.exists || (analysis.sensitive_findings || []).length > 0) process.exit(1);
  } catch (error) {
    console.error(`SANDBOX_ACTION_RESULT_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyzeLatestActionResult,
};

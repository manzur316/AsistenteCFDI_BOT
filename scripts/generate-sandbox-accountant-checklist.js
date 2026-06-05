const {
  buildAccountantValidationChecklist,
  resolvePackageDir,
  writeChecklistFiles,
} = require("./lib/sandbox-accountant-checklist");

function generateAccountantChecklist(options = {}) {
  const packageDir = resolvePackageDir(options);
  const checklist = buildAccountantValidationChecklist({ packageDir });
  const files = writeChecklistFiles({ packageDir }, checklist);
  return {
    ok: true,
    period: checklist.period,
    package_dir: checklist.package_dir,
    files: files.files,
    summary: checklist.summary,
    ready_for_human_review: checklist.ready_for_human_review,
    sensitive_findings: [],
  };
}

function printResult(result) {
  console.log("Sandbox accountant validation checklist generated");
  console.log(`Period: ${result.period}`);
  console.log(`Package: ${result.package_dir}`);
  console.log(`Markdown: ${result.files.markdown}`);
  console.log(`JSON: ${result.files.json}`);
  console.log(`CSV: ${result.files.csv}`);
  console.log(`Checks: ${result.summary.total_checks}`);
  console.log(`PASS: ${result.summary.pass}`);
  console.log(`WARNING: ${result.summary.warning}`);
  console.log(`FAIL: ${result.summary.fail}`);
  console.log(`PENDING_REVIEW: ${result.summary.pending_review}`);
  console.log(`Ready for human review: ${result.ready_for_human_review}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = generateAccountantChecklist({
      packageRoot: process.argv[2] || undefined,
      period: process.argv[3] || undefined,
    });
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_CHECKLIST_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  generateAccountantChecklist,
};

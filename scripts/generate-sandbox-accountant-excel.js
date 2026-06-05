const {
  DEFAULT_PACKAGE_ROOT,
} = require("./lib/sandbox-accountant-package");
const {
  generateAccountantExcel,
} = require("./lib/sandbox-accountant-excel");

function printResult(result) {
  if (result.skipped) {
    console.log("Sandbox accountant Excel skipped");
    console.log(result.message);
    console.log(`Reason: ${result.reason}`);
    return;
  }
  console.log("Sandbox accountant Excel generated");
  console.log(`Period: ${result.period}`);
  console.log(`Format: ${result.format}`);
  console.log(`Excel: ${result.excel_path}`);
  console.log(`Bytes: ${result.bytes}`);
  console.log(`Sheets: ${result.sheets.join(", ")}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
  console.log(`Formula injection findings: ${result.formula_injection_findings.length ? result.formula_injection_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const result = generateAccountantExcel({
      packageRoot: process.argv[2] || DEFAULT_PACKAGE_ROOT,
      period: process.argv[3] || undefined,
    });
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_EXCEL_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  generateAccountantExcel,
};

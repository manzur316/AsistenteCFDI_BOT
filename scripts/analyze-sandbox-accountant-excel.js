const {
  analyzeAccountantExcel,
} = require("./lib/sandbox-accountant-excel");

function printAnalysis(result) {
  console.log("Sandbox accountant Excel analysis");
  console.log(`Periodo: ${result.period || "UNKNOWN"}`);
  console.log(`Archivo existe: ${result.exists}`);
  console.log(`Archivo: ${result.path}`);
  console.log(`Tamano bytes: ${result.bytes}`);
  console.log(`Formato: ${result.format || "UNKNOWN"}`);
  console.log(`Runtime path OK: ${result.runtime_path_ok}`);
  console.log(`Hojas: ${result.sheets.join(", ") || "none"}`);
  console.log(`Hojas requeridas: ${result.required_sheets_present ? "OK" : "MISSING"}`);
  console.log("Filas aproximadas:");
  for (const [sheet, count] of Object.entries(result.row_counts || {})) {
    console.log(` - ${sheet}: ${count}`);
  }
  console.log(`Absolute path findings: ${result.absolute_path_findings.length ? result.absolute_path_findings.join(" | ") : "none"}`);
  console.log(`Sensitive findings: ${result.sensitive_findings.length ? result.sensitive_findings.join(" | ") : "none"}`);
  console.log(`Formula injection findings: ${result.formula_injection_findings.length ? result.formula_injection_findings.join(" | ") : "none"}`);
}

if (require.main === module) {
  try {
    const arg = process.argv[2];
    const result = analyzeAccountantExcel(arg ? { excelPath: arg } : {});
    printAnalysis(result);
    if (!result.exists || !result.runtime_path_ok || result.absolute_path_findings.length || result.sensitive_findings.length || result.formula_injection_findings.length) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`SANDBOX_ACCOUNTANT_EXCEL_ANALYSIS_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  analyzeAccountantExcel,
};

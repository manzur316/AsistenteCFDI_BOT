const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const kbDir = path.join(root, "data", "knowledge_base");

const fillingRulesPath = path.join(kbDir, "cfdi40_filling_rules.json");
const decisionEnginePath = path.join(kbDir, "cfdi40_decision_engine.json");
const officialGuideDocPath = path.join(docsDir, "CFDI40_OFFICIAL_FILLING_GUIDE_ANALYSIS.md");
const validationMatrixDocPath = path.join(docsDir, "CFDI40_VALIDATION_MATRIX.md");
const taxModelDocPath = path.join(docsDir, "CFDI40_TAX_MODEL.md");
const resicoDocPath = path.join(docsDir, "RESICO_626_DECISION_MATRIX.md");
const activeCatalogPath = path.join(root, "data", "concepts.normalized.json");
const activeExcelPath = path.join(root, "data", "base_cfdi_resico_n8n_emberhub_2026.xlsx");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function gitDiffNameOnly(filePath) {
  const repoPath = path.relative(root, filePath).replace(/\\/g, "/");
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

const checks = [];

checks.push({ name: "filling_rules_json_exists", pass: exists(fillingRulesPath), value: path.relative(root, fillingRulesPath) });
checks.push({ name: "decision_engine_json_exists", pass: exists(decisionEnginePath), value: path.relative(root, decisionEnginePath) });
checks.push({ name: "official_guide_doc_exists", pass: exists(officialGuideDocPath), value: path.relative(root, officialGuideDocPath) });
checks.push({ name: "validation_matrix_doc_exists", pass: exists(validationMatrixDocPath), value: path.relative(root, validationMatrixDocPath) });
checks.push({ name: "tax_model_doc_exists", pass: exists(taxModelDocPath), value: path.relative(root, taxModelDocPath) });
checks.push({ name: "resico_doc_exists", pass: exists(resicoDocPath), value: path.relative(root, resicoDocPath) });

let fillingRules = null;
let decisionEngine = null;
let guideDoc = "";
let validationDoc = "";
let taxDoc = "";
let resicoDoc = "";

try {
  fillingRules = readJson(fillingRulesPath);
  decisionEngine = readJson(decisionEnginePath);
  guideDoc = readText(officialGuideDocPath);
  validationDoc = readText(validationMatrixDocPath);
  taxDoc = readText(taxModelDocPath);
  resicoDoc = readText(resicoDocPath);
  checks.push({ name: "json_files_parse", pass: true, value: "filling_rules/decision_engine" });
} catch (error) {
  checks.push({ name: "json_files_parse", pass: false, value: error.message });
}

if (fillingRules) {
  checks.push({ name: "official_guide_read_123_pages", pass: fillingRules.guide_page_count >= 120, value: fillingRules.guide_page_count });
  checks.push({ name: "official_sources_recorded", pass: /Anexo_20/i.test(fillingRules.sources.official_filling_guide_pdf) && /catCFDI_V_4_20260603\.xls/i.test(fillingRules.sources.official_master_catalog_xls), value: "Anexo 20 + catCFDI" });
  checks.push({ name: "rules_extracted", pass: Array.isArray(fillingRules.rules) && fillingRules.rules.length >= 25, value: fillingRules.rules?.length || 0 });
  checks.push({
    name: "rules_follow_requested_shape",
    pass: fillingRules.rules.every((rule) => rule.source === "ANEXO20_OFICIAL" && rule.category && rule.condition && Array.isArray(rule.applies_to) && ["INFO", "WARNING", "BLOCKER"].includes(rule.severity)),
    value: "source/category/condition/severity/applies_to",
  });
  for (const requiredRule of ["CFDI40-006", "CFDI40-007", "CFDI40-009", "CFDI40-012", "CFDI40-021", "CFDI40-026", "CFDI40-027"]) {
    checks.push({ name: `required_rule:${requiredRule}`, pass: fillingRules.rules.some((rule) => rule.rule_id === requiredRule), value: requiredRule });
  }
  for (const term of ["ClaveProdServ", "ClaveUnidad", "ObjetoImp", "UsoCFDI", "RegimenFiscal", "Impuestos"]) {
    checks.push({ name: `guide_term_pages:${term}`, pass: Array.isArray(fillingRules.guide_term_pages?.[term]) && fillingRules.guide_term_pages[term].length > 0, value: term });
  }
}

if (decisionEngine) {
  checks.push({ name: "decision_engine_created", pass: decisionEngine.schema_version === "cfdi40_decision_engine.v1", value: decisionEngine.schema_version });
  checks.push({ name: "decision_engine_never_invents", pass: (decisionEngine.decision_contract?.never_invent || []).includes("clave_prod_serv") && (decisionEngine.decision_contract?.never_invent || []).includes("clave_unidad"), value: "clave_prod_serv/clave_unidad" });
  checks.push({ name: "decision_engine_requires_human_review", pass: decisionEngine.decision_contract?.requires_human_review === true, value: "true" });
  checks.push({ name: "decision_engine_no_pac_timbrado", pass: decisionEngine.decision_contract?.no_timbrado_no_pac === true, value: "true" });
  checks.push({ name: "decision_engine_has_resico_626", pass: decisionEngine.resico_626_summary?.regimen_entry?.clave === "626", value: decisionEngine.resico_626_summary?.regimen_entry?.descripcion || "" });
}

checks.push({ name: "guide_doc_mentions_official_sources", pass: /Fuentes oficiales usadas/.test(guideDoc) && /Catalogo maestro/.test(guideDoc), value: "sources" });
checks.push({ name: "validation_matrix_mentions_ready_rules", pass: /CFDI40-006/.test(validationDoc) && /ClaveProdServ/.test(validationDoc), value: "ClaveProdServ" });
checks.push({ name: "tax_model_mentions_objeto_imp", pass: /Objeto de impuesto/.test(taxDoc) && /IVA/.test(taxDoc), value: "tax" });
checks.push({ name: "resico_matrix_mentions_626", pass: /626/.test(resicoDoc) && /No timbrar/.test(resicoDoc), value: "626/no timbrar" });
checks.push({ name: "active_catalog_not_modified", pass: gitDiffNameOnly(activeCatalogPath) === "", value: "data/concepts.normalized.json" });
checks.push({ name: "active_excel_not_modified", pass: !exists(activeExcelPath) || gitDiffNameOnly(activeExcelPath) === "", value: "data/base_cfdi_resico_n8n_emberhub_2026.xlsx" });

const passed = checks.filter((check) => check.pass).length;

console.log("CFDI 4.0 filling guide contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const kbDir = path.join(root, "data", "knowledge_base");
const docsDir = path.join(root, "docs");

const files = {
  master: path.join(kbDir, "cfdi40_master_knowledge.json"),
  prodServ: path.join(kbDir, "cfdi40_claveprodserv_index.json"),
  unidad: path.join(kbDir, "cfdi40_claveunidad_index.json"),
  decision: path.join(kbDir, "cfdi40_decision_engine.json"),
  rules: path.join(kbDir, "cfdi40_filling_rules.json"),
  masterDoc: path.join(docsDir, "CFDI40_MASTER_CATALOG_MAP.md"),
  prodServDoc: path.join(docsDir, "CFDI40_CLAVEPRODSERV_ANALYSIS.md"),
  unidadDoc: path.join(docsDir, "CFDI40_CLAVEUNIDAD_ANALYSIS.md"),
  regimenDoc: path.join(docsDir, "CFDI40_REGIMEN_ANALYSIS.md"),
  usoDoc: path.join(docsDir, "CFDI40_USOCFDI_ANALYSIS.md"),
  roadmapDoc: path.join(docsDir, "CFDI40_IMPLEMENTATION_ROADMAP.md"),
};

const protectedPaths = [
  "data/concepts.normalized.json",
  "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function gitDiffNameOnly(repoPath) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

const checks = [];

for (const [name, filePath] of Object.entries(files)) {
  checks.push({ name: `file_exists:${name}`, pass: exists(filePath), value: path.relative(root, filePath).replace(/\\/g, "/") });
}

let master = null;
let prodServ = null;
let unidad = null;
let decision = null;
let rules = null;
try {
  master = readJson(files.master);
  prodServ = readJson(files.prodServ);
  unidad = readJson(files.unidad);
  decision = readJson(files.decision);
  rules = readJson(files.rules);
  checks.push({ name: "all_json_parse", pass: true, value: "5 JSON" });
} catch (error) {
  checks.push({ name: "all_json_parse", pass: false, value: error.message });
}

if (master) {
  checks.push({ name: "master_kb_schema", pass: master.schema_version === "cfdi40_master_knowledge.v1", value: master.schema_version });
  checks.push({ name: "master_reads_each_sheet", pass: Array.isArray(master.sheet_inventory) && master.sheet_inventory.length >= 28, value: master.sheet_inventory?.length || 0 });
  for (const sheetName of ["c_ClaveProdServ", "c_ClaveUnidad", "c_RegimenFiscal", "c_UsoCFDI", "c_ObjetoImp", "c_Impuesto", "c_TasaOCuota"]) {
    checks.push({ name: `sheet_detected:${sheetName}`, pass: master.sheet_inventory.some((sheet) => sheet.name === sheetName), value: sheetName });
  }
  checks.push({ name: "master_has_row_counts", pass: master.row_counts?.clave_prod_serv_all > 50000 && master.row_counts?.clave_unidad_all > 2000, value: `prod=${master.row_counts?.clave_prod_serv_all} unidad=${master.row_counts?.clave_unidad_all}` });
  checks.push({ name: "master_has_official_catalogs", pass: master.official_catalogs?.objeto_imp?.some((item) => item.clave === "02") && master.official_catalogs?.impuesto?.some((item) => item.clave === "002"), value: "ObjetoImp 02 / IVA 002" });
  checks.push({ name: "master_has_active_catalog_facts", pass: master.active_catalog_facts?.concept_count >= 80, value: master.active_catalog_facts?.concept_count || 0 });
}

if (prodServ) {
  checks.push({ name: "prodserv_schema", pass: prodServ.schema_version === "cfdi40_claveprodserv_index.v1", value: prodServ.schema_version });
  checks.push({ name: "prodserv_uses_master_xls", pass: /catCFDI_V_4_20260603\.xls/i.test(prodServ.source_file), value: prodServ.source_file });
  checks.push({ name: "prodserv_has_deep_index", pass: prodServ.total_rows_in_sheet > 50000 && prodServ.entries.length > 1000, value: `${prodServ.total_rows_in_sheet}/${prodServ.entries.length}` });
  checks.push({ name: "prodserv_has_cctv_family", pass: (prodServ.grouped_by_operational_family?.CCTV || []).length > 0, value: "CCTV" });
  checks.push({ name: "prodserv_has_red_family", pass: (prodServ.grouped_by_operational_family?.RED_COMUNICACION || []).length > 0, value: "RED_COMUNICACION" });
  checks.push({ name: "prodserv_has_computo_family", pass: (prodServ.grouped_by_operational_family?.COMPUTO || []).length > 0, value: "COMPUTO" });
  checks.push({ name: "prodserv_has_control_acceso_family", pass: (prodServ.grouped_by_operational_family?.CONTROL_ACCESO || []).length > 0, value: "CONTROL_ACCESO" });
  checks.push({ name: "active_product_keys_exist_in_master", pass: prodServ.active_catalog_key_validation.length > 0 && prodServ.active_catalog_key_validation.every((item) => item.exists_in_master_catalog), value: prodServ.active_catalog_key_validation.length });
  checks.push({ name: "prodserv_false_positive_guards", pass: (prodServ.false_positive_guards || []).some((item) => /Fuente de poder/i.test(item)), value: "fuente de poder" });
}

if (unidad) {
  checks.push({ name: "unidad_schema", pass: unidad.schema_version === "cfdi40_claveunidad_index.v1", value: unidad.schema_version });
  checks.push({ name: "unidad_has_full_index", pass: unidad.total_rows_indexed > 2000 && unidad.entries.length > 2000, value: unidad.total_rows_indexed });
  checks.push({ name: "unidad_has_e48", pass: unidad.entries.some((item) => item.clave === "E48"), value: "E48" });
  checks.push({ name: "unidad_has_h87", pass: unidad.entries.some((item) => item.clave === "H87"), value: "H87" });
  checks.push({ name: "active_unit_keys_exist_in_master", pass: unidad.active_catalog_unit_validation.length > 0 && unidad.active_catalog_unit_validation.every((item) => item.exists_in_master_catalog), value: unidad.active_catalog_unit_validation.length });
}

if (decision) {
  checks.push({ name: "decision_has_stages", pass: Array.isArray(decision.stages) && decision.stages.length >= 5, value: decision.stages?.length || 0 });
  checks.push({ name: "decision_operation_policy", pass: decision.operation_type_policy?.venta === "PRODUCTO" && decision.operation_type_policy?.cambio_reemplazo_sustitucion === "SERVICIO_O_MIXTO", value: "venta/cambio" });
  checks.push({ name: "decision_ambiguity_policy", pass: decision.ambiguity_policy?.action === "PEDIR_ACLARACION" && decision.ambiguity_policy?.ready_to_copy === false, value: "PEDIR_ACLARACION" });
}

if (rules) {
  checks.push({ name: "rules_have_source_pages", pass: rules.rules.filter((rule) => Array.isArray(rule.source_pages) && rule.source_pages.length > 0).length >= 15, value: "source_pages" });
  checks.push({ name: "rules_have_no_timbrado_limit", pass: rules.rules.some((rule) => rule.rule_id === "CFDI40-027" && /timbrado|PAC/i.test(rule.expected_behavior)), value: "CFDI40-027" });
}

const masterDoc = exists(files.masterDoc) ? readText(files.masterDoc) : "";
const prodServDoc = exists(files.prodServDoc) ? readText(files.prodServDoc) : "";
const unidadDoc = exists(files.unidadDoc) ? readText(files.unidadDoc) : "";
const regimenDoc = exists(files.regimenDoc) ? readText(files.regimenDoc) : "";
const usoDoc = exists(files.usoDoc) ? readText(files.usoDoc) : "";
const roadmapDoc = exists(files.roadmapDoc) ? readText(files.roadmapDoc) : "";

checks.push({ name: "master_doc_maps_sheets", pass: /c_ClaveProdServ/.test(masterDoc) && /c_ClaveUnidad/.test(masterDoc), value: "sheet map" });
checks.push({ name: "prodserv_doc_has_active_validation", pass: /Validacion contra catalogo activo/.test(prodServDoc), value: "active validation" });
checks.push({ name: "unidad_doc_has_e48_h87_policy", pass: /E48/.test(unidadDoc) && /H87/.test(unidadDoc), value: "E48/H87" });
checks.push({ name: "regimen_doc_has_626", pass: /626/.test(regimenDoc), value: "626" });
checks.push({ name: "uso_doc_has_626_compatibility", pass: /receptor 626/i.test(usoDoc), value: "UsoCFDI 626" });
checks.push({ name: "roadmap_no_workflow_change", pass: /Workflows n8n no modificados/i.test(roadmapDoc), value: "workflow untouched" });

for (const repoPath of protectedPaths) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const passed = checks.filter((check) => check.pass).length;

console.log("CFDI 4.0 knowledge base contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

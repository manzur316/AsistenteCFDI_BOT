const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const importedPath = path.join(root, "data", "sat_official", "imported_sat_catalog.normalized.json");
const inventoryPath = path.join(root, "docs", "SAT_COMPACT_FILES_INVENTORY.md");
const finalCatalogPath = path.join(root, "data", "concepts.normalized.json");
const excelPath = path.join(root, "data", "base_cfdi_resico_n8n_emberhub_2026.xlsx");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function gitDiffNameOnly(file) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", file], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function hasFile(inventory, namePart) {
  return (inventory.file_inventory || []).some((file) => file.name.toLowerCase().includes(namePart.toLowerCase()));
}

function count(imported, key) {
  return (imported[key] || []).length;
}

const checks = [];
let imported = null;
let inventory = "";

try {
  imported = readJson(importedPath);
  inventory = fs.readFileSync(inventoryPath, "utf8");
  checks.push({ name: "imported_json_exists_and_parses", pass: true, value: path.relative(root, importedPath) });
} catch (error) {
  checks.push({ name: "imported_json_exists_and_parses", pass: false, value: error.message });
}

checks.push({ name: "inventory_doc_exists", pass: fs.existsSync(inventoryPath), value: path.relative(root, inventoryPath) });

if (imported) {
  for (const required of [
    "Catalogo_SAT_Clave_Unidad",
    "Catalogo_SAT_objeto_impuesto",
    "Catalogo_SAT_Impuesto",
    "Catalogo_SAT_Regimen_Fiscal",
    "Catalogo_SAT_Uso_CFDI",
    "Catalogo_SAT_Tasa_O_Cuota",
    "Catalogo_SAT_Metodo_Pago",
    "Catalogo_SAT_Forma_de_Pago",
    "Catalogo_SAT_Tipo_De_Comprobante",
    "Catalogo_SAT_Tipo_Factor",
  ]) {
    checks.push({ name: `critical_file_detected:${required}`, pass: hasFile(imported, required), value: required });
  }

  checks.push({ name: "detects_sheets_and_columns", pass: (imported.file_inventory || []).some((file) => (file.sheets || []).some((sheet) => (sheet.columns || []).length > 0)), value: "columns" });
  checks.push({ name: "imports_c_claveunidad", pass: count(imported, "clave_unidad") > 1000 && imported.clave_unidad.some((item) => item.clave === "E48") && imported.clave_unidad.some((item) => item.clave === "H87"), value: count(imported, "clave_unidad") });
  checks.push({ name: "imports_c_objetoimp", pass: count(imported, "objeto_impuesto") >= 3 && imported.objeto_impuesto.some((item) => item.clave === "02"), value: count(imported, "objeto_impuesto") });
  checks.push({ name: "imports_c_impuesto", pass: count(imported, "impuesto") >= 3 && imported.impuesto.some((item) => /IVA/i.test(item.descripcion)), value: count(imported, "impuesto") });
  checks.push({ name: "imports_c_regimenfiscal", pass: count(imported, "regimen_fiscal") > 0 && imported.regimen_fiscal.some((item) => item.clave === "626"), value: count(imported, "regimen_fiscal") });
  checks.push({ name: "imports_c_usocfdi", pass: count(imported, "uso_cfdi") > 0 && imported.uso_cfdi.some((item) => item.clave === "G03"), value: count(imported, "uso_cfdi") });
  checks.push({ name: "imports_c_tasaocuota", pass: count(imported, "tasa_o_cuota") > 0, value: count(imported, "tasa_o_cuota") });
  checks.push({ name: "imports_c_metodopago", pass: count(imported, "metodo_pago") >= 2, value: count(imported, "metodo_pago") });
  checks.push({ name: "imports_c_formapago", pass: count(imported, "forma_pago") > 10, value: count(imported, "forma_pago") });
  checks.push({ name: "imports_c_tipocomprobante", pass: count(imported, "tipo_comprobante") >= 5, value: count(imported, "tipo_comprobante") });
  checks.push({ name: "imports_c_tipofactor", pass: count(imported, "tipo_factor") >= 3, value: count(imported, "tipo_factor") });
  checks.push({
    name: "reports_absence_of_official_claveprodserv",
    pass: count(imported, "clave_prod_serv") === 0 && (imported.warnings || []).some((warning) => warning.code === "MISSING_OFFICIAL_CLAVE_PROD_SERV"),
    value: `clave_prod_serv=${count(imported, "clave_prod_serv")}`,
  });
  checks.push({
    name: "source_rows_preserved",
    pass: ["clave_unidad", "objeto_impuesto", "impuesto", "regimen_fiscal", "uso_cfdi"].every((key) => (imported[key] || []).every((item) => item.source_file && item.source_sheet && item.source_row)),
    value: "source_file/source_sheet/source_row",
  });
}

checks.push({ name: "inventory_marks_compact_util", pass: /PDF Compact\.pdf.*\| Compact \| 0 \| UTIL/s.test(inventory), value: "Compact UTIL" });
checks.push({ name: "inventory_marks_geographic_secondary", pass: inventory.includes("Catalogo_SAT_Codigo_Postal.xlsx") && inventory.includes("SECUNDARIO"), value: "geographic secondary" });
checks.push({ name: "inventory_marks_aduana_ignored", pass: inventory.includes("Catalogo_SAT_Aduana.xlsx") && inventory.includes("IGNORAR"), value: "aduana ignored" });
checks.push({ name: "final_catalog_not_modified", pass: gitDiffNameOnly(path.relative(root, finalCatalogPath)) === "", value: "data/concepts.normalized.json" });
checks.push({ name: "excel_source_not_modified", pass: !fs.existsSync(excelPath) || gitDiffNameOnly(path.relative(root, excelPath)) === "", value: "excel source" });

console.log("SAT official import contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

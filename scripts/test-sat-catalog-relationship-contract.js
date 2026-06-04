const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const relationshipPath = path.join(root, "docs", "SAT_CATALOG_RELATIONSHIP_MAP.md");
const importedPath = path.join(root, "data", "sat_official", "imported_sat_catalog.normalized.json");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
let doc = "";
let imported = null;

try {
  doc = fs.readFileSync(relationshipPath, "utf8");
  imported = JSON.parse(fs.readFileSync(importedPath, "utf8"));
  checks.push({ name: "inputs_parse", pass: true, value: "relationship/imported" });
} catch (error) {
  checks.push({ name: "inputs_parse", pass: false, value: error.message });
}

for (const term of [
  "c_ClaveProdServ",
  "c_ClaveUnidad",
  "c_ObjetoImp",
  "c_Impuesto",
  "c_TipoFactor",
  "c_TasaOCuota",
  "c_RegimenFiscal",
  "c_UsoCFDI",
  "c_MetodoPago",
  "c_FormaPago",
  "c_TipoDeComprobante",
]) {
  checks.push({ name: `documents:${term}`, pass: doc.includes(term), value: term });
}

checks.push({ name: "geographic_catalogs_are_not_scoring", pass: /geograficos/i.test(doc) && /No deben afectar el scoring/i.test(doc), value: "geo != scoring" });
checks.push({ name: "resico_626_scope_documented", pass: doc.includes("626 RESICO") && doc.includes("Software") && doc.includes("WhatsApp"), value: "scope" });

if (imported) {
  checks.push({ name: "relationship_counts_match_imported", pass: doc.includes(`c_ClaveUnidad | ${imported.clave_unidad.length}`) && doc.includes(`c_ClaveProdServ | ${imported.clave_prod_serv.length}`), value: "counts" });
}

console.log("SAT catalog relationship contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

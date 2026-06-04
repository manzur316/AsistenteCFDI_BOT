const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const importedPath = path.join(root, "data", "sat_official", "imported_sat_catalog.normalized.json");
const compactDocPath = path.join(root, "docs", "COMPACT_CATALOG_ANALYSIS.md");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
let imported = null;
let doc = "";

try {
  imported = JSON.parse(fs.readFileSync(importedPath, "utf8"));
  doc = fs.readFileSync(compactDocPath, "utf8");
  checks.push({ name: "inputs_parse", pass: true, value: "imported/doc" });
} catch (error) {
  checks.push({ name: "inputs_parse", pass: false, value: error.message });
}

if (imported) {
  const compact = imported.compact_reference || {};
  checks.push({ name: "compact_pdf_detected", pass: compact.file === "PDF Compact.pdf", value: compact.file || "N/A" });
  checks.push({ name: "compact_text_extractable", pass: compact.pages > 0 && compact.key_count > 0, value: `${compact.pages} pages/${compact.key_count} keys` });
  checks.push({ name: "compact_reference_only", pass: compact.source_role === "REFERENCE_ONLY", value: compact.source_role || "N/A" });
  checks.push({
    name: "compact_keys_cross_checked_against_sat_local",
    pass: (compact.keys_cross_check || []).length > 0 && (compact.keys_cross_check || []).every((item) => ["CONFIRMED_IN_LOCAL_SAT", "NEEDS_OFFICIAL_CONFIRMATION"].includes(item.status)),
    value: `${(compact.keys_cross_check || []).length} checked`,
  });
  checks.push({
    name: "compact_not_used_as_unique_official_source",
    pass: (imported.clave_prod_serv || []).length === 0 && (compact.keys_cross_check || []).some((item) => item.status === "NEEDS_OFFICIAL_CONFIRMATION"),
    value: "needs confirmation",
  });
}

checks.push({ name: "compact_doc_exists", pass: fs.existsSync(compactDocPath), value: path.relative(root, compactDocPath) });
checks.push({ name: "compact_doc_documents_useful_sections", pass: doc.includes("Secciones utiles detectadas") && doc.includes("Conceptos utiles para proponer"), value: "sections" });
checks.push({ name: "compact_doc_warns_reference_only", pass: doc.includes("referencia") && doc.includes("fuente oficial unica"), value: "reference only" });
checks.push({ name: "compact_doc_mentions_official_confirmation", pass: doc.includes("NEEDS_OFFICIAL_CONFIRMATION"), value: "confirmation" });
checks.push({ name: "compact_doc_no_massive_ocr", pass: doc.includes("No se uso OCR masivo"), value: "no OCR" });
checks.push({ name: "compact_doc_not_too_large", pass: doc.length < 20000, value: `${doc.length} chars` });

console.log("Compact catalog analysis contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

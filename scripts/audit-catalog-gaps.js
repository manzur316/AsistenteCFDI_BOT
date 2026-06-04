const fs = require("fs");
const path = require("path");
const scoring = require("./scoring");
const { MISSING_MESSAGE, OUTPUT_PATH: SAT_IMPORT_PATH, listOfficialFiles } = require("./import-sat-catalog");

const root = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(root, "data", "concepts.normalized.json");
const REPORT_PATH = path.join(root, "docs", "CATALOG_GAPS_REPORT.md");

const CASES = [
  {
    id: "camera_not_dvr",
    text: "venta de camara CCTV 1200 + IVA",
    expectedFamily: "CCTV",
    expectedType: "PRODUCTO",
    forbiddenContains: ["DVR", "NVR", "GRABADOR"],
    target: "Debe proponer camara, no grabador.",
  },
  {
    id: "dvr_not_camera",
    text: "venta de DVR para camaras 1200 + IVA",
    expectedFamily: "CCTV",
    expectedType: "PRODUCTO",
    forbiddenContains: ["CAMARA DE VIDEOVIGILANCIA"],
    target: "Debe proponer DVR/NVR cuando el texto lo dice.",
  },
  {
    id: "power_not_camera",
    text: "venta de fuente de poder para camara",
    expectedFamily: "CCTV",
    expectedType: "PRODUCTO",
    forbiddenContains: ["CAMARA DE VIDEOVIGILANCIA", "DVR", "NVR", "GRABADOR"],
    target: "Fuente CCTV no debe sustituirse por camara o grabador.",
  },
  {
    id: "ssd_computo",
    text: "venta de SSD para computadora",
    expectedFamily: "COMPUTO",
    expectedType: "PRODUCTO",
    forbiddenContains: ["CCTV", "CONTROL DE ACCESO", "RFID", "TAG"],
    target: "SSD debe caer en computo/producto.",
  },
  {
    id: "ap_red",
    text: "venta de access point",
    expectedFamily: "RED",
    expectedType: "PRODUCTO",
    forbiddenContains: ["COMPUTO", "CONTROL DE ACCESO"],
    target: "Access point debe caer en red/comunicacion/producto.",
  },
  {
    id: "router_red",
    text: "venta de router",
    expectedFamily: "RED",
    expectedType: "PRODUCTO",
    forbiddenContains: ["COMPUTO", "CONTROL DE ACCESO"],
    target: "Router debe caer en red/comunicacion/producto.",
  },
  {
    id: "switch_red",
    text: "venta de switch",
    expectedFamily: "RED",
    expectedType: "PRODUCTO",
    forbiddenContains: ["COMPUTO", "CONTROL DE ACCESO"],
    target: "Switch debe caer en red/comunicacion/producto.",
  },
];

function readCatalog() {
  return JSON.parse(fs.readFileSync(CATALOG_PATH, "utf8"));
}

function normalized(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function resultSummary(result) {
  return {
    action: result.action || result.accion || result.accion_n8n || null,
    concept_id: result.concept?.id || result.concept_id || null,
    concept: result.concept?.concepto_factura || result.concepto_sugerido || null,
    family: result.concept?.familia || result.family || result.familia || null,
    type: result.concept?.tipo || result.concept_type || result.tipo || null,
    key: result.concept?.clave_prod_serv || result.clave_prod_serv || null,
    unit: result.concept?.clave_unidad || result.clave_unidad || null,
  };
}

function checkCase(testCase, catalog) {
  const result = scoring.classifyMessage(testCase.text, catalog);
  const summary = resultSummary(result);
  const haystack = normalized(`${summary.concept_id || ""} ${summary.concept || ""} ${summary.family || ""} ${summary.type || ""}`);
  const forbidden = (testCase.forbiddenContains || []).filter((term) => haystack.includes(normalized(term)));
  const familyOk = !testCase.expectedFamily || normalized(summary.family).includes(normalized(testCase.expectedFamily));
  const typeOk = !testCase.expectedType || normalized(summary.type).includes(normalized(testCase.expectedType));
  const pass = familyOk && typeOk && forbidden.length === 0;
  return { ...testCase, pass, forbidden, summary };
}

function currentCatalogCoverage(catalog) {
  const concepts = catalog.concepts || [];
  const has = (predicate) => concepts.some(predicate);
  return [
    { item: "Producto camara CCTV especifico", ok: has((c) => /PROD-CCTV-001/.test(c.id || "") || /CAMARA/i.test(c.invoice_concept || "")) },
    { item: "Producto DVR/NVR especifico", ok: has((c) => /DVR|NVR|GRABADOR/i.test(c.invoice_concept || "")) },
    { item: "Producto fuente CCTV especifico", ok: has((c) => /FUENTE DE PODER/i.test(c.invoice_concept || "") && /CCTV|ELECTRONICO/i.test(c.invoice_concept || "")) },
    { item: "Producto SSD computo especifico", ok: has((c) => /SSD|ESTADO SOLIDO/i.test(c.invoice_concept || "")) },
    { item: "Producto access point especifico", ok: has((c) => /ACCESS POINT|PUNTO DE ACCESO/i.test(c.invoice_concept || "") && /VENTA/i.test(c.invoice_concept || "")) },
  ];
}

function importedSatStatus() {
  if (!fs.existsSync(SAT_IMPORT_PATH)) {
    return {
      exists: false,
      hasProductServices: false,
      productServices: 0,
      units: 0,
      warnings: [{ code: "NO_IMPORTED_SAT_CATALOG", message: MISSING_MESSAGE }],
      sourceFiles: [],
    };
  }
  const imported = JSON.parse(fs.readFileSync(SAT_IMPORT_PATH, "utf8"));
  return {
    exists: true,
    hasProductServices: (imported.clave_prod_serv || imported.product_services || []).length > 0,
    productServices: (imported.clave_prod_serv || imported.product_services || []).length,
    units: (imported.clave_unidad || imported.units || []).length,
    warnings: imported.warnings || [],
    sourceFiles: imported.source_files || [],
  };
}

function buildReport() {
  const catalog = readCatalog();
  const officialFiles = listOfficialFiles();
  const satStatus = importedSatStatus();
  const cases = CASES.map((testCase) => checkCase(testCase, catalog));
  const coverage = currentCatalogCoverage(catalog);
  const gaps = cases.filter((item) => !item.pass);
  const lines = [];

  lines.push("# Catalog Gaps Report", "");
  lines.push("Generated by `scripts/audit-catalog-gaps.js`.", "");
  lines.push("## SAT Official Source Status", "");
  if (!satStatus.exists) {
    lines.push("- Status: BLOCKED_MISSING_SAT_OFFICIAL_CATALOG");
    lines.push(`- Message: ${MISSING_MESSAGE}`);
    lines.push("- No new SAT keys were proposed.");
  } else if (!satStatus.hasProductServices) {
    lines.push("- Status: BLOCKED_MISSING_OFFICIAL_CLAVE_PROD_SERV");
    lines.push("- Auxiliary SAT catalogs were imported, but the official local `c_ClaveProdServ` catalog was not found.");
    lines.push(`- c_ClaveProdServ imported: ${satStatus.productServices}`);
    lines.push(`- c_ClaveUnidad imported: ${satStatus.units}`);
    lines.push("- No Compact key is treated as official without cross-checking against `c_ClaveProdServ`.");
  } else {
    lines.push(`- Local official c_ClaveProdServ entries imported: ${satStatus.productServices}`);
    lines.push(`- Local official files found: ${officialFiles.map((file) => path.basename(file)).join(", ")}`);
  }

  lines.push("", "## Current Catalog Coverage", "");
  for (const item of coverage) lines.push(`- ${item.ok ? "OK" : "GAP"}: ${item.item}`);

  lines.push("", "## Semantic Substitution Audit", "");
  for (const item of cases) {
    const status = item.pass ? "OK" : "GAP";
    lines.push(`### ${status} - ${item.id}`);
    lines.push(`- Text: ${item.text}`);
    lines.push(`- Target: ${item.target}`);
    lines.push(`- Current concept: ${item.summary.concept_id || "N/A"} - ${item.summary.concept || "N/A"}`);
    lines.push(`- Current family/type: ${item.summary.family || "N/A"} / ${item.summary.type || "N/A"}`);
    if (item.forbidden.length) lines.push(`- Forbidden match detected: ${item.forbidden.join(", ")}`);
    lines.push("");
  }

  lines.push("## Gaps Detected", "");
  if (!gaps.length) {
    lines.push("- No semantic substitution gaps detected in the audited cases.");
  } else {
    for (const gap of gaps) {
      lines.push(`- ${gap.id}: ${gap.text} -> ${gap.summary.concept_id || "N/A"} (${gap.summary.concept || "N/A"})`);
    }
  }

  lines.push("", "## Required Human Review", "");
  lines.push("- Any proposed concept with `precision_level=BROAD_ALLOWED` needs human review.");
  lines.push("- Any missing official SAT key becomes `GAP_REQUIRES_REVIEW` and must not be suggested automatically.");
  lines.push("- The final catalog `data/concepts.normalized.json` remains unchanged in this phase.");

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
  return { report_path: REPORT_PATH, gaps, cases, official_files: officialFiles, sat_status: satStatus };
}

if (require.main === module) {
  const result = buildReport();
  console.log(`Reporte generado: ${result.report_path}`);
  console.log(`c_ClaveProdServ oficial local: ${result.sat_status.hasProductServices ? "SI" : "NO"}`);
  console.log(`Gaps: ${result.gaps.length}`);
  if (!result.sat_status.hasProductServices) {
    console.log(MISSING_MESSAGE);
  }
}

module.exports = {
  CASES,
  REPORT_PATH,
  buildReport,
};

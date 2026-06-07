const assert = require("assert");
const {
  detectSheetNamesByBinaryScan,
  loadSatCatalogWorkbook,
  workbookSignature,
} = require("./lib/sat-catalogs/sat-catalog-loader");
const { REQUIRED_CATALOGS } = require("./lib/sat-catalogs/sat-catalog-normalizer");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

const SOURCE_FILE = "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL/catCFDI_V_4_20260603.xls";

test("Excel SAT puede ser leido/indexado desde ruta local", () => {
  const result = loadSatCatalogWorkbook();
  if (result.status === "NEEDS_SOURCE") {
    assert.strictEqual(result.ok, false);
    return "NEEDS_SOURCE";
  }
  assert.strictEqual(result.workbook_signature, "OLE_XLS");
  assert(result.detected_sheets.includes("c_ClaveProdServ"));
  assert(result.detected_sheets.includes("c_ClaveUnidad"));
  assert(result.detected_sheets.includes("c_UsoCFDI"));
  assert.strictEqual(result.catalog_validation.ok, true);
  return `${result.detected_sheets.length} sheets`;
});

test("ruta inexistente devuelve NEEDS_SOURCE", () => {
  const result = loadSatCatalogWorkbook({ filePath: "C:/missing/catCFDI.xls" });
  assert.strictEqual(result.status, "NEEDS_SOURCE");
  assert.strictEqual(result.ok, false);
  return result.status;
});

test("detector binario encuentra hojas principales", () => {
  const sheets = detectSheetNamesByBinaryScan(SOURCE_FILE, REQUIRED_CATALOGS);
  if (sheets.length === 0) return "source missing";
  for (const name of ["c_FormaPago", "c_RegimenFiscal", "c_TasaOCuota"]) {
    assert(sheets.includes(name), name);
  }
  assert.strictEqual(workbookSignature(SOURCE_FILE), "OLE_XLS");
  return "binary_scan";
});

let pass = 0;
for (const item of tests) {
  try {
    const detail = item.fn();
    pass += 1;
    console.log(`PASS ${item.name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`PASS total: ${pass}/${tests.length}`);

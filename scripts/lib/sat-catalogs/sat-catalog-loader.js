const fs = require("fs");
const path = require("path");
const { buildSatSourceRegistry, DEFAULT_SAT_SOURCE_DIR, normalizePath } = require("./sat-source-registry");
const { REQUIRED_CATALOGS, normalizeCatalogRow, validateCatalogSet } = require("./sat-catalog-normalizer");

function optionalRequire(moduleName) {
  try {
    return require(moduleName);
  } catch (_error) {
    return null;
  }
}

function workbookSignature(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const fd = fs.openSync(filePath, "r");
  try {
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, header.length, 0);
    if (header.equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return "OLE_XLS";
    if (header.subarray(0, 2).equals(Buffer.from([0x50, 0x4b]))) return "ZIP_XLSX";
    return "UNKNOWN";
  } finally {
    fs.closeSync(fd);
  }
}

function detectSheetNamesByBinaryScan(filePath, expectedCatalogs = REQUIRED_CATALOGS) {
  if (!fs.existsSync(filePath)) return [];
  const buffer = fs.readFileSync(filePath);
  return expectedCatalogs.filter((sheetName) => buffer.includes(Buffer.from(sheetName, "utf8")));
}

function readWorkbookWithXlsx(filePath, options = {}) {
  const XLSX = optionalRequire("xlsx");
  if (!XLSX) {
    return {
      ok: false,
      status: "NEEDS_READER",
      reason: "Modulo opcional 'xlsx' no disponible. El loader mantiene contrato, hash y deteccion binaria de hojas.",
      sheets: [],
      entries: [],
    };
  }
  const workbook = XLSX.readFile(filePath, { cellDates: true });
  const wanted = options.catalogs || REQUIRED_CATALOGS;
  const sheets = [];
  const entries = [];
  for (const sheetName of workbook.SheetNames) {
    if (!wanted.includes(sheetName)) continue;
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });
    sheets.push({ name: sheetName, row_count: rows.length, imported: true });
    const batchLimit = Number(options.maxRowsPerCatalog || 0);
    const importRows = batchLimit > 0 ? rows.slice(0, batchLimit) : rows;
    for (const row of importRows) {
      const entry = normalizeCatalogRow(row, sheetName, { source_id: options.source_id || "sat-catcfdi-v4-20260603" });
      if (entry) entries.push(entry);
    }
  }
  return {
    ok: true,
    status: "IMPORTED",
    sheets,
    entries,
  };
}

function loadSatCatalogWorkbook(options = {}) {
  const sourceDir = normalizePath(options.sourceDir || DEFAULT_SAT_SOURCE_DIR);
  const filePath = normalizePath(options.filePath || path.join(sourceDir, "catCFDI_V_4_20260603.xls"));
  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      status: "NEEDS_SOURCE",
      file_path: filePath,
      message: "No existe catCFDI local. Coloca el archivo oficial SAT en la ruta local configurada.",
      catalog_validation: validateCatalogSet([]),
      entries: [],
      sheets: [],
    };
  }

  const registry = buildSatSourceRegistry({ sourceDir });
  const signature = workbookSignature(filePath);
  const detectedSheetNames = detectSheetNamesByBinaryScan(filePath, options.catalogs || REQUIRED_CATALOGS);
  const catalogValidation = validateCatalogSet(detectedSheetNames);
  const imported = options.importRows === true
    ? readWorkbookWithXlsx(filePath, { ...options, source_id: "sat-catcfdi-v4-20260603" })
    : { ok: false, status: "INDEX_ONLY", sheets: [], entries: [] };

  return {
    ok: signature !== null && detectedSheetNames.length > 0,
    status: imported.status === "IMPORTED" ? "IMPORTED" : "INDEX_ONLY",
    file_path: filePath,
    workbook_signature: signature,
    detected_sheets: detectedSheetNames,
    catalog_validation: catalogValidation,
    entries: imported.entries || [],
    sheets: imported.sheets.length
      ? imported.sheets
      : detectedSheetNames.map((name) => ({ name, imported: false, detected_by: "binary_scan" })),
    source_registry: registry,
    reader_status: imported.status,
    human_review_required: true,
  };
}

function summarizeCatalogEntries(entries = []) {
  const byCatalog = {};
  for (const entry of entries) {
    byCatalog[entry.catalog_name] = (byCatalog[entry.catalog_name] || 0) + 1;
  }
  return byCatalog;
}

module.exports = {
  detectSheetNamesByBinaryScan,
  loadSatCatalogWorkbook,
  readWorkbookWithXlsx,
  summarizeCatalogEntries,
  workbookSignature,
};

const fs = require("fs");
const path = require("path");
const { loadSatCatalogWorkbook, summarizeCatalogEntries } = require("./lib/sat-catalogs/sat-catalog-loader");

const root = path.resolve(__dirname, "..");
const DEFAULT_OUTPUT = path.join(root, "runtime", "sat-catalog-import", "sat-catalog-index.json");

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    sourceDir: null,
    output: DEFAULT_OUTPUT,
    importRows: false,
    maxRowsPerCatalog: 0,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--source-dir") out.sourceDir = argv[++index] || null;
    else if (key.startsWith("--source-dir=")) out.sourceDir = key.slice("--source-dir=".length);
    else if (key === "--output") out.output = argv[++index] || DEFAULT_OUTPUT;
    else if (key.startsWith("--output=")) out.output = key.slice("--output=".length);
    else if (key === "--import-rows") out.importRows = true;
    else if (key === "--max-rows-per-catalog") out.maxRowsPerCatalog = Number(argv[++index] || 0);
  }
  return out;
}

function writeSafeIndex(result, outputPath = DEFAULT_OUTPUT) {
  const payload = {
    schema_version: "sat_catalog_import_index.v1",
    generated_at: new Date().toISOString(),
    status: result.status,
    ok: result.ok,
    workbook_signature: result.workbook_signature,
    detected_sheets: result.detected_sheets,
    catalog_validation: result.catalog_validation,
    reader_status: result.reader_status,
    entries_by_catalog: summarizeCatalogEntries(result.entries),
    source_registry: result.source_registry,
    human_review_required: true,
    note: "Indice seguro local. No copia el XLS/PDF oficial al repo.",
  };
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

function importSatCatalogs(options = {}) {
  const result = loadSatCatalogWorkbook(options);
  const index = writeSafeIndex(result, options.output || DEFAULT_OUTPUT);
  return { ...result, index_path: String(options.output || DEFAULT_OUTPUT).replace(/\\/g, "/"), index };
}

if (require.main === module) {
  try {
    const args = parseArgs();
    const result = importSatCatalogs(args);
    console.log(JSON.stringify({
      ok: result.ok,
      status: result.status,
      reader_status: result.reader_status,
      detected_sheets: result.detected_sheets.length,
      missing_sheets: result.catalog_validation.missing,
      index_path: result.index_path,
      human_review_required: true,
    }, null, 2));
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    console.error(`SAT_CATALOG_IMPORT_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_OUTPUT,
  importSatCatalogs,
  parseArgs,
  writeSafeIndex,
};

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULT_SAT_SOURCE_DIR = "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL";
const SAT_SOURCE_TYPES = Object.freeze({
  SAT_CATALOG_XLS: "SAT_CATALOG_XLS",
  ANEXO_20_GUIDE_PDF: "ANEXO_20_GUIDE_PDF",
});
const SAT_SOURCE_STATUSES = Object.freeze({
  LOCAL_ONLY: "LOCAL_ONLY",
  IMPORTED: "IMPORTED",
  DERIVED: "DERIVED",
  NEEDS_SOURCE: "NEEDS_SOURCE",
});

const EXPECTED_SOURCES = Object.freeze([
  {
    source_id: "sat-catcfdi-v4-20260603",
    source_name: "catCFDI_V_4_20260603.xls",
    source_type: SAT_SOURCE_TYPES.SAT_CATALOG_XLS,
    expected_version: "20260603",
  },
  {
    source_id: "sat-anexo20-cfdi40-guide",
    source_name: "Anexo_20_Guia_de_llenado_CFDI .pdf",
    source_type: SAT_SOURCE_TYPES.ANEXO_20_GUIDE_PDF,
    expected_version: "CFDI_4.0",
  },
]);

function normalizePath(filePath) {
  return String(filePath || "").replace(/\\/g, "/");
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest("hex");
}

function detectCatalogVersion(fileName) {
  const match = String(fileName || "").match(/(\d{8})/);
  return match ? match[1] : null;
}

function inspectSource(source, options = {}) {
  const sourceDir = normalizePath(options.sourceDir || DEFAULT_SAT_SOURCE_DIR);
  const sourcePath = path.join(sourceDir, source.source_name);
  if (!fs.existsSync(sourcePath)) {
    return {
      ...source,
      source_path: normalizePath(sourcePath),
      source_hash: null,
      catalog_version: source.expected_version || detectCatalogVersion(source.source_name),
      loaded_at: new Date().toISOString(),
      status: SAT_SOURCE_STATUSES.NEEDS_SOURCE,
      note: "Fuente oficial no encontrada localmente. SATBOT no copia ni inventa catalogos.",
    };
  }
  const stat = fs.statSync(sourcePath);
  return {
    ...source,
    source_path: normalizePath(sourcePath),
    source_hash: sha256File(sourcePath),
    catalog_version: detectCatalogVersion(source.source_name) || source.expected_version || null,
    loaded_at: new Date().toISOString(),
    file_size_bytes: stat.size,
    last_modified_at: stat.mtime.toISOString(),
    status: SAT_SOURCE_STATUSES.LOCAL_ONLY,
    note: source.source_type === SAT_SOURCE_TYPES.ANEXO_20_GUIDE_PDF
      ? "La guia de llenado se usa como referencia tecnica; no sustituye disposiciones fiscales ni revision humana."
      : "Catalogo SAT local registrado como fuente oficial. No se copia el archivo pesado al repo.",
  };
}

function buildSatSourceRegistry(options = {}) {
  const sources = EXPECTED_SOURCES.map((source) => inspectSource(source, options));
  return {
    schema_version: "sat_source_registry.v1",
    generated_at: new Date().toISOString(),
    source_dir: normalizePath(options.sourceDir || DEFAULT_SAT_SOURCE_DIR),
    sources,
    ok: sources.every((source) => source.status !== SAT_SOURCE_STATUSES.NEEDS_SOURCE),
    human_review_required: true,
    disclaimer: "SATBOT pre-valida y sugiere; no sustituye contador ni PAC/SAT.",
  };
}

module.exports = {
  DEFAULT_SAT_SOURCE_DIR,
  EXPECTED_SOURCES,
  SAT_SOURCE_STATUSES,
  SAT_SOURCE_TYPES,
  buildSatSourceRegistry,
  detectCatalogVersion,
  inspectSource,
  normalizePath,
  sha256File,
};

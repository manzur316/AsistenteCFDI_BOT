const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const SAT_DIR = path.join(root, "data", "sat_official");
const OUTPUT_PATH = path.join(SAT_DIR, "imported_sat_catalog.normalized.json");
const MISSING_MESSAGE = "Falta catálogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.";

function ensureSatDir() {
  fs.mkdirSync(SAT_DIR, { recursive: true });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, "");
}

function listOfficialFiles() {
  ensureSatDir();
  return fs
    .readdirSync(SAT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /^catcfdi/i.test(name) || /claveprodserv|claveunidad|catcfdi/i.test(name))
    .filter((name) => /\.(csv|txt|tsv|xlsx|xls)$/i.test(name))
    .map((name) => path.join(SAT_DIR, name));
}

function parseCsv(text, delimiter = null) {
  const delim = delimiter || (text.split(/\r?\n/, 1)[0].includes("\t") ? "\t" : ",");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === delim && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => String(value).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => String(value).trim() !== "")) rows.push(row);
  return rows;
}

function rowsToObjects(rows) {
  if (!rows.length) return [];
  const headers = rows[0].map((header) => String(header || "").trim());
  return rows.slice(1).map((row, index) => {
    const obj = { __row_number: index + 2 };
    headers.forEach((header, colIndex) => {
      obj[header] = row[colIndex] === undefined ? "" : row[colIndex];
    });
    return obj;
  });
}

function readWorkbookRows(filePath) {
  let XLSX;
  try {
    XLSX = require("xlsx");
  } catch (_error) {
    throw new Error(`El archivo ${path.basename(filePath)} requiere el paquete xlsx para lectura local. Usa CSV oficial o instala xlsx en el entorno de scripts.`);
  }
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const rows = [];
  for (const sheetName of workbook.SheetNames || []) {
    const sheet = workbook.Sheets[sheetName];
    const sheetRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    for (const row of sheetRows) rows.push({ ...row, __sheet_name: sheetName });
  }
  return rows;
}

function valueByHeaders(row, candidates) {
  const entries = Object.entries(row || {});
  for (const candidate of candidates) {
    const normalizedCandidate = normalizeHeader(candidate);
    const found = entries.find(([key]) => normalizeHeader(key) === normalizedCandidate);
    if (found) return found[1];
  }
  return "";
}

function parseDateMaybe(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return new Date(`${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}T00:00:00Z`);
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}T00:00:00Z`);
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isActiveByEndDate(fechaFin) {
  const end = parseDateMaybe(fechaFin);
  if (!end) return true;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return end >= today;
}

function detectCatalogKind(row) {
  const keys = Object.keys(row || {}).map(normalizeHeader);
  if (keys.includes("cclaveprodserv") || keys.includes("claveprodserv")) return "product_service";
  if (keys.includes("cclaveunidad") || keys.includes("claveunidad")) return "unit";
  return null;
}

function normalizeSatRow(row, sourceFile) {
  const kind = detectCatalogKind(row);
  if (!kind) return null;
  const key = kind === "product_service"
    ? valueByHeaders(row, ["c_ClaveProdServ", "ClaveProdServ", "cClaveProdServ"])
    : valueByHeaders(row, ["c_ClaveUnidad", "ClaveUnidad", "cClaveUnidad"]);
  const description = valueByHeaders(row, ["Descripcion", "Descripción", "Nombre", "Texto", "description"]);
  const fechaInicio = valueByHeaders(row, ["Fecha inicio de vigencia", "FechaInicioVigencia", "fecha_inicio", "Vigencia desde"]);
  const fechaFin = valueByHeaders(row, ["Fecha fin de vigencia", "FechaFinVigencia", "fecha_fin", "Vigencia hasta"]);
  if (!String(key || "").trim()) return null;
  return {
    kind,
    key: String(key).trim(),
    description: String(description || "").trim(),
    fecha_inicio: String(fechaInicio || "").trim() || null,
    fecha_fin: String(fechaFin || "").trim() || null,
    active: isActiveByEndDate(fechaFin),
    source_catalog_file: path.basename(sourceFile),
    source_catalog_row_or_key: String(row.__row_number || row.__sheet_name || key),
  };
}

function readOfficialFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".csv" || ext === ".txt" || ext === ".tsv") {
    const text = fs.readFileSync(filePath, "utf8");
    return rowsToObjects(parseCsv(text, ext === ".tsv" ? "\t" : null));
  }
  if (ext === ".xlsx" || ext === ".xls") return readWorkbookRows(filePath);
  return [];
}

function importSatCatalog() {
  ensureSatDir();
  const files = listOfficialFiles();
  if (!files.length) {
    return {
      ok: false,
      message: MISSING_MESSAGE,
      files: [],
      product_services: [],
      units: [],
    };
  }

  const normalized = [];
  const errors = [];
  for (const file of files) {
    try {
      for (const row of readOfficialFile(file)) {
        const item = normalizeSatRow(row, file);
        if (item && item.active) normalized.push(item);
      }
    } catch (error) {
      errors.push({ file: path.basename(file), error: error.message });
    }
  }

  const productServices = normalized.filter((item) => item.kind === "product_service");
  const units = normalized.filter((item) => item.kind === "unit");
  const output = {
    schema_version: "1.0.0",
    source: "SAT_OFFICIAL_LOCAL",
    generated_at: new Date().toISOString(),
    source_files: files.map((file) => path.basename(file)),
    errors,
    product_services: productServices,
    units,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  return { ok: productServices.length > 0 || units.length > 0, output_path: OUTPUT_PATH, ...output };
}

if (require.main === module) {
  const result = importSatCatalog();
  if (!result.ok) {
    console.error(result.message || "No se pudo importar catalogo SAT oficial.");
    process.exit(1);
  }
  console.log(`Catalogo SAT importado: ${result.output_path}`);
  console.log(`c_ClaveProdServ activos: ${result.product_services.length}`);
  console.log(`c_ClaveUnidad activos: ${result.units.length}`);
  if (result.errors && result.errors.length) console.log(`Advertencias: ${result.errors.length}`);
}

module.exports = {
  SAT_DIR,
  OUTPUT_PATH,
  MISSING_MESSAGE,
  importSatCatalog,
  listOfficialFiles,
  normalizeText,
  normalizeHeader,
};

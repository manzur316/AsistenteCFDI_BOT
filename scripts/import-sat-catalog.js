const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const SAT_DIR = path.join(root, "data", "sat_official");
const DOCS_DIR = path.join(root, "docs");
const OUTPUT_PATH = path.join(SAT_DIR, "imported_sat_catalog.normalized.json");
const INVENTORY_DOC_PATH = path.join(DOCS_DIR, "SAT_COMPACT_FILES_INVENTORY.md");
const COMPACT_DOC_PATH = path.join(DOCS_DIR, "COMPACT_CATALOG_ANALYSIS.md");
const RELATIONSHIP_DOC_PATH = path.join(DOCS_DIR, "SAT_CATALOG_RELATIONSHIP_MAP.md");
const DEFAULT_SOURCE_DIR = path.join(SAT_DIR);
const EXAMPLE_SOURCE_DIR = "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD";
const MISSING_MESSAGE = "Falta catalogo oficial SAT. Coloca el archivo oficial catCFDI del SAT en data/sat_official/ y vuelve a ejecutar.";

const CRITICAL_FILES = [
  "Catalogo_SAT_Clave_Unidad.xlsx",
  "Catalogo_SAT_Objeto_Impuesto.xlsx",
  "Catalogo_SAT_objeto_impuesto.xlsx",
  "Catalogo_SAT_Impuesto.xlsx",
  "Catalogo_SAT_Regimen_Fiscal.xlsx",
  "Catalogo_SAT_Uso_CFDI.xlsx",
  "Catalogo_SAT_Tasa_o_Cuota.xlsx",
  "Catalogo_SAT_Tasa_O_Cuota.xlsx",
  "Catalogo_SAT_Metodo_Pago.xlsx",
  "Catalogo_SAT_Forma_de_Pago.xlsx",
  "Catalogo_SAT_Tipo_De_Comprobante.xlsx",
  "Catalogo_SAT_Tipo_Factor.xlsx",
];

const SUPERFICIAL_FILES = [
  "Catalogo_SAT_Codigo_Postal.xlsx",
  "Catalogo_SAT_Colonia.xlsx",
  "Catalogo_SAT_Estado.xlsx",
  "Catalogo_SAT_Municipio.xlsx",
  "Catalogo_SAT_Localidad.xlsx",
  "Catalogo_SAT_Pais.xlsx",
  "Catalogo_SAT_Moneda.xlsx",
  "Catalogo_SAT_Periodicidad.xlsx",
  "Catalogo_SAT_Meses.xlsx",
  "Catalogo_SAT_Exportacion.xlsx",
  "Catalogo_SAT_Tipo_Relacion.xlsx",
];

const IGNORE_BY_DEFAULT_FILES = [
  "Catalogo_SAT_Aduana.xlsx",
  "Catalogo_SAT_Numero_Pedimento_Aduana.xlsx",
  "Catalogo_SAT_Patente_Aduanal.xlsx",
];

const CATALOG_CONFIG = {
  clave_prod_serv: {
    keyHeaders: ["c_ClaveProdServ", "ClaveProdServ", "ProductoServicio", "Clave del Producto o servicio"],
    descHeaders: ["Descripcion", "Descripción", "Nombre", "Texto", "Producto o servicio", "Descripción del producto o servicio"],
    fileHints: ["claveprodserv", "productoservicio"],
  },
  clave_unidad: {
    keyHeaders: ["c_ClaveUnidad", "ClaveUnidad", "Clave"],
    descHeaders: ["Nombre", "Descripción", "Descripcion"],
    fileHints: ["clave_unidad", "claveunidad"],
  },
  objeto_impuesto: {
    keyHeaders: ["c_ObjetoImp", "ObjetoImp"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["objeto_impuesto", "objetoimp"],
  },
  impuesto: {
    keyHeaders: ["c_Impuesto", "Impuesto"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["impuesto"],
  },
  regimen_fiscal: {
    keyHeaders: ["c_RegimenFiscal", "RegimenFiscal"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["regimen_fiscal", "regimenfiscal"],
  },
  uso_cfdi: {
    keyHeaders: ["c_UsoCFDI", "UsoCFDI"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["uso_cfdi", "usocfdi"],
  },
  tasa_o_cuota: {
    keyHeaders: ["c_TasaOCuota", "Valor máximo", "Valor maximo", "Valor minimo", "Valor mínimo"],
    descHeaders: ["Impuesto", "Factor", "Rango o Fijo"],
    fileHints: ["tasa_o_cuota", "tasaocuota"],
  },
  metodo_pago: {
    keyHeaders: ["c_MetodoPago", "MetodoPago"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["metodo_pago", "metodopago"],
  },
  forma_pago: {
    keyHeaders: ["c_FormaPago", "FormaPago"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["forma_de_pago", "formapago"],
  },
  tipo_comprobante: {
    keyHeaders: ["c_TipoDeComprobante", "TipoDeComprobante"],
    descHeaders: ["Descripción", "Descripcion"],
    fileHints: ["tipo_de_comprobante", "tipodecomprobante"],
  },
  tipo_factor: {
    keyHeaders: ["c_TipoFactor", "TipoFactor"],
    descHeaders: ["c_TipoFactor", "TipoFactor"],
    fileHints: ["tipo_factor", "tipofactor"],
  },
};

function ensureDirs() {
  fs.mkdirSync(SAT_DIR, { recursive: true });
  fs.mkdirSync(DOCS_DIR, { recursive: true });
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

function parseArgs(argv = process.argv.slice(2)) {
  const args = { source: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--source") args.source = argv[i + 1] || null;
    if (argv[i].startsWith("--source=")) args.source = argv[i].slice("--source=".length);
  }
  return args;
}

function pathExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function defaultSourceDir() {
  if (pathExists(EXAMPLE_SOURCE_DIR)) return EXAMPLE_SOURCE_DIR;
  return DEFAULT_SOURCE_DIR;
}

function resolveSourceDir(sourceArg) {
  const source = sourceArg || defaultSourceDir();
  return path.resolve(source);
}

function findPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push(process.env.PYTHON);
  if (process.env.USERPROFILE) {
    candidates.push(path.join(process.env.USERPROFILE, ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"));
  }
  candidates.push("python");
  candidates.push("py");
  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-c", "import openpyxl, pypdf; print('ok')"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("No encontre Python con openpyxl y pypdf. Define PYTHON o usa el runtime bundled de Codex.");
}

function extractWithPython(sourceDir) {
  const python = findPython();
  const script = String.raw`
import json, os, re, sys
from pathlib import Path
from openpyxl import load_workbook
from pypdf import PdfReader

source = Path(sys.argv[1])
target_terms = [
  "cctv", "videovigilancia", "vigilancia", "camara", "cámara", "dvr", "nvr",
  "fuente de poder", "fuente", "cable", "conector", "control de acceso",
  "barrera", "pluma", "router", "switch", "access point", "red",
  "comunicacion", "comunicación", "computadora", "laptop", "ssd", "ram",
  "reparacion", "reparación", "mantenimiento", "instalacion", "instalación",
  "equipo electronico", "equipo electrónico", "telefono", "teléfono"
]

def norm(v):
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", str(v or "")) if unicodedata.category(c) != "Mn").lower()

def clean_cell(v):
    if v is None:
        return ""
    if hasattr(v, "isoformat"):
        return v.isoformat(sep=" ")
    return str(v).strip()

def detect_header(rows, sheet_name):
    best_idx = None
    best_score = -1
    for idx, row in enumerate(rows[:12]):
        joined = " ".join(norm(x) for x in row)
        score = 0
        if "c_" in joined or "clave" in joined:
            score += 5
        for token in ["c_claveunidad", "c_objetoimp", "c_impuesto", "c_regimenfiscal", "c_usocfdi", "c_tasaocuota", "c_metodopago", "c_formapago", "c_tipodecomprobante", "c_tipofactor", "claveprodserv", "descripcion"]:
            if token in joined.replace(" ", ""):
                score += 4
        non_empty = sum(1 for x in row if str(x or "").strip())
        score += min(non_empty, 6)
        if score > best_score:
            best_score = score
            best_idx = idx
    return best_idx if best_score >= 8 else 0

def file_kind(file_name, sheet_name, headers):
    text = norm(file_name + " " + sheet_name + " " + " ".join(headers)).replace(" ", "").replace("-", "_")
    file_text = norm(file_name + " " + sheet_name).replace(" ", "").replace("-", "_")
    if "uso_cfdi" in file_text or "usocfdi" in file_text:
        return "uso_cfdi"
    if "regimen_fiscal" in file_text or "regimenfiscal" in file_text:
        return "regimen_fiscal"
    if "claveprodserv" in text or "productoservicio" in text:
        return "clave_prod_serv"
    if "clave_unidad" in text or "claveunidad" in text:
        return "clave_unidad"
    if "objeto_impuesto" in text or "objetoimp" in text:
        return "objeto_impuesto"
    if "uso_cfdi" in text or "usocfdi" in text:
        return "uso_cfdi"
    if "regimen_fiscal" in text or "regimenfiscal" in text:
        return "regimen_fiscal"
    if "tasa_o_cuota" in text or "tasaocuota" in text:
        return "tasa_o_cuota"
    if "metodo_pago" in text or "metodopago" in text:
        return "metodo_pago"
    if "forma_de_pago" in text or "formapago" in text:
        return "forma_pago"
    if "tipo_de_comprobante" in text or "tipodecomprobante" in text:
        return "tipo_comprobante"
    if "tipo_factor" in text or "tipofactor" in text:
        return "tipo_factor"
    if "impuesto" in text:
        return "impuesto"
    return None

def pdf_summary(path):
    item = {"pages": 0, "text_extractable": False, "key_count": 0, "keys": [], "matches": [], "error": None}
    try:
        reader = PdfReader(str(path))
        item["pages"] = len(reader.pages)
        keys = set()
        for page_num, page in enumerate(reader.pages, start=1):
            text = page.extract_text() or ""
            if text.strip():
                item["text_extractable"] = True
            low = text.lower()
            hits = [term for term in target_terms if term in low]
            found_keys = sorted(set(re.findall(r"(?<!\d)(\d{8})(?!\d)", text)))
            for key in found_keys:
                keys.add(key)
            if hits or found_keys:
                sample = " ".join(text.split())[:320]
                item["matches"].append({"page": page_num, "hits": hits[:12], "keys": found_keys[:20], "sample": sample})
        item["keys"] = sorted(keys)
        item["key_count"] = len(item["keys"])
    except Exception as exc:
        item["error"] = str(exc)
    return item

files = []
rows_by_kind = {}
if source.exists():
    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        ext = path.suffix.lower()
        info = {
            "name": path.name,
            "path": str(path).replace("\\\\", "/"),
            "extension": ext,
            "size": path.stat().st_size,
            "sheets": [],
            "pdf": None,
            "error": None,
        }
        if ext in [".xlsx", ".xlsm", ".xltx", ".xltm"]:
            try:
                wb = load_workbook(path, read_only=True, data_only=True)
                for ws in wb.worksheets:
                    preview_rows = []
                    for ridx, row in enumerate(ws.iter_rows(values_only=True), start=1):
                        preview_rows.append([clean_cell(x) for x in row])
                        if ridx >= 12:
                            break
                    header_idx = detect_header(preview_rows, ws.title)
                    headers = preview_rows[header_idx] if preview_rows else []
                    kind = file_kind(path.name, ws.title, headers)
                    info["sheets"].append({
                        "name": ws.title,
                        "max_row": ws.max_row,
                        "max_column": ws.max_column,
                        "header_row": header_idx + 1,
                        "columns": [h for h in headers if str(h).strip()][:40],
                        "detected_catalog": kind,
                    })
                    if kind:
                        rows = []
                        for ridx, row in enumerate(ws.iter_rows(min_row=header_idx + 2, values_only=True), start=header_idx + 2):
                            values = [clean_cell(x) for x in row]
                            if not any(values):
                                continue
                            if any(norm(x).startswith("valor minimo") or norm(x).startswith("valor maximo") for x in values):
                                continue
                            rows.append({"source_file": path.name, "source_sheet": ws.title, "source_row": ridx, "headers": headers, "values": values})
                        rows_by_kind.setdefault(kind, []).extend(rows)
                wb.close()
            except Exception as exc:
                info["error"] = str(exc)
        elif ext == ".pdf":
            info["pdf"] = pdf_summary(path)
        files.append(info)

print(json.dumps({"source_dir": str(source).replace("\\\\", "/"), "files": files, "rows_by_kind": rows_by_kind}, ensure_ascii=True))
`;
  const result = spawnSync(python, ["-", sourceDir], {
    input: script,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 80,
  });
  if (result.status !== 0) {
    throw new Error(`Python extraction failed: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout);
}

function valueByHeaders(row, candidates) {
  const headers = row.headers || [];
  const values = row.values || [];
  for (const candidate of candidates) {
    const wanted = normalizeHeader(candidate);
    const index = headers.findIndex((header) => normalizeHeader(header) === wanted);
    if (index >= 0) return values[index] || "";
  }
  return "";
}

function combineDescription(row, config, kind) {
  const parts = [];
  for (const header of config.descHeaders || []) {
    const value = valueByHeaders(row, [header]);
    if (value && !parts.includes(value)) parts.push(value);
  }
  if (kind === "tasa_o_cuota") {
    const impuesto = valueByHeaders(row, ["Impuesto"]);
    const factor = valueByHeaders(row, ["Factor"]);
    const rango = valueByHeaders(row, ["Rango o Fijo"]);
    return [rango, impuesto, factor].filter(Boolean).join(" / ");
  }
  return parts.filter(Boolean).join(" - ");
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  return raw;
}

function normalizeCatalogEntry(row, kind) {
  const config = CATALOG_CONFIG[kind] || {};
  let key = valueByHeaders(row, config.keyHeaders || []);
  if (kind === "tasa_o_cuota" && !key) {
    key = valueByHeaders(row, ["Valor máximo", "Valor maximo", "Valor mínimo", "Valor minimo"]);
  }
  if (!key && kind === "tipo_factor") key = valueByHeaders(row, ["c_TipoFactor"]);
  const descripcion = combineDescription(row, config, kind) || key;
  if (!String(key || "").trim()) return null;
  return {
    clave: String(key).trim(),
    descripcion: String(descripcion || "").trim(),
    nombre: String(descripcion || key).trim(),
    vigencia_inicio: normalizeDate(valueByHeaders(row, ["Fecha inicio de vigencia", "Fecha de inicio de vigencia", "Fecha inicio", "Fecha de inicio"])),
    vigencia_fin: normalizeDate(valueByHeaders(row, ["Fecha fin de vigencia", "Fecha de fin de vigencia", "Fecha fin", "Fecha de fin"])),
    source_file: row.source_file,
    source_sheet: row.source_sheet,
    source_row: row.source_row,
  };
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];
  for (const item of entries || []) {
    const key = `${item.clave}|${item.source_file}|${item.source_sheet}|${item.source_row}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function classifyFile(info) {
  const lower = normalizeText(info.name);
  const sheetCatalogs = (info.sheets || []).map((sheet) => sheet.detected_catalog).filter(Boolean);
  const containsProductService = sheetCatalogs.includes("clave_prod_serv") || /claveprodserv|productoservicio|clave.*producto/i.test(info.name);
  const isCompact = lower.includes("compact");
  const isCritical = CRITICAL_FILES.some((name) => normalizeText(name) === lower) || containsProductService;
  const isSuperficial = SUPERFICIAL_FILES.some((name) => normalizeText(name) === lower);
  const isIgnored = IGNORE_BY_DEFAULT_FILES.some((name) => normalizeText(name) === lower) || /^anexo_24/i.test(info.name);
  if (isCritical) return { utilidad: "CRITICO", origen: "SAT", razon: "Catalogo SAT usado para validar claves fiscales del bot." };
  if (isCompact) return { utilidad: "UTIL", origen: "Compact", razon: "Referencia para buscar familias y claves; requiere confirmacion contra SAT oficial." };
  if (isSuperficial) return { utilidad: "SECUNDARIO", origen: "SAT", razon: "Util para CFDI general o timbrado futuro; no decide scoring de concepto en el MVP." };
  if (isIgnored) return { utilidad: "IGNORAR", origen: "SAT", razon: "Catalogo aduanal/Anexo no usado para clasificar conceptos CFDI del MVP." };
  if (info.extension === ".pdf") return { utilidad: "SECUNDARIO", origen: "referencia", razon: "PDF de referencia; no se usa como fuente oficial unica." };
  return { utilidad: "IGNORAR", origen: "no util", razon: "No contiene columnas relevantes para la clasificacion actual." };
}

function markdownTable(rows, headers) {
  const escape = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${headers.map((header) => escape(row[header])).join(" | ")} |`),
  ].join("\n");
}

function writeInventoryDoc(imported) {
  const rows = imported.file_inventory.map((file) => ({
    nombre: file.name,
    extension: file.extension,
    tamano: file.size,
    origen: file.origen_inferido,
    hojas: file.sheet_count,
    utilidad: file.utilidad_bot,
    razon: file.razon,
  }));
  const lines = [
    "# Inventario de archivos SAT / Compact",
    "",
    `Fuente analizada: \`${imported.source_dir}\``,
    `Generado: ${imported.generated_at}`,
    "",
    "## Resumen",
    "",
    markdownTable(rows, ["nombre", "extension", "tamano", "origen", "hojas", "utilidad", "razon"]),
    "",
    "## Hojas y columnas detectadas",
    "",
  ];
  for (const file of imported.file_inventory) {
    lines.push(`### ${file.name}`);
    lines.push("");
    if (!file.sheets.length) {
      lines.push(file.extension === ".pdf" ? `PDF: ${file.pdf_pages || 0} paginas; texto seleccionable: ${file.pdf_text_extractable ? "si" : "no"}.` : "Sin hojas.");
      lines.push("");
      continue;
    }
    lines.push(markdownTable(file.sheets.map((sheet) => ({
      hoja: sheet.name,
      filas: sheet.max_row,
      columnas: sheet.max_column,
      header_row: sheet.header_row,
      catalogo: sheet.detected_catalog || "N/A",
      columnas_detectadas: (sheet.columns || []).join(", "),
    })), ["hoja", "filas", "columnas", "header_row", "catalogo", "columnas_detectadas"]));
    lines.push("");
  }
  fs.writeFileSync(INVENTORY_DOC_PATH, `${lines.join("\n")}\n`);
}

function compactFile(imported) {
  return imported.file_inventory.find((file) => /compact/i.test(file.name) && file.extension === ".pdf") || null;
}

function writeCompactDoc(imported) {
  const compact = compactFile(imported);
  const officialKeys = new Set((imported.clave_prod_serv || []).map((item) => String(item.clave)));
  const matches = compact?.compact_matches || [];
  const relevantMatches = matches.filter((match) => (match.hits || []).length > 0).slice(0, 25);
  const compactKeys = compact?.compact_keys || [];
  const confirmation = compactKeys.slice(0, 120).map((key) => ({
    clave: key,
    estado: officialKeys.has(String(key)) ? "CONFIRMED_IN_LOCAL_SAT" : "NEEDS_OFFICIAL_CONFIRMATION",
  }));
  const lines = [
    "# Analisis del PDF Compact",
    "",
    compact
      ? `Archivo analizado: \`${compact.name}\` (${compact.pdf_pages} paginas).`
      : "No se encontro PDF Compact en la carpeta fuente.",
    "",
    "## Uso permitido",
    "",
    "- Compact se usa como referencia de busqueda, no como fuente oficial unica.",
    "- Cualquier clave detectada debe cruzarse contra `c_ClaveProdServ` oficial local.",
    "- Si no existe `c_ClaveProdServ` oficial local, las claves quedan como `NEEDS_OFFICIAL_CONFIRMATION`.",
    "",
    "## Secciones utiles detectadas",
    "",
  ];
  if (!compact) {
    lines.push("No aplica.");
  } else if (!relevantMatches.length) {
    lines.push("No se detectaron secciones textuales directas para CCTV, control de acceso, redes o computo mediante extraccion seleccionable. No se aplico OCR masivo.");
  } else {
    lines.push(markdownTable(relevantMatches.map((match) => ({
      pagina: match.page,
      terminos: (match.hits || []).join(", "),
      claves: (match.keys || []).join(", "),
      nota: "Referencia breve; validar contra SAT oficial.",
    })), ["pagina", "terminos", "claves", "nota"]));
  }
  lines.push("");
  lines.push("## Claves Compact encontradas");
  lines.push("");
  lines.push(`Total de claves de 8 digitos detectadas: ${compactKeys.length}.`);
  lines.push("");
  if (confirmation.length) {
    lines.push(markdownTable(confirmation.slice(0, 60), ["clave", "estado"]));
    if (confirmation.length > 60) lines.push("");
    if (confirmation.length > 60) lines.push(`Se muestran 60 de ${confirmation.length} claves muestreadas.`);
  } else {
    lines.push("No se detectaron claves en el PDF Compact.");
  }
  lines.push("");
  lines.push("## Conceptos utiles para proponer");
  lines.push("");
  lines.push("- CCTV / videovigilancia: requiere `c_ClaveProdServ` oficial local para proponer nuevas claves.");
  lines.push("- Control de acceso, barreras, redes, computo y accesorios: requieren confirmacion oficial antes de entrar al candidate.");
  lines.push("- Las claves de Compact no activan conceptos por si solas.");
  lines.push("");
  lines.push("## Advertencias");
  lines.push("");
  if ((imported.clave_prod_serv || []).length === 0) {
    lines.push("- No se encontro catalogo oficial local `c_ClaveProdServ`; todas las claves Compact quedan pendientes de confirmacion oficial.");
  }
  lines.push("- No se copio texto extenso del PDF.");
  lines.push("- No se uso OCR masivo.");
  fs.writeFileSync(COMPACT_DOC_PATH, `${lines.join("\n")}\n`);
}

function writeRelationshipDoc(imported) {
  const lines = [
    "# Mapa de relacion de catalogos SAT para el bot CFDI",
    "",
    "Este mapa separa catalogos de scoring de concepto contra catalogos utiles para validacion CFDI/timbrado futuro.",
    "",
    "## Catalogos principales",
    "",
    "- `c_ClaveProdServ`: define el producto o servicio facturado. Es el catalogo critico para proponer conceptos nuevos.",
    "- `c_ClaveUnidad`: define unidad de medida. Para este MVP se usan principalmente `E48` para servicios y `H87` para productos.",
    "- `c_ObjetoImp`: define si el concepto es objeto de impuesto. El bot normalmente trabaja con `02` cuando hay IVA trasladado.",
    "- `c_Impuesto`: define IVA, ISR e IEPS.",
    "- `c_TipoFactor`: define tasa, cuota o exento.",
    "- `c_TasaOCuota`: define tasas aplicables para impuestos.",
    "- `c_RegimenFiscal`: valida regimen del receptor/emisor, incluido 626 RESICO.",
    "- `c_UsoCFDI`: valida el uso fiscal del receptor.",
    "- `c_MetodoPago` y `c_FormaPago`: utiles para pago y timbrado futuro; no clasifican conceptos.",
    "- `c_TipoDeComprobante`: util para CFDI futuro, normalmente ingreso en este MVP.",
    "",
    "## Catalogos geograficos",
    "",
    "CP, colonia, estado, municipio, localidad y pais son utiles para validacion fiscal/timbrado. No deben afectar el scoring de concepto.",
    "",
    "## Relacion con RESICO 626",
    "",
    "Las actividades permitidas para este proyecto cubren instalacion/equipamiento, mantenimiento/reparacion de equipo comercial/electronico, comercio de telefonos/comunicacion y computadoras/accesorios. Software, SaaS, web, IA, marketing digital, PAC, timbrado y WhatsApp quedan fuera del MVP.",
    "",
    "## Estado de importacion local",
    "",
    markdownTable([
      { catalogo: "c_ClaveProdServ", importadas: (imported.clave_prod_serv || []).length, uso: "scoring/propuesta de conceptos" },
      { catalogo: "c_ClaveUnidad", importadas: (imported.clave_unidad || []).length, uso: "unidad SAT" },
      { catalogo: "c_ObjetoImp", importadas: (imported.objeto_impuesto || []).length, uso: "impuestos por concepto" },
      { catalogo: "c_Impuesto", importadas: (imported.impuesto || []).length, uso: "IVA/ISR/IEPS" },
      { catalogo: "c_RegimenFiscal", importadas: (imported.regimen_fiscal || []).length, uso: "validacion fiscal" },
      { catalogo: "c_UsoCFDI", importadas: (imported.uso_cfdi || []).length, uso: "uso receptor" },
      { catalogo: "c_TasaOCuota", importadas: (imported.tasa_o_cuota || []).length, uso: "tasas" },
      { catalogo: "c_MetodoPago", importadas: (imported.metodo_pago || []).length, uso: "pago futuro" },
      { catalogo: "c_FormaPago", importadas: (imported.forma_pago || []).length, uso: "pago futuro" },
      { catalogo: "c_TipoDeComprobante", importadas: (imported.tipo_comprobante || []).length, uso: "CFDI futuro" },
      { catalogo: "c_TipoFactor", importadas: (imported.tipo_factor || []).length, uso: "impuestos" },
    ], ["catalogo", "importadas", "uso"]),
  ];
  fs.writeFileSync(RELATIONSHIP_DOC_PATH, `${lines.join("\n")}\n`);
}

function listOfficialFiles(sourceArg = null) {
  const sourceDir = resolveSourceDir(sourceArg);
  if (!pathExists(sourceDir)) return [];
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(csv|txt|tsv|xlsx|xls|xlsm)$/i.test(name))
    .map((name) => path.join(sourceDir, name));
}

function importSatCatalog(options = {}) {
  ensureDirs();
  const sourceDir = resolveSourceDir(options.source || null);
  if (!pathExists(sourceDir)) {
    return {
      ok: false,
      message: `No existe la carpeta fuente: ${sourceDir}`,
      source_dir: sourceDir.replace(/\\/g, "/"),
    };
  }

  const extracted = extractWithPython(sourceDir);
  const imported = {
    schema_version: "2.0.0",
    source: "SAT_OFFICIAL_LOCAL_AND_COMPACT_REFERENCE",
    source_dir: extracted.source_dir,
    generated_at: new Date().toISOString(),
    source_files: [],
    clave_prod_serv: [],
    clave_unidad: [],
    objeto_impuesto: [],
    impuesto: [],
    regimen_fiscal: [],
    uso_cfdi: [],
    tasa_o_cuota: [],
    metodo_pago: [],
    forma_pago: [],
    tipo_comprobante: [],
    tipo_factor: [],
    warnings: [],
    ignored_files: [],
    file_inventory: [],
    compact_reference: {
      file: null,
      pages: 0,
      key_count: 0,
      keys: [],
      keys_cross_check: [],
      matches: [],
      source_role: "REFERENCE_ONLY",
    },
  };

  for (const file of extracted.files || []) {
    const classification = classifyFile(file);
    const inventoryItem = {
      name: file.name,
      extension: file.extension,
      size: file.size,
      origen_inferido: classification.origen,
      sheet_count: (file.sheets || []).length,
      sheets: file.sheets || [],
      utilidad_bot: classification.utilidad,
      razon: classification.razon,
      pdf_pages: file.pdf?.pages || 0,
      pdf_text_extractable: Boolean(file.pdf?.text_extractable),
      compact_keys: file.pdf?.keys || [],
      compact_matches: file.pdf?.matches || [],
    };
    imported.file_inventory.push(inventoryItem);
    if (classification.utilidad === "IGNORAR") imported.ignored_files.push({ file: file.name, reason: classification.razon });
    else imported.source_files.push({ file: file.name, role: classification.utilidad, origin: classification.origen });
  }

  for (const kind of Object.keys(CATALOG_CONFIG)) {
    imported[kind] = dedupeEntries((extracted.rows_by_kind?.[kind] || []).map((row) => normalizeCatalogEntry(row, kind)).filter(Boolean));
  }

  const compact = compactFile(imported);
  if (compact) {
    imported.compact_reference.file = compact.name;
    imported.compact_reference.pages = compact.pdf_pages || 0;
    imported.compact_reference.key_count = (compact.compact_keys || []).length;
    imported.compact_reference.keys = compact.compact_keys || [];
    imported.compact_reference.matches = (compact.compact_matches || []).slice(0, 80);
    const officialProductKeys = new Set(imported.clave_prod_serv.map((item) => String(item.clave)));
    imported.compact_reference.keys_cross_check = imported.compact_reference.keys.slice(0, 500).map((key) => ({
      clave: key,
      status: officialProductKeys.has(String(key)) ? "CONFIRMED_IN_LOCAL_SAT" : "NEEDS_OFFICIAL_CONFIRMATION",
    }));
  }

  if (imported.clave_prod_serv.length === 0) {
    imported.warnings.push({
      code: "MISSING_OFFICIAL_CLAVE_PROD_SERV",
      message: "No se encontro catalogo oficial local c_ClaveProdServ. Compact no se usara como fuente oficial unica.",
    });
  }
  if (imported.clave_unidad.length === 0) {
    imported.warnings.push({
      code: "MISSING_CLAVE_UNIDAD",
      message: "No se importo c_ClaveUnidad; no se pueden proponer conceptos nuevos.",
    });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(imported, null, 2));
  writeInventoryDoc(imported);
  writeCompactDoc(imported);
  writeRelationshipDoc(imported);

  return {
    ok: true,
    output_path: OUTPUT_PATH,
    inventory_doc_path: INVENTORY_DOC_PATH,
    compact_doc_path: COMPACT_DOC_PATH,
    relationship_doc_path: RELATIONSHIP_DOC_PATH,
    ...imported,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs();
    const result = importSatCatalog({ source: args.source });
    if (!result.ok) {
      console.error(result.message || MISSING_MESSAGE);
      process.exit(1);
    }
    console.log(`Catalogos analizados desde: ${result.source_dir}`);
    console.log(`Normalizado SAT escrito en: ${result.output_path}`);
    console.log(`Inventario escrito en: ${result.inventory_doc_path}`);
    console.log(`Analisis Compact escrito en: ${result.compact_doc_path}`);
    console.log(`Mapa de relacion escrito en: ${result.relationship_doc_path}`);
    console.log(`c_ClaveProdServ: ${result.clave_prod_serv.length}`);
    console.log(`c_ClaveUnidad: ${result.clave_unidad.length}`);
    console.log(`c_ObjetoImp: ${result.objeto_impuesto.length}`);
    console.log(`c_Impuesto: ${result.impuesto.length}`);
    console.log(`c_RegimenFiscal: ${result.regimen_fiscal.length}`);
    console.log(`c_UsoCFDI: ${result.uso_cfdi.length}`);
    console.log(`Warnings: ${result.warnings.length}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  SAT_DIR,
  OUTPUT_PATH,
  INVENTORY_DOC_PATH,
  COMPACT_DOC_PATH,
  RELATIONSHIP_DOC_PATH,
  MISSING_MESSAGE,
  importSatCatalog,
  listOfficialFiles,
  normalizeText,
  normalizeHeader,
};

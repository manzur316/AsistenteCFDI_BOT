const fs = require("fs");
const path = require("path");
const {
  DEFAULT_PACKAGE_ROOT,
  HUMAN_REVIEW_NOTICE,
  createZipArchive,
} = require("./sandbox-accountant-package");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const EXCEL_SCHEMA_VERSION = "sandbox_accountant_excel.v1";
const REQUIRED_SHEETS = ["RESUMEN", "FACTURAS", "CLIENTES", "CANCELADAS", "CONTROL", "ALERTAS", "README"];

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function assertRuntimePath(target, label = "runtime path") {
  const resolved = path.resolve(target);
  if (!isInside(runtimeRoot, resolved)) throw new Error(`${label} fuera de runtime/: ${resolved}`);
  return resolved;
}

function assertInside(parent, child, label = "path") {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  if (!isInside(resolvedParent, resolvedChild)) {
    throw new Error(`${label} fuera de ${resolvedParent}: ${resolvedChild}`);
  }
  return resolvedChild;
}

function relFromRoot(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizePeriod(value) {
  const match = String(value || "").match(/^(\d{4})[-/](\d{2})$/);
  return match ? `${match[1]}-${match[2]}` : null;
}

function latestPackagePeriod(packageRoot = DEFAULT_PACKAGE_ROOT) {
  const root = assertRuntimePath(packageRoot, "packageRoot");
  if (!fs.existsSync(root)) return null;
  const periods = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => normalizePeriod(entry.name))
    .filter(Boolean)
    .sort();
  return periods[periods.length - 1] || null;
}

function packagePeriodDir(packageRoot = DEFAULT_PACKAGE_ROOT, period) {
  const normalized = normalizePeriod(period);
  if (!normalized) throw new Error(`Periodo invalido para Excel sandbox: ${period || ""}`);
  return assertRuntimePath(path.join(packageRoot, normalized), "packagePeriodDir");
}

function accountantExcelPathForPeriod(packageRoot = DEFAULT_PACKAGE_ROOT, period) {
  const normalized = normalizePeriod(period);
  if (!normalized) throw new Error(`Periodo invalido para Excel sandbox: ${period || ""}`);
  return assertRuntimePath(path.join(packageRoot, normalized, `accountant-review-${normalized}.xlsx`), "accountantExcelPath");
}

function resolvePackageDir(options = {}) {
  const packageRoot = assertRuntimePath(options.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot");
  if (options.packageDir) {
    const resolved = assertRuntimePath(options.packageDir, "packageDir");
    return path.basename(resolved).toLowerCase() === "package" ? resolved : path.join(resolved, "package");
  }
  const period = normalizePeriod(options.period) || latestPackagePeriod(packageRoot);
  if (!period) throw new Error("No existen paquetes sandbox. Ejecuta node scripts/generate-sandbox-accountant-package.js primero.");
  return assertRuntimePath(path.join(packageRoot, period, "package"), "packageDir");
}

function loadPackageData(options = {}) {
  const packageDir = resolvePackageDir(options);
  const packagePeriod = normalizePeriod(path.basename(path.dirname(packageDir)));
  const required = {
    manifest: "manifest.json",
    monthly: "monthly-summary.json",
    client: "client-summary.json",
    control: "document-control.json",
    accountant_review: "accountant-review.json",
  };
  const files = {};
  for (const [key, name] of Object.entries(required)) {
    const filePath = assertInside(packageDir, path.join(packageDir, name), name);
    if (!fs.existsSync(filePath)) throw new Error(`Falta archivo requerido del paquete: ${name}`);
    files[key] = filePath;
  }
  const manifest = readJson(files.manifest);
  const period = normalizePeriod(manifest.period) || packagePeriod;
  if (!period) throw new Error("No se pudo resolver periodo del paquete sandbox.");
  return {
    packageDir,
    period,
    files,
    manifest,
    monthly: readJson(files.monthly),
    client: readJson(files.client),
    control: readJson(files.control),
    accountant_review: readJson(files.accountant_review),
  };
}

function sanitizeText(value) {
  const cleaned = String(value ?? "")
    .replace(/<\?xml[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<cfdi:Comprobante[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/<tfd:TimbreFiscalDigital[\s\S]*$/i, "[REDACTED_XML_TEXT]")
    .replace(/%PDF[\s\S]*$/i, "[REDACTED_PDF_TEXT]")
    .replace(/https:\/\/api\.factura\.com/gi, "[BLOCKED_FACTURACOM_PRODUCTION_URL]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [REDACTED]");
  const trimmedLeft = cleaned.trimStart();
  if (/^[=+\-@]/.test(trimmedLeft)) return `'${cleaned}`;
  return cleaned;
}

function safeCellValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "boolean") return value ? "SI" : "NO";
  return sanitizeText(value);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function attrEscape(value) {
  return xmlEscape(value).replace(/\r?\n/g, " ");
}

function columnName(index) {
  let value = index + 1;
  let out = "";
  while (value > 0) {
    const mod = (value - 1) % 26;
    out = String.fromCharCode(65 + mod) + out;
    value = Math.floor((value - mod) / 26);
  }
  return out;
}

function worksheetXml(rows) {
  const sheetData = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const cells = row.map((raw, colIndex) => {
      const cellRef = `${columnName(colIndex)}${rowNumber}`;
      const value = safeCellValue(raw);
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${cellRef}"><v>${value}</v></c>`;
      }
      return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowNumber}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<sheetData>${sheetData}</sheetData></worksheet>`;
}

function safeSheetName(name) {
  return String(name || "HOJA").replace(/[\[\]:*?/\\]/g, "_").slice(0, 31);
}

function scalarRows(title, value) {
  return [title, value ?? ""];
}

function buildWorkbookSheets(data) {
  const monthly = data.monthly || {};
  const manifest = data.manifest || {};
  const client = data.client || {};
  const control = data.control || {};
  const fiscal = monthly.fiscal_totals || {};
  const statusCounts = monthly.status_counts || {};
  const documents = Array.isArray(monthly.documents) ? monthly.documents : [];
  const clients = Array.isArray(client.clients) ? client.clients : [];
  const cancelled = documents.filter((doc) => doc.status === "CANCELLED");
  const amountUnknown = documents.filter((doc) => doc.amount_status !== "EXTRACTED");

  const resumen = [
    ["Campo", "Valor"],
    scalarRows("periodo", data.period),
    scalarRows("total documentos", monthly.total_documents || 0),
    scalarRows("creados", statusCounts.CREATED || 0),
    scalarRows("cancelados", statusCounts.CANCELLED || 0),
    scalarRows("errores", statusCounts.ERROR || 0),
    scalarRows("subtotal activo", fiscal.subtotal ?? null),
    scalarRows("IVA trasladado activo", fiscal.iva_trasladado ?? null),
    scalarRows("total activo", fiscal.total ?? null),
    scalarRows("cancelled total", fiscal.cancelled_total ?? null),
    scalarRows("amount_status", fiscal.amount_status || "UNKNOWN"),
    scalarRows("cancelled_amount_status", fiscal.cancelled_amount_status || "UNKNOWN"),
    scalarRows("leyenda revision humana", HUMAN_REVIEW_NOTICE),
    scalarRows("nota cancelados", "Cancelados no se suman como ingresos vigentes."),
  ];

  const facturas = [
    ["fecha", "cliente", "draft_id", "invoice_id", "cfdi_uid", "uuid", "serie", "folio", "estatus", "subtotal", "IVA", "total", "xml_disponible", "pdf_disponible", "amount_status"],
    ...documents.map((doc) => [
      doc.fecha || doc.fecha_timbrado || "",
      doc.client_id || "",
      doc.draft_id || "",
      doc.invoice_id || "",
      doc.cfdi_uid || "",
      doc.uuid || "",
      doc.serie || "",
      doc.folio || "",
      doc.status || "",
      doc.subtotal,
      doc.iva_trasladado,
      doc.total,
      Boolean(doc.has_xml),
      Boolean(doc.has_pdf),
      doc.amount_status || "UNKNOWN",
    ]),
  ];

  const clientes = [
    ["client_id", "nombre_razon_social_segura", "documentos", "total activo", "cancelados", "XML disponibles", "PDF disponibles"],
    ...clients.map((item) => [
      item.client_id || "",
      item.client_name || item.nombre_razon_social || item.razon_social || item.client_id || "CLIENTE_SANDBOX",
      item.total_documents || 0,
      item.active_totals?.total ?? null,
      item.status_counts?.CANCELLED || 0,
      item.with_xml || 0,
      item.with_pdf || 0,
    ]),
  ];

  const canceladas = [
    ["invoice_id", "uuid", "cfdi_uid", "fecha", "cancel_status", "total si existe", "motivo_observacion", "no_sumar_como_ingreso_vigente"],
    ...cancelled.map((doc) => [
      doc.invoice_id || "",
      doc.uuid || "",
      doc.cfdi_uid || "",
      doc.fecha || doc.fecha_timbrado || "",
      doc.cancel_status || (doc.has_cancel_response ? "OK" : "UNKNOWN"),
      doc.total,
      doc.cancel_reason || doc.observacion || "Documento cancelado sandbox; revisar con contador.",
      "SI",
    ]),
  ];

  const controlRows = [
    ["control", "conteo", "documentos"],
    ["documentos sin XML", (control.documents_without_xml || []).length, (control.documents_without_xml || []).map((doc) => doc.invoice_id).join(", ")],
    ["documentos sin PDF", (control.documents_without_pdf || []).length, (control.documents_without_pdf || []).map((doc) => doc.invoice_id).join(", ")],
    ["documentos sin UUID", (control.documents_without_uuid || []).length, (control.documents_without_uuid || []).map((doc) => doc.invoice_id).join(", ")],
    ["identity missing", (control.identity_missing_documents || []).length, (control.identity_missing_documents || []).map((doc) => doc.invoice_id).join(", ")],
    ["amount unknown", amountUnknown.length, amountUnknown.map((doc) => doc.invoice_id).join(", ")],
    ["sensitive findings", (control.sensitive_findings || []).length, (control.sensitive_findings || []).join(" | ")],
  ];

  const alertItems = Array.from(new Set([
    ...(manifest.alerts || []),
    ...((control.sensitive_findings || []).length ? ["SENSITIVE_FINDINGS"] : []),
    ...(amountUnknown.length ? ["AMOUNT_UNKNOWN"] : []),
  ]));
  const alertas = [
    ["alerta", "recomendacion"],
    ...alertItems.map((alert) => [
      alert,
      alert === "CANCELLED_NOT_INCLUDED_IN_ACTIVE_INCOME"
        ? "Verificar canceladas por separado; no sumar como ingreso vigente."
        : "Revisar evidencia y validar con contador antes de usar fiscalmente.",
    ]),
    [HUMAN_REVIEW_NOTICE, "Este archivo es un borrador de revision mensual."],
  ];

  const readme = [
    ["Tema", "Detalle"],
    ["Archivo", "Accountant Excel sandbox mensual."],
    ["Fuente", "Sandbox local: accountant package y reportes generados bajo runtime/."],
    ["Produccion", "No es produccion. No timbra, no cancela, no llama PAC y no envia mensajes."],
    ["XML/PDF", "No incluye XML/PDF completos dentro del Excel; solo metadatos y rutas relativas."],
    ["Macros", "Sin macros."],
    ["Formulas", "Sin formulas peligrosas; celdas con =, +, - o @ se escapan como texto."],
    ["Revision", HUMAN_REVIEW_NOTICE],
  ];

  return [
    { name: "RESUMEN", rows: resumen },
    { name: "FACTURAS", rows: facturas },
    { name: "CLIENTES", rows: clientes },
    { name: "CANCELADAS", rows: canceladas },
    { name: "CONTROL", rows: controlRows },
    { name: "ALERTAS", rows: alertas },
    { name: "README", rows: readme },
  ];
}

function writeFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeWorkbookDirectory(workbookDir, sheets) {
  fs.mkdirSync(workbookDir, { recursive: true });
  writeFile(path.join(workbookDir, "[Content_Types].xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`
    + `<Default Extension="xml" ContentType="application/xml"/>`
    + `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`
    + `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`
    + `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>`
    + `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>`
    + sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")
    + `</Types>`);
  writeFile(path.join(workbookDir, "_rels", ".rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>`
    + `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>`
    + `<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>`
    + `</Relationships>`);
  writeFile(path.join(workbookDir, "docProps", "core.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/">`
    + `<dc:title>AsistenteCFDI BOT Accountant Sandbox</dc:title>`
    + `<dc:creator>AsistenteCFDI_BOT</dc:creator>`
    + `<dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${new Date().toISOString()}</dcterms:created>`
    + `</cp:coreProperties>`);
  writeFile(path.join(workbookDir, "docProps", "app.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>AsistenteCFDI_BOT</Application></Properties>`);
  writeFile(path.join(workbookDir, "xl", "workbook.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${sheets.map((sheet, index) => `<sheet name="${attrEscape(safeSheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>`
    + `</workbook>`);
  writeFile(path.join(workbookDir, "xl", "_rels", "workbook.xml.rels"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("")
    + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + `</Relationships>`);
  writeFile(path.join(workbookDir, "xl", "styles.xml"),
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`
    + `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + `<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>`
    + `<fills count="1"><fill><patternFill patternType="none"/></fill></fills>`
    + `<borders count="1"><border/></borders>`
    + `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>`
    + `<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>`
    + `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>`
    + `</styleSheet>`);
  sheets.forEach((sheet, index) => {
    writeFile(path.join(workbookDir, "xl", "worksheets", `sheet${index + 1}.xml`), worksheetXml(sheet.rows));
  });
}

function generateXlsxFile(sheets, targetPath, options = {}) {
  const target = assertRuntimePath(targetPath, "targetExcel");
  const tempRoot = assertRuntimePath(options.tempRoot || path.join(runtimeRoot, ".tmp-accountant-excel"), "tempRoot");
  const tempDir = path.join(tempRoot, `xlsx-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
  try {
    writeWorkbookDirectory(tempDir, sheets);
    const zip = createZipArchive(tempDir, target);
    return {
      path: relFromRoot(target),
      bytes: zip.bytes,
      entries: zip.entries,
    };
  } finally {
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function generateAccountantExcel(options = {}) {
  const packageRoot = assertRuntimePath(options.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot");
  if (!fs.existsSync(packageRoot)) {
    return {
      ok: false,
      skipped: true,
      reason: "ACCOUNTANT_PACKAGE_ROOT_MISSING",
      message: "Se requiere ejecutar primero node scripts/generate-sandbox-accountant-package.js.",
      package_root: relFromRoot(packageRoot),
    };
  }
  const data = loadPackageData({ packageRoot, packageDir: options.packageDir, period: options.period });
  const target = options.targetPath
    ? assertRuntimePath(options.targetPath, "targetPath")
    : accountantExcelPathForPeriod(packageRoot, data.period);
  const sheets = buildWorkbookSheets(data);
  const workbook = generateXlsxFile(sheets, target, options);
  const analysis = analyzeAccountantExcel(target);
  if (analysis.sensitive_findings.length || analysis.absolute_path_findings.length || analysis.formula_injection_findings.length) {
    throw new Error(`Excel sandbox inseguro: ${[
      ...analysis.sensitive_findings,
      ...analysis.absolute_path_findings,
      ...analysis.formula_injection_findings,
    ].join(" | ")}`);
  }
  return {
    ok: true,
    skipped: false,
    schema_version: EXCEL_SCHEMA_VERSION,
    period: data.period,
    format: "XLSX_OOXML_NODE_PURE",
    excel_path: workbook.path,
    bytes: workbook.bytes,
    entries: workbook.entries,
    sheets: sheets.map((sheet) => sheet.name),
    row_counts: Object.fromEntries(sheets.map((sheet) => [sheet.name, sheet.rows.length])),
    sensitive_findings: [],
    absolute_path_findings: [],
    formula_injection_findings: [],
  };
}

function listZipEntries(zipPath) {
  const resolved = assertRuntimePath(zipPath, "xlsxPath");
  const buffer = fs.readFileSync(resolved);
  const entries = [];
  let offset = 0;
  while (offset + 30 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const fileNameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const dataStart = nameStart + fileNameLength + extraLength;
    const name = buffer.subarray(nameStart, nameStart + fileNameLength).toString("utf8");
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    entries.push({ name, method, data });
    offset = dataStart + compressedSize;
  }
  return entries;
}

function entryText(entries, name) {
  const entry = entries.find((item) => item.name === name);
  return entry ? entry.data.toString("utf8") : "";
}

function detectSheetNames(entries) {
  const workbook = entryText(entries, "xl/workbook.xml");
  return Array.from(workbook.matchAll(/<sheet\s+name="([^"]+)"/g)).map((match) => match[1]
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"));
}

function detectRowCounts(entries) {
  const names = detectSheetNames(entries);
  const counts = {};
  names.forEach((name, index) => {
    const xml = entryText(entries, `xl/worksheets/sheet${index + 1}.xml`);
    counts[name] = (xml.match(/<row\b/g) || []).length;
  });
  return counts;
}

function xmlDecode(value) {
  return String(value || "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, "\"")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function sheetNameByEntry(entries) {
  const names = detectSheetNames(entries);
  const map = {};
  names.forEach((name, index) => {
    map[`xl/worksheets/sheet${index + 1}.xml`] = name;
  });
  return map;
}

function absolutePathMatches(text) {
  const raw = String(text || "");
  const patterns = [
    /\b[A-Za-z]:[\\/][^\s<>"']*/g,
    /\\\\[A-Za-z0-9._$-]+[\\/][^\s<>"']*/g,
  ];
  return patterns.flatMap((pattern) => Array.from(raw.matchAll(pattern)).map((match) => ({
    index: match.index || 0,
    value: match[0],
  })));
}

function cellReferenceForIndex(text, index) {
  const before = text.lastIndexOf("<c ", index);
  if (before < 0) return "";
  const after = text.indexOf("</c>", before);
  if (after < index) return "";
  const cellTagEnd = text.indexOf(">", before);
  if (cellTagEnd < 0 || cellTagEnd > index) return "";
  const cellTag = text.slice(before, cellTagEnd + 1);
  const match = cellTag.match(/\sr="([^"]+)"/);
  return match ? match[1] : "";
}

function findingPrefix(workbookName, entryName, sheetNames, text, index) {
  const sheet = sheetNames[entryName] || "";
  const cell = cellReferenceForIndex(text, index);
  const location = sheet && cell ? `${sheet}!${cell}` : cell;
  return [workbookName, entryName, location].filter(Boolean).join(":");
}

function findAbsolutePathFindings(entries, workbookName = "workbook.xlsx") {
  const findings = [];
  const sheetNames = sheetNameByEntry(entries);
  for (const entry of entries) {
    if (!/\.(xml|rels)$/i.test(entry.name)) continue;
    const text = entry.data.toString("utf8");
    for (const match of absolutePathMatches(xmlDecode(text))) {
      const prefix = findingPrefix(workbookName, entry.name, sheetNames, text, match.index);
      findings.push(`${prefix}:absolute_path`);
    }
  }
  return findings;
}

function findSensitiveFindings(entries, workbookName = "workbook.xlsx") {
  const findings = [];
  for (const entry of entries) {
    const name = entry.name;
    const text = entry.data.toString("utf8");
    const prefix = `${workbookName}:${name}`;
    if (/vbaProject\.bin|\.bin$/i.test(name)) findings.push(`${prefix}:macro_or_binary_part`);
    if (/\.env(?:\.|$)/i.test(name) || /\.env(?:\.|$)/i.test(text)) findings.push(`${prefix}:env_reference`);
    if (/\.(cer|key|pfx|p12)$/i.test(name) || /\.(cer|key|pfx|p12)\b/i.test(text)) findings.push(`${prefix}:csd_or_key_reference`);
    if (/<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text)) findings.push(`${prefix}:xml_content`);
    if (/%PDF/i.test(text)) findings.push(`${prefix}:pdf_content`);
    if (/https:\/\/api\.factura\.com/i.test(text)) findings.push(`${prefix}:production_url`);
    if (/(FACTURACOM_API_KEY|FACTURACOM_SECRET_KEY|FACTURACOM_PLUGIN|F-Api-Key|F-Secret-Key|F-PLUGIN)["':=\s]+(?!\[REDACTED\]|REEMPLAZAR|PLACEHOLDER|TEST_)[A-Za-z0-9+/=_-]{8,}/i.test(text)) {
      findings.push(`${prefix}:secret_like_value`);
    }
  }
  return findings;
}

function findFormulaInjectionFindings(entries) {
  const findings = [];
  for (const entry of entries) {
    const text = entry.data.toString("utf8");
    if (/<f\b/i.test(text)) findings.push(`${entry.name}:formula_element`);
    const dangerous = Array.from(text.matchAll(/<t>([\s\S]*?)<\/t>/g))
      .map((match) => match[1].replace(/&apos;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">"))
      .filter((value) => /^[=+\-@]/.test(value.trimStart()));
    if (dangerous.length) findings.push(`${entry.name}:unescaped_formula_like_text`);
  }
  return findings;
}

function resolveExcelPath(options = {}) {
  if (typeof options === "string") return assertRuntimePath(options, "xlsxPath");
  if (options.excelPath) return assertRuntimePath(options.excelPath, "excelPath");
  const packageRoot = assertRuntimePath(options.packageRoot || DEFAULT_PACKAGE_ROOT, "packageRoot");
  const period = normalizePeriod(options.period) || latestPackagePeriod(packageRoot);
  if (!period) throw new Error("No existen paquetes sandbox para analizar Excel.");
  return accountantExcelPathForPeriod(packageRoot, period);
}

function analyzeAccountantExcel(options = {}) {
  const excelPath = resolveExcelPath(options);
  const period = normalizePeriod(path.basename(path.dirname(excelPath))) || "UNKNOWN";
  const workbookName = path.basename(excelPath);
  const exists = fs.existsSync(excelPath);
  if (!exists) {
    return {
      ok: false,
      period,
      exists: false,
      path: relFromRoot(excelPath),
      bytes: 0,
      sheets: [],
      row_counts: {},
      sensitive_findings: [],
      absolute_path_findings: [],
      formula_injection_findings: [],
      runtime_path_ok: isInside(runtimeRoot, excelPath),
    };
  }
  const entries = listZipEntries(excelPath);
  const sheets = detectSheetNames(entries);
  const rowCounts = detectRowCounts(entries);
  const absolutePathFindings = findAbsolutePathFindings(entries, workbookName);
  const sensitiveFindings = findSensitiveFindings(entries, workbookName);
  const formulaFindings = findFormulaInjectionFindings(entries);
  return {
    ok: sensitiveFindings.length === 0 && absolutePathFindings.length === 0 && formulaFindings.length === 0,
    period,
    exists: true,
    path: relFromRoot(excelPath),
    bytes: fs.statSync(excelPath).size,
    format: "XLSX_OOXML_NODE_PURE",
    sheets,
    required_sheets_present: REQUIRED_SHEETS.every((sheet) => sheets.includes(sheet)),
    row_counts: rowCounts,
    entries: entries.length,
    sensitive_findings: sensitiveFindings,
    absolute_path_findings: absolutePathFindings,
    formula_injection_findings: formulaFindings,
    runtime_path_ok: isInside(runtimeRoot, excelPath),
  };
}

module.exports = {
  EXCEL_SCHEMA_VERSION,
  REQUIRED_SHEETS,
  accountantExcelPathForPeriod,
  analyzeAccountantExcel,
  buildWorkbookSheets,
  findAbsolutePathFindings,
  generateAccountantExcel,
  listZipEntries,
  loadPackageData,
  sanitizeText,
};

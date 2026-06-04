const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const docsDir = path.join(root, "docs");
const kbDir = path.join(root, "data", "knowledge_base");
const activeCatalogPath = path.join(root, "data", "concepts.normalized.json");
const officialSearchDirs = [
  "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD ORIGINAL",
  "C:/Users/Juandi Gamer/Desktop/CATALOGOS SAT BD",
  path.join(root, "data", "sat_official"),
];

const requiredDocs = {
  fillingGuide: path.join(docsDir, "CFDI40_OFFICIAL_FILLING_GUIDE_ANALYSIS.md"),
  validationMatrix: path.join(docsDir, "CFDI40_VALIDATION_MATRIX.md"),
  masterCatalogMap: path.join(docsDir, "CFDI40_MASTER_CATALOG_MAP.md"),
  claveProdServ: path.join(docsDir, "CFDI40_CLAVEPRODSERV_ANALYSIS.md"),
  claveUnidad: path.join(docsDir, "CFDI40_CLAVEUNIDAD_ANALYSIS.md"),
  taxModel: path.join(docsDir, "CFDI40_TAX_MODEL.md"),
  regimen: path.join(docsDir, "CFDI40_REGIMEN_ANALYSIS.md"),
  usoCfdi: path.join(docsDir, "CFDI40_USOCFDI_ANALYSIS.md"),
  resico: path.join(docsDir, "RESICO_626_DECISION_MATRIX.md"),
  roadmap: path.join(docsDir, "CFDI40_IMPLEMENTATION_ROADMAP.md"),
};

const requiredJson = {
  fillingRules: path.join(kbDir, "cfdi40_filling_rules.json"),
  decisionEngine: path.join(kbDir, "cfdi40_decision_engine.json"),
  claveProdServIndex: path.join(kbDir, "cfdi40_claveprodserv_index.json"),
  claveUnidadIndex: path.join(kbDir, "cfdi40_claveunidad_index.json"),
  masterKnowledge: path.join(kbDir, "cfdi40_master_knowledge.json"),
};

const productSearchFamilies = {
  CCTV: ["camara", "cámara", "cctv", "videovigilancia", "video vigilancia", "dvr", "nvr", "grabador", "vigilancia", "fuente de poder", "alimentacion", "alimentación", "adaptador", "transformador"],
  RED_COMUNICACION: ["router", "switch", "red", "cable", "cableado", "access point", "punto de acceso", "comunicacion", "comunicación", "inalambrico", "inalámbrico"],
  COMPUTO: ["computadora", "laptop", "ordenador", "pc", "disco duro", "ssd", "ram", "memoria", "servidor", "monitor"],
  CONTROL_ACCESO: ["control de acceso", "biometrico", "biométrico", "lector", "lectora", "tag", "rfid", "chapa", "cerradura", "torniquete", "tarjeta"],
  ACCESO_VEHICULAR: ["barrera", "pluma", "vehicular", "estacionamiento", "brazo"],
  SERVICIOS_TECNICOS: ["mantenimiento", "reparacion", "reparación", "instalacion", "instalación", "soporte", "diagnostico", "diagnóstico", "configuracion", "configuración"],
  ELECTRONICO: ["electronico", "electrónico", "equipo electronico", "equipo eléctrico", "fuente", "cargador", "adaptador"],
};

const guidePageMap = {
  FormaPago: [6, 7, 11, 69, 71, 72, 73, 74, 75, 84, 86, 96],
  MetodoPago: [11, 12, 71, 72, 73, 75, 80],
  TipoDeComprobante: [8, 10, 11, 71, 73, 74, 75],
  RegimenFiscal: [16, 19, 30, 46, 123],
  UsoCFDI: [19, 20, 77],
  ClaveProdServ: [20, 21, 32, 33, 62, 65, 67, 68, 71, 73, 75, 78],
  ClaveUnidad: [22, 32, 66, 67, 68, 71, 73, 75, 83, 85, 116, 117],
  ObjetoImp: [25],
  Impuestos: [8, 10, 11, 25, 27, 35, 36, 37, 38, 40, 53, 56],
  Exportacion: [11],
};

function ensureDirs() {
  fs.mkdirSync(docsDir, { recursive: true });
  fs.mkdirSync(kbDir, { recursive: true });
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slug(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function findOfficialFile(predicate, label) {
  for (const dir of officialSearchDirs) {
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
        } else if (predicate(entry.name, full)) {
          return full.replace(/\\/g, "/");
        }
      }
    }
  }
  throw new Error(`No encontre ${label}. Revisar carpetas: ${officialSearchDirs.join(", ")}`);
}

function findPython() {
  const candidates = [
    process.env.PYTHON,
    path.join(process.env.USERPROFILE || "", ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "python", "python.exe"),
    "python",
    "py",
  ].filter(Boolean);

  for (const candidate of candidates) {
    const result = spawnSync(candidate, ["-c", "import pypdf; print('ok')"], { encoding: "utf8" });
    if (result.status === 0) return candidate;
  }
  throw new Error("No encontre Python con pypdf para leer la guia Anexo 20.");
}

function extractPdfGuide(pdfPath) {
  const python = findPython();
  const script = String.raw`
import json, re, sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
pages = []
for idx, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    clean = re.sub(r"\s+", " ", text).strip()
    pages.append({"page": idx, "text": clean[:2500]})

terms = ["FormaPago", "MetodoPago", "TipoDeComprobante", "RegimenFiscal", "UsoCFDI", "ClaveProdServ", "ClaveUnidad", "ObjetoImp", "Impuestos", "Exportacion"]
term_pages = {}
for term in terms:
    found = []
    for idx, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        if term.lower() in text.lower():
            found.append(idx)
    term_pages[term] = found[:16]

print(json.dumps({
    "page_count": len(reader.pages),
    "term_pages": term_pages,
    "first_pages": pages[:6],
}, ensure_ascii=False))
`;

  const result = spawnSync(python, ["-c", script, pdfPath], {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Fallo lectura PDF: ${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout.trim());
}

function activeCatalogFacts() {
  const catalog = JSON.parse(fs.readFileSync(activeCatalogPath, "utf8"));
  const concepts = catalog.concepts || [];
  const productKeys = new Map();
  const unitKeys = new Map();

  for (const concept of concepts) {
    const sat = concept.sat || {};
    const productKey = sat.product_service_key || concept.clave_prod_serv || "";
    const unitKey = sat.unit_key || concept.clave_unidad || "";
    if (productKey) {
      if (!productKeys.has(productKey)) productKeys.set(productKey, []);
      productKeys.get(productKey).push({
        id: concept.id,
        family: concept.subfamily || concept.family || null,
        type: concept.item_type || null,
        action_n8n: concept.action_n8n || null,
      });
    }
    if (unitKey) {
      if (!unitKeys.has(unitKey)) unitKeys.set(unitKey, []);
      unitKeys.get(unitKey).push(concept.id);
    }
  }

  return {
    source: catalog.source || {},
    concept_count: concepts.length,
    active_product_keys: Array.from(productKeys.keys()).sort(),
    active_unit_keys: Array.from(unitKeys.keys()).sort(),
    product_key_usage: Object.fromEntries(Array.from(productKeys.entries()).map(([key, usages]) => [key, usages])),
    unit_key_usage: Object.fromEntries(Array.from(unitKeys.entries()).map(([key, usages]) => [key, usages.slice(0, 20)])),
  };
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function psArray(values) {
  return `@(${values.map(psString).join(",")})`;
}

function extractMasterCatalog(xlsPath, activeFacts) {
  const allTerms = Array.from(new Set(Object.values(productSearchFamilies).flat().map(normalizeText)));
  const ps = String.raw`
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$xlsPath = __XLS_PATH__
$activeKeys = __ACTIVE_PRODUCT_KEYS__
$activeUnits = __ACTIVE_UNIT_KEYS__
$targetTerms = __TARGET_TERMS__

function Normalize([string]$value) {
  if ($null -eq $value) { return "" }
  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)
  return ([Regex]::Replace($normalized, '\p{Mn}', '')).ToLowerInvariant()
}

function CleanValue($value) {
  if ($null -eq $value -or $value -is [DBNull]) { return "" }
  return ([string]$value).Trim()
}

function NormalizeCode([string]$sheet, [string]$header, [string]$value) {
  if ($header -ne 'clave' -or -not $value) { return $value }
  if ($sheet -eq 'c_ClaveProdServ' -and $value -match '^\d+$') { return $value.PadLeft(8, '0') }
  if ($sheet -eq 'c_Impuesto' -and $value -match '^\d+$') { return $value.PadLeft(3, '0') }
  if ($sheet -eq 'c_FormaPago' -and $value -match '^\d+$') { return $value.PadLeft(2, '0') }
  if ($sheet -eq 'c_ObjetoImp' -and $value -match '^\d+$') { return $value.PadLeft(2, '0') }
  return $value
}

function QueryTable($conn, [string]$sql) {
  $cmd = $conn.CreateCommand()
  $cmd.CommandText = $sql
  $adapter = New-Object System.Data.OleDb.OleDbDataAdapter($cmd)
  $dt = New-Object System.Data.DataTable
  [void]$adapter.Fill($dt)
  return ,$dt
}

function ReadFixed($conn, [string]$sheet, [string]$range, [array]$headers, [int]$sourceStartRow) {
  $sql = 'SELECT * FROM [' + $sheet + '$' + $range + ']'
  $dt = QueryTable $conn $sql
  $items = @()
  $rowNumber = $sourceStartRow
  foreach ($row in $dt.Rows) {
    $obj = [ordered]@{ source_sheet = $sheet; source_row = $rowNumber }
    for ($i = 0; $i -lt $headers.Count; $i++) {
      $clean = CleanValue $row.ItemArray[$i]
      $obj[$headers[$i]] = NormalizeCode $sheet $headers[$i] $clean
    }
    $items += [pscustomobject]$obj
    $rowNumber++
  }
  return @($items)
}

$connString = 'Provider=Microsoft.ACE.OLEDB.12.0;Data Source=' + $xlsPath + ';Extended Properties="Excel 8.0;HDR=NO;IMEX=1"'
$conn = New-Object System.Data.OleDb.OleDbConnection($connString)
$conn.Open()
try {
  $schema = $conn.GetOleDbSchemaTable([System.Data.OleDb.OleDbSchemaGuid]::Tables, $null)
  $sheets = @()
  foreach ($row in $schema.Rows) {
    $name = [string]$row.TABLE_NAME
    if ($name -like '*$' -and $name -notlike '*FilterDatabase*') {
      $sheetName = $name.TrimEnd('$')
      $count = (QueryTable $conn "SELECT COUNT(*) AS total_rows FROM [$name]").Rows[0].ItemArray[0]
      $preview = @()
      $sampleDt = QueryTable $conn "SELECT TOP 7 * FROM [$name]"
      foreach ($sampleRow in $sampleDt.Rows) {
        $previewRow = @()
        for ($i = 0; $i -lt [Math]::Min(8, $sampleDt.Columns.Count); $i++) { $previewRow += CleanValue $sampleRow.ItemArray[$i] }
        $preview += ,$previewRow
      }
      $sheets += [pscustomobject]@{ name = $sheetName; raw_rows_in_sheet = [int]$count; preview = $preview }
    }
  }

  $productsAll = ReadFixed $conn 'c_ClaveProdServ' 'A6:H65536' @('clave','descripcion','incluir_iva_trasladado','incluir_ieps_trasladado','complemento_que_debe_incluir','fecha_inicio_vigencia','fecha_fin_vigencia','estimulo_franja_fronteriza') 6
  $products = @()
  $activeProductEntries = @()
  foreach ($item in $productsAll) {
    if (-not $item.clave) { continue }
    $normalizedDescription = Normalize $item.descripcion
    $matches = @()
    foreach ($term in $targetTerms) {
      if ($normalizedDescription.Contains($term)) { $matches += $term }
    }
    $isActive = $activeKeys -contains $item.clave
    if ($isActive) { $activeProductEntries += $item }
    if ($matches.Count -gt 0 -or $isActive) {
      $products += [pscustomobject]@{
        source_sheet = $item.source_sheet
        source_row = $item.source_row
        clave = $item.clave
        descripcion = $item.descripcion
        incluir_iva_trasladado = $item.incluir_iva_trasladado
        incluir_ieps_trasladado = $item.incluir_ieps_trasladado
        complemento_que_debe_incluir = $item.complemento_que_debe_incluir
        fecha_inicio_vigencia = $item.fecha_inicio_vigencia
        fecha_fin_vigencia = $item.fecha_fin_vigencia
        estimulo_franja_fronteriza = $item.estimulo_franja_fronteriza
        matched_terms = @($matches | Select-Object -Unique)
        used_by_active_catalog = [bool]$isActive
      }
    }
  }

  $unitsAll = ReadFixed $conn 'c_ClaveUnidad' 'A6:G65536' @('clave','nombre','descripcion','nota','fecha_inicio_vigencia','fecha_fin_vigencia','simbolo') 6
  $units = @($unitsAll | Where-Object { $_.clave })
  $activeUnitsFound = @($units | Where-Object { $activeUnits -contains $_.clave })

  $regimen = @(ReadFixed $conn 'c_RegimenFiscal' 'A7:F65536' @('clave','descripcion','persona_fisica','persona_moral','fecha_inicio_vigencia','fecha_fin_vigencia') 7 | Where-Object { $_.clave })
  $uso = @(ReadFixed $conn 'c_UsoCFDI' 'A7:G65536' @('clave','descripcion','persona_fisica','persona_moral','fecha_inicio_vigencia','fecha_fin_vigencia','regimenes_fiscales_receptor') 7 | Where-Object { $_.clave })
  $objetoImp = @(ReadFixed $conn 'c_ObjetoImp' 'A6:D65536' @('clave','descripcion','fecha_inicio_vigencia','fecha_fin_vigencia') 6 | Where-Object { $_.clave })
  $impuestos = @(ReadFixed $conn 'c_Impuesto' 'A6:G65536' @('clave','descripcion','retencion','traslado','local_o_federal','fecha_inicio_vigencia','fecha_fin_vigencia') 6 | Where-Object { $_.clave })
  $tasas = @(ReadFixed $conn 'c_TasaOCuota' 'A7:I65536' @('rango_o_fijo','valor_minimo','valor_maximo','impuesto','factor','traslado','retencion','fecha_inicio_vigencia','fecha_fin_vigencia') 7 | Where-Object { $_.rango_o_fijo })
  $metodos = @(ReadFixed $conn 'c_MetodoPago' 'A6:D65536' @('clave','descripcion','fecha_inicio_vigencia','fecha_fin_vigencia') 6 | Where-Object { $_.clave })
  $formas = @(ReadFixed $conn 'c_FormaPago' 'A6:J65536' @('clave','descripcion','bancarizado','numero_operacion','rfc_emisor_cuenta_ordenante','cuenta_ordenante','patron_cuenta_ordenante','rfc_emisor_cuenta_beneficiario','cuenta_beneficiario','patron_cuenta_beneficiaria') 6 | Where-Object { $_.clave })
  $tiposComprobante = @(ReadFixed $conn 'c_TipoDeComprobante' 'A6:F65536' @('clave','descripcion','valor_maximo','valor_maximo_extra','fecha_inicio_vigencia','fecha_fin_vigencia') 6 | Where-Object { $_.clave })
  $tiposFactor = @(ReadFixed $conn 'c_TipoFactor' 'A6:C65536' @('clave','fecha_inicio_vigencia','fecha_fin_vigencia') 6 | Where-Object { $_.clave })

  $result = [ordered]@{
    source_file = $xlsPath
    extracted_at = (Get-Date).ToString('s')
    sheets = $sheets
    row_counts = [ordered]@{
      clave_prod_serv_all = @($productsAll | Where-Object { $_.clave }).Count
      clave_prod_serv_relevant = $products.Count
      clave_unidad_all = $units.Count
      regimen_fiscal = $regimen.Count
      uso_cfdi = $uso.Count
      objeto_imp = $objetoImp.Count
      impuesto = $impuestos.Count
      tasa_o_cuota = $tasas.Count
      metodo_pago = $metodos.Count
      forma_pago = $formas.Count
      tipo_comprobante = $tiposComprobante.Count
      tipo_factor = $tiposFactor.Count
    }
    clave_prod_serv = $products
    clave_prod_serv_active_entries = $activeProductEntries
    clave_unidad = $units
    clave_unidad_active_entries = $activeUnitsFound
    regimen_fiscal = $regimen
    uso_cfdi = $uso
    objeto_imp = $objetoImp
    impuesto = $impuestos
    tasa_o_cuota = $tasas
    metodo_pago = $metodos
    forma_pago = $formas
    tipo_comprobante = $tiposComprobante
    tipo_factor = $tiposFactor
  }
  $result | ConvertTo-Json -Depth 12 -Compress
} finally {
  if ($conn.State -eq 'Open') { $conn.Close() }
}
`
    .replace("__XLS_PATH__", psString(xlsPath))
    .replace("__ACTIVE_PRODUCT_KEYS__", psArray(activeFacts.active_product_keys))
    .replace("__ACTIVE_UNIT_KEYS__", psArray(activeFacts.active_unit_keys))
    .replace("__TARGET_TERMS__", psArray(allTerms));

  const tempPs1 = path.join(kbDir, `_tmp_extract_cfdi40_${Date.now()}.ps1`);
  fs.writeFileSync(tempPs1, ps, "utf8");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tempPs1], {
    encoding: "utf8",
    maxBuffer: 80 * 1024 * 1024,
    timeout: 180000,
  });
  try {
    fs.unlinkSync(tempPs1);
  } catch (_error) {
    // Best effort cleanup for the generated extractor script.
  }
  if (result.status !== 0) {
    throw new Error(`Fallo lectura XLS maestro SAT: ${result.stderr || result.stdout}`);
  }
  const output = result.stdout.trim();
  if (!output) {
    throw new Error(`Fallo lectura XLS maestro SAT: PowerShell no devolvio JSON. stderr=${result.stderr.trim() || "(vacio)"}`);
  }
  return JSON.parse(output);
}

function buildRules(guide, catalog) {
  const page = (term) => guide.term_pages?.[term] || guidePageMap[term] || [];
  return [
    ["CFDI40-001", "Comprobante", "TipoDeComprobante=I", "Para ingresos de servicios/productos Emberhub usar comprobante de Ingreso antes de cualquier captura manual.", "ERROR", page("TipoDeComprobante")],
    ["CFDI40-002", "Comprobante", "Exportacion", "Definir Exportacion con clave vigente del catalogo; para operaciones locales comunes se requiere revisar que sea la clave aplicable antes de emitir.", "ERROR", page("Exportacion")],
    ["CFDI40-003", "Emisor", "RegimenFiscal", "El regimen emisor debe existir en c_RegimenFiscal y corresponder al certificado/CSD. Para este MVP se modela RESICO persona fisica 626 como matriz de decision, no como timbrado.", "ERROR", page("RegimenFiscal")],
    ["CFDI40-004", "Receptor", "RegimenFiscalReceptor", "El regimen receptor debe existir en c_RegimenFiscal y ser compatible con el RFC/tipo persona del receptor.", "ERROR", page("RegimenFiscal")],
    ["CFDI40-005", "Receptor", "UsoCFDI", "UsoCFDI debe existir en c_UsoCFDI y ser compatible con RegimenFiscalReceptor segun la columna Regimen Fiscal Receptor.", "ERROR", page("UsoCFDI")],
    ["CFDI40-006", "Concepto", "ClaveProdServ", "ClaveProdServ debe provenir del catalogo oficial c_ClaveProdServ y del catalogo activo validado; no se inventan claves.", "ERROR", page("ClaveProdServ")],
    ["CFDI40-007", "Concepto", "ClaveUnidad", "ClaveUnidad debe existir en c_ClaveUnidad. Para servicios tecnicos se prefiere E48 si la base activa lo indica; para productos H87 u otra unidad solo si esta en la base.", "ERROR", page("ClaveUnidad")],
    ["CFDI40-008", "Concepto", "Descripcion", "La descripcion capturada debe describir el bien o servicio real sin usar texto ambiguo como 'servicio general' cuando falte equipo/sistema.", "WARNING", page("ClaveProdServ")],
    ["CFDI40-009", "Concepto", "ObjetoImp=02", "Si ObjetoImp es 02, el concepto es objeto de impuesto y debe tener desglose de impuestos aplicable.", "ERROR", page("ObjetoImp")],
    ["CFDI40-010", "Concepto", "ObjetoImp=01", "Si ObjetoImp es 01, no se deben capturar traslados del concepto.", "ERROR", page("ObjetoImp")],
    ["CFDI40-011", "Concepto", "ObjetoImp=03", "Si ObjetoImp es 03, el concepto puede ser objeto de impuesto sin obligar al desglose; requiere revision humana por caso.", "WARNING", page("ObjetoImp")],
    ["CFDI40-012", "Impuestos", "IVA traslado", "IVA debe usar c_Impuesto=002, TipoFactor=Tasa/Exento segun corresponda y tasa vigente de c_TasaOCuota.", "ERROR", page("Impuestos")],
    ["CFDI40-013", "Impuestos", "ISR retencion", "ISR c_Impuesto=001 es retencion, no traslado; para RESICO se evalua solo como regla fiscal futura, no se automatiza timbrado.", "WARNING", page("Impuestos")],
    ["CFDI40-014", "Pago", "MetodoPago=PUE", "PUE se usa cuando el pago ocurre en una sola exhibicion; FormaPago debe reflejar el medio real si se conoce.", "ERROR", page("MetodoPago")],
    ["CFDI40-015", "Pago", "MetodoPago=PPD", "PPD indica pago diferido/parcialidades; en captura manual se debe revisar FormaPago y complemento de pago futuro.", "WARNING", page("MetodoPago")],
    ["CFDI40-016", "Pago", "FormaPago", "FormaPago debe existir en c_FormaPago y respetar restricciones bancarizadas cuando aplique.", "ERROR", page("FormaPago")],
    ["CFDI40-017", "Totales", "Subtotal/Total", "SubTotal, descuentos, impuestos y Total deben cuadrar aritmeticamente; este bot no calcula ni timbra totales finales.", "ERROR", page("Impuestos")],
    ["CFDI40-018", "Moneda", "TipoCambio", "Si la moneda no es MXN, validar moneda vigente y tipo de cambio antes de captura/timbrado.", "ERROR", []],
    ["CFDI40-019", "Catalogos", "Vigencia", "Toda clave debe estar vigente para la fecha del comprobante segun fechas de inicio/fin del catalogo maestro.", "ERROR", []],
    ["CFDI40-020", "Catalogos", "Complemento requerido", "Si c_ClaveProdServ indica complemento obligatorio, no usar esa clave en el MVP sin flujo especifico.", "ERROR", page("ClaveProdServ")],
    ["CFDI40-021", "RESICO", "626", "El regimen 626 se considera actividad actual solo si la base activa marca current_activity_ok/resico_626_ok.", "ERROR", page("RegimenFiscal")],
    ["CFDI40-022", "RESICO", "software/apps/web/IA", "Software, apps, IA, web, SaaS y automatizacion digital requieren actividad o bloqueo segun base; no se reclasifican como soporte tecnico.", "ERROR", page("ClaveProdServ")],
    ["CFDI40-023", "Operacion", "venta", "Si el mensaje dice venta, priorizar tipo PRODUCTO en base activa y validar ClaveProdServ/ClaveUnidad del producto.", "ERROR", page("ClaveProdServ")],
    ["CFDI40-024", "Operacion", "servicio", "Revision, diagnostico, mantenimiento y configuracion priorizan SERVICIO; no sugerir producto puro sin evidencia de venta.", "ERROR", page("ClaveProdServ")],
    ["CFDI40-025", "Operacion", "instalacion/cambio", "Instalacion, cambio, sustitucion o reemplazo se tratan como servicio o mixto; si incluye material, pedir desglose o validar concepto mixto.", "WARNING", page("ClaveProdServ")],
    ["CFDI40-026", "Seguridad", "revision humana", "Todos los resultados del bot son sugerencias para captura manual; requires_human_review debe permanecer verdadero.", "ERROR", []],
    ["CFDI40-027", "Limite", "no PAC", "La knowledge base no autoriza timbrado, PAC, WhatsApp ni envio fiscal automatico.", "ERROR", []],
  ].map(([rule_id, domain, field, behavior, severity, source_pages]) => ({
    rule_id,
    source: "ANEXO20_OFICIAL",
    category: domain,
    condition: field,
    domain,
    field,
    expected_behavior: behavior,
    severity: severity === "ERROR" ? "BLOCKER" : severity,
    applies_to: [domain, field].filter(Boolean),
    source_pages,
    implementation_status: "knowledge_base_only",
  }));
}

function groupProductsByFamily(entries) {
  const grouped = {};
  for (const [family, terms] of Object.entries(productSearchFamilies)) {
    const normalizedTerms = terms.map(normalizeText);
    grouped[family] = entries
      .filter((entry) => normalizedTerms.some((term) => normalizeText(entry.descripcion).includes(term)) || (entry.matched_terms || []).some((term) => normalizedTerms.includes(normalizeText(term))))
      .slice(0, 80)
      .map((entry) => ({
        clave: entry.clave,
        descripcion: entry.descripcion,
        incluir_iva_trasladado: entry.incluir_iva_trasladado,
        complemento_que_debe_incluir: entry.complemento_que_debe_incluir || null,
        used_by_active_catalog: Boolean(entry.used_by_active_catalog),
      }));
  }
  return grouped;
}

function usageRows(activeFacts, productIndex) {
  const byKey = new Map(productIndex.entries.map((entry) => [entry.clave, entry]));
  return activeFacts.active_product_keys.map((key) => ({
    clave: key,
    exists_in_master_catalog: byKey.has(key),
    master_description: byKey.get(key)?.descripcion || null,
    active_concept_usages: activeFacts.product_key_usage[key] || [],
  }));
}

function buildKnowledge(pdfPath, xlsPath, guide, catalog, activeFacts) {
  const rules = buildRules(guide, catalog);
  const regimen626 = (catalog.regimen_fiscal || []).find((item) => item.clave === "626") || null;
  const usoFor626 = (catalog.uso_cfdi || []).filter((item) => String(item.regimenes_fiscales_receptor || "").replace(/\s+/g, "").split(",").includes("626"));
  const productIndex = {
    schema_version: "cfdi40_claveprodserv_index.v1",
    source_file: xlsPath,
    source_sheet: "c_ClaveProdServ",
    extracted_at: new Date().toISOString(),
    total_rows_in_sheet: catalog.row_counts.clave_prod_serv_all,
    relevant_rows_indexed: catalog.clave_prod_serv.length,
    columns: ["clave", "descripcion", "incluir_iva_trasladado", "incluir_ieps_trasladado", "complemento_que_debe_incluir", "fecha_inicio_vigencia", "fecha_fin_vigencia", "estimulo_franja_fronteriza"],
    search_families: productSearchFamilies,
    entries: catalog.clave_prod_serv,
    grouped_by_operational_family: groupProductsByFamily(catalog.clave_prod_serv),
    active_catalog_key_validation: usageRows(activeFacts, { entries: catalog.clave_prod_serv }),
    false_positive_guards: [
      "Fuente de poder para camara no debe caer en DVR/NVR/disco si el mensaje no menciona DVR/NVR/disco.",
      "Venta prioriza PRODUCTO; revision/configuracion/mantenimiento prioriza SERVICIO.",
      "Cambio/reemplazo/sustitucion prioriza servicio o mixto, no producto puro salvo venta explicita.",
    ],
  };

  const unitIndex = {
    schema_version: "cfdi40_claveunidad_index.v1",
    source_file: xlsPath,
    source_sheet: "c_ClaveUnidad",
    extracted_at: new Date().toISOString(),
    total_rows_indexed: catalog.clave_unidad.length,
    columns: ["clave", "nombre", "descripcion", "nota", "fecha_inicio_vigencia", "fecha_fin_vigencia", "simbolo"],
    active_catalog_unit_validation: activeFacts.active_unit_keys.map((key) => ({
      clave: key,
      exists_in_master_catalog: catalog.clave_unidad.some((unit) => unit.clave === key),
      usages: activeFacts.unit_key_usage[key] || [],
      master_entry: catalog.clave_unidad.find((unit) => unit.clave === key) || null,
    })),
    recommended_for_current_mvp: [
      { clave: "E48", use: "Servicios tecnicos, diagnostico, mantenimiento, instalacion cuando la base activa lo indique." },
      { clave: "H87", use: "Pieza/producto unitario cuando la base activa lo indique." },
    ],
    entries: catalog.clave_unidad,
  };

  const fillingRules = {
    schema_version: "cfdi40_filling_rules.v1",
    generated_at: new Date().toISOString(),
    sources: {
      official_filling_guide_pdf: pdfPath,
      official_master_catalog_xls: xlsPath,
      active_personal_catalog: path.relative(root, activeCatalogPath).replace(/\\/g, "/"),
    },
    guide_page_count: guide.page_count,
    guide_term_pages: guide.term_pages,
    rules,
  };

  const decisionEngine = {
    schema_version: "cfdi40_decision_engine.v1",
    generated_at: new Date().toISOString(),
    decision_contract: {
      catalog_source_of_truth_for_concepts: "data/concepts.normalized.json",
      official_catalog_source_for_validation: "catCFDI_V_4_20260603.xls",
      never_invent: ["concepto_factura", "clave_prod_serv", "clave_unidad", "unidad", "regimen", "uso_cfdi"],
      requires_human_review: true,
      no_timbrado_no_pac: true,
    },
    stages: [
      { order: 1, name: "message_safety", rule_ids: ["CFDI40-022", "CFDI40-026", "CFDI40-027"] },
      { order: 2, name: "active_catalog_match", rule_ids: ["CFDI40-006", "CFDI40-007", "CFDI40-023", "CFDI40-024", "CFDI40-025"] },
      { order: 3, name: "official_catalog_validation", rule_ids: ["CFDI40-019", "CFDI40-020"] },
      { order: 4, name: "tax_model_validation", rule_ids: ["CFDI40-009", "CFDI40-010", "CFDI40-011", "CFDI40-012", "CFDI40-013"] },
      { order: 5, name: "receiver_and_payment_validation", rule_ids: ["CFDI40-004", "CFDI40-005", "CFDI40-014", "CFDI40-015", "CFDI40-016"] },
    ],
    operation_type_policy: {
      venta: "PRODUCTO",
      revision_diagnostico_mantenimiento_configuracion: "SERVICIO",
      instalacion: "SERVICIO_INSTALACION",
      cambio_reemplazo_sustitucion: "SERVICIO_O_MIXTO",
    },
    ambiguity_policy: {
      generic_terms: ["sistema", "equipo", "caseta", "servicio tecnico", "general", "falla", "revision"],
      action: "PEDIR_ACLARACION",
      ready_to_copy: false,
    },
    resico_626_summary: {
      regimen_entry: regimen626,
      allowed_uso_cfdi_when_receiver_is_626: usoFor626.map((item) => ({ clave: item.clave, descripcion: item.descripcion })),
      current_mvp_limit: "Solo sugerencia de conceptos para captura manual; no calcula retenciones ni timbra.",
    },
  };

  const masterKnowledge = {
    schema_version: "cfdi40_master_knowledge.v1",
    generated_at: new Date().toISOString(),
    sources: fillingRules.sources,
    sheet_inventory: catalog.sheets.map((sheet) => ({
      name: sheet.name,
      raw_rows_in_sheet: sheet.raw_rows_in_sheet,
      first_visible_rows: sheet.preview,
      classification: classifySheet(sheet.name),
    })),
    row_counts: catalog.row_counts,
    guide_summary: {
      page_count: guide.page_count,
      term_pages: guide.term_pages,
      first_page_excerpt: guide.first_pages?.[0]?.text || "",
    },
    official_catalogs: {
      regimen_fiscal: catalog.regimen_fiscal,
      uso_cfdi: catalog.uso_cfdi,
      objeto_imp: catalog.objeto_imp,
      impuesto: catalog.impuesto,
      tasa_o_cuota: catalog.tasa_o_cuota,
      metodo_pago: catalog.metodo_pago,
      forma_pago: catalog.forma_pago,
      tipo_comprobante: catalog.tipo_comprobante,
      tipo_factor: catalog.tipo_factor,
    },
    product_index_file: "data/knowledge_base/cfdi40_claveprodserv_index.json",
    unit_index_file: "data/knowledge_base/cfdi40_claveunidad_index.json",
    active_catalog_facts: activeFacts,
  };

  return { fillingRules, decisionEngine, productIndex, unitIndex, masterKnowledge };
}

function classifySheet(name) {
  const normalized = slug(name);
  if (["c_claveprodserv", "c_claveunidad", "c_objetoimp", "c_impuesto", "c_tasaocuota"].includes(normalized)) return "CRITICO_CONCEPTO_IMPUESTO";
  if (["c_regimenfiscal", "c_usocfdi", "c_formapago", "c_metodopago", "c_tipodecomprobante", "c_tipofactor"].includes(normalized)) return "CRITICO_LLENADO";
  if (normalized.includes("codigopostal") || normalized.includes("colonia") || normalized.includes("municipio") || normalized.includes("estado") || normalized.includes("pais")) return "GEOGRAFICO";
  return "SECUNDARIO";
}

function mdTable(headers, rows) {
  const line = `| ${headers.join(" | ")} |`;
  const sep = `| ${headers.map(() => "---").join(" | ")} |`;
  return [line, sep, ...rows.map((row) => `| ${row.map((cell) => String(cell ?? "").replace(/\|/g, "\\|")).join(" | ")} |`)].join("\n");
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeDocs(knowledge, catalog, activeFacts) {
  const { fillingRules, decisionEngine, productIndex, unitIndex, masterKnowledge } = knowledge;
  const sourceBlock = [
    "Fuentes oficiales usadas:",
    `- Guia: \`${fillingRules.sources.official_filling_guide_pdf}\``,
    `- Catalogo maestro: \`${fillingRules.sources.official_master_catalog_xls}\``,
    `- Catalogo activo personal: \`${fillingRules.sources.active_personal_catalog}\``,
    "",
    "Nota de alcance: estos documentos son conocimiento operativo para validacion y captura manual. No autorizan timbrado, PAC ni automatizacion fiscal final.",
  ].join("\n");

  fs.writeFileSync(requiredDocs.fillingGuide, [
    "# CFDI 4.0 - Analisis operativo de la guia oficial de llenado",
    "",
    sourceBlock,
    "",
    "## Campos criticos localizados",
    "",
    mdTable(["Campo", "Paginas donde aparece"], Object.entries(fillingRules.guide_term_pages).map(([term, pages]) => [term, pages.join(", ")])),
    "",
    "## Reglas operativas extraidas",
    "",
    mdTable(["Regla", "Dominio", "Campo", "Severidad", "Comportamiento"], fillingRules.rules.map((rule) => [rule.rule_id, rule.domain, rule.field, rule.severity, rule.expected_behavior])),
    "",
    "## Decision para el bot",
    "",
    "- El bot solo sugiere conceptos y claves desde la base activa.",
    "- Las reglas oficiales se usan para validar consistencia, vigencia y riesgos.",
    "- Cualquier salida sigue requiriendo revision humana antes de capturar en SAT.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.validationMatrix, [
    "# CFDI 4.0 - Matriz de validacion",
    "",
    sourceBlock,
    "",
    mdTable(["ID", "Validacion", "Entrada requerida", "Salida esperada", "Nivel"], fillingRules.rules.map((rule) => [
      rule.rule_id,
      `${rule.domain}.${rule.field}`,
      "Mensaje, catalogo activo y catalogo maestro SAT",
      rule.expected_behavior,
      rule.severity,
    ])),
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.masterCatalogMap, [
    "# CFDI 4.0 - Mapa del catalogo maestro SAT",
    "",
    sourceBlock,
    "",
    "## Hojas detectadas",
    "",
    mdTable(["Hoja", "Filas visibles", "Clasificacion"], masterKnowledge.sheet_inventory.map((sheet) => [sheet.name, sheet.raw_rows_in_sheet, sheet.classification])),
    "",
    "## Hojas criticas para este MVP",
    "",
    "- c_ClaveProdServ: valida que una clave SAT exista y este vigente.",
    "- c_ClaveUnidad: valida unidad de servicio/producto.",
    "- c_ObjetoImp, c_Impuesto, c_TasaOCuota, c_TipoFactor: validan modelo de impuestos.",
    "- c_RegimenFiscal y c_UsoCFDI: validan receptor/regimen/uso.",
    "- c_FormaPago, c_MetodoPago, c_TipoDeComprobante: validan llenado general.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.claveProdServ, [
    "# CFDI 4.0 - Analisis c_ClaveProdServ",
    "",
    sourceBlock,
    "",
    `Total de claves oficiales leidas: ${productIndex.total_rows_in_sheet}.`,
    `Claves indexadas por relevancia Emberhub/RESICO: ${productIndex.relevant_rows_indexed}.`,
    "",
    "## Validacion contra catalogo activo",
    "",
    mdTable(["Clave activa", "Existe en maestro", "Descripcion SAT", "Usos"], productIndex.active_catalog_key_validation.map((item) => [
      item.clave,
      item.exists_in_master_catalog ? "SI" : "NO",
      item.master_description || "",
      item.active_concept_usages.map((usage) => `${usage.id}:${usage.type}`).join(", "),
    ])),
    "",
    "## Familias operativas",
    "",
    ...Object.entries(productIndex.grouped_by_operational_family).map(([family, entries]) => [
      `### ${family}`,
      "",
      mdTable(["Clave", "Descripcion", "IVA", "Complemento", "En base activa"], entries.slice(0, 20).map((entry) => [entry.clave, entry.descripcion, entry.incluir_iva_trasladado, entry.complemento_que_debe_incluir || "", entry.used_by_active_catalog ? "SI" : "NO"])),
      "",
    ].join("\n")),
    "## Guardrails semanticos",
    "",
    ...productIndex.false_positive_guards.map((guard) => `- ${guard}`),
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.claveUnidad, [
    "# CFDI 4.0 - Analisis c_ClaveUnidad",
    "",
    sourceBlock,
    "",
    `Unidades oficiales indexadas: ${unitIndex.total_rows_indexed}.`,
    "",
    "## Unidades usadas por catalogo activo",
    "",
    mdTable(["Clave", "Existe en maestro", "Nombre", "Uso activo"], unitIndex.active_catalog_unit_validation.map((item) => [
      item.clave,
      item.exists_in_master_catalog ? "SI" : "NO",
      item.master_entry?.nombre || "",
      item.usages.join(", "),
    ])),
    "",
    "## Politica MVP",
    "",
    "- E48 se conserva para servicios si la base activa lo usa.",
    "- H87 se conserva para venta de piezas/productos si la base activa lo usa.",
    "- No se infieren unidades nuevas desde texto libre.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.taxModel, [
    "# CFDI 4.0 - Modelo de impuestos",
    "",
    sourceBlock,
    "",
    "## Objeto de impuesto",
    "",
    mdTable(["Clave", "Descripcion"], catalog.objeto_imp.map((item) => [item.clave, item.descripcion])),
    "",
    "## Impuestos",
    "",
    mdTable(["Clave", "Descripcion", "Retencion", "Traslado"], catalog.impuesto.map((item) => [item.clave, item.descripcion, item.retencion, item.traslado])),
    "",
    "## Tasas o cuotas vigentes relevantes",
    "",
    mdTable(["Rango/Fijo", "Min", "Max", "Impuesto", "Factor", "Traslado", "Retencion"], catalog.tasa_o_cuota.map((item) => [item.rango_o_fijo, item.valor_minimo, item.valor_maximo, item.impuesto, item.factor, item.traslado, item.retencion])),
    "",
    "## Decision",
    "",
    "- ObjetoImp 02 exige desglose fiscal antes de timbrado; este proyecto solo sugiere.",
    "- IVA traslado se modela como referencia desde catalogo activo y catalogo maestro.",
    "- Retenciones RESICO no se automatizan en el MVP.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.regimen, [
    "# CFDI 4.0 - Analisis c_RegimenFiscal",
    "",
    sourceBlock,
    "",
    mdTable(["Clave", "Descripcion", "Fisica", "Moral"], catalog.regimen_fiscal.map((item) => [item.clave, item.descripcion, item.persona_fisica, item.persona_moral])),
    "",
    "## Regimen 626",
    "",
    decisionEngine.resico_626_summary.regimen_entry
      ? `626 localizado: ${decisionEngine.resico_626_summary.regimen_entry.descripcion}.`
      : "626 no localizado en el extracto; revisar fuente oficial.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.usoCfdi, [
    "# CFDI 4.0 - Analisis c_UsoCFDI",
    "",
    sourceBlock,
    "",
    "## Usos compatibles con receptor 626",
    "",
    mdTable(["Clave", "Descripcion"], decisionEngine.resico_626_summary.allowed_uso_cfdi_when_receiver_is_626.map((item) => [item.clave, item.descripcion])),
    "",
    "## Regla para n8n",
    "",
    "UsoCFDI se debe validar contra RegimenFiscalReceptor. La sugerencia de concepto no basta para capturar factura completa.",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.resico, [
    "# RESICO 626 - Matriz de decision",
    "",
    sourceBlock,
    "",
    mdTable(["Decision", "Condicion", "Resultado"], [
      ["Permitir sugerencia", "Concepto activo resico_626_ok/current_activity_ok y claves SAT validadas", "SUGERIR con revision humana"],
      ["Pedir aclaracion", "Mensaje generico o equipo/sistema no identificado", "PEDIR_ACLARACION sin concepto listo"],
      ["Bloquear/agregar actividad", "Software, apps, IA, web, SaaS o automatizacion digital no permitida por base", "BLOQUEAR o AGREGAR_ACTIVIDAD"],
      ["No timbrar", "Cualquier caso", "Captura manual SAT/PAC externo bajo criterio humano"],
    ]),
    "",
    "## Regimen 626 en catalogo maestro",
    "",
    decisionEngine.resico_626_summary.regimen_entry
      ? JSON.stringify(decisionEngine.resico_626_summary.regimen_entry, null, 2)
      : "No localizado",
    "",
  ].join("\n"), "utf8");

  fs.writeFileSync(requiredDocs.roadmap, [
    "# CFDI 4.0 - Roadmap de implementacion",
    "",
    sourceBlock,
    "",
    "## Estado actual",
    "",
    "- Knowledge base oficial creada desde Anexo 20 y catCFDI maestro.",
    "- Motor de scoring productivo no modificado.",
    "- Workflows n8n no modificados por esta fase.",
    "",
    "## Siguientes pasos recomendados",
    "",
    mdTable(["Fase", "Objetivo", "Notas"], [
      ["5G.4", "Usar knowledge base solo para validacion offline", "No cambiar sugerencias hasta tener tests de regresion."],
      ["5G.5", "Agregar auditoria de claves activas contra maestro", "Solo reportes; no mutar catalogo activo."],
      ["Futura", "Wizard de captura fiscal completa", "Receptor, uso CFDI, metodo/forma pago, totales e impuestos."],
      ["Fuera de alcance MVP", "PAC/timbrado/WhatsApp", "No implementar sin decision explicita."],
    ]),
    "",
  ].join("\n"), "utf8");

  return { docs_written: Object.values(requiredDocs).map((filePath) => path.relative(root, filePath).replace(/\\/g, "/")) };
}

function main() {
  ensureDirs();
  const pdfPath = findOfficialFile((name) => /\.pdf$/i.test(name) && normalizeText(name).includes("guia") && normalizeText(name).includes("cfdi"), "Anexo 20 Guia de llenado CFDI PDF");
  const xlsPath = findOfficialFile((name) => /^catcfdi_v_4_20260603\.xls$/i.test(name), "catCFDI_V_4_20260603.xls");
  const guide = extractPdfGuide(pdfPath);
  const activeFacts = activeCatalogFacts();
  const catalog = extractMasterCatalog(xlsPath, activeFacts);
  const knowledge = buildKnowledge(pdfPath, xlsPath, guide, catalog, activeFacts);

  writeJson(requiredJson.fillingRules, knowledge.fillingRules);
  writeJson(requiredJson.decisionEngine, knowledge.decisionEngine);
  writeJson(requiredJson.claveProdServIndex, knowledge.productIndex);
  writeJson(requiredJson.claveUnidadIndex, knowledge.unitIndex);
  writeJson(requiredJson.masterKnowledge, knowledge.masterKnowledge);
  const docResult = writeDocs(knowledge, catalog, activeFacts);

  console.log("CFDI 4.0 knowledge base generated");
  console.log(`PDF: ${pdfPath}`);
  console.log(`XLS: ${xlsPath}`);
  console.log(`Guide pages: ${guide.page_count}`);
  console.log(`Master sheets: ${catalog.sheets.length}`);
  console.log(`ClaveProdServ total: ${catalog.row_counts.clave_prod_serv_all}`);
  console.log(`ClaveProdServ indexed: ${catalog.row_counts.clave_prod_serv_relevant}`);
  console.log(`ClaveUnidad total: ${catalog.row_counts.clave_unidad_all}`);
  console.log(`Docs: ${docResult.docs_written.length}`);
  console.log(`JSON: ${Object.values(requiredJson).length}`);
}

main();

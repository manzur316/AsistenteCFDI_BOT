const fs = require("fs");
const path = require("path");
const { MISSING_MESSAGE, OUTPUT_PATH: SAT_IMPORT_PATH, importSatCatalog, listOfficialFiles, normalizeText } = require("./import-sat-catalog");

const root = path.resolve(__dirname, "..");
const BASE_CATALOG_PATH = path.join(root, "data", "concepts.normalized.json");
const OUT_DIR = path.join(root, "data", "catalog_expansion");
const PROPOSED_PATH = path.join(OUT_DIR, "proposed_concepts.resico_626.json");
const CANDIDATE_PATH = path.join(OUT_DIR, "concepts.normalized.candidate.json");

const REQUIRED_FIELDS = [
  "id",
  "familia",
  "subfamilia",
  "tipo",
  "operation_type",
  "concepto_factura_recomendado",
  "descripcion_clave_sat",
  "clave_prod_serv",
  "clave_unidad",
  "unidad",
  "objeto_imp",
  "iva_sugerido",
  "resico_626_ok",
  "actividad_actual_ok",
  "actividad_soporte",
  "cobertura_constancia",
  "riesgo_fiscal",
  "requiere_revision_humana",
  "score_base",
  "keywords_match",
  "keywords_excluir",
  "notas_guardrail",
  "precision_level",
  "source",
  "source_catalog_file",
  "source_catalog_row_or_key",
  "internal_only_notes",
];

const DESIRED_CONCEPTS = [
  tpl("EXP-PROD-CCTV-CAMERA", "CCTV", "Camara videovigilancia", "PRODUCTO", "PRODUCTO", "VENTA DE CAMARA CCTV O CAMARA DE VIDEOVIGILANCIA", ["camara", "videovigilancia"], ["dvr", "nvr", "grabador"], "EXACT"),
  tpl("EXP-PROD-CCTV-DVR-NVR", "CCTV", "Grabador videovigilancia", "PRODUCTO", "PRODUCTO", "VENTA DE DVR, NVR O GRABADOR DE VIDEOVIGILANCIA", ["dvr", "nvr", "grabador", "videovigilancia"], ["camara"], "EXACT"),
  tpl("EXP-PROD-CCTV-POWER", "CCTV", "Fuente CCTV", "PRODUCTO", "PRODUCTO", "VENTA DE FUENTE DE PODER PARA CCTV", ["fuente", "poder"], ["camara", "dvr", "nvr"], "BROAD_ALLOWED"),
  tpl("EXP-PROD-CCTV-DISK", "CCTV", "Disco CCTV", "PRODUCTO", "PRODUCTO", "VENTA DE DISCO DURO PARA DVR O NVR", ["disco", "duro"], ["camara"], "EXACT"),
  tpl("EXP-PROD-CCTV-ACCESSORY", "CCTV", "Accesorios CCTV", "PRODUCTO", "PRODUCTO", "VENTA DE CONECTOR, BALUN O ACCESORIO PARA CCTV", ["conector", "accesorio"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-CCTV-CABLE", "CCTV", "Cable CCTV", "PRODUCTO", "PRODUCTO", "VENTA DE CABLE PARA SISTEMA CCTV", ["cable"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-CAMERA-INSTALL", "CCTV", "Instalacion camara", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE CAMARA CCTV", ["instalacion", "camara"], ["dvr", "nvr"], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-SYSTEM-INSTALL", "CCTV", "Instalacion sistema", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE SISTEMA DE VIDEOVIGILANCIA", ["instalacion", "videovigilancia"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-DVR-INSTALL", "CCTV", "Instalacion DVR/NVR", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE DVR O NVR", ["instalacion", "dvr"], ["camara"], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-MAINT", "CCTV", "Mantenimiento CCTV", "SERVICIO", "SERVICIO", "MANTENIMIENTO DE SISTEMA CCTV", ["mantenimiento", "videovigilancia"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-DIAG", "CCTV", "Diagnostico CCTV", "SERVICIO", "SERVICIO", "DIAGNOSTICO Y REVISION DE SISTEMA CCTV", ["soporte", "tecnico"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-CONFIG", "CCTV", "Configuracion CCTV", "SERVICIO", "SERVICIO", "CONFIGURACION DE DVR, NVR O CAMARAS CCTV", ["configuracion", "sistema"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-CCTV-CABLING", "CCTV", "Cableado CCTV", "SERVICIO", "SERVICIO_INSTALACION", "CABLEADO PARA SISTEMA CCTV", ["cableado", "instalacion"], [], "BROAD_ALLOWED"),

  tpl("EXP-SVC-AC-LOCK-INSTALL", "CONTROL_ACCESO", "Chapa magnetica", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE CHAPA MAGNETICA O ELECTROIMAN", ["instalacion", "control", "acceso"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-AC-READER-INSTALL", "CONTROL_ACCESO", "Lector biometrico", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE LECTOR, BIOMETRICO O PANEL DE ACCESO", ["instalacion", "control", "acceso"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-AC-ACCESSORY-INSTALL", "CONTROL_ACCESO", "Accesorio control acceso", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE BOTON, FUENTE O ACCESORIO DE CONTROL DE ACCESO", ["instalacion", "control", "acceso"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-AC-MAINT", "CONTROL_ACCESO", "Mantenimiento control acceso", "SERVICIO", "SERVICIO", "MANTENIMIENTO Y REVISION DE CONTROL DE ACCESO", ["soporte", "tecnico"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-AC-LOCK", "CONTROL_ACCESO", "Chapa electroiman", "PRODUCTO", "PRODUCTO", "VENTA DE CHAPA MAGNETICA O ELECTROIMAN", ["cerradura", "electromagnetica"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-AC-READER", "CONTROL_ACCESO", "Lector biometrico", "PRODUCTO", "PRODUCTO", "VENTA DE LECTOR O BIOMETRICO DE CONTROL DE ACCESO", ["lector"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-AC-TAG", "CONTROL_ACCESO", "Tarjetas tags", "PRODUCTO", "PRODUCTO", "VENTA DE TARJETA, TAG O LLAVERO RFID", ["tarjeta", "rfid"], [], "EXACT"),
  tpl("EXP-PROD-AC-ACCESSORY", "CONTROL_ACCESO", "Accesorios control acceso", "PRODUCTO", "PRODUCTO", "VENTA DE FUENTE, BOTON O ACCESORIO DE CONTROL DE ACCESO", ["accesorio"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-AC-CONFIG", "CONTROL_ACCESO", "Configuracion acceso", "SERVICIO", "SERVICIO", "CONFIGURACION DE SISTEMA DE CONTROL DE ACCESO", ["configuracion", "sistema"], ["software"], "BROAD_ALLOWED"),

  tpl("EXP-SVC-BARRERA-MAINT", "BARRERA", "Mantenimiento barrera", "SERVICIO", "SERVICIO", "MANTENIMIENTO DE BARRERA VEHICULAR", ["mantenimiento", "seguridad"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-BARRERA-DIAG", "BARRERA", "Diagnostico barrera", "SERVICIO", "SERVICIO", "DIAGNOSTICO DE BARRERA VEHICULAR", ["soporte", "tecnico"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-BARRERA-ADJUST", "BARRERA", "Ajuste barrera", "SERVICIO", "SERVICIO", "AJUSTE DE RESORTE, BRAZO O SENSOR DE BARRERA VEHICULAR", ["mantenimiento", "seguridad"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-BARRERA-INSTALL", "BARRERA", "Instalacion barrera", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE BARRERA VEHICULAR", ["instalacion", "seguridad"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-BARRERA-PART", "BARRERA", "Refacciones barrera", "PRODUCTO", "PRODUCTO", "VENTA DE REFACCION O ACCESORIO PARA BARRERA VEHICULAR", ["accesorio"], [], "BROAD_ALLOWED"),

  tpl("EXP-SVC-RED-ROUTER", "RED", "Router", "SERVICIO", "SERVICIO", "INSTALACION O CONFIGURACION DE ROUTER", ["configuracion", "router"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-RED-SWITCH", "RED", "Switch", "SERVICIO", "SERVICIO", "INSTALACION O CONFIGURACION DE SWITCH", ["configuracion", "switch"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-RED-AP", "RED", "Access point", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION O CONFIGURACION DE ACCESS POINT", ["configuracion", "red"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-RED-WIFI", "RED", "WiFi", "SERVICIO", "SERVICIO", "CONFIGURACION DE RED WIFI", ["configuracion", "red"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-RED-DIAG", "RED", "Diagnostico red", "SERVICIO", "SERVICIO", "DIAGNOSTICO DE RED LOCAL", ["soporte", "red"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-RED-CABLING", "RED", "Cableado red", "SERVICIO", "SERVICIO_INSTALACION", "CABLEADO DE RED LIGADO A EQUIPAMIENTO", ["cableado", "instalacion"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-RED-ROUTER", "RED", "Router", "PRODUCTO", "PRODUCTO", "VENTA DE ROUTER", ["router"], [], "EXACT"),
  tpl("EXP-PROD-RED-SWITCH", "RED", "Switch", "PRODUCTO", "PRODUCTO", "VENTA DE SWITCH DE RED", ["switch"], [], "EXACT"),
  tpl("EXP-PROD-RED-AP", "RED", "Access point", "PRODUCTO", "PRODUCTO", "VENTA DE ACCESS POINT", ["access", "point"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-RED-CABLE", "RED", "Cable accesorios", "PRODUCTO", "PRODUCTO", "VENTA DE CABLE UTP, CONECTOR O ACCESORIO DE COMUNICACION", ["cable", "conector"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-RED-EQUIPMENT", "RED", "Equipo comunicacion", "PRODUCTO", "PRODUCTO", "VENTA DE EQUIPO DE COMUNICACION", ["comunicacion"], [], "BROAD_ALLOWED"),

  tpl("EXP-PROD-PC-COMPUTER", "COMPUTO", "Computadora", "PRODUCTO", "PRODUCTO", "VENTA DE COMPUTADORA", ["computadora"], [], "EXACT"),
  tpl("EXP-PROD-PC-LAPTOP", "COMPUTO", "Laptop", "PRODUCTO", "PRODUCTO", "VENTA DE LAPTOP", ["computadora", "portatil"], [], "BROAD_ALLOWED"),
  tpl("EXP-PROD-PC-SSD", "COMPUTO", "SSD", "PRODUCTO", "PRODUCTO", "VENTA DE SSD O UNIDAD DE ESTADO SOLIDO", ["disco", "estado", "solido"], ["cctv", "dvr"], "BROAD_ALLOWED"),
  tpl("EXP-PROD-PC-RAM", "COMPUTO", "RAM", "PRODUCTO", "PRODUCTO", "VENTA DE MEMORIA RAM", ["memoria"], ["cctv"], "BROAD_ALLOWED"),
  tpl("EXP-PROD-PC-POWER", "COMPUTO", "Fuente PC", "PRODUCTO", "PRODUCTO", "VENTA DE FUENTE DE PODER PARA PC", ["fuente", "poder"], ["cctv"], "BROAD_ALLOWED"),
  tpl("EXP-PROD-PC-PERIPHERAL", "COMPUTO", "Perifericos", "PRODUCTO", "PRODUCTO", "VENTA DE TECLADO, MOUSE, MONITOR O PERIFERICO", ["teclado", "mouse"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-PC-MAINT", "COMPUTO", "Mantenimiento computadora", "SERVICIO", "SERVICIO", "MANTENIMIENTO DE COMPUTADORA", ["mantenimiento", "computadora"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-PC-REPAIR", "COMPUTO", "Reparacion computadora", "SERVICIO", "SERVICIO", "REPARACION DE COMPUTADORA", ["reparacion", "computadora"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-PC-DIAG", "COMPUTO", "Diagnostico computadora", "SERVICIO", "SERVICIO", "DIAGNOSTICO DE COMPUTADORA", ["soporte", "tecnico"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-PC-FORMAT", "COMPUTO", "Formateo", "SERVICIO", "SERVICIO", "FORMATEO O MANTENIMIENTO TECNICO DE EQUIPO DE COMPUTO", ["mantenimiento", "computadora"], [], "BROAD_ALLOWED"),
  tpl("EXP-SVC-PC-COMPONENT", "COMPUTO", "Componente fisico", "SERVICIO", "SERVICIO_INSTALACION", "INSTALACION DE COMPONENTE FISICO EN EQUIPO DE COMPUTO", ["instalacion", "computadora"], [], "BROAD_ALLOWED"),
];

function tpl(id, familia, subfamilia, tipo, operationType, concepto, search_terms, excludeTerms, precision) {
  return { id, familia, subfamilia, tipo, operation_type: operationType, concepto_factura_recomendado: concepto, search_terms, keywords_excluir: excludeTerms, desired_precision_level: precision };
}

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function loadJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function officialCatalogAvailable() {
  if (!listOfficialFiles().length) return false;
  const imported = loadJson(SAT_IMPORT_PATH);
  return Boolean(imported && (imported.product_services || []).length && (imported.units || []).length);
}

function scoreOfficialDescription(description, terms) {
  const text = normalizeText(description);
  let score = 0;
  for (const term of terms || []) {
    const normalized = normalizeText(term);
    if (normalized && text.includes(normalized)) score += normalized.length > 4 ? 3 : 2;
  }
  return score;
}

function findOfficialProductService(template, sat) {
  const candidates = (sat.product_services || [])
    .map((item) => ({ item, score: scoreOfficialDescription(item.description, template.search_terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.item.key).localeCompare(String(b.item.key)));
  return candidates[0]?.item || null;
}

function findOfficialUnit(template, sat) {
  const desired = template.tipo === "PRODUCTO" ? "H87" : "E48";
  return (sat.units || []).find((item) => String(item.key).toUpperCase() === desired) || null;
}

function currentActivitySupport(template) {
  if (template.familia === "COMPUTO") return ["A2", "A3", "A5"];
  if (template.familia === "RED") return ["A1", "A3", "A4"];
  if (template.familia === "CCTV" || template.familia === "CONTROL_ACCESO" || template.familia === "BARRERA") return ["A1", "A2", "A3", "A4"];
  return [];
}

function buildGap(template, reason, details = {}) {
  return {
    id: template.id,
    familia: template.familia,
    subfamilia: template.subfamilia,
    tipo: template.tipo,
    operation_type: template.operation_type,
    concepto_factura_recomendado: template.concepto_factura_recomendado,
    precision_level: "GAP_REQUIRES_REVIEW",
    requires_human_review: true,
    suggestible: false,
    reason,
    ...details,
  };
}

function buildConcept(template, satProduct, satUnit) {
  const concept = {
    id: template.id,
    familia: template.familia,
    subfamilia: template.subfamilia,
    tipo: template.tipo,
    operation_type: template.operation_type,
    concepto_factura_recomendado: template.concepto_factura_recomendado,
    descripcion_clave_sat: satProduct.description,
    clave_prod_serv: satProduct.key,
    clave_unidad: satUnit.key,
    unidad: satUnit.description,
    objeto_imp: "02",
    iva_sugerido: "16%",
    resico_626_ok: true,
    actividad_actual_ok: true,
    actividad_soporte: currentActivitySupport(template),
    cobertura_constancia: template.desired_precision_level === "EXACT" ? "Fuerte" : "Media",
    riesgo_fiscal: template.desired_precision_level === "EXACT" ? "Bajo" : "Medio",
    requiere_revision_humana: true,
    score_base: template.desired_precision_level === "EXACT" ? 94 : 84,
    keywords_match: template.search_terms,
    keywords_excluir: template.keywords_excluir,
    notas_guardrail: "Propuesto, no activado. Validar contra constancia y operacion real antes de usar.",
    precision_level: template.desired_precision_level,
    source: "SAT_OFFICIAL",
    source_catalog_file: satProduct.source_catalog_file,
    source_catalog_row_or_key: satProduct.source_catalog_row_or_key || satProduct.key,
    internal_only_notes: "Generado por propose-resico-catalog-expansion.js desde catalogo oficial SAT local. No activar sin revision humana.",
  };
  for (const field of REQUIRED_FIELDS) {
    if (!(field in concept)) concept[field] = null;
  }
  return concept;
}

function toNormalizedCatalogConcept(proposed) {
  return {
    id: proposed.id,
    source_sheet: "CATALOG_EXPANSION_PROPOSAL",
    family: proposed.tipo === "PRODUCTO" ? "Productos" : "Servicios",
    subfamily: proposed.familia,
    item_type: proposed.tipo === "PRODUCTO" ? "Producto" : "Servicio",
    action_n8n: proposed.precision_level === "GAP_REQUIRES_REVIEW" ? "PEDIR_ACLARACION" : "SUGERIR",
    invoice_concept: proposed.concepto_factura_recomendado,
    sat: {
      product_service_key: proposed.clave_prod_serv,
      product_service_description: proposed.descripcion_clave_sat,
      unit_key: proposed.clave_unidad,
      unit: proposed.unidad,
      tax_object: proposed.objeto_imp,
      suggested_iva: proposed.iva_sugerido,
    },
    fiscal_fit: {
      resico_626_ok: proposed.resico_626_ok,
      current_activity_ok: proposed.actividad_actual_ok,
      supported_activity_ids: proposed.actividad_soporte,
      certificate_coverage: proposed.cobertura_constancia,
      fiscal_risk: proposed.riesgo_fiscal,
      requires_human_review: true,
    },
    scoring: {
      base_score: proposed.score_base,
      match_keywords: proposed.keywords_match,
      exclude_keywords: proposed.keywords_excluir,
    },
    guardrail_notes: proposed.notas_guardrail,
    source: proposed.source,
    source_catalog_file: proposed.source_catalog_file,
    reviewed_at: new Date().toISOString().slice(0, 10),
  };
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function proposeExpansion() {
  ensureOutDir();
  const base = loadJson(BASE_CATALOG_PATH, { concepts: [] });
  let sat = loadJson(SAT_IMPORT_PATH);
  let importResult = null;
  if (!officialCatalogAvailable()) {
    importResult = importSatCatalog();
    sat = loadJson(SAT_IMPORT_PATH);
  }

  if (!sat || !(sat.product_services || []).length || !(sat.units || []).length) {
    const proposed = {
      schema_version: "1.0.0",
      status: "BLOCKED_MISSING_SAT_OFFICIAL_CATALOG",
      message: MISSING_MESSAGE,
      generated_at: new Date().toISOString(),
      source: "NO_SAT_OFFICIAL_LOCAL",
      desired_concepts: DESIRED_CONCEPTS,
      concepts: [],
      gaps: DESIRED_CONCEPTS.map((template) => buildGap(template, "MISSING_SAT_OFFICIAL_CATALOG")),
    };
    const candidate = {
      schema_version: base.schema_version || "1.0.0",
      candidate_status: "NOT_ACTIVATED_MISSING_SAT_OFFICIAL_CATALOG",
      base_catalog_path: "data/concepts.normalized.json",
      base_catalog_unchanged: true,
      proposed_additions_count: 0,
      message: MISSING_MESSAGE,
      concepts: base.concepts || [],
    };
    writeJson(PROPOSED_PATH, proposed);
    writeJson(CANDIDATE_PATH, candidate);
    return { ok: false, proposed_path: PROPOSED_PATH, candidate_path: CANDIDATE_PATH, proposed, candidate, importResult };
  }

  const concepts = [];
  const gaps = [];
  for (const template of DESIRED_CONCEPTS) {
    const satProduct = findOfficialProductService(template, sat);
    const satUnit = findOfficialUnit(template, sat);
    if (!satProduct || !satUnit) {
      gaps.push(buildGap(template, !satProduct ? "NO_OFFICIAL_PRODUCT_SERVICE_MATCH" : "NO_OFFICIAL_UNIT_MATCH", {
        matched_product_service: satProduct ? satProduct.key : null,
        matched_unit: satUnit ? satUnit.key : null,
      }));
      continue;
    }
    concepts.push(buildConcept(template, satProduct, satUnit));
  }

  const proposed = {
    schema_version: "1.0.0",
    status: "PROPOSED_NOT_ACTIVATED",
    generated_at: new Date().toISOString(),
    source: "SAT_OFFICIAL_LOCAL",
    source_catalog_file: sat.source_files || [],
    concepts,
    gaps,
  };
  const candidate = {
    ...(base || {}),
    candidate_status: "NOT_ACTIVATED_REVIEW_REQUIRED",
    base_catalog_path: "data/concepts.normalized.json",
    base_catalog_unchanged: true,
    proposed_additions_count: concepts.length,
    concepts: [...(base.concepts || []), ...concepts.map(toNormalizedCatalogConcept)],
  };
  writeJson(PROPOSED_PATH, proposed);
  writeJson(CANDIDATE_PATH, candidate);
  return { ok: true, proposed_path: PROPOSED_PATH, candidate_path: CANDIDATE_PATH, proposed, candidate };
}

if (require.main === module) {
  const result = proposeExpansion();
  if (!result.ok) {
    console.error(result.proposed.message || MISSING_MESSAGE);
    console.log(`Propuesta bloqueada escrita en: ${result.proposed_path}`);
    console.log(`Candidate sin activar escrito en: ${result.candidate_path}`);
    process.exitCode = 1;
  } else {
    console.log(`Conceptos propuestos: ${result.proposed.concepts.length}`);
    console.log(`Gaps: ${result.proposed.gaps.length}`);
    console.log(`Archivo: ${result.proposed_path}`);
  }
}

module.exports = {
  DESIRED_CONCEPTS,
  REQUIRED_FIELDS,
  PROPOSED_PATH,
  CANDIDATE_PATH,
  proposeExpansion,
  buildGap,
};

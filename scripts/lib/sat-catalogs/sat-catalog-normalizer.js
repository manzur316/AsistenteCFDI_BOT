const REQUIRED_CATALOGS = Object.freeze([
  "c_FormaPago",
  "c_Moneda",
  "c_TipoDeComprobante",
  "c_Exportacion",
  "c_MetodoPago",
  "c_RegimenFiscal",
  "c_UsoCFDI",
  "c_ClaveProdServ",
  "c_ClaveUnidad",
  "c_ObjetoImp",
  "c_Impuesto",
  "c_TipoFactor",
  "c_TasaOCuota",
  "c_CodigoPostal_Parte_1",
  "c_CodigoPostal_Parte_2",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeCatalogName(value) {
  const text = String(value || "").trim();
  const found = REQUIRED_CATALOGS.find((name) => normalizeHeader(name) === normalizeHeader(text));
  return found || text;
}

function pickField(row, aliases) {
  if (!row || typeof row !== "object") return null;
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const wanted = normalizeHeader(alias);
    const found = entries.find(([key]) => normalizeHeader(key) === wanted);
    if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim() !== "") {
      return String(found[1]).trim();
    }
  }
  return null;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${String(dmy[2]).padStart(2, "0")}-${String(dmy[1]).padStart(2, "0")}`;
  return null;
}

function primaryKeyAliases(catalogName) {
  return {
    c_FormaPago: ["c_FormaPago", "FormaPago", "Clave"],
    c_Moneda: ["c_Moneda", "Moneda", "Clave"],
    c_TipoDeComprobante: ["c_TipoDeComprobante", "TipoDeComprobante", "Clave"],
    c_Exportacion: ["c_Exportacion", "Exportacion", "Clave"],
    c_MetodoPago: ["c_MetodoPago", "MetodoPago", "Clave"],
    c_RegimenFiscal: ["c_RegimenFiscal", "RegimenFiscal", "Clave"],
    c_UsoCFDI: ["c_UsoCFDI", "UsoCFDI", "Clave"],
    c_ClaveProdServ: ["c_ClaveProdServ", "ClaveProdServ", "Clave del producto o servicio", "Clave"],
    c_ClaveUnidad: ["c_ClaveUnidad", "ClaveUnidad", "Clave"],
    c_ObjetoImp: ["c_ObjetoImp", "ObjetoImp", "Clave"],
    c_Impuesto: ["c_Impuesto", "Impuesto", "Clave"],
    c_TipoFactor: ["c_TipoFactor", "TipoFactor", "Clave"],
    c_TasaOCuota: ["c_TasaOCuota", "Valor maximo", "Valor máximo", "Valor minimo", "Valor mínimo"],
    c_CodigoPostal_Parte_1: ["c_CodigoPostal", "CodigoPostal", "c_CodigoPostal_Parte_1", "Clave"],
    c_CodigoPostal_Parte_2: ["c_CodigoPostal", "CodigoPostal", "c_CodigoPostal_Parte_2", "Clave"],
  }[catalogName] || ["Clave", "key"];
}

function descriptionAliases(_catalogName) {
  return ["Descripcion", "Descripción", "Nombre", "Texto", "Producto o servicio", "Descripcion del producto o servicio"];
}

function normalizeCatalogRow(row, catalogName, context = {}) {
  const normalizedCatalogName = normalizeCatalogName(catalogName);
  const key = pickField(row, primaryKeyAliases(normalizedCatalogName));
  if (!key) return null;
  const description = pickField(row, descriptionAliases(normalizedCatalogName)) || key;
  const validFrom = normalizeDate(pickField(row, [
    "Fecha inicio de vigencia",
    "Fecha de inicio de vigencia",
    "Inicio de vigencia",
  ]));
  const validTo = normalizeDate(pickField(row, [
    "Fecha fin de vigencia",
    "Fecha de fin de vigencia",
    "Fin de vigencia",
  ]));
  return {
    entry_id: `${context.source_id || "SOURCE"}:${normalizedCatalogName}:${key}`.replace(/\s+/g, "_"),
    source_id: context.source_id || null,
    catalog_name: normalizedCatalogName,
    key,
    description,
    valid_from: validFrom,
    valid_to: validTo,
    attributes: Object.fromEntries(Object.entries(row || {}).map(([field, value]) => [String(field), value ?? null])),
    active: !validTo,
  };
}

function validateCatalogSet(catalogNames = REQUIRED_CATALOGS) {
  const available = new Set((catalogNames || []).map(normalizeCatalogName));
  return {
    required: REQUIRED_CATALOGS,
    available: Array.from(available).sort(),
    missing: REQUIRED_CATALOGS.filter((name) => !available.has(name)),
    ok: REQUIRED_CATALOGS.every((name) => available.has(name)),
  };
}

module.exports = {
  REQUIRED_CATALOGS,
  normalizeCatalogName,
  normalizeCatalogRow,
  normalizeDate,
  normalizeHeader,
  normalizeText,
  validateCatalogSet,
};

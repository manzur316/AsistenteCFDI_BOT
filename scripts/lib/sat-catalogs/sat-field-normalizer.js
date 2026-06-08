const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../..");
const IMPORTED_CATALOG_PATH = path.join(repoRoot, "data", "sat_official", "imported_sat_catalog.normalized.json");
const SEED_PATH = path.join(repoRoot, "data", "sat-catalog-normalization-seed.json");

const CATALOGS = Object.freeze({
  REGIMEN_FISCAL: "c_RegimenFiscal",
  USO_CFDI: "c_UsoCFDI",
  FORMA_PAGO: "c_FormaPago",
  METODO_PAGO: "c_MetodoPago",
  OBJETO_IMP: "c_ObjetoImp",
  CLAVE_UNIDAD: "c_ClaveUnidad",
  CLAVE_PROD_SERV: "c_ClaveProdServ",
  MONEDA: "c_Moneda",
  CODIGO_POSTAL: "c_CodigoPostal",
});

const IMPORTED_KEYS = Object.freeze({
  c_RegimenFiscal: "regimen_fiscal",
  c_UsoCFDI: "uso_cfdi",
  c_FormaPago: "forma_pago",
  c_MetodoPago: "metodo_pago",
  c_ObjetoImp: "objeto_impuesto",
  c_ClaveUnidad: "clave_unidad",
  c_ClaveProdServ: "clave_prod_serv",
});

const KEY_PATTERNS = Object.freeze({
  c_RegimenFiscal: /^\d{3}$/,
  c_UsoCFDI: /^(?:[GIPDS]\d{2}|CP\d{2}|CN\d{2}|S\d{2})$/i,
  c_FormaPago: /^\d{1,2}$/,
  c_MetodoPago: /^(PUE|PPD)$/i,
  c_ObjetoImp: /^\d{2}$/,
  c_ClaveUnidad: /^[A-Z0-9]{2,3}$/i,
  c_ClaveProdServ: /^\d{8}$/,
  c_Moneda: /^[A-Z]{3}$/i,
  c_CodigoPostal: /^\d{5}$/,
});

const AMBIGUOUS_ALIASES = Object.freeze({
  c_ClaveUnidad: new Set(["servicio"]),
  c_UsoCFDI: new Set(["general"]),
});

const ALIASES = Object.freeze({
  c_RegimenFiscal: {
    "personas morales con fines no lucrativos": "603",
    "personas morales fines no lucrativos": "603",
    "pm sin fines de lucro": "603",
    "general de ley personas morales": "601",
    resico: "626",
    "regimen simplificado de confianza": "626",
    "sin obligaciones fiscales": "616",
  },
  c_UsoCFDI: {
    "gastos en general": "G03",
    "adquisicion de mercancias": "G01",
    "sin efectos fiscales": "S01",
    pagos: "CP01",
  },
  c_FormaPago: {
    transferencia: "03",
    "transferencia electronica": "03",
    "transferencia electronica de fondos": "03",
    efectivo: "01",
    "por definir": "99",
  },
  c_MetodoPago: {
    "pago en una sola exhibicion": "PUE",
    "una sola exhibicion": "PUE",
    "pago en parcialidades o diferido": "PPD",
    parcialidades: "PPD",
  },
  c_ObjetoImp: {
    "no objeto de impuesto": "01",
    "si objeto de impuesto": "02",
    "si objeto del impuesto y no obligado al desglose": "03",
  },
  c_ClaveUnidad: {
    "unidad de servicio": "E48",
    pieza: "H87",
    actividad: "ACT",
    kilogramo: "KGM",
    metro: "MTR",
    litro: "LTR",
  },
  c_Moneda: {
    "peso mexicano": "MXN",
    pesos: "MXN",
    dolar: "USD",
    "dolar estadounidense": "USD",
  },
});

let cachedCatalogs = null;

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function stripAccents(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function comparable(value) {
  return stripAccents(value)
    .toLowerCase()
    .replace(/[.,;:()/_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function displayCatalog(catalog) {
  return catalog || "UNKNOWN";
}

function output({ ok, status, catalog, input, key = null, description = null, confidence = 0, source = "UNKNOWN", warnings = [], errors = [] }) {
  return {
    ok,
    status,
    catalog: displayCatalog(catalog),
    input: input ?? null,
    key,
    description,
    confidence,
    source,
    warnings,
    errors,
  };
}

function loadJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeCatalogKey(catalog, key) {
  const raw = text(key);
  if (!raw) return null;
  if (catalog === CATALOGS.FORMA_PAGO) return raw.padStart(2, "0");
  if (catalog === CATALOGS.METODO_PAGO || catalog === CATALOGS.USO_CFDI || catalog === CATALOGS.CLAVE_UNIDAD || catalog === CATALOGS.MONEDA) {
    return raw.toUpperCase();
  }
  return raw;
}

function seedEntries(seed, catalog) {
  const rows = seed?.catalogs?.[catalog];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    key: normalizeCatalogKey(catalog, row.key || row.clave),
    description: text(row.description || row.descripcion || row.nombre),
    source: "STATIC_SEED",
  })).filter((row) => row.key);
}

function importedEntries(imported, catalog) {
  const importedKey = IMPORTED_KEYS[catalog];
  if (!importedKey) return [];
  const rows = imported?.[importedKey];
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => ({
    key: normalizeCatalogKey(catalog, row.clave || row.key),
    description: text(row.descripcion || row.nombre || row.description),
    source: "SAT_CATALOG",
  })).filter((row) => row.key);
}

function loadCatalogs() {
  if (cachedCatalogs) return cachedCatalogs;
  const imported = loadJsonIfExists(IMPORTED_CATALOG_PATH) || {};
  const seed = loadJsonIfExists(SEED_PATH) || {};
  const catalogs = {};
  for (const catalog of Object.values(CATALOGS)) {
    if (catalog === CATALOGS.CODIGO_POSTAL) continue;
    const byKey = new Map();
    for (const row of seedEntries(seed, catalog)) byKey.set(row.key, row);
    for (const row of importedEntries(imported, catalog)) byKey.set(row.key, row);
    catalogs[catalog] = Array.from(byKey.values());
  }
  cachedCatalogs = catalogs;
  return cachedCatalogs;
}

function findEntryByKey(catalog, key) {
  const normalizedKey = normalizeCatalogKey(catalog, key);
  const rows = loadCatalogs()[catalog] || [];
  return rows.find((row) => normalizeCatalogKey(catalog, row.key) === normalizedKey) || null;
}

function keyLooksValid(catalog, value) {
  const raw = text(value);
  if (!raw) return false;
  const pattern = KEY_PATTERNS[catalog];
  return pattern ? pattern.test(raw) : false;
}

function formatInvalidMessage(catalog, value) {
  if (catalog === CATALOGS.USO_CFDI) return `UsoCFDI invalido: ${value}. Usa clave SAT completa, por ejemplo G01 si corresponde.`;
  if (catalog === CATALOGS.CODIGO_POSTAL) return `Codigo postal fiscal invalido: ${value}. Debe tener 5 digitos.`;
  return `Formato invalido para ${catalog}: ${value}.`;
}

function contextAllowsServiceAlias(options = {}) {
  const context = comparable(options.context || options.concept_type || options.tipo || options.operation || "");
  return Boolean(context && /(servicio|instalacion|mantenimiento|reparacion|diagnostico|configuracion)/.test(context));
}

function matchDescription(catalog, value) {
  const needle = comparable(value);
  const rows = loadCatalogs()[catalog] || [];
  const matches = rows.filter((row) => comparable(row.description) === needle);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: true, matches };
  return null;
}

function normalizeCodigoPostal(value) {
  const input = text(value);
  if (!input) {
    return output({ ok: false, status: "NOT_FOUND", catalog: CATALOGS.CODIGO_POSTAL, input, errors: ["CODIGO_POSTAL_REQUIRED"] });
  }
  if (!/^\d{5}$/.test(input)) {
    return output({ ok: false, status: "INVALID_FORMAT", catalog: CATALOGS.CODIGO_POSTAL, input, errors: [formatInvalidMessage(CATALOGS.CODIGO_POSTAL, input)] });
  }
  return output({ ok: true, status: "EXACT_KEY", catalog: CATALOGS.CODIGO_POSTAL, input, key: input, description: "Codigo postal fiscal", confidence: 1, source: "SAT_CATALOG" });
}

function normalizeSatCatalogField({ catalog, value, allowDescription = true, allowAliases = true, strict = true, ...options } = {}) {
  const input = text(value);
  if (!catalog) return output({ ok: false, status: "NOT_FOUND", catalog, input, errors: ["CATALOG_REQUIRED"] });
  if (catalog === CATALOGS.CODIGO_POSTAL) return normalizeCodigoPostal(input);
  if (!input) return output({ ok: false, status: "NOT_FOUND", catalog, input, errors: [`${catalog}_REQUIRED`] });

  if (catalog === CATALOGS.USO_CFDI && /^[A-Z]\d$/i.test(input)) {
    return output({ ok: false, status: "INVALID_FORMAT", catalog, input, errors: [formatInvalidMessage(catalog, input)] });
  }

  if (keyLooksValid(catalog, input)) {
    const normalizedKey = normalizeCatalogKey(catalog, input);
    const found = findEntryByKey(catalog, normalizedKey);
    if (found || catalog === CATALOGS.CLAVE_PROD_SERV || catalog === CATALOGS.MONEDA) {
      return output({
        ok: true,
        status: "EXACT_KEY",
        catalog,
        input,
        key: normalizedKey,
        description: found?.description || null,
        confidence: 1,
        source: found?.source || "SAT_CATALOG",
        warnings: found?.source === "STATIC_SEED" ? ["SAT_CATALOG_SEED_USED"] : [],
      });
    }
    if (strict) return output({ ok: false, status: "NOT_FOUND", catalog, input, errors: [`${catalog}_KEY_NOT_FOUND`] });
  } else if (/^[A-Z0-9]+$/i.test(input) && !allowDescription) {
    return output({ ok: false, status: "INVALID_FORMAT", catalog, input, errors: [formatInvalidMessage(catalog, input)] });
  }

  const normalizedText = comparable(input);
  if (allowAliases && AMBIGUOUS_ALIASES[catalog]?.has(normalizedText)) {
    if (catalog === CATALOGS.CLAVE_UNIDAD && contextAllowsServiceAlias(options)) {
      return output({
        ok: true,
        status: "NORMALIZED",
        catalog,
        input,
        key: "E48",
        description: findEntryByKey(catalog, "E48")?.description || "Unidad de servicio",
        confidence: 0.9,
        source: "ALIAS",
        warnings: ["SAT_DESCRIPTION_NORMALIZED_TO_KEY"],
      });
    }
    return output({
      ok: false,
      status: "NEEDS_CONFIRMATION",
      catalog,
      input,
      confidence: 0.3,
      errors: [`${catalog}_AMBIGUOUS_DESCRIPTION`],
    });
  }

  if (allowAliases) {
    const aliasKey = ALIASES[catalog]?.[normalizedText];
    if (aliasKey) {
      const found = findEntryByKey(catalog, aliasKey);
      return output({
        ok: true,
        status: "NORMALIZED",
        catalog,
        input,
        key: normalizeCatalogKey(catalog, aliasKey),
        description: found?.description || null,
        confidence: 1,
        source: "ALIAS",
        warnings: ["SAT_DESCRIPTION_NORMALIZED_TO_KEY"],
      });
    }
  }

  if (allowDescription) {
    const match = matchDescription(catalog, input);
    if (match?.ambiguous) {
      return output({ ok: false, status: "AMBIGUOUS", catalog, input, confidence: 0.4, errors: [`${catalog}_AMBIGUOUS_DESCRIPTION`] });
    }
    if (match) {
      return output({
        ok: true,
        status: "NORMALIZED",
        catalog,
        input,
        key: match.key,
        description: match.description,
        confidence: 1,
        source: match.source,
        warnings: ["SAT_DESCRIPTION_NORMALIZED_TO_KEY"],
      });
    }
  }

  return output({
    ok: false,
    status: strict ? "NOT_FOUND" : "NEEDS_CONFIRMATION",
    catalog,
    input,
    errors: [`${catalog}_NOT_FOUND`],
  });
}

function normalizeRegimenFiscal(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.REGIMEN_FISCAL, value, ...options });
}

function normalizeUsoCfdi(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.USO_CFDI, value, ...options });
}

function normalizeFormaPago(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.FORMA_PAGO, value, ...options });
}

function normalizeMetodoPago(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.METODO_PAGO, value, ...options });
}

function normalizeObjetoImp(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.OBJETO_IMP, value, ...options });
}

function normalizeClaveUnidad(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.CLAVE_UNIDAD, value, ...options });
}

function normalizeClaveProdServ(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.CLAVE_PROD_SERV, value, allowDescription: false, allowAliases: false, ...options });
}

function normalizeMoneda(value, options = {}) {
  return normalizeSatCatalogField({ catalog: CATALOGS.MONEDA, value, ...options });
}

module.exports = {
  CATALOGS,
  comparable,
  normalizeSatCatalogField,
  normalizeRegimenFiscal,
  normalizeUsoCfdi,
  normalizeFormaPago,
  normalizeMetodoPago,
  normalizeObjetoImp,
  normalizeClaveUnidad,
  normalizeClaveProdServ,
  normalizeMoneda,
  normalizeCodigoPostal,
};

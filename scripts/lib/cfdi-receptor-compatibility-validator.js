const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "..");
const DEFAULT_COMPATIBILITY_PATH = path.join(root, "data", "knowledge_base", "cfdi40_uso_cfdi_compatibility.derived.json");
const GENERIC_NATIONAL_RFC = "XAXX010101000";
const GENERIC_FOREIGN_RFC = "XEXX010101000";
const RFC_PM_PATTERN = /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/;
const RFC_PF_PATTERN = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

let cachedCompatibility = null;

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function stripRfcHiddenCharacters(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .replace(/[\r\n\t ]+/g, "")
    .replace(/^["'`]+|["'`]+$/g, "");
}

function normalizeRfc(value) {
  const cleaned = stripRfcHiddenCharacters(value)
    .normalize("NFC")
    .toUpperCase();
  return cleaned || null;
}

function hasRfcHiddenCharacters(value) {
  const raw = String(value ?? "");
  if (!raw) return false;
  return raw !== stripRfcHiddenCharacters(raw) || /[\u0000-\u001F\u007F\uFEFF"'`]/.test(raw);
}

function inferPersonTypeFromRfc(rfc) {
  const normalized = normalizeRfc(rfc);
  if (!normalized) return "INVALID";
  if (normalized === GENERIC_NATIONAL_RFC) return "GENERIC_NATIONAL";
  if (normalized === GENERIC_FOREIGN_RFC) return "GENERIC_FOREIGN";
  if (normalized.length === 12 && RFC_PM_PATTERN.test(normalized)) return "PM";
  if (normalized.length === 13 && RFC_PF_PATTERN.test(normalized)) return "PF";
  return "INVALID";
}

function effectivePersonBucket(personType) {
  const normalized = String(personType || "").trim().toUpperCase();
  if (["PF", "FISICA", "FÍSICA", "PERSONA_FISICA", "PERSONA_FÍSICA"].includes(normalized)) return "PF";
  if (["PM", "MORAL", "PERSONA_MORAL"].includes(normalized)) return "PM";
  if (["GENERIC_NATIONAL", "GENERIC_FOREIGN"].includes(normalized)) return normalized;
  return "INVALID";
}

function safeRfcDescriptor(rfc) {
  const normalized = normalizeRfc(rfc);
  const shape = inferPersonTypeFromRfc(normalized);
  return {
    rfc_shape: shape,
    normalized_rfc_shape: shape,
    normalized_rfc_length: normalized ? normalized.length : 0,
  };
}

function validateRfcShape(rfc) {
  const normalized = normalizeRfc(rfc);
  const shape = inferPersonTypeFromRfc(normalized);
  const errors = [];
  const warnings = [];
  const hadHiddenCharacters = hasRfcHiddenCharacters(rfc);
  if (!normalized) {
    errors.push("LOCAL_RFC_REQUIRED");
  } else if (shape === "INVALID") {
    errors.push("LOCAL_INVALID_RFC_SHAPE");
  }
  if (hadHiddenCharacters) {
    warnings.push("LOCAL_RFC_HAS_HIDDEN_CHARACTERS");
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    rfc_shape: shape,
    normalized_rfc_shape: shape,
    normalized_rfc_length: normalized ? normalized.length : 0,
    person_type: shape,
    has_hidden_characters: hadHiddenCharacters,
  };
}

function loadCompatibilityIndex(filePath = DEFAULT_COMPATIBILITY_PATH) {
  if (cachedCompatibility && cachedCompatibility.filePath === filePath) return cachedCompatibility;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const byUso = new Map(entries.map((entry) => [String(entry.uso_cfdi || "").trim().toUpperCase(), entry]));
  cachedCompatibility = { filePath, parsed, entries, byUso };
  return cachedCompatibility;
}

function validateUsoCfdiRegimenCompatibility({ usoCfdi, regimenFiscalReceptor, personType } = {}) {
  const uso = text(usoCfdi)?.toUpperCase();
  const regimen = text(regimenFiscalReceptor);
  const bucket = effectivePersonBucket(personType);
  const errors = [];
  const warnings = [];
  const compatibility = loadCompatibilityIndex();
  const entry = uso ? compatibility.byUso.get(uso) : null;

  if (!uso) errors.push("LOCAL_USO_CFDI_REQUIRED");
  if (!regimen) errors.push("LOCAL_REGIMEN_FISCAL_RECEPTOR_REQUIRED");
  if (!personType || bucket === "INVALID") errors.push("LOCAL_PERSON_TYPE_REQUIRED");
  if (uso && !entry) errors.push("LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG");

  if (entry && regimen && !entry.regimenes_allowed.includes(regimen)) {
    errors.push("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH");
  }

  if (entry && bucket === "PF" && entry.persona_fisica_allowed !== true) {
    errors.push("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH");
  }
  if (entry && bucket === "PM" && entry.persona_moral_allowed !== true) {
    errors.push("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH");
  }
  if (entry && (bucket === "GENERIC_NATIONAL" || bucket === "GENERIC_FOREIGN")
    && entry.persona_fisica_allowed !== true && entry.persona_moral_allowed !== true) {
    errors.push("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH");
  }

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings,
    uso_cfdi: uso || null,
    regimen_fiscal_receptor: regimen || null,
    person_type: bucket,
    rfc_shape: bucket,
    catalog_entry: entry ? {
      uso_cfdi: entry.uso_cfdi,
      descripcion: entry.descripcion,
      persona_fisica_allowed: entry.persona_fisica_allowed,
      persona_moral_allowed: entry.persona_moral_allowed,
      regimenes_allowed: entry.regimenes_allowed,
      source: entry.source,
      generated_from: entry.generated_from,
    } : null,
  };
}

function validateReceptorForCfdi({ rfc, regimenFiscalReceptor, usoCfdi, clientUid } = {}) {
  const rfcValidation = validateRfcShape(rfc);
  const personType = rfcValidation.rfc_shape;
  const compatibility = validateUsoCfdiRegimenCompatibility({
    usoCfdi,
    regimenFiscalReceptor,
    personType,
  });
  const errors = [];
  const warnings = [];
  if (!text(clientUid)) errors.push("LOCAL_RECEPTOR_UID_REQUIRED");
  errors.push(...rfcValidation.errors, ...compatibility.errors);
  warnings.push(...rfcValidation.warnings, ...compatibility.warnings);

  return {
    ok: errors.length === 0,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    client_uid_present: Boolean(text(clientUid)),
    effective_uso_cfdi: compatibility.uso_cfdi,
    effective_regimen_fiscal_receptor: compatibility.regimen_fiscal_receptor,
    effective_person_type: personType,
    rfc_shape: personType,
    normalized_rfc_shape: rfcValidation.normalized_rfc_shape,
    normalized_rfc_length: rfcValidation.normalized_rfc_length,
    rfc_has_hidden_characters: rfcValidation.has_hidden_characters,
    catalog_entry: compatibility.catalog_entry,
  };
}

function explainUsoCfdiCompatibilityFailure(input = {}) {
  const result = validateReceptorForCfdi(input);
  if (result.ok) {
    return "UsoCFDI compatible con regimen fiscal receptor y tipo de persona.";
  }
  const parts = [];
  if (result.errors.includes("LOCAL_RECEPTOR_UID_REQUIRED")) parts.push("Falta Receptor.UID sandbox.");
  if (result.errors.includes("LOCAL_RFC_REQUIRED")) parts.push("Falta RFC receptor.");
  if (result.errors.includes("LOCAL_INVALID_RFC_SHAPE")) parts.push(`RFC receptor con forma invalida (${result.rfc_shape}, len=${result.normalized_rfc_length}).`);
  if (result.errors.includes("LOCAL_USO_CFDI_REQUIRED")) parts.push("Falta UsoCFDI.");
  if (result.errors.includes("LOCAL_REGIMEN_FISCAL_RECEPTOR_REQUIRED")) parts.push("Falta RegimenFiscalR.");
  if (result.errors.includes("LOCAL_USO_CFDI_NOT_IN_SAT_CATALOG")) parts.push("UsoCFDI no existe en catalogo SAT local.");
  if (result.errors.includes("LOCAL_CFDI40161_USO_CFDI_REGIMEN_PERSONA_MISMATCH")) {
    parts.push(`UsoCFDI ${result.effective_uso_cfdi || "N/A"} no es compatible con RegimenFiscalR ${result.effective_regimen_fiscal_receptor || "N/A"} y persona ${result.effective_person_type || "N/A"}.`);
  }
  if (result.warnings.includes("LOCAL_RFC_HAS_HIDDEN_CHARACTERS")) {
    parts.push("RFC receptor tenia espacios, comillas, BOM o saltos; se evaluo solo la forma normalizada sin exponer el RFC.");
  }
  return parts.join(" ") || "Error local de compatibilidad receptor/UsoCFDI.";
}

module.exports = {
  DEFAULT_COMPATIBILITY_PATH,
  explainUsoCfdiCompatibilityFailure,
  inferPersonTypeFromRfc,
  loadCompatibilityIndex,
  normalizeRfc,
  safeRfcDescriptor,
  validateReceptorForCfdi,
  validateRfcShape,
  validateUsoCfdiRegimenCompatibility,
};

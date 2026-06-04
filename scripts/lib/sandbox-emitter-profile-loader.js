const fs = require("fs");
const path = require("path");
const {
  normalizeRfc,
  validateRfcShape,
} = require("./cfdi-receptor-compatibility-validator");

const root = path.resolve(__dirname, "..", "..");
const DEFAULT_SANDBOX_EMITTER_PROFILES_PATH = path.join(root, "data", "sandbox", "facturacom-sandbox-emitter-profiles.json");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateCp(value) {
  return /^\d{5}$/.test(String(value || "").trim());
}

function hasForbiddenMaterial(profile = {}) {
  const serialized = JSON.stringify(profile).toLowerCase();
  return /\.(cer|key|pfx)\b/.test(serialized)
    || /private[-_ ]?key|certificate|certificado|contrase(?:n|ñ)a|password|secret|api[-_ ]?key|token/.test(serialized);
}

function validateSandboxEmitterProfile(profile = {}) {
  const errors = [];
  const warnings = [];
  const profileId = text(profile.profile_id);
  const allowedForSmoke = profile.allowedForSmoke === true;
  const normalizedRfc = normalizeRfc(profile.rfc);
  const normalizedExpectedCsdRfc = normalizeRfc(profile.expected_csd_rfc);
  const rfcValidation = validateRfcShape(profile.rfc);
  const csdValidation = validateRfcShape(profile.expected_csd_rfc);
  const regimenFiscal = text(profile.regimenFiscal);
  const lugarExpedicion = text(profile.lugarExpedicion);

  if (!profileId) errors.push("SANDBOX_EMITTER_PROFILE_ID_REQUIRED");
  if (allowedForSmoke !== true) errors.push("SANDBOX_EMITTER_PROFILE_NOT_ALLOWED_FOR_SMOKE");
  if (!normalizedRfc) errors.push("SANDBOX_EMITTER_RFC_REQUIRED");
  if (String(profile.rfc || "").includes("[REDACTED_RFC]")) errors.push("SANDBOX_EMITTER_RFC_REDACTED_NOT_ALLOWED");
  if (!text(profile.legal_name)) errors.push("SANDBOX_EMITTER_LEGAL_NAME_REQUIRED");
  if (!regimenFiscal) errors.push("SANDBOX_EMITTER_REGIMEN_REQUIRED");
  if (!lugarExpedicion) errors.push("SANDBOX_EMITTER_LUGAR_EXPEDICION_REQUIRED");
  if (lugarExpedicion === "00000" || !validateCp(lugarExpedicion)) errors.push("SANDBOX_EMITTER_LUGAR_EXPEDICION_INVALID");
  if (!normalizedExpectedCsdRfc) errors.push("SANDBOX_EMITTER_EXPECTED_CSD_RFC_REQUIRED");
  if (normalizedRfc && normalizedExpectedCsdRfc && normalizedRfc !== normalizedExpectedCsdRfc) {
    errors.push("SANDBOX_EMITTER_CSD_RFC_MISMATCH");
  }
  if (hasForbiddenMaterial(profile)) errors.push("SANDBOX_EMITTER_PROFILE_CONTAINS_CERT_OR_SECRET_MATERIAL");
  errors.push(...rfcValidation.errors.map((code) => `SANDBOX_EMITTER_${code}`));
  errors.push(...csdValidation.errors.map((code) => `SANDBOX_EMITTER_CSD_${code}`));
  warnings.push(...rfcValidation.warnings.map((code) => `SANDBOX_EMITTER_${code}`));
  warnings.push(...csdValidation.warnings.map((code) => `SANDBOX_EMITTER_CSD_${code}`));

  return {
    ok: errors.length === 0,
    errors: unique(errors),
    warnings: unique(warnings),
    profile_id: profileId,
    allowed_for_smoke: allowedForSmoke,
    regimenFiscal,
    lugarExpedicion,
    rfc_shape: rfcValidation.rfc_shape,
    normalized_rfc_shape: rfcValidation.normalized_rfc_shape,
    normalized_rfc_length: rfcValidation.normalized_rfc_length,
    expected_csd_rfc_shape: csdValidation.rfc_shape,
    expected_csd_rfc_length: csdValidation.normalized_rfc_length,
    source: text(profile.source),
  };
}

function loadSandboxEmitterProfiles(filePath = DEFAULT_SANDBOX_EMITTER_PROFILES_PATH) {
  const parsed = loadJson(filePath);
  const profiles = Array.isArray(parsed.profiles) ? parsed.profiles : [];
  const byId = new Map();
  const validations = {};
  const duplicateIds = [];
  for (const profile of profiles) {
    const id = text(profile.profile_id);
    if (!id) continue;
    if (byId.has(id)) duplicateIds.push(id);
    byId.set(id, profile);
    validations[id] = validateSandboxEmitterProfile(profile);
  }
  return {
    filePath,
    schema_version: parsed.schema_version || null,
    source_of_truth: parsed.source_of_truth === true,
    default_smoke_profile_id: text(parsed.default_smoke_profile_id),
    profiles,
    byId,
    validations,
    duplicateIds,
  };
}

function getSandboxEmitterProfile(profileId, options = {}) {
  const loaded = options.loadedProfiles || loadSandboxEmitterProfiles(options.filePath);
  const id = text(profileId || loaded.default_smoke_profile_id);
  return {
    loaded,
    profile: id ? loaded.byId.get(id) || null : null,
    validation: id ? loaded.validations[id] || {
      ok: false,
      profile_id: id,
      errors: ["SANDBOX_EMITTER_PROFILE_NOT_FOUND"],
      warnings: [],
    } : {
      ok: false,
      profile_id: null,
      errors: ["SANDBOX_EMITTER_PROFILE_ID_REQUIRED"],
      warnings: [],
    },
  };
}

function applyEmitterProfileToFacturaComConfig(config = {}, profile = {}) {
  return {
    ...config,
    emitterProfileId: text(profile.profile_id) || config.emitterProfileId || null,
    emitterRegimenFiscal: text(profile.regimenFiscal) || config.emitterRegimenFiscal,
    lugarExpedicion: text(profile.lugarExpedicion) || config.lugarExpedicion,
  };
}

function buildSafeEmitterProfileReport(profile = {}) {
  const validation = validateSandboxEmitterProfile(profile);
  return {
    profile_id: validation.profile_id,
    ok: validation.ok,
    status: validation.ok ? "PASS" : "FAIL",
    errors: validation.errors,
    warnings: validation.warnings,
    allowed_for_smoke: validation.allowed_for_smoke,
    regimenFiscal: validation.regimenFiscal,
    lugarExpedicion: validation.lugarExpedicion,
    rfc_shape: validation.rfc_shape,
    normalized_rfc_length: validation.normalized_rfc_length,
    expected_csd_rfc_shape: validation.expected_csd_rfc_shape,
    expected_csd_rfc_length: validation.expected_csd_rfc_length,
    source: validation.source,
  };
}

module.exports = {
  DEFAULT_SANDBOX_EMITTER_PROFILES_PATH,
  applyEmitterProfileToFacturaComConfig,
  buildSafeEmitterProfileReport,
  getSandboxEmitterProfile,
  loadSandboxEmitterProfiles,
  validateSandboxEmitterProfile,
};

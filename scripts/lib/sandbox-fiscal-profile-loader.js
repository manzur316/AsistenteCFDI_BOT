const fs = require("fs");
const path = require("path");
const {
  normalizeRfc,
  validateReceptorForCfdi,
  validateRfcShape,
} = require("./cfdi-receptor-compatibility-validator");

const root = path.resolve(__dirname, "..", "..");
const DEFAULT_SANDBOX_FISCAL_PROFILES_PATH = path.join(root, "data", "sandbox", "facturacom-sandbox-fiscal-profiles.json");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function unique(values = []) {
  return Array.from(new Set(values.map(text).filter(Boolean)));
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function expectedPersonBucket(personType, receiverKind) {
  const normalized = String(personType || receiverKind || "").trim().toUpperCase();
  if (/PUBLIC|GENERAL/.test(normalized)) return "GENERIC_NATIONAL";
  if (/MORAL/.test(normalized)) return "PM";
  if (/FISICA|FÍSICA|FISICA/.test(normalized)) return "PF";
  return null;
}

function validateSandboxFiscalProfile(profile = {}) {
  const errors = [];
  const warnings = [];
  const profileId = text(profile.profile_id);
  const normalizedRfc = normalizeRfc(profile.rfc);
  const rfcValidation = validateRfcShape(profile.rfc);
  const expectedBucket = expectedPersonBucket(profile.person_type, profile.receiver_kind);

  if (!profileId) errors.push("SANDBOX_PROFILE_ID_REQUIRED");
  if (!text(profile.client_id)) errors.push("SANDBOX_PROFILE_CLIENT_ID_REQUIRED");
  if (!text(profile.tax_regime)) errors.push("SANDBOX_PROFILE_TAX_REGIME_REQUIRED");
  if (!text(profile.cfdi_use)) errors.push("SANDBOX_PROFILE_USO_CFDI_REQUIRED");
  if (!text(profile.fiscal_zip)) errors.push("SANDBOX_PROFILE_FISCAL_ZIP_REQUIRED");
  if (!normalizedRfc) errors.push("SANDBOX_PROFILE_RFC_REQUIRED");
  if (String(profile.rfc || "").includes("[REDACTED_RFC]")) errors.push("SANDBOX_PROFILE_RFC_REDACTED_NOT_ALLOWED");
  errors.push(...rfcValidation.errors.map((code) => `SANDBOX_PROFILE_${code}`));
  warnings.push(...rfcValidation.warnings.map((code) => `SANDBOX_PROFILE_${code}`));

  if (expectedBucket && rfcValidation.rfc_shape !== expectedBucket) {
    errors.push("SANDBOX_PROFILE_PERSON_TYPE_RFC_SHAPE_MISMATCH");
  }

  if (rfcValidation.rfc_shape === "GENERIC_NATIONAL"
    && !(text(profile.tax_regime) === "616" && text(profile.cfdi_use)?.toUpperCase() === "S01")) {
    errors.push("SANDBOX_GENERIC_RFC_REQUIRES_PUBLIC_GENERAL_616_S01");
  }

  const receptor = validateReceptorForCfdi({
    rfc: profile.rfc,
    regimenFiscalReceptor: profile.tax_regime,
    usoCfdi: profile.cfdi_use,
    clientUid: "UID-SANDBOX-PROFILE-CHECK",
  });
  errors.push(...receptor.errors.map((code) => `SANDBOX_PROFILE_${code}`));
  warnings.push(...receptor.warnings.map((code) => `SANDBOX_PROFILE_${code}`));

  return {
    ok: errors.length === 0,
    errors: unique(errors),
    warnings: unique(warnings),
    profile_id: profileId,
    client_id: text(profile.client_id),
    cfdi_use: text(profile.cfdi_use)?.toUpperCase() || null,
    tax_regime: text(profile.tax_regime),
    rfc_shape: rfcValidation.rfc_shape,
    normalized_rfc_shape: rfcValidation.normalized_rfc_shape,
    normalized_rfc_length: rfcValidation.normalized_rfc_length,
    rfc_has_hidden_characters: rfcValidation.has_hidden_characters,
    effective_uso_cfdi: receptor.effective_uso_cfdi,
    effective_regimen_fiscal_receptor: receptor.effective_regimen_fiscal_receptor,
    effective_person_type: receptor.effective_person_type,
  };
}

function loadSandboxFiscalProfiles(filePath = DEFAULT_SANDBOX_FISCAL_PROFILES_PATH) {
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
    validations[id] = validateSandboxFiscalProfile(profile);
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

function profileToClientOverlay(profile = {}) {
  return {
    client_id: text(profile.client_id),
    display_name: text(profile.display_name),
    legal_name: text(profile.legal_name),
    rfc: normalizeRfc(profile.rfc),
    tax_regime: text(profile.tax_regime),
    fiscal_zip: text(profile.fiscal_zip),
    person_type: text(profile.person_type),
    cfdi_use: text(profile.cfdi_use)?.toUpperCase() || null,
    uso_cfdi: text(profile.cfdi_use)?.toUpperCase() || null,
    fiscal_profile_id: text(profile.profile_id),
    fiscal_profile_source: "facturacom-sandbox-fiscal-profiles.json",
    validated_by_human: profile.validated_by_human === true,
    validation_warnings: unique([
      ...asArray(profile.validation_warnings),
      "SANDBOX_FISCAL_PROFILE_SOURCE_OF_TRUTH",
    ]),
  };
}

function applySandboxFiscalProfilesToClients(clients = [], options = {}) {
  const loaded = options.loadedProfiles || loadSandboxFiscalProfiles(options.filePath);
  const hydrated = clients.map((client) => {
    const profileId = text(client.fiscal_profile_id);
    if (!profileId) return client;
    const profile = loaded.byId.get(profileId);
    if (!profile) {
      return {
        ...client,
        fiscal_profile_validation: {
          ok: false,
          errors: ["SANDBOX_PROFILE_NOT_FOUND"],
          profile_id: profileId,
        },
      };
    }
    const overlay = profileToClientOverlay(profile);
    return {
      ...client,
      ...overlay,
      client_id: client.client_id || overlay.client_id,
      fiscal_profile_validation: loaded.validations[profileId],
    };
  });
  return { clients: hydrated, profiles: loaded };
}

module.exports = {
  DEFAULT_SANDBOX_FISCAL_PROFILES_PATH,
  applySandboxFiscalProfilesToClients,
  loadSandboxFiscalProfiles,
  profileToClientOverlay,
  validateSandboxFiscalProfile,
};

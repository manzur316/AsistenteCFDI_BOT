const assert = require("assert");
const fs = require("fs");
const path = require("path");
const {
  DEFAULT_SANDBOX_FISCAL_PROFILES_PATH,
  applySandboxFiscalProfilesToClients,
  loadSandboxFiscalProfiles,
  validateSandboxFiscalProfile,
} = require("./lib/sandbox-fiscal-profile-loader");

const root = path.resolve(__dirname, "..");
const clientsPath = path.join(root, "data", "sandbox", "canonical-test-clients.json");
const draftsPath = path.join(root, "data", "sandbox", "canonical-test-drafts.json");
const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const loaded = loadSandboxFiscalProfiles();
const clients = readJson(clientsPath);
const drafts = readJson(draftsPath);

check("profiles_file_exists", () => {
  assert(fs.existsSync(DEFAULT_SANDBOX_FISCAL_PROFILES_PATH));
  return path.relative(root, DEFAULT_SANDBOX_FISCAL_PROFILES_PATH);
});

check("profiles_are_source_of_truth", () => {
  assert.strictEqual(loaded.schema_version, "facturacom_sandbox_fiscal_profiles.v1");
  assert.strictEqual(loaded.source_of_truth, true);
  assert.strictEqual(loaded.default_smoke_profile_id, "PF_612_G03_DEMO");
  return loaded.default_smoke_profile_id;
});

check("required_profiles_exist", () => {
  for (const id of ["PF_612_G03_DEMO", "PUBLIC_GENERAL_616_S01_DEMO", "PM_601_G03_DEMO"]) {
    assert(loaded.byId.has(id), id);
  }
  return `${loaded.profiles.length} profiles`;
});

check("pf_612_g03_uses_pf_rfc_not_generic", () => {
  const profile = loaded.byId.get("PF_612_G03_DEMO");
  const validation = loaded.validations.PF_612_G03_DEMO;
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  assert.strictEqual(validation.rfc_shape, "PF");
  assert.strictEqual(validation.normalized_rfc_length, 13);
  assert.strictEqual(validation.effective_regimen_fiscal_receptor, "612");
  assert.strictEqual(validation.effective_uso_cfdi, "G03");
  assert.strictEqual(profile.legal_name, "ALBA XKARAJAM MENDEZ");
  assert.strictEqual(profile.fiscal_zip, "01219");
  return `${validation.rfc_shape}/${validation.effective_regimen_fiscal_receptor}/${validation.effective_uso_cfdi}`;
});

check("public_general_uses_616_s01", () => {
  const validation = loaded.validations.PUBLIC_GENERAL_616_S01_DEMO;
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  assert.strictEqual(validation.rfc_shape, "GENERIC_NATIONAL");
  assert.strictEqual(validation.effective_regimen_fiscal_receptor, "616");
  assert.strictEqual(validation.effective_uso_cfdi, "S01");
  return "616/S01";
});

check("pm_601_g03_valid", () => {
  const validation = loaded.validations.PM_601_G03_DEMO;
  assert.strictEqual(validation.ok, true, validation.errors.join(","));
  assert.strictEqual(validation.rfc_shape, "PM");
  assert.strictEqual(validation.effective_regimen_fiscal_receptor, "601");
  assert.strictEqual(validation.effective_uso_cfdi, "G03");
  return "PM/601/G03";
});

check("generic_rfc_cannot_use_612_g03", () => {
  const validation = validateSandboxFiscalProfile({
    profile_id: "BAD_GENERIC_612_G03",
    client_id: "CLIENT-BAD",
    rfc: "XAXX010101000",
    tax_regime: "612",
    cfdi_use: "G03",
    fiscal_zip: "00000",
    person_type: "PUBLICO_GENERAL_NACIONAL",
    receiver_kind: "PUBLIC_GENERAL",
    validated_by_human: true,
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_GENERIC_RFC_REQUIRES_PUBLIC_GENERAL_616_S01"));
  return validation.errors.join(",");
});

check("redacted_rfc_is_not_valid_source", () => {
  const validation = validateSandboxFiscalProfile({
    profile_id: "BAD_REDACTED",
    client_id: "CLIENT-BAD",
    rfc: "[REDACTED_RFC]",
    tax_regime: "612",
    cfdi_use: "G03",
    fiscal_zip: "00000",
    person_type: "FISICA",
    receiver_kind: "PERSONA_FISICA",
    validated_by_human: true,
  });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("SANDBOX_PROFILE_RFC_REDACTED_NOT_ALLOWED"));
  return validation.errors.join(",");
});

check("clients_are_hydrated_from_profiles", () => {
  const { clients: hydrated } = applySandboxFiscalProfilesToClients(clients, { loadedProfiles: loaded });
  const pf = hydrated.find((client) => client.client_id === "CLIENT-DEMO-PF-GENERIC");
  assert(pf, "PF client missing");
  assert.strictEqual(pf.fiscal_profile_id, "PF_612_G03_DEMO");
  assert.strictEqual(pf.rfc, loaded.byId.get("PF_612_G03_DEMO").rfc);
  assert.strictEqual(pf.legal_name, "ALBA XKARAJAM MENDEZ");
  assert.strictEqual(pf.fiscal_zip, "01219");
  assert.strictEqual(pf.tax_regime, "612");
  assert.strictEqual(pf.cfdi_use, "G03");
  assert.strictEqual(pf.fiscal_profile_validation.ok, true);
  return pf.fiscal_profile_id;
});

check("first_draft_uses_consistent_profile", () => {
  const first = drafts[0];
  assert.strictEqual(first.receiver_fiscal_profile_id, "PF_612_G03_DEMO");
  assert.strictEqual(first.client_ref, "CLIENT-DEMO-PF-GENERIC");
  return first.receiver_fiscal_profile_id;
});

check("draft_profiles_exist_in_catalog", () => {
  for (const draft of drafts) {
    assert(loaded.byId.has(draft.receiver_fiscal_profile_id), `${draft.draft_id}:${draft.receiver_fiscal_profile_id}`);
  }
  return `${drafts.length} drafts`;
});

console.log("Sandbox Fiscal Profiles Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

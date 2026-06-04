const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { MISSING_MESSAGE } = require("./import-sat-catalog");
const { REQUIRED_FIELDS } = require("./propose-resico-catalog-expansion");

const root = path.resolve(__dirname, "..");
const proposedPath = path.join(root, "data", "catalog_expansion", "proposed_concepts.resico_626.json");
const candidatePath = path.join(root, "data", "catalog_expansion", "concepts.normalized.candidate.json");
const basePath = path.join(root, "data", "concepts.normalized.json");
const excelPath = path.join(root, "data", "base_cfdi_resico_n8n_emberhub_2026.xlsx");
const satReadmePath = path.join(root, "data", "sat_official", "README.md");
const satImportedPath = path.join(root, "data", "sat_official", "imported_sat_catalog.normalized.json");
const policyPath = path.join(root, "docs", "CATALOG_EXPANSION_POLICY.md");
const gapsPath = path.join(root, "docs", "CATALOG_GAPS_REPORT.md");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function gitDiffNameOnly(file) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", file], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function gitStatusPorcelain(file) {
  try {
    return execFileSync("git", ["status", "--short", "--", file], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function officialKeySets() {
  if (!fs.existsSync(satImportedPath)) return { productServices: new Set(), units: new Set() };
  const sat = readJson(satImportedPath);
  return {
    productServices: new Set((sat.product_services || sat.clave_prod_serv || []).map((item) => String(item.key || item.clave))),
    units: new Set((sat.units || sat.clave_unidad || []).map((item) => String(item.key || item.clave))),
  };
}

const checks = [];
let proposed = null;
let candidate = null;
let base = null;
let imported = null;

for (const file of [satReadmePath, proposedPath, candidatePath, policyPath, gapsPath]) {
  checks.push({ name: `file_exists:${path.relative(root, file).replace(/\\/g, "/")}`, pass: fs.existsSync(file), value: path.relative(root, file).replace(/\\/g, "/") });
}

try {
  proposed = readJson(proposedPath);
  candidate = readJson(candidatePath);
  base = readJson(basePath);
  imported = fs.existsSync(satImportedPath) ? readJson(satImportedPath) : null;
  checks.push({ name: "json_parse", pass: true, value: "proposed/candidate/base/imported" });
} catch (error) {
  checks.push({ name: "json_parse", pass: false, value: error.message });
}

if (proposed && candidate && base) {
  const missingProductServices = !imported || (imported.clave_prod_serv || imported.product_services || []).length === 0;
  checks.push({
    name: "official_claveprodserv_missing_blocks_generation",
    pass: missingProductServices
      ? proposed.status === "BLOCKED_MISSING_OFFICIAL_CLAVE_PROD_SERV" && /ClaveProdServ/i.test(proposed.message)
      : proposed.source === "SAT_OFFICIAL_LOCAL",
    value: missingProductServices ? proposed.status : proposed.source,
  });
  checks.push({
    name: "no_suggestible_concepts_without_official_claveprodserv",
    pass: missingProductServices ? (proposed.concepts || []).length === 0 : true,
    value: `concepts=${(proposed.concepts || []).length}`,
  });
  checks.push({
    name: "candidate_not_activated",
    pass: String(candidate.candidate_status || "").includes("NOT_ACTIVATED") && candidate.base_catalog_unchanged === true,
    value: candidate.candidate_status || "N/A",
  });
  checks.push({
    name: "candidate_preserves_base_count_when_blocked",
    pass: missingProductServices ? (candidate.concepts || []).length === (base.concepts || []).length && candidate.proposed_additions_count === 0 : true,
    value: `${(candidate.concepts || []).length}/${(base.concepts || []).length}`,
  });
  checks.push({
    name: "desired_concepts_cover_required_families",
    pass: ["CCTV", "CONTROL_ACCESO", "BARRERA", "RED", "COMPUTO"].every((family) => (proposed.desired_concepts || proposed.concepts || []).some((item) => item.familia === family)),
    value: "families",
  });
  checks.push({
    name: "desired_concepts_do_not_embed_product_service_keys",
    pass: !(proposed.desired_concepts || []).some((item) => /(^|[^0-9])\d{8}([^0-9]|$)/.test(JSON.stringify(item))),
    value: "no c_ClaveProdServ literals",
  });
  checks.push({
    name: "all_gaps_not_suggestible",
    pass: (proposed.gaps || []).every((gap) => gap.precision_level === "GAP_REQUIRES_REVIEW" && gap.suggestible === false),
    value: `gaps=${(proposed.gaps || []).length}`,
  });

  const officialKeys = officialKeySets();
  const conceptChecks = (proposed.concepts || []).map((concept) => {
    const requiredOk = REQUIRED_FIELDS.every((field) => Object.prototype.hasOwnProperty.call(concept, field));
    const sourceOk = concept.source === "SAT_OFFICIAL";
    const productKeyOk = officialKeys.productServices.has(String(concept.clave_prod_serv));
    const unitKeyOk = officialKeys.units.has(String(concept.clave_unidad));
    const reviewOk = concept.requiere_revision_humana === true;
    const precisionOk = ["EXACT", "BROAD_ALLOWED"].includes(concept.precision_level);
    return requiredOk && sourceOk && productKeyOk && unitKeyOk && reviewOk && precisionOk;
  });
  checks.push({
    name: "official_backed_concepts_have_required_fields_and_keys",
    pass: conceptChecks.every(Boolean),
    value: `concepts=${conceptChecks.length}`,
  });
  checks.push({
    name: "no_gap_added_as_sugerible",
    pass: !(proposed.concepts || []).some((concept) => concept.precision_level === "GAP_REQUIRES_REVIEW" || concept.action_n8n === "SUGERIR" && (!concept.clave_prod_serv || !concept.clave_unidad)),
    value: "safe",
  });
}

checks.push({
  name: "final_catalog_not_modified",
  pass: gitDiffNameOnly("data/concepts.normalized.json") === "",
  value: "data/concepts.normalized.json",
});
checks.push({
  name: "excel_original_not_modified_or_staged",
  pass: gitDiffNameOnly("data/base_cfdi_resico_n8n_emberhub_2026.xlsx") === "" && gitStatusPorcelain("data/base_cfdi_resico_n8n_emberhub_2026.xlsx") === "",
  value: fs.existsSync(excelPath) ? "exists local, not changed" : "not present",
});

const policy = fs.existsSync(policyPath) ? fs.readFileSync(policyPath, "utf8") : "";
checks.push({
  name: "policy_blocks_non_authorized_digital_services",
  pass: ["Software", "apps", "web", "SaaS", "n8n", "IA"].every((text) => policy.includes(text)),
  value: "blocked categories",
});
checks.push({
  name: "policy_public_preview_hides_internals",
  pass: ["familia", "score", "keywords", "notas internas", "source row", "precision internals"].every((text) => policy.includes(text)),
  value: "public preview",
});

if (imported) {
  checks.push({
    name: "sat_auxiliary_catalogs_imported",
    pass: (imported.clave_unidad || []).length > 0 && (imported.objeto_impuesto || []).length > 0 && (imported.uso_cfdi || []).length > 0,
    value: `unidad=${(imported.clave_unidad || []).length}/uso=${(imported.uso_cfdi || []).length}`,
  });
  checks.push({
    name: "compact_reference_not_official_source",
    pass: imported.compact_reference?.source_role === "REFERENCE_ONLY" && (imported.warnings || []).some((warning) => warning.code === "MISSING_OFFICIAL_CLAVE_PROD_SERV"),
    value: imported.compact_reference?.source_role || "N/A",
  });
}

console.log("Catalog expansion contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

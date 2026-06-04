const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const proposalPath = path.join(root, "data", "knowledge_base", "emitter_activity_scope.proposed.json");
const auditDocPath = path.join(root, "docs", "RESICO_626_ENGINE_REARCHITECTURE_AUDIT.md");
const prodServIndexPath = path.join(root, "data", "knowledge_base", "cfdi40_claveprodserv_index.json");

const protectedPaths = [
  "data/concepts.normalized.json",
  "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
  "scripts/scoring.js",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
];

const requiredBlockedTerms = [
  "software",
  "app movil",
  "pagina web",
  "SaaS",
  "IA",
  "n8n como servicio",
  "marketing",
  "diseno grafico",
  "video",
  "comida",
  "plomeria",
  "pintura",
  "albanileria",
  "construccion civil general",
  "consultoria fiscal",
  "consultoria legal",
  "consultoria contable",
  "renta de equipo",
];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function gitDiffNameOnly(repoPath) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function allCandidateKeys(proposal) {
  return (proposal.fiscal_scope_categories || [])
    .flatMap((category) => category.candidate_sat_keys_from_active_catalog || [])
    .filter(Boolean);
}

const checks = [];
checks.push({ name: "proposal_json_exists", pass: exists(proposalPath), value: path.relative(root, proposalPath) });
checks.push({ name: "audit_doc_exists", pass: exists(auditDocPath), value: path.relative(root, auditDocPath) });

let proposal = null;
let prodServIndex = null;
let auditDoc = "";
try {
  proposal = readJson(proposalPath);
  prodServIndex = readJson(prodServIndexPath);
  auditDoc = fs.readFileSync(auditDocPath, "utf8");
  checks.push({ name: "proposal_and_prodserv_parse", pass: true, value: "json ok" });
} catch (error) {
  checks.push({ name: "proposal_and_prodserv_parse", pass: false, value: error.message });
}

if (proposal) {
  checks.push({ name: "proposal_not_active", pass: proposal.status === "PROPOSED_NOT_ACTIVE" && proposal.activation_policy?.does_not_enable_new_concepts === true, value: proposal.status });
  checks.push({ name: "principle_constancia_manda", pass: /constancia fiscal manda/i.test(proposal.principle), value: "principle" });
  checks.push({ name: "regimen_626", pass: proposal.emitter?.regimen_fiscal === "626", value: proposal.emitter?.regimen_fiscal });
  checks.push({ name: "human_review_always", pass: proposal.emitter?.requires_human_review_always === true, value: "true" });

  const activityIds = new Set((proposal.activities || []).map((activity) => activity.id));
  for (const id of ["A1", "A2", "A3", "A4", "A5"]) {
    checks.push({ name: `activity_exists:${id}`, pass: activityIds.has(id), value: id });
  }

  const categoryIds = new Set((proposal.fiscal_scope_categories || []).map((category) => category.id));
  for (const id of [
    "INSTALLATION_EQUIPMENT_CONSTRUCTION",
    "TECHNICAL_MAINTENANCE_COMMERCIAL_SERVICE_EQUIPMENT",
    "ELECTRONIC_PRECISION_EQUIPMENT",
    "COMMUNICATION_DEVICES_RETAIL",
    "COMPUTERS_ACCESSORIES_RETAIL",
    "SECURITY_ELECTRONICS_WHEN_JUSTIFIED",
  ]) {
    checks.push({ name: `scope_category_exists:${id}`, pass: categoryIds.has(id), value: id });
  }

  const blockedText = JSON.stringify(proposal.blocked_scope || []).toLowerCase();
  for (const term of requiredBlockedTerms) {
    checks.push({ name: `blocked_term:${term}`, pass: blockedText.includes(term.toLowerCase()), value: term });
  }

  const layerOrder = (proposal.proposed_scoring_layers || []).map((layer) => layer.id);
  checks.push({ name: "scoring_layer_activity_before_keywords", pass: layerOrder.indexOf("emitter_activity_scope") >= 0 && layerOrder.indexOf("manual_keywords_current") > layerOrder.indexOf("emitter_activity_scope"), value: layerOrder.join(" > ") });
  checks.push({ name: "scoring_layer_sat_before_keywords", pass: layerOrder.indexOf("sat_master_catalog_validation") >= 0 && layerOrder.indexOf("manual_keywords_current") > layerOrder.indexOf("sat_master_catalog_validation"), value: layerOrder.join(" > ") });

  const semanticIds = new Set((proposal.semantic_disambiguation_rules || []).map((rule) => rule.id));
  for (const id of ["CAMERA_NOT_DVR", "DVR_NOT_CAMERA", "POWER_SOURCE_NOT_DVR", "SYSTEM_GENERIC_NEEDS_EQUIPMENT"]) {
    checks.push({ name: `semantic_rule:${id}`, pass: semanticIds.has(id), value: id });
  }

  const keysInProposal = Array.from(new Set(allCandidateKeys(proposal)));
  const officialKnownKeys = new Set((prodServIndex?.active_catalog_key_validation || []).map((item) => item.clave));
  const missingKeys = keysInProposal.filter((key) => !officialKnownKeys.has(key));
  checks.push({ name: "candidate_keys_are_active_validated_keys", pass: missingKeys.length === 0 && keysInProposal.length > 20, value: missingKeys.length ? missingKeys.join(",") : `${keysInProposal.length} keys` });
}

checks.push({ name: "audit_doc_reports_keyword_limit", pass: /depend\w* demasiado de keywords manuales/i.test(auditDoc) && /FAMILY_HINTS/.test(auditDoc), value: "keyword audit" });
checks.push({ name: "audit_doc_has_minimal_changes", pass: /P1 - Auditoria no productiva/.test(auditDoc) && /Shadow scoring/.test(auditDoc), value: "minimal changes" });
checks.push({ name: "audit_doc_mentions_no_activation", pass: /no activa conceptos nuevos/i.test(auditDoc) && /no implementa PAC/i.test(auditDoc), value: "no activation/no PAC" });

for (const repoPath of protectedPaths) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const passed = checks.filter((check) => check.pass).length;

console.log("Emitter activity scope proposal contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

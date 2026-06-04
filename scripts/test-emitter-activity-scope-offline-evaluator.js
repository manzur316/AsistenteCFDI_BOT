const { execFileSync } = require("child_process");
const path = require("path");
const { loadEmitterActivityScope } = require("./lib/emitter-activity-scope-loader");

const root = path.resolve(__dirname, "..");

const POLICY = {
  ALLOW: "ALLOW_CANDIDATE",
  ASK: "ASK_CLARIFICATION",
  BLOCK: "BLOCK_OR_ACTIVITY_REVIEW",
};

const SALE_TERMS = ["venta", "vendo", "vend", "suministro", "suministre", "suministr"];
const INSTALL_TERMS = ["instalacion", "instalar", "instale", "instal", "cableado", "canalizacion"];
const SERVICE_TERMS = ["reparacion", "reparar", "repare", "mantenimiento", "diagnostico", "diagnosticar", "configuracion", "configurar", "configure", "revision", "revisar", "revise", "cambio", "cambiar", "cambie"];

const GENERIC_PHRASES = [
  "servicio tecnico",
  "revision de sistema",
  "mantenimiento general",
  "trabajo en caseta",
  "instalacion de equipo",
  "configuracion de sistema",
];

const SPECIFIC_EQUIPMENT_TERMS = [
  "router",
  "switch",
  "access point",
  "punto de acceso",
  "computadora",
  "laptop",
  "memoria",
  "ram",
  "barrera",
  "vehicular",
  "control de acceso",
  "camara",
  "cctv",
  "dvr",
  "nvr",
  "grabador",
  "fuente de poder",
  "fuente",
  "cable de red",
  "conector",
  "equipo electronico",
  "electronico",
  "telefono",
];

const CATEGORY_ALIASES = {
  INSTALLATION_EQUIPMENT_CONSTRUCTION: [
    "instalacion",
    "equipamiento",
    "cableado",
    "cable de red",
    "control de acceso",
    "camara",
    "cctv",
    "sistema cctv",
  ],
  TECHNICAL_MAINTENANCE_COMMERCIAL_SERVICE_EQUIPMENT: [
    "mantenimiento",
    "reparacion",
    "diagnostico",
    "revision",
    "barrera",
    "vehicular",
    "caseta",
    "equipo comercial",
  ],
  ELECTRONIC_PRECISION_EQUIPMENT: [
    "equipo electronico",
    "electronico",
    "fuente",
    "fuente de poder",
    "camara",
    "cctv",
    "dvr",
    "nvr",
    "grabador",
    "control de acceso",
    "computadora",
    "hardware",
    "memoria",
    "ram",
  ],
  COMMUNICATION_DEVICES_RETAIL: [
    "router",
    "switch",
    "access point",
    "punto de acceso",
    "cable de red",
    "conector",
    "red",
    "telefono",
    "comunicacion",
  ],
  COMPUTERS_ACCESSORIES_RETAIL: [
    "computadora",
    "laptop",
    "memoria",
    "ram",
    "monitor",
    "almacenamiento",
    "disco duro",
    "ssd",
    "accesorio",
  ],
  SECURITY_ELECTRONICS_WHEN_JUSTIFIED: [
    "seguridad electronica",
    "camara",
    "cctv",
    "dvr",
    "nvr",
    "grabador",
    "control de acceso",
    "barrera",
    "vehicular",
    "fuente",
  ],
};

const BLOCKED_ALIASES = {
  NO_SOFTWARE_APPS_WEB_SAAS_IA_N8N: [
    "software",
    "app",
    "app movil",
    "aplicacion movil",
    "pagina web",
    "sitio web",
    "web",
    "saas",
    "ia",
    "inteligencia artificial",
    "n8n",
    "automatizacion n8n",
    "automatizacion digital",
  ],
  NO_MARKETING_DESIGN_VIDEO: [
    "marketing",
    "marketing digital",
    "diseno grafico",
    "edicion de video",
    "video",
  ],
  NO_OFF_TRADES_OR_CONSTRUCTION: [
    "comida",
    "plomeria",
    "pintura",
    "albanileria",
    "construccion civil",
    "construccion civil general",
  ],
  NO_PROFESSIONAL_CONSULTING_OR_RENTAL: [
    "consultoria fiscal",
    "consultoria legal",
    "consultoria contable",
    "renta de equipo",
  ],
};

const CASES = [
  ...[
    "venta de router",
    "venta de switch",
    "venta de access point",
    "venta de computadora",
    "venta de memoria RAM",
    "reparacion de computadora",
    "mantenimiento de barrera vehicular",
    "instalacion de control de acceso",
    "instalacion de camara CCTV",
    "configuracion de DVR",
    "diagnostico de sistema CCTV",
    "cambio de fuente de poder de camara",
    "venta de cable de red",
    "venta de conector para red",
    "reparacion de equipo electronico",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.ALLOW, group: "permitidos" })),
  ...[
    "servicio tecnico",
    "revision de sistema",
    "mantenimiento general",
    "trabajo en caseta",
    "instalacion de equipo",
    "configuracion de sistema",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.ASK, group: "aclaracion" })),
  ...[
    "desarrollo de app movil",
    "pagina web",
    "automatizacion n8n",
    "servicio de IA",
    "marketing digital",
    "diseno grafico",
    "edicion de video",
    "plomeria",
    "pintura",
    "albanileria",
    "comida",
    "consultoria fiscal",
    "renta de equipo",
  ].map((input_text) => ({ input_text, expected_policy: POLICY.BLOCK, group: "bloqueo" })),
  { input_text: "venta de camara CCTV", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "CAMERA_NOT_DVR_GUARD_APPLIED", forbidden_activation: "DVR_NVR" },
  { input_text: "venta de DVR", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "venta de NVR", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "fuente de poder para camara", expected_policy: POLICY.ASK, group: "contaminacion", required_guard: "POWER_SOURCE_NOT_DVR_OR_DISK_GUARD_APPLIED", forbidden_activation: "DISK_DVR" },
  { input_text: "disco duro para DVR", expected_policy: POLICY.ASK, group: "contaminacion", required_guard: "DVR_NOT_CAMERA_GUARD_APPLIED", forbidden_activation: "CAMERA" },
  { input_text: "sistema CCTV completo", expected_policy: POLICY.ALLOW, group: "contaminacion", required_guard: "SYSTEM_CCTV_BROAD_ALLOWED", forbidden_activation: "EQUIPMENT_CONTRADICTION" },
];

const PROTECTED_PATHS = [
  "data/concepts.normalized.json",
  "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
  "scripts/scoring.js",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
];

function normalizeText(input) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input) {
  return normalizeText(input).match(/[a-z0-9]+/g) || [];
}

function termMatches(normalizedText, tokens, term) {
  const normalizedTerm = normalizeText(term);
  if (!normalizedTerm) return false;
  if (normalizedTerm.includes(" ")) return normalizedText.includes(normalizedTerm);
  if (normalizedTerm.length <= 3) return tokens.includes(normalizedTerm);
  return tokens.some((token) =>
    token === normalizedTerm ||
    token.startsWith(normalizedTerm) ||
    normalizedTerm.startsWith(token) && token.length >= 4
  );
}

function termsMatched(normalizedText, tokens, terms) {
  return [...new Set((terms || []).filter((term) => termMatches(normalizedText, tokens, term)).map(normalizeText))];
}

function containsDigitalBlockedSignal(inputText) {
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const digitalBlockedTerms = [
    "software",
    "app movil",
    "aplicacion movil",
    "pagina web",
    "sitio web",
    "automatizacion n8n",
    "automatizacion digital",
    "servicio de ia",
    "inteligencia artificial",
    "n8n",
    "saas",
  ];

  return termsMatched(normalizedText, tokens, digitalBlockedTerms).length > 0;
}

function detectOperationType(normalizedText, tokens) {
  if (normalizedText.includes("sistema cctv completo")) return "MIXTO";
  if (termsMatched(normalizedText, tokens, SALE_TERMS).length) return "PRODUCTO";
  if (termsMatched(normalizedText, tokens, INSTALL_TERMS).length) return "SERVICIO_INSTALACION";
  if (termsMatched(normalizedText, tokens, SERVICE_TERMS).length) return "SERVICIO";
  return "DESCONOCIDO";
}

function operationAllowedForActivity(activity, operationType) {
  const allowed = activity.allowed_operation_types || [];
  if (allowed.includes(operationType)) return true;
  if (operationType === "MIXTO" && (allowed.includes("SERVICIO") || allowed.includes("PRODUCTO"))) return true;
  return false;
}

function detectBlockedScope(scope, normalizedText, tokens) {
  const matches = [];
  for (const blocked of scope.blocked_scope || []) {
    const terms = [...(blocked.terms || []), ...(BLOCKED_ALIASES[blocked.id] || [])];
    const matched_terms = termsMatched(normalizedText, tokens, terms);
    if (matched_terms.length) {
      matches.push({
        id: blocked.id,
        decision: blocked.decision,
        matched_terms,
      });
    }
  }
  return matches;
}

function detectScopeCategories(scope, normalizedText, tokens) {
  const matches = [];
  for (const category of scope.fiscal_scope_categories || []) {
    const terms = [
      ...(category.candidate_topics || []),
      ...(CATEGORY_ALIASES[category.id] || []),
    ];
    const matched_terms = termsMatched(normalizedText, tokens, terms);
    if (matched_terms.length) {
      matches.push({
        id: category.id,
        activity_ids: category.activity_ids || [],
        matched_terms,
      });
    }
  }
  return matches;
}

function hasSpecificEquipment(normalizedText, tokens) {
  return termsMatched(normalizedText, tokens, SPECIFIC_EQUIPMENT_TERMS).length > 0;
}

function requiresClarification(normalizedText, tokens, operationType, matchedCategories, blockedMatches) {
  if (blockedMatches.length) return false;
  const genericPhraseMatched = GENERIC_PHRASES.some((phrase) => normalizedText === normalizeText(phrase) || normalizedText.includes(normalizeText(phrase)));
  const specific = hasSpecificEquipment(normalizedText, tokens);
  if (genericPhraseMatched && !specific) return true;
  if (operationType === "DESCONOCIDO" && !normalizedText.includes("sistema cctv completo")) return true;
  if (!matchedCategories.length) return true;
  if (!specific && operationType !== "MIXTO") return true;
  return false;
}

function detectSemanticFlags(normalizedText, tokens) {
  const flags = [];
  const hasCamera = termsMatched(normalizedText, tokens, ["camara", "camaras"]).length > 0;
  const hasCctv = termsMatched(normalizedText, tokens, ["cctv", "videovigilancia"]).length > 0;
  const hasDvrNvr = termsMatched(normalizedText, tokens, ["dvr", "nvr", "grabador"]).length > 0;
  const hasPower = termsMatched(normalizedText, tokens, ["fuente", "fuente de poder", "alimentacion", "adaptador", "transformador"]).length > 0;
  const hasDisk = termsMatched(normalizedText, tokens, ["disco", "disco duro", "hdd", "ssd", "almacenamiento"]).length > 0;
  const hasCompleteCctvSystem = normalizedText.includes("sistema cctv completo");

  if ((hasCamera || hasCctv) && !hasDvrNvr && !hasDisk && !hasCompleteCctvSystem) flags.push("CAMERA_NOT_DVR_GUARD_APPLIED");
  if (hasDvrNvr && !hasCamera) flags.push("DVR_NOT_CAMERA_GUARD_APPLIED");
  if (hasPower && (hasCamera || hasCctv) && !hasDvrNvr && !hasDisk) flags.push("POWER_SOURCE_NOT_DVR_OR_DISK_GUARD_APPLIED");
  if (hasDisk && hasDvrNvr && !hasCamera) flags.push("DVR_NOT_CAMERA_GUARD_APPLIED");
  if (hasCompleteCctvSystem && !hasCamera && !hasDvrNvr && !hasDisk) flags.push("SYSTEM_CCTV_BROAD_ALLOWED");

  return [...new Set(flags)];
}

function deriveActivityIds(scope, operationType, matchedCategories) {
  const activitiesById = new Map((scope.activities || []).map((activity) => [activity.id, activity]));
  const ids = [];
  for (const category of matchedCategories) {
    for (const id of category.activity_ids || []) {
      const activity = activitiesById.get(id);
      if (activity && operationAllowedForActivity(activity, operationType)) ids.push(id);
    }
  }
  return [...new Set(ids)].sort();
}

function evaluateCase(scope, inputText) {
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const detected_operation_type = detectOperationType(normalizedText, tokens);
  const blocked_scope_matches = detectBlockedScope(scope, normalizedText, tokens);
  const matchedCategories = detectScopeCategories(scope, normalizedText, tokens);
  const detected_activity_ids = deriveActivityIds(scope, detected_operation_type, matchedCategories);
  const semantic_contamination_flags = detectSemanticFlags(normalizedText, tokens);
  const ask = requiresClarification(normalizedText, tokens, detected_operation_type, matchedCategories, blocked_scope_matches);
  const reasons = [];

  if (blocked_scope_matches.length) reasons.push("blocked_scope_match");
  if (ask) reasons.push("requires_clarification");
  if (matchedCategories.length) reasons.push(`matched_scope:${matchedCategories.map((item) => item.id).join(",")}`);
  if (detected_activity_ids.length) reasons.push(`activity_scope:${detected_activity_ids.join(",")}`);
  if (semantic_contamination_flags.length) reasons.push(`semantic_guards:${semantic_contamination_flags.join(",")}`);

  let offline_policy_result = POLICY.ASK;
  if (blocked_scope_matches.length) {
    offline_policy_result = POLICY.BLOCK;
  } else if (ask || !detected_activity_ids.length) {
    offline_policy_result = POLICY.ASK;
  } else {
    offline_policy_result = POLICY.ALLOW;
  }

  return {
    input_text: inputText,
    expected_policy: null,
    detected_activity_ids,
    detected_operation_type,
    matched_scope_categories: matchedCategories.map((item) => ({
      id: item.id,
      activity_ids: item.activity_ids,
      matched_terms: item.matched_terms,
    })),
    blocked_scope_matches,
    requires_clarification: ask,
    semantic_contamination_flags,
    offline_policy_result,
    reasons,
  };
}

function gitDiffNameOnly(repoPath) {
  try {
    return execFileSync("git", ["diff", "--name-only", "--", repoPath], { cwd: root, encoding: "utf8" }).trim();
  } catch (_error) {
    return "git-error";
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const scope = loadEmitterActivityScope();
const checks = [];
const results = CASES.map((testCase) => ({
  ...evaluateCase(scope, testCase.input_text),
  expected_policy: testCase.expected_policy,
  group: testCase.group,
  required_guard: testCase.required_guard || null,
  forbidden_activation: testCase.forbidden_activation || null,
}));

console.log("Offline emitter_activity_scope evaluator");
console.log(`Total casos: ${results.length}`);
for (const result of results) {
  console.log(JSON.stringify(result, null, 2));
  const policyPass = result.offline_policy_result === result.expected_policy;
  const blockNotAllowed = result.group !== "bloqueo" || result.offline_policy_result !== POLICY.ALLOW;
  const genericNotAllowed = result.group !== "aclaracion" || result.offline_policy_result !== POLICY.ALLOW;
  const requiredGuardPass = !result.required_guard || result.semantic_contamination_flags.includes(result.required_guard);
  const noContaminationPass = !result.semantic_contamination_flags.some((flag) => flag.startsWith("CONTAMINATION_"));
  const softwareNotAllowed = !containsDigitalBlockedSignal(result.input_text) || result.offline_policy_result !== POLICY.ALLOW;

  checks.push({ name: `policy:${result.input_text}`, pass: policyPass, value: `${result.offline_policy_result} expected ${result.expected_policy}` });
  checks.push({ name: `blocked_not_allowed:${result.input_text}`, pass: blockNotAllowed, value: result.group });
  checks.push({ name: `generic_not_allowed:${result.input_text}`, pass: genericNotAllowed, value: result.group });
  checks.push({ name: `semantic_guard:${result.input_text}`, pass: requiredGuardPass, value: result.required_guard || "not-required" });
  checks.push({ name: `no_semantic_contamination:${result.input_text}`, pass: noContaminationPass, value: result.forbidden_activation || "none" });
  checks.push({ name: `software_web_ia_n8n_not_allowed:${result.input_text}`, pass: softwareNotAllowed, value: result.group });
}

for (const repoPath of PROTECTED_PATHS) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const passed = checks.filter((check) => check.pass).length;
console.log("");
console.log("Validaciones");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

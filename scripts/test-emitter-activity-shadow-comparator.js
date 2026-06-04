const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadEmitterActivityScope } = require("./lib/emitter-activity-scope-loader");

const root = path.resolve(__dirname, "..");
const catalogPath = path.join(root, "data", "concepts.normalized.json");

const POLICY = {
  ALLOW: "ALLOW_CANDIDATE",
  ASK: "ASK_CLARIFICATION",
  BLOCK: "BLOCK_OR_ACTIVITY_REVIEW",
};

const DIVERGENCE = {
  NONE: "NONE",
  SHADOW_MORE_STRICT: "SHADOW_MORE_STRICT",
  SHADOW_MORE_PERMISSIVE: "SHADOW_MORE_PERMISSIVE",
  CURRENT_SCORING_SEMANTIC_CONTAMINATION: "CURRENT_SCORING_SEMANTIC_CONTAMINATION",
  CURRENT_SCORING_BLOCKS_VALID_SCOPE: "CURRENT_SCORING_BLOCKS_VALID_SCOPE",
  CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE: "CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE",
  NEEDS_POLICY_REVIEW: "NEEDS_POLICY_REVIEW",
  CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE: "CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE",
};

const SALE_TERMS = ["venta", "vendo", "vend", "suministro", "suministre", "suministr"];
const INSTALL_TERMS = ["instalacion", "instalar", "instale", "instal", "cableado", "canalizacion"];
const SERVICE_TERMS = [
  "reparacion",
  "reparar",
  "repare",
  "mantenimiento",
  "diagnostico",
  "diagnosticar",
  "configuracion",
  "configurar",
  "configure",
  "revision",
  "revisar",
  "revise",
  "cambio",
  "cambiar",
  "cambie",
];

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
  { input_text: "venta de camara CCTV", expected_policy: POLICY.ALLOW, kind: "semantic_camera_not_dvr" },
  { input_text: "venta de DVR", expected_policy: POLICY.ALLOW, kind: "semantic_dvr_not_camera" },
  { input_text: "venta de NVR", expected_policy: POLICY.ALLOW, kind: "semantic_dvr_not_camera" },
  { input_text: "sistema CCTV completo", expected_policy: POLICY.ALLOW, kind: "broad_cctv" },
  { input_text: "fuente de poder para camara", expected_policy: POLICY.ASK, kind: "clarification" },
  { input_text: "disco duro para DVR", expected_policy: POLICY.ASK, kind: "clarification" },
  { input_text: "servicio tecnico", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "revision de sistema", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "mantenimiento general", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "trabajo en caseta", expected_policy: POLICY.ASK, kind: "generic" },
  { input_text: "venta de router", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "venta de switch", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "venta de computadora", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "reparacion de computadora", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "instalacion de control de acceso", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "mantenimiento de barrera vehicular", expected_policy: POLICY.ALLOW, kind: "valid_scope" },
  { input_text: "desarrollo de app movil", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "pagina web", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "automatizacion n8n", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "servicio de IA", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "marketing digital", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "plomeria", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "pintura", expected_policy: POLICY.BLOCK, kind: "blocked" },
  { input_text: "renta de equipo", expected_policy: POLICY.BLOCK, kind: "blocked" },
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
    (normalizedTerm.startsWith(token) && token.length >= 4)
  );
}

function termsMatched(normalizedText, tokens, terms) {
  return [...new Set((terms || []).filter((term) => termMatches(normalizedText, tokens, term)).map(normalizeText))];
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
  if (genericPhraseMatched && !hasSpecificEquipment(normalizedText, tokens)) return true;
  if (operationType === "DESCONOCIDO" && !normalizedText.includes("sistema cctv completo")) return true;
  if (!matchedCategories.length) return true;
  if (!hasSpecificEquipment(normalizedText, tokens) && !normalizedText.includes("sistema cctv completo")) return true;
  return false;
}

function detectSemanticContaminationFlags(normalizedText, tokens) {
  const hasCamera = termsMatched(normalizedText, tokens, ["camara", "camaras", "cctv"]).length > 0;
  const hasDvrNvr = termsMatched(normalizedText, tokens, ["dvr", "nvr", "grabador"]).length > 0;
  const hasPower = termsMatched(normalizedText, tokens, ["fuente", "fuente de poder", "power supply", "alimentacion", "adaptador", "transformador"]).length > 0;
  const hasDisk = termsMatched(normalizedText, tokens, ["disco", "disco duro", "hdd", "ssd", "almacenamiento"]).length > 0;
  const flags = [];

  if (normalizedText.includes("sistema cctv completo")) flags.push("SYSTEM_CCTV_BROAD_ALLOWED");
  if (hasCamera && !hasDvrNvr) flags.push("CAMERA_NOT_DVR_GUARD_APPLIED");
  if (hasDvrNvr && !hasCamera) flags.push("DVR_NOT_CAMERA_GUARD_APPLIED");
  if (hasPower && hasCamera && !hasDisk) flags.push("POWER_SOURCE_NOT_DVR_OR_DISK_GUARD_APPLIED");
  return flags;
}

function evaluateActivityScope(scope, inputText) {
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const detected_operation_type = detectOperationType(normalizedText, tokens);
  const blocked_scope_matches = detectBlockedScope(scope, normalizedText, tokens);
  const matched_scope_categories = detectScopeCategories(scope, normalizedText, tokens);
  const requires_clarification = requiresClarification(
    normalizedText,
    tokens,
    detected_operation_type,
    matched_scope_categories,
    blocked_scope_matches
  );

  const activityIds = new Set();
  for (const category of matched_scope_categories) {
    for (const activityId of category.activity_ids || []) {
      const activity = (scope.activities || []).find((item) => item.id === activityId);
      if (activity && operationAllowedForActivity(activity, detected_operation_type)) {
        activityIds.add(activityId);
      }
    }
  }

  const semantic_contamination_flags = detectSemanticContaminationFlags(normalizedText, tokens);
  let offline_policy_result = POLICY.ALLOW;
  if (blocked_scope_matches.length) {
    offline_policy_result = POLICY.BLOCK;
  } else if (requires_clarification || !activityIds.size) {
    offline_policy_result = POLICY.ASK;
  }

  return {
    offline_policy_result,
    detected_activity_ids: [...activityIds].sort(),
    detected_operation_type,
    matched_scope_categories: matched_scope_categories.map((item) => item.id),
    blocked_scope_matches,
    requires_clarification,
    semantic_contamination_flags,
  };
}

function loadCurrentScoring() {
  try {
    const scoring = require("./scoring.js");
    if (typeof scoring.classifyMessage !== "function" || typeof scoring.buildN8nResponse !== "function") {
      return { importable: false, reason: "classifyMessage/buildN8nResponse no disponibles" };
    }
    const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
    return { importable: true, scoring, catalog };
  } catch (error) {
    return { importable: false, reason: error.message };
  }
}

function currentPolicyFromAction(action) {
  if (action === "SUGERIR") return POLICY.ALLOW;
  if (action === "PEDIR_ACLARACION") return POLICY.ASK;
  if (action === "BLOQUEAR" || action === "AGREGAR_ACTIVIDAD") return POLICY.BLOCK;
  return null;
}

function classifyWithCurrentScoring(current, inputText) {
  if (!current.importable) {
    return {
      current_scoring_action: null,
      current_scoring_concept_id: null,
      current_scoring_family: null,
      current_scoring_reason: current.reason || "CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE",
      current_policy: null,
      concept_text: "",
    };
  }

  const raw = current.scoring.classifyMessage(inputText, current.catalog);
  const response = current.scoring.buildN8nResponse(raw, inputText);
  const concept = response.concept || {};
  return {
    current_scoring_action: response.action || null,
    current_scoring_concept_id: concept.id || null,
    current_scoring_family: concept.familia || null,
    current_scoring_reason: raw.reason || response.json_debug?.reason || null,
    current_policy: currentPolicyFromAction(response.action),
    concept_text: normalizeText([
      concept.id,
      concept.concepto_factura,
      concept.familia,
      concept.tipo,
      concept.operacion,
    ].filter(Boolean).join(" ")),
  };
}

function currentHasSemanticContamination(inputText, currentResult) {
  if (currentResult.current_scoring_action !== "SUGERIR") return false;
  const input = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const concept = currentResult.concept_text;
  const hasCamera = termsMatched(input, tokens, ["camara", "camaras", "cctv"]).length > 0;
  const hasDvrNvr = termsMatched(input, tokens, ["dvr", "nvr", "grabador"]).length > 0;
  const hasPower = termsMatched(input, tokens, ["fuente", "fuente de poder", "adaptador", "transformador"]).length > 0;
  const hasDisk = termsMatched(input, tokens, ["disco", "disco duro", "hdd", "ssd", "almacenamiento"]).length > 0;
  const broadCctv = input.includes("sistema cctv completo");

  if (broadCctv) return false;
  if (hasCamera && !hasDvrNvr && /\b(dvr|nvr|grabador|disco|almacenamiento)\b/.test(concept)) return true;
  if (hasDvrNvr && !hasCamera && /\b(camara|camaras)\b/.test(concept)) return true;
  if (hasPower && hasCamera && !hasDisk && /\b(dvr|nvr|grabador|disco|almacenamiento)\b/.test(concept)) return true;
  return false;
}

function decideDivergence(inputText, currentResult, activityResult) {
  if (!currentResult.current_policy) return DIVERGENCE.CURRENT_SCORING_NOT_IMPORTABLE_WITHOUT_RUNTIME_CHANGE;
  if (currentHasSemanticContamination(inputText, currentResult)) return DIVERGENCE.CURRENT_SCORING_SEMANTIC_CONTAMINATION;

  const currentPolicy = currentResult.current_policy;
  const shadowPolicy = activityResult.offline_policy_result;
  if (currentPolicy === shadowPolicy) return DIVERGENCE.NONE;
  if (currentPolicy === POLICY.ALLOW && shadowPolicy === POLICY.BLOCK) return DIVERGENCE.CURRENT_SCORING_ALLOWS_OUT_OF_SCOPE;
  if (currentPolicy === POLICY.BLOCK && shadowPolicy === POLICY.ALLOW) return DIVERGENCE.CURRENT_SCORING_BLOCKS_VALID_SCOPE;
  if (currentPolicy === POLICY.ALLOW && shadowPolicy === POLICY.ASK) return DIVERGENCE.SHADOW_MORE_STRICT;
  if ((currentPolicy === POLICY.ASK || currentPolicy === POLICY.BLOCK) && shadowPolicy === POLICY.ALLOW) return DIVERGENCE.SHADOW_MORE_PERMISSIVE;
  return DIVERGENCE.NEEDS_POLICY_REVIEW;
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
const current = loadCurrentScoring();
const checks = [];
const results = CASES.map((testCase) => {
  const currentResult = classifyWithCurrentScoring(current, testCase.input_text);
  const activityResult = evaluateActivityScope(scope, testCase.input_text);
  const divergence_type = decideDivergence(testCase.input_text, currentResult, activityResult);

  return {
    input_text: testCase.input_text,
    expected_policy: testCase.expected_policy,
    current_scoring_action: currentResult.current_scoring_action,
    current_scoring_concept_id: currentResult.current_scoring_concept_id,
    current_scoring_family: currentResult.current_scoring_family,
    current_scoring_reason: currentResult.current_scoring_reason,
    current_scoring_concept_text: currentResult.concept_text,
    activity_scope_result: activityResult.offline_policy_result,
    activity_scope_detected_activity_ids: activityResult.detected_activity_ids,
    activity_scope_requires_clarification: activityResult.requires_clarification,
    activity_scope_blocked_matches: activityResult.blocked_scope_matches.map((match) => match.id),
    activity_scope_semantic_flags: activityResult.semantic_contamination_flags,
    divergence_type,
    kind: testCase.kind,
  };
});

console.log("Emitter activity shadow comparator");
console.log(`Current scoring importable: ${current.importable ? "yes" : "no"}`);
if (!current.importable) console.log(`Current scoring import reason: ${current.reason}`);
console.log(`Total casos: ${results.length}`);

for (const result of results) {
  console.log(JSON.stringify({
    input_text: result.input_text,
    current_scoring_action: result.current_scoring_action,
    current_scoring_concept_id: result.current_scoring_concept_id,
    current_scoring_family: result.current_scoring_family,
    current_scoring_reason: result.current_scoring_reason,
    activity_scope_result: result.activity_scope_result,
    activity_scope_detected_activity_ids: result.activity_scope_detected_activity_ids,
    activity_scope_requires_clarification: result.activity_scope_requires_clarification,
    activity_scope_blocked_matches: result.activity_scope_blocked_matches,
    divergence_type: result.divergence_type,
  }, null, 2));

  const expectedPass = result.activity_scope_result === result.expected_policy;
  const blockedNotAllowedByScope = result.kind !== "blocked" || result.activity_scope_result !== POLICY.ALLOW;
  const blockedNotAllowedByCurrent = result.kind !== "blocked" || result.current_scoring_action !== "SUGERIR";
  const genericNotAllowedByScope = result.kind !== "generic" || result.activity_scope_result === POLICY.ASK;
  const genericNotAllowedByCurrent = result.kind !== "generic" || result.current_scoring_action !== "SUGERIR";
  const semanticContaminationIsLabeled =
    !currentHasSemanticContamination(result.input_text, {
      current_scoring_action: result.current_scoring_action,
      concept_text: result.current_scoring_concept_text,
    }) ||
    result.divergence_type === DIVERGENCE.CURRENT_SCORING_SEMANTIC_CONTAMINATION;
  const softwareNotPermitted =
    !["blocked"].includes(result.kind) ||
    result.activity_scope_result !== POLICY.ALLOW;
  const divergenceAllowed = Object.values(DIVERGENCE).includes(result.divergence_type);

  checks.push({ name: `expected_policy:${result.input_text}`, pass: expectedPass, value: `${result.activity_scope_result} expected ${result.expected_policy}` });
  checks.push({ name: `blocked_scope_not_allowed:${result.input_text}`, pass: blockedNotAllowedByScope, value: result.kind });
  checks.push({ name: `blocked_current_not_allowed:${result.input_text}`, pass: blockedNotAllowedByCurrent, value: result.current_scoring_action || "not-imported" });
  checks.push({ name: `generic_scope_requires_clarification:${result.input_text}`, pass: genericNotAllowedByScope, value: String(result.activity_scope_requires_clarification) });
  checks.push({ name: `generic_current_not_allowed:${result.input_text}`, pass: genericNotAllowedByCurrent, value: result.current_scoring_action || "not-imported" });
  checks.push({ name: `semantic_contamination_labeled:${result.input_text}`, pass: semanticContaminationIsLabeled, value: result.divergence_type });
  checks.push({ name: `software_web_ia_n8n_not_permitted:${result.input_text}`, pass: softwareNotPermitted, value: result.kind });
  checks.push({ name: `divergence_type_valid:${result.input_text}`, pass: divergenceAllowed, value: result.divergence_type });
}

for (const repoPath of PROTECTED_PATHS) {
  checks.push({
    name: `protected_path_not_modified:${repoPath}`,
    pass: gitDiffNameOnly(repoPath) === "",
    value: repoPath,
  });
}

const divergenceSummary = results.reduce((acc, result) => {
  acc[result.divergence_type] = (acc[result.divergence_type] || 0) + 1;
  return acc;
}, {});

const passed = checks.filter((check) => check.pass).length;
console.log("");
console.log("Divergencias");
for (const [type, count] of Object.entries(divergenceSummary).sort()) {
  console.log(` - ${type}: ${count}`);
}
console.log("");
console.log("Validaciones");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exitCode = 1;

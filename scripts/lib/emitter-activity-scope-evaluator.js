const POLICY = {
  ALLOW: "ALLOW_CANDIDATE",
  ASK: "ASK_CLARIFICATION",
  BLOCK: "BLOCK_OR_ACTIVITY_REVIEW",
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

function containsDigitalBlockedSignal(inputText) {
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(inputText);
  return termsMatched(normalizedText, tokens, BLOCKED_ALIASES.NO_SOFTWARE_APPS_WEB_SAAS_IA_N8N).length > 0;
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
  const genericPhraseMatched = GENERIC_PHRASES.some((phrase) => {
    const normalizedPhrase = normalizeText(phrase);
    return normalizedText === normalizedPhrase || normalizedText.includes(normalizedPhrase);
  });
  const specific = hasSpecificEquipment(normalizedText, tokens);
  if (genericPhraseMatched && !specific) return true;
  if (operationType === "DESCONOCIDO" && !normalizedText.includes("sistema cctv completo")) return true;
  if (!matchedCategories.length) return true;
  if (!specific && operationType !== "MIXTO") return true;
  return false;
}

function detectSemanticContaminationFlags(normalizedText, tokens) {
  const flags = [];
  const hasCamera = termsMatched(normalizedText, tokens, ["camara", "camaras"]).length > 0;
  const hasCctv = termsMatched(normalizedText, tokens, ["cctv", "videovigilancia"]).length > 0;
  const hasDvrNvr = termsMatched(normalizedText, tokens, ["dvr", "nvr", "grabador"]).length > 0;
  const hasPower = termsMatched(normalizedText, tokens, ["fuente", "fuente de poder", "power supply", "alimentacion", "adaptador", "transformador"]).length > 0;
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

function evaluateEmitterActivityScope(inputText, scope) {
  const normalizedText = normalizeText(inputText);
  const tokens = tokenize(inputText);
  const detected_operation_type = detectOperationType(normalizedText, tokens);
  const blocked_scope_matches = detectBlockedScope(scope, normalizedText, tokens);
  const matched_scope_categories = detectScopeCategories(scope, normalizedText, tokens);
  const detected_activity_ids = deriveActivityIds(scope, detected_operation_type, matched_scope_categories);
  const semantic_contamination_flags = detectSemanticContaminationFlags(normalizedText, tokens);
  const requires_clarification = requiresClarification(
    normalizedText,
    tokens,
    detected_operation_type,
    matched_scope_categories,
    blocked_scope_matches
  );
  const reasons = [];

  if (blocked_scope_matches.length) reasons.push("blocked_scope_match");
  if (requires_clarification) reasons.push("requires_clarification");
  if (matched_scope_categories.length) reasons.push(`matched_scope:${matched_scope_categories.map((item) => item.id).join(",")}`);
  if (detected_activity_ids.length) reasons.push(`activity_scope:${detected_activity_ids.join(",")}`);
  if (semantic_contamination_flags.length) reasons.push(`semantic_guards:${semantic_contamination_flags.join(",")}`);

  let offline_policy_result = POLICY.ASK;
  if (blocked_scope_matches.length) {
    offline_policy_result = POLICY.BLOCK;
  } else if (!requires_clarification && detected_activity_ids.length) {
    offline_policy_result = POLICY.ALLOW;
  }

  return {
    offline_policy_result,
    detected_activity_ids,
    detected_operation_type,
    matched_scope_categories,
    blocked_scope_matches,
    requires_clarification,
    semantic_contamination_flags,
    reasons,
  };
}

module.exports = {
  POLICY,
  normalizeText,
  tokenize,
  termsMatched,
  containsDigitalBlockedSignal,
  evaluateEmitterActivityScope,
};

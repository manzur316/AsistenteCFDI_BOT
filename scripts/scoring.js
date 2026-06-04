const DEFAULT_CATALOG = { concepts: [] };

const WORD_TOKEN_RE = /[a-z0-9]+/g;

const FAMILY_HINTS = {
  CCTV: [
    "cctv",
    "camara",
    "camaras",
    "cámara",
    "dvr",
    "nvr",
    "videovigilancia",
    "vigilancia",
    "hikvision",
    "ip",
  ],
  RED: [
    "router",
    "switch",
    "access point",
    "accesspoint",
    "punto de acceso",
    "red",
    "cable",
    "cableado",
    "cableado",
    "utp",
    "rj45",
    "wifi",
    "wi fi",
    "lan",
    "fibra",
    "canaleta",
    "canalizacion",
    "interconexión",
    "enlace",
  ],
  COMPUTO: [
    "computadora",
    "computo",
    "pc",
    "laptop",
    "formate",
    "disco",
    "disco duro",
    "ram",
    "memoria",
    "so",
    "sistema operativo",
    "driver",
  ],
  CONTROL_ACCESO: [
    "control de acceso",
    "zkteco",
    "accesspro",
    "tag",
    "tags",
    "lector",
    "biometrico",
    "chapa",
    "boton",
    "botón",
    "biometria",
    "tarjeta",
    "residente",
    "electromagnetica",
  ],
  BARRERA: [
    "barrera",
    "pluma",
    "vehicular",
    "acceso vehicular",
    "barrera vehicular",
  ],
};

const SALE_MARKERS = [
  "venta",
  "vendo",
  "vendio",
  "vendí",
  "vendi",
  "vendia",
  "suministro",
  "suministré",
  "suministre",
  "compre",
];

const SERVICE_MARKERS = [
  "revis",
  "diagnost",
  "mantenimiento",
  "configur",
  "ajust",
  "repar",
  "soporte",
  "formate",
];

const INSTALL_MARKERS = [
  "instal",
  "cableado",
  "canaleta",
  "canalización",
  "canalizacion",
];

const REPLACEMENT_MARKERS = [
  "cambi",
  "reemplaz",
  "sustit",
];

const POWER_SOURCE_MARKERS = [
  "fuente",
  "fuente de poder",
  "power supply",
  "alimentacion",
  "adaptador",
  "transformador",
];

const STORAGE_MARKERS = [
  "disco",
  "disco duro",
  "hdd",
  "ssd",
  "almacenamiento",
  "formateo",
  "grabacion",
  "grabación",
  "dvr disco",
  "nvr disco",
];

const POWER_PRODUCT_MARKERS = [
  "fuente",
  "fuente de poder",
  "fuente poder",
  "power supply",
  "alimentacion",
  "adaptador",
  "transformador",
];

const DVR_NVR_DISK_MARKERS = [
  "dvr",
  "nvr",
  "grabador",
  "disco",
  "disco duro",
  "grabacion",
  "grabación",
  "almacenamiento",
  "hdd",
  "ssd",
];

const RENTAL_BLOCK_MARKERS = [
  "renta",
  "rentar",
  "rente",
  "alquiler",
  "alquilar",
  "arrendamiento",
  "arrendar",
];

const AMBIGUOUS_MARKERS = [
  "sistema",
  "equipo",
  "caseta",
  "servicio tecnico",
  "servicio",
  "tecnico",
  "general",
  "falla",
  "revision",
];

function normalizeText(input) {
  const value = input === null || input === undefined ? "" : String(input);
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAnyMarker(text, markers) {
  const normalizedText = normalizeText(text);
  return markers.some((marker) => normalizedText.includes(normalizeText(marker)));
}

function tokenize(input) {
  return normalizeText(input).match(WORD_TOKEN_RE) || [];
}

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getConceptAction(concept) {
  return String(concept?.action_n8n || concept?.accion_n8n || "").toUpperCase();
}

function conceptScoringKeywords(concept) {
  return asArray(concept?.scoring?.match_keywords || concept?.keywords_match || [])
    .map(normalizeText)
    .filter(Boolean);
}

function conceptExclusionKeywords(concept) {
  return asArray(concept?.scoring?.exclude_keywords || concept?.keywords_excluir || [])
    .map(normalizeText)
    .filter(Boolean);
}

function conceptCategory(concept) {
  const subfamily = normalizeText(concept?.subfamily || "");
  const family = normalizeText(concept?.family || "");

  if (subfamily.includes("control de acceso") || subfamily.includes("control")) return "CONTROL_ACCESO";
  if (subfamily.includes("cctv") || subfamily.includes("videovigilancia") || subfamily.includes("vigilancia")) return "CCTV";
  if (subfamily.includes("red") || subfamily.includes("comunicacion")) return "RED";
  if (subfamily.includes("computo") || subfamily.includes("cómputo")) return "COMPUTO";
  if (subfamily.includes("vehicular") || subfamily.includes("barrera") || family.includes("acceso vehicular")) return "BARRERA";
  return "";
}

function normalizeConceptType(value) {
  const text = String(value || "").toLowerCase().trim();
  if (text.startsWith("prod")) return "PRODUCTO";
  if (text.startsWith("serv")) return "SERVICIO";
  if (text.startsWith("mix")) return "MIXTO";
  return text.toUpperCase() || "";
}

function termMatches(text, tokens, term) {
  const normalized = normalizeText(term);
  if (!normalized) return false;

  if (tokens.has(normalized)) return true;

  // Allow stem matches like "revis" -> "revision"/"revisé", "cambi" -> "cambio"/"cambié"
  if (normalized.includes(" ")) {
    const phraseRegex = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i");
    return phraseRegex.test(text);
  }

  if (normalized.length > 3) {
    for (const token of tokens) {
      if (token.startsWith(normalized)) return true;
      if (normalized.startsWith(token) && token.length >= 4 && token.startsWith(normalized.slice(0, token.length))) {
        return true;
      }
    }
    const stemRegex = new RegExp(`\\b${escapeRegExp(normalized)}[a-z0-9]*\\b`, "i");
    if (stemRegex.test(text)) return true;
  }

  return false;
}

function scoreTokenHits(text, tokens, terms) {
  let score = 0;
  for (const term of terms) {
    if (!term) continue;
    const normalized = normalizeText(term);
    if (!normalized) continue;
    if (normalized.includes(" ")) {
      const regex = new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i");
      if (regex.test(text)) score += 12;
      continue;
    }
    if (tokens.has(normalized)) {
      score += 12;
      continue;
    }
    for (const token of tokens) {
      if (token.startsWith(normalized)) {
        score += 10;
        break;
      }
    }
  }
  return score;
}

function extractContext(message) {
  const text = normalizeText(message);
  const tokens = new Set(tokenize(message));

  const familyHits = {
    CCTV: 0,
    RED: 0,
    COMPUTO: 0,
    CONTROL_ACCESO: 0,
    BARRERA: 0,
  };

  Object.keys(FAMILY_HINTS).forEach((family) => {
    for (const term of FAMILY_HINTS[family]) {
      if (termMatches(text, tokens, term)) {
        familyHits[family] += term.includes(" ") ? 16 : 14;
      }
    }
  });

  const hasSale = SALE_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasService = SERVICE_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasInstall = INSTALL_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasReplacement = REPLACEMENT_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasPowerSource = POWER_SOURCE_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasStorageMention = STORAGE_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasCctvMention =
    FAMILY_HINTS.CCTV.some((term) => termMatches(text, tokens, term));
  const hasExplicitDvrNvrStorageMention = DVR_NVR_DISK_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasPowerSaleCctv =
    hasSale &&
    hasPowerSource &&
    hasCctvMention &&
    !hasExplicitDvrNvrStorageMention;
  const hasAction = SERVICE_MARKERS.some((term) => termMatches(text, tokens, term)) ||
    INSTALL_MARKERS.some((term) => termMatches(text, tokens, term)) ||
    REPLACEMENT_MARKERS.some((term) => termMatches(text, tokens, term)) ||
    AMBIGUOUS_MARKERS.some((term) => termMatches(text, tokens, term) && term !== "servicio");

  const hasGeneric = AMBIGUOUS_MARKERS.some((term) => termMatches(text, tokens, term));
  const hasAnyFamily = Object.values(familyHits).some((score) => score > 0);
  const strongFamily = Object.entries(familyHits)
    .map(([family, score]) => ({ family, score }))
    .sort((a, b) => b.score - a.score)
    .find((it) => it.score > 0) || { family: "", score: 0 };

  const operationType = hasSale
    ? "PRODUCTO"
    : hasInstall
      ? "SERVICIO_INSTALACION"
      : hasReplacement
        ? "SERVICIO"
        : hasService
          ? "SERVICIO"
          : "DESCONOCIDO";

  return {
    text,
    tokens,
    familyHits,
    hasAnyFamily,
    strongFamily,
    hasSale,
    hasService,
    hasInstall,
    hasReplacement,
    hasPowerSource,
    hasExplicitDvrNvrStorageMention,
    hasPowerSaleCctv,
    hasStorageMention,
    hasCctvMention,
    hasAction,
    hasGeneric,
    operationType,
  };
}

function scoreConcept(message, concept, _catalog = DEFAULT_CATALOG) {
  const context = extractContext(message);
  const text = context.text;

  const includeKeywords = conceptScoringKeywords(concept);
  const excludeKeywords = conceptExclusionKeywords(concept);
  const conceptHasStorageSignal = includeKeywords.some((term) => STORAGE_MARKERS.some((marker) => term === normalizeText(marker)));
  const conceptLabel = normalizeText(concept?.invoice_concept || concept?.concepto_factura_recomendado || concept?.concepto_factura || "");
  const conceptLabelHasPowerSignal = includesAnyMarker(conceptLabel, POWER_PRODUCT_MARKERS);
  const conceptHasPowerSignal = conceptLabelHasPowerSignal || includesAnyMarker(includeKeywords.join(" "), POWER_PRODUCT_MARKERS);
  const conceptLabelHasDvrNvrDiskSignal = includesAnyMarker(conceptLabel, DVR_NVR_DISK_MARKERS);
  const conceptHasDvrNvrDiskSignal =
    conceptLabelHasDvrNvrDiskSignal ||
    includeKeywords.some((term) => {
      const normalized = normalizeText(term);
      return includesAnyMarker(normalized, DVR_NVR_DISK_MARKERS);
    });
  const hasPowerStorageRestriction = context.hasPowerSource && context.hasCctvMention && !context.hasStorageMention;
  const hasDvrNvrLabelWithoutExplicitMention =
    context.hasCctvMention &&
    !context.hasExplicitDvrNvrStorageMention &&
    conceptLabelHasDvrNvrDiskSignal;
  const hasPowerLabelWithoutPowerMention =
    context.hasCctvMention &&
    !context.hasPowerSource &&
    conceptLabelHasPowerSignal;

  const matchedInclude = [];
  const matchedExclude = [];

  for (const key of includeKeywords) {
    if (termMatches(text, context.tokens, key)) {
      matchedInclude.push(key);
    }
  }

  for (const key of excludeKeywords) {
    if (termMatches(text, context.tokens, key)) {
      matchedExclude.push(key);
    }
  }

  const action = getConceptAction(concept);
  const category = conceptCategory(concept);
  const conceptType = normalizeConceptType(concept?.item_type);
  const baseScore = Number(concept?.scoring?.base_score || concept?.score_base || 0) || 0;
  const fiscalFit = concept?.fiscal_fit || {};
  const actividadOk = String(fiscalFit.current_activity_ok || concept?.actividad_actual_ok || "").toLowerCase() !== "false";
  const resicoOk = String(fiscalFit.resico_626_ok || concept?.resico_626_ok || "").toLowerCase() !== "false";

  let confidence = Math.round(baseScore * 0.6);
  const familyScore = context.familyHits[category] || 0;
  confidence += Math.min(24, matchedInclude.length * 8);
  confidence += Math.min(24, Math.round(familyScore));
  confidence += context.strongFamily.family && context.strongFamily.family === category ? 10 : 0;

  if (context.hasAnyFamily && category && context.familyHits[category] === 0) {
    confidence -= 14;
  }
  if (context.hasAnyFamily && category === context.strongFamily.family) {
    confidence += 8;
  }

  if (context.operationType === "PRODUCTO") {
    confidence += conceptType === "PRODUCTO" ? 26 : conceptType === "MIXTO" ? 8 : -44;
  } else if (context.operationType === "SERVICIO_INSTALACION") {
    confidence += conceptType === "SERVICIO" ? 20 : conceptType === "MIXTO" ? 6 : -20;
  } else if (context.operationType === "SERVICIO") {
    confidence += conceptType === "SERVICIO" ? 16 : conceptType === "MIXTO" ? 4 : -16;
    if (context.hasReplacement) confidence += conceptType === "SERVICIO" ? 4 : -4;
  }

  if (context.hasAction) confidence += 6;
  if (context.operationType === "PRODUCTO") confidence += 2;
  if (action === "BLOQUEAR") confidence = Math.min(confidence, 55);
  if (hasPowerStorageRestriction && conceptHasStorageSignal) {
    confidence -= 55;
    if (!matchedExclude.includes("fuente_contexto_no_aplica_dispositivo")) {
      matchedExclude.push("fuente_contexto_no_aplica_dispositivo");
    }
  }
  if (hasDvrNvrLabelWithoutExplicitMention) {
    confidence -= 70;
    if (!matchedExclude.includes("dvr_nvr_requiere_mencion_explicita")) {
      matchedExclude.push("dvr_nvr_requiere_mencion_explicita");
    }
  }
  if (hasPowerLabelWithoutPowerMention) {
    confidence -= 70;
    if (!matchedExclude.includes("fuente_requiere_mencion_explicita")) {
      matchedExclude.push("fuente_requiere_mencion_explicita");
    }
  }

  if (!context.hasAnyFamily && context.hasSale) {
    confidence += 6;
  }

  if (context.hasPowerSaleCctv) {
    if (conceptType === "PRODUCTO" && conceptHasPowerSignal) {
      confidence += 28;
    } else if (conceptType === "PRODUCTO") {
      confidence -= 18;
    }
    if (conceptHasDvrNvrDiskSignal) {
      confidence -= 60;
    }
  }

  if (matchedExclude.length > 0) confidence -= Math.min(24, matchedExclude.length * 8);
  if (!actividadOk) confidence = Math.min(confidence, 45);
  if (!resicoOk) confidence = Math.min(confidence, 35);

  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const hasEvidence = (context.hasAnyFamily && context.hasAction) || (context.hasSale && context.hasAnyFamily) || (context.hasSale && matchedInclude.length > 0);
  const reasons = [];
  if (context.hasSale) reasons.push("venta_detectada");
  if (context.hasAction) reasons.push("accion_detectada");
  if (context.hasInstall) reasons.push("operacion:SERVICIO_INSTALACION");
  if (context.hasReplacement) reasons.push("operacion:SERVICIO");
  if (context.hasAnyFamily) reasons.push(`familia_detectada:${category || context.strongFamily.family || "desconocida"}`);
  if (matchedInclude.length) reasons.push(`match:${matchedInclude.slice(0, 4).join("|")}`);
  if (matchedExclude.length) reasons.push(`exclude:${matchedExclude.join("|")}`);
  if (familyScore > 0) reasons.push(`familia_score:${familyScore}`);

  return {
    concept,
    id: concept?.id || null,
    score: confidence,
    confidence,
    action,
    family: category,
    conceptType,
    hasFamilyHint: context.hasAnyFamily,
    hasEvidence,
    matched_include: matchedInclude,
    matched_exclude: matchedExclude,
    reasons,
  };
}

function detectBlockedTerms(message, catalog) {
  const concepts = Array.isArray(catalog?.concepts) ? catalog.concepts : [];
  const context = extractContext(message);
  const rentalMatches = RENTAL_BLOCK_MARKERS
    .map(normalizeText)
    .filter((term) => termMatches(context.text, context.tokens, term));

  const scoredBlocked = concepts
    .filter((concept) => getConceptAction(concept) === "BLOQUEAR")
    .map((concept) => scoreConcept(message, concept, catalog))
    .filter((item) => item.matched_include.length > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const hardTerms = scoredBlocked.flatMap((item) => item.matched_include || []);
  const syntheticRentalBlock = rentalMatches.length > 0
    ? [{
        id: "BLOCK-RENTAL",
        action: "BLOQUEAR",
        confidence: 100,
        score: 100,
        concept_id: "BLOCK-RENTAL",
        concept_name: "NO FACTURAR CON ACTIVIDADES ACTUALES: RENTA, ALQUILER O ARRENDAMIENTO DE EQUIPO",
      }]
    : [];
  const matchedBlockConcepts = [
    ...syntheticRentalBlock,
    ...scoredBlocked.slice(0, 5).map((item) => ({
      id: item.id,
      action: item.action,
      confidence: item.confidence,
      score: item.score,
      concept_id: item.id,
      concept_name: item.concept?.invoice_concept || null,
    })),
  ].slice(0, 5);

  return {
    is_blocked: scoredBlocked.length > 0 || rentalMatches.length > 0,
    is_hard_block: scoredBlocked.length > 0 || rentalMatches.length > 0,
    hard_terms: [...rentalMatches, ...hardTerms].slice(0, 8),
    matched_block_concepts: matchedBlockConcepts,
    selected_block: scoredBlocked[0]?.concept || null,
    blocked_candidates: scoredBlocked,
    context,
  };
}

function sanitizeTop3(scoredEntries, options = {}) {
  const nonConfirmable = options.nonConfirmable || false;
  return scoredEntries
    .sort((a, b) => (b.confidence - a.confidence) || (b.score - a.score) || (b.matched_include.length - a.matched_include.length))
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      accion_n8n: item.action,
      score: item.score,
      confidence: item.confidence,
      family: item.family || "N/A",
      concept_type: item.conceptType || normalizeConceptType(item.concept?.item_type),
      concepto_sugerido: item.concept?.invoice_concept || item.concept?.concepto_factura_recomendado || item.concept?.concepto_factura || null,
      concepto_factura: item.concept?.invoice_concept || item.concept?.concepto_factura_recomendado || item.concept?.concepto_factura || null,
      clave_prod_serv: item.concept?.sat?.product_service_key || item.concept?.clave_prod_serv || null,
      clave_unidad: item.concept?.sat?.unit_key || item.concept?.clave_unidad || null,
      unidad: item.concept?.sat?.unit || null,
      motivo: item.reasons.join("; "),
      candidatos_no_confirmados: nonConfirmable,
      estado: nonConfirmable ? "candidatos_no_confirmados" : "recomendados",
    }));
}

function buildReason(action, context, selected, blockInfo, ambiguous) {
  const base = [];
  if (blockInfo.is_blocked) base.push("bloqueo_base_aplicable");
  if (selected) {
    if (action === "SUGERIR") base.push("confianza_alta");
    if (selected.reasons?.length) base.push(...selected.reasons);
  }
  if (ambiguous) base.push("mensaje_ambiguo: requiere_detalle_de_equipos");
  return base.length ? base.join("; ") : "sin_razon_clara";
}

function activityScopeShadowEnabled() {
  return typeof process !== "undefined" &&
    process.env &&
    String(process.env.CFDI_ACTIVITY_SCOPE_SHADOW || "").trim() === "1";
}

function attachShadowActivityScope(result, message) {
  if (!activityScopeShadowEnabled()) return result;
  try {
    const {
      buildShadowActivityScopeReport,
      writeShadowActivityScopeLog,
    } = require("./lib/emitter-activity-shadow-logger");
    const shadowReport = buildShadowActivityScopeReport(message, result, { enabled: true });
    writeShadowActivityScopeLog(shadowReport);
    return {
      ...result,
      shadow_activity_scope: shadowReport,
    };
  } catch (error) {
    return {
      ...result,
      shadow_activity_scope: {
        enabled: true,
        non_productive: true,
        current_action: result?.accion_n8n || null,
        current_concept_id: result?.concepto_id || result?.matched_id || null,
        activity_scope_result: null,
        detected_activity_ids: [],
        requires_clarification: null,
        blocked_scope_matches: [],
        semantic_flags: [],
        divergence_type: "NEEDS_POLICY_REVIEW",
        reasons: [`shadow_error:${error.message}`],
      },
    };
  }
}

function classifyMessage(message, catalog = DEFAULT_CATALOG) {
  const concepts = Array.isArray(catalog?.concepts) ? catalog.concepts : [];
  const context = extractContext(message);
  const blockInfo = detectBlockedTerms(message, catalog);

  const scored = concepts
    .map((concept) => scoreConcept(message, concept, catalog))
    .filter((item) => item.confidence > 0);

  const candidatesForSuggestion = scored.filter((item) => item.action === "SUGERIR");
  const sorted = candidatesForSuggestion.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.matched_include.length - a.matched_include.length;
  });
  const sortedRaw = scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.matched_include.length - a.matched_include.length;
  });

  const topScored = sorted[0] || null;
  const topScoredRaw = sortedRaw[0] || null;

  const onlyGenericWithoutSpecificContext = context.hasGeneric && !context.hasAnyFamily && !context.hasSale;
  const genericEvidenceWeak = context.hasAction && !context.hasAnyFamily && !context.hasSale;
  const ambiguous =
    onlyGenericWithoutSpecificContext ||
    !topScored ||
    genericEvidenceWeak ||
    topScored.confidence < 50 ||
    !topScored.hasEvidence;

  let action = "PEDIR_ACLARACION";
  if (blockInfo.is_hard_block) {
    action = "BLOQUEAR";
    const blockCandidate = (blockInfo.matched_block_concepts || [])[0];
    if (blockCandidate && blockCandidate.id) {
      const blockConcept = concepts.find((item) => item.id === blockCandidate.id);
      if (blockConcept && getConceptAction(blockConcept) === "AGREGAR_ACTIVIDAD") action = "AGREGAR_ACTIVIDAD";
    }
  } else if (topScored && topScored.confidence >= 80 && !ambiguous && topScored.action === "SUGERIR") {
    action = "SUGERIR";
  }

  const isBillable = action === "SUGERIR";
  const selected = isBillable ? topScored : null;
  const concept = selected?.concept || null;
  const sat = concept?.sat || {};
  const fiscalFit = concept?.fiscal_fit || {};
  const selectedFamily = selected ? selected.family : null;
  const conceptType = selected ? selected.conceptType : null;

  const result = {
    accion_n8n: action,
    matched_id: isBillable ? selected?.id || null : null,
    concepto_id: isBillable ? selected?.id || null : null,
    concept: isBillable ? concept : null,
    concepto_sugerido: isBillable
      ? concept?.invoice_concept || concept?.concepto_factura_recomendado || concept?.concepto_factura || null
      : null,
    concepto_factura: isBillable
      ? concept?.invoice_concept || concept?.concepto_factura_recomendado || concept?.concepto_factura || null
      : null,
    clave_prod_serv: isBillable ? (sat.product_service_key || concept?.clave_prod_serv || null) : null,
    clave_unidad: isBillable ? (sat.unit_key || concept?.clave_unidad || null) : null,
    unidad: isBillable ? (sat.unit || null) : null,
    family: selectedFamily || null,
    concept_type: conceptType || null,
    operation_type: context.operationType,
    iva: isBillable ? (sat.suggested_iva || null) : null,
    actividad_relacionada: isBillable
      ? (Array.isArray(fiscalFit.supported_activity_ids) ? fiscalFit.supported_activity_ids : null)
      : null,
    objeto_imp: isBillable ? (sat.tax_object || sat.objeto_impuesto || null) : "referencia",
    requires_revision_humana: true,
    requiere_revision_humana: true,
    confidence: isBillable ? topScored?.confidence || 0 : topScoredRaw?.confidence || 0,
    top_3: sanitizeTop3(isBillable ? sorted : sortedRaw, { nonConfirmable: !isBillable }),
    reason: buildReason(action, context, topScored, blockInfo, ambiguous),
    blocked_terms: blockInfo,
  };

  return attachShadowActivityScope(result, message);
}

function formatTelegramMessage(result) {
  const lines = [];
  lines.push(`Accion: ${result.accion_n8n}`);
  lines.push(`Mensaje sugerido: ${result.concepto_sugerido || "Sin propuesta"}`);
  lines.push(`Clave SAT: ${result.clave_prod_serv || "Sin clave"}`);
  lines.push(`Clave unidad: ${result.clave_unidad || "Sin clave"}`);
  lines.push(`Unidad: ${result.unidad || "Sin unidad"}`);
  lines.push(`Confianza: ${Math.round(result.confidence || 0)}%`);
  lines.push(`Operacion: ${result.operation_type || "DESCONOCIDO"}`);
  lines.push(`Requiere revision humana: ${result.requires_revision_humana ? "Si" : "No"}`);
  if (result.accion_n8n === "PEDIR_ACLARACION") {
    lines.push("No captures esto todavía. Falta especificar el equipo/sistema atendido.");
  }
  lines.push(`Motivo: ${result.reason || ""}`);
  const top3 = (result.top_3 || [])
    .map((item, index) =>
      `${index + 1}. ${item.id} (${item.accion_n8n}) score=${item.score} conf=${item.confidence} ${item.candidatos_no_confirmados ? "[candidatos_no_confirmados]" : ""}`)
    .join(" | ");
  lines.push(`Top3: ${top3 || "Sin candidatos"}`);
  return lines.join("\n");
}

function buildN8nResponse(classificationResult, messageOriginal = "") {
  const result = classificationResult || {};
  const action = result.accion_n8n || "PEDIR_ACLARACION";
  const isSugerir = action === "SUGERIR";
  const isBlock = action === "BLOQUEAR" || action === "AGREGAR_ACTIVIDAD";

  const top3 = Array.isArray(result.top_3) ? [...result.top_3] : [];
  const candidateTop = top3.length > 0 ? top3[0].confidence || top3[0].score || 0 : 0;

  const conceptIsReady = isSugerir;
  const concept = conceptIsReady
    ? {
        id: result.concepto_id || result.matched_id || null,
        concepto_factura: result.concepto_factura || result.concepto_sugerido || null,
        clave_prod_serv: result.clave_prod_serv || null,
        clave_unidad: result.clave_unidad || null,
        unidad: result.unidad || null,
        familia: result.family || null,
        tipo: result.concept_type || null,
        operacion: result.operation_type || null,
      }
    : {
        id: null,
        concepto_factura: null,
        clave_prod_serv: null,
        clave_unidad: null,
        unidad: null,
        familia: null,
        tipo: null,
        operacion: null,
      };

  const ready = isSugerir;
  const safetyLevel = isSugerir
    ? "OK"
    : isBlock
      ? "BLOCKED"
      : "NEEDS_CLARIFICATION";

  let telegramMessage = "";
  if (isSugerir) {
    const reviewWarning = "Requiere revisión humana antes de timbrar.";
    telegramMessage = [
      `Concepto sugerido: ${concept.concepto_factura}`,
      `Clave SAT: ${concept.clave_prod_serv}`,
      `Unidad: ${concept.unidad}`,
      `Familia: ${concept.familia}`,
      `Tipo: ${concept.tipo}`,
      `Operación: ${concept.operacion || "DESCONOCIDO"}`,
      reviewWarning,
    ].join("\n");
  } else if (action === "PEDIR_ACLARACION") {
    telegramMessage = [
      "No captures esto todavía. Falta especificar el equipo/sistema atendido.",
      "¿Qué equipo o sistema fue atendido? Ejemplo: CCTV, control de acceso, red, computadora, barrera.",
    ].join("\n");
  } else {
    const blockReason =
      result.blocked_terms?.selected_block?.invoice_concept ||
      "No debe facturarse con la actividad actual. Registra esta acción en otro flujo o espera confirmación de actividad.";
    telegramMessage = [
      "No está listo para facturar con la actividad actual.",
      blockReason,
      "Requiere revisión humana antes de emitir CFDI.",
    ].join("\n");
  }

  return {
    action,
    ready_to_copy: ready,
    requires_human_review: true,
    message_original: messageOriginal || "",
    decision_confidence: isSugerir ? Math.round(result.confidence || 0) : Math.round(result.confidence || 0),
    candidate_confidence: Math.round(candidateTop || 0),
    safety_level: safetyLevel,
    concept,
    top_3: isSugerir ? top3 : isBlock ? [] : top3,
    telegram_message: telegramMessage,
    json_debug: {
      score: result.confidence ?? null,
      family: concept.familia,
      type: concept.tipo,
      operation: concept.operacion,
      reason: result.reason || null,
      top3_length: top3.length,
      action_flow: isBlock ? "guard_rail" : isSugerir ? "invoice_candidate" : "clarify_required",
      blocked_terms: result.blocked_terms || null,
    },
  };
}

module.exports = {
  normalizeText,
  tokenize,
  detectBlockedTerms,
  scoreConcept,
  classifyMessage,
  formatTelegramMessage,
  buildN8nResponse,
};

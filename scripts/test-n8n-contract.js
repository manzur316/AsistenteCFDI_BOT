const fs = require("fs");
const path = require("path");
const scoring = require("./scoring.js");

const catalogPath = path.resolve(__dirname, "..", "data", "concepts.normalized.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const PEDIR_MSG = "No captures esto todavía. Falta especificar el equipo/sistema atendido.";
const PEDIR_Q = "¿Qué equipo o sistema fue atendido? Ejemplo: CCTV, control de acceso, red, computadora, barrera.";
const BLOCK_MSG_HINT = "No está listo para facturar con la actividad actual";

const cases = [
  {
    message: "revisé un sistema de control de acceso zkteco que no leía tags",
    expected: ["SUGERIR"],
  },
  {
    message: "mantenimiento a cámaras de vigilancia y revisión de dvr",
    expected: ["SUGERIR"],
  },
  {
    message: "configuré router, switch y punto de acceso",
    expected: ["SUGERIR"],
  },
  {
    message: "servicio técnico general",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "desarrollé una app móvil",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
  },
  {
    message: "venta de switch de red",
    expected: ["SUGERIR"],
  },
  {
    message: "venta de cámara de vigilancia",
    expected: ["SUGERIR"],
  },
  {
    message: "cambié fuente de poder de cámara",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
  },
  {
    message: "revisé fuente de poder de cámaras",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
  },
  {
    message: "venta de fuente de poder para cámara",
    expected: ["SUGERIR"],
    expected_family: ["CCTV"],
    expected_type: ["PRODUCTO"],
    expected_concept_prefix: ["PROD-CCTV-007"],
    forbidden_concept_prefix: ["PROD-CCTV-002"],
    forbidden_concept_contains: ["DVR", "NVR", "GRABADOR", "DISCO", "ALMACENAMIENTO"],
  },
  {
    message: "cambié disco duro de dvr",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
  },
  {
    message: "fui a revisar equipo en caseta",
    expected: ["PEDIR_ACLARACION"],
  },
];

function toList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function hasExpectedPrefix(value, allowedList) {
  if (!value || !Array.isArray(allowedList) || allowedList.length === 0) return false;
  return allowedList.some((prefix) => {
    const normalized = String(prefix || "").trim();
    if (!normalized) return false;
    return String(value).startsWith(normalized);
  });
}

function hasForbiddenPrefix(value, forbiddenList) {
  if (!value || !Array.isArray(forbiddenList) || forbiddenList.length === 0) return false;
  return forbiddenList.some((prefix) => {
    const normalized = String(prefix || "").trim();
    if (!normalized) return false;
    return String(value).startsWith(normalized);
  });
}

function hasForbiddenContains(value, forbiddenList) {
  if (!value || !Array.isArray(forbiddenList) || forbiddenList.length === 0) return false;
  const selected = String(value).toLowerCase();
  return forbiddenList.some((fragment) => {
    const normalized = String(fragment || "").trim().toLowerCase();
    return normalized && selected.includes(normalized);
  });
}

function evaluateCase(testCase) {
  const raw = scoring.classifyMessage(testCase.message, catalog);
  const result = scoring.buildN8nResponse(raw, testCase.message);
  const checks = [];

  const expectedActions = toList(testCase.expected);
  const actionOk = expectedActions.includes(result.action);
  checks.push({ name: "action", pass: actionOk, value: result.action });

  const isSugerir = result.action === "SUGERIR";
  const isPedir = result.action === "PEDIR_ACLARACION";
  const isBlocked = result.action === "BLOQUEAR" || result.action === "AGREGAR_ACTIVIDAD";

  const readyToCopyOk = result.ready_to_copy === isSugerir;
  checks.push({ name: "ready_to_copy", pass: readyToCopyOk, value: result.ready_to_copy });

  const humanReviewOk = result.requires_human_review === true;
  checks.push({ name: "human_review", pass: humanReviewOk, value: result.requires_human_review });

  const telegramOk = typeof result.telegram_message === "string" && result.telegram_message.trim().length >= 20;
  checks.push({ name: "telegram_message", pass: telegramOk, value: telegramOk });

  const concept = result.concept || {};
  const conceptId = concept.id || "";
  const conceptName = concept.concepto_factura || "";
  const conceptFields = [
    "id",
    "concepto_factura",
    "clave_prod_serv",
    "clave_unidad",
    "unidad",
    "familia",
    "tipo",
    "operacion",
  ];

  let conceptOk = true;
  if (isSugerir) {
    conceptOk = conceptFields.every((field) => {
      const value = concept[field];
      return value !== null && value !== undefined && value !== "" && value !== "N/A";
    });
  } else {
    conceptOk = conceptFields.every((field) => concept[field] === null);
  }
  checks.push({ name: "concept", pass: conceptOk, value: JSON.stringify(concept) });

  const confDecisionOk =
    Number.isFinite(result.decision_confidence) &&
    Number.isFinite(result.candidate_confidence) &&
    result.decision_confidence >= 0 &&
    result.candidate_confidence >= 0;
  checks.push({ name: "conf_values", pass: confDecisionOk, value: `decision=${result.decision_confidence}, candidate=${result.candidate_confidence}` });

  if (isSugerir) {
    checks.push({
      name: "sugerir_claves",
      pass: result.decision_confidence >= 80,
      value: result.decision_confidence,
    });
    checks.push({
      name: "concepto_listo_para_facturar",
      pass: !!(result.concept?.clave_prod_serv && result.concept?.clave_unidad),
      value: `${result.concept?.clave_prod_serv || ""}/${result.concept?.clave_unidad || ""}`,
    });
    const expectedFamilies = toList(testCase.expected_family);
    const expectedTypes = toList(testCase.expected_type);
    const expectedPrefixes = toList(testCase.expected_concept_prefix);
    const forbiddenPrefixes = toList(testCase.forbidden_concept_prefix);
    const forbiddenContains = toList(testCase.forbidden_concept_contains);

    checks.push({
      name: "concept_family",
      pass: expectedFamilies.length === 0 || expectedFamilies.includes(concept.familia || ""),
      value: concept.familia || "",
    });
    checks.push({
      name: "concept_type",
      pass:
        expectedTypes.length === 0 ||
        expectedTypes.includes(concept.tipo || "") ||
        expectedTypes.includes(concept.operacion || ""),
      value: `${concept.tipo || ""}/${concept.operacion || ""}`,
    });
    checks.push({
      name: "concept_prefix",
      pass: expectedPrefixes.length === 0 || hasExpectedPrefix(conceptId, expectedPrefixes),
      value: conceptId,
    });
    checks.push({
      name: "forbidden_concept_prefix",
      pass:
        forbiddenPrefixes.length === 0 ||
        (!hasForbiddenPrefix(conceptId, forbiddenPrefixes) && !hasForbiddenPrefix(conceptName, forbiddenPrefixes)),
      value: conceptId,
    });
    checks.push({
      name: "forbidden_concept_contains",
      pass:
        forbiddenContains.length === 0 ||
        (!hasForbiddenContains(conceptId, forbiddenContains) && !hasForbiddenContains(conceptName, forbiddenContains)),
      value: `${conceptId}:${conceptName}`,
    });
  } else if (isPedir) {
    checks.push({
      name: "clarity_msg",
      pass: !!result.telegram_message && result.telegram_message.includes(PEDIR_MSG),
      value: result.telegram_message.includes(PEDIR_MSG),
    });
    checks.push({
      name: "pedir_question",
      pass: !!result.telegram_message && result.telegram_message.includes(PEDIR_Q),
      value: result.telegram_message.includes(PEDIR_Q),
    });

    const top3Exists = Array.isArray(result.top_3) && result.top_3.length > 0;
    const top3NoConfirm = top3Exists && result.top_3.every((item) => item && item.candidatos_no_confirmados === true);
    checks.push({
      name: "top3_candidatos_no_confirmados",
      pass: top3Exists && top3NoConfirm,
      value: top3Exists ? `${result.top_3.length}` : "0",
    });
  } else if (isBlocked) {
    checks.push({
      name: "blocked_msg",
      pass:
        !!result.telegram_message &&
        (result.telegram_message.includes(BLOCK_MSG_HINT) || result.telegram_message.includes("No se debe facturar")),
      value: result.telegram_message,
    });
    checks.push({
      name: "top3_no_facturar",
      pass: Array.isArray(result.top_3) && (result.top_3.length === 0 || result.top_3.every((item) => item && item.candidatos_no_confirmados === true)),
      value: Array.isArray(result.top_3) ? `${result.top_3.length}` : "no-array",
    });
  }

  const allPass = checks.every((check) => check.pass);
  return { result, checks, pass: allPass, message: testCase.message };
}

function printCase(output) {
  console.log(`Mensaje: ${output.message}`);
  console.log(`Accion: ${output.result.action}`);
  console.log(`Decision confidence: ${output.result.decision_confidence}`);
  console.log(`Candidate confidence: ${output.result.candidate_confidence}`);
  console.log(`Ready to copy: ${output.result.ready_to_copy}`);
  console.log(`Concept: ${JSON.stringify(output.result.concept)}`);
  console.log(`Top_3: ${JSON.stringify(output.result.top_3)}`);
  console.log(`Telegram: ${output.result.telegram_message}`);
  for (const check of output.checks) {
    console.log(`  - ${check.name}: ${check.pass ? "PASS" : "FAIL"} (${check.value})`);
  }
  console.log(`Resultado: ${output.pass ? "PASS" : "FAIL"}`);
}

function main() {
  console.log(`Output de contrato n8n. Archivo de catálogo: ${catalogPath}`);
  console.log(`Total pruebas: ${cases.length}`);
  console.log("");

  let passCount = 0;
  const failed = [];

  for (const testCase of cases) {
    const output = evaluateCase(testCase);
    if (output.pass) {
      passCount += 1;
    } else {
      failed.push(output);
    }
    printCase(output);
    console.log("-----");
  }

  console.log(`Resumen: ${passCount}/${cases.length} PASS`);
  if (failed.length > 0) {
    console.log("");
    console.log("Casos fallidos:");
    for (const fail of failed) {
      const failedChecks = fail.checks.filter((item) => !item.pass).map((item) => item.name).join(", ");
      console.log(`- ${fail.message}`);
      console.log(`  Fallas: ${failedChecks || "n/a"}`);
    }
  }
}

main();

const fs = require("fs");
const path = require("path");
const scoring = require("./scoring.js");

const catalogPath = path.resolve(__dirname, "..", "data", "concepts.normalized.json");
const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));

const cases = [
  {
    message: "revisé un sistema de control de acceso zkteco que no leía tags",
    expected: ["SUGERIR"],
    expected_family: ["CONTROL_ACCESO"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "mantenimiento a cámaras de vigilancia y revisión de dvr",
    expected: ["SUGERIR"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "configuré router, switch y punto de acceso",
    expected: ["SUGERIR"],
    expected_family: ["RED"],
    expected_type: ["SERVICIO"],
    forbidden_concept_prefix: ["PROD-"],
  },
  {
    message: "ajusté barrera vehicular que no subía bien",
    expected: ["SUGERIR"],
    expected_family: ["BARRERA"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "formateo y diagnóstico de computadora",
    expected: ["SUGERIR"],
    expected_family: ["COMPUTO"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "instalación de chapa magnética y botón de salida",
    expected: ["SUGERIR"],
    expected_family: ["CONTROL_ACCESO"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "venta de switch de red",
    expected: ["SUGERIR"],
    expected_family: ["RED"],
    expected_type: ["PRODUCTO"],
    expected_concept_prefix: ["PROD-RED-"],
  },
  {
    message: "venta de computadora y accesorios",
    expected: ["SUGERIR"],
    expected_family: ["COMPUTO"],
    expected_type: ["PRODUCTO"],
    expected_concept_prefix: ["PROD-PC-"],
    forbidden_family: ["CONTROL_ACCESO"],
    forbidden_concept_prefix: ["PROD-AC-"],
  },
  {
    message: "revisé un sistema que fallaba",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "servicio técnico general",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "fui a revisar equipo en caseta",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "desarrollé una app móvil",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    expectBlockedPrimary: true,
  },
  {
    message: "hice una automatización en n8n",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    expectBlockedPrimary: true,
  },
  {
    message: "configuré un agente de inteligencia artificial",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    expectBlockedPrimary: true,
  },
  {
    message: "creé una página web",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    expectBlockedPrimary: true,
  },
  {
    message: "desarrollé software a medida",
    expected: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    expectBlockedPrimary: true,
  },
  {
    message: "revisé cámaras hikvision sin imagen",
    expected: ["SUGERIR"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO"],
    forbidden_concept_prefix: ["PROD-CCTV-"],
  },
  {
    message: "cambié fuente de poder de cámara",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO", "MIXTO"],
    forbidden_concept_prefix: ["SVC-CCTV-008"],
  },
  {
    message: "revisé fuente de poder de cámaras",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO", "MIXTO"],
    forbidden_concept_prefix: ["SVC-CCTV-008"],
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
    message: "configuré nvr y cámaras ip",
    expected: ["SUGERIR"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "revisé access point ruijie",
    expected: ["SUGERIR"],
    expected_family: ["RED"],
    expected_type: ["SERVICIO"],
    forbidden_concept_prefix: ["PROD-RED-"],
  },
  {
    message: "instalé cable de red para cámaras",
    expected: ["SUGERIR"],
    expected_family: ["RED", "CCTV"],
    expected_type: ["SERVICIO_INSTALACION", "SERVICIO"],
    expected_concept_prefix: ["SVC-RED-", "SVC-RED","MIX-"],
    forbidden_concept_prefix: ["SVC-CCTV-001", "SVC-CCTV-006"],
  },
  {
    message: "cambié disco duro de dvr",
    expected: ["SUGERIR", "PEDIR_ACLARACION"],
    expected_family: ["CCTV"],
    expected_type: ["SERVICIO", "MIXTO"],
    forbidden_concept_prefix: ["PROD-CCTV-005", "PROD-"],
  },
  {
    message: "revisé pluma que se quedaba abajo",
    expected: ["SUGERIR"],
    expected_family: ["BARRERA"],
    expected_type: ["SERVICIO"],
  },
  {
    message: "venta de router",
    expected: ["SUGERIR"],
    expected_family: ["RED"],
    expected_type: ["PRODUCTO"],
    expected_concept_prefix: ["PROD-RED-"],
  },
  {
    message: "venta de cámara de vigilancia",
    expected: ["SUGERIR"],
    expected_family: ["CCTV"],
    expected_type: ["PRODUCTO"],
    expected_concept_prefix: ["PROD-CCTV-"],
  },
  {
    message: "revisión general en privada",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "falla en caseta",
    expected: ["PEDIR_ACLARACION"],
  },
  {
    message: "mantenimiento general",
    expected: ["PEDIR_ACLARACION"],
  },
];

function toList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function normalizeResultValue(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function hasPrimaryFacturable(value) {
  return value !== null && value !== undefined && String(value).trim() !== "" && String(value).trim().toUpperCase() !== "N/A";
}

function hasForbiddenPrefix(value, forbiddenList) {
  if (!value || !Array.isArray(forbiddenList) || forbiddenList.length === 0) return false;
  return forbiddenList.some((prefix) => {
    const normalized = String(prefix || "").trim();
    if (!normalized) return false;
    return String(value).startsWith(normalized);
  });
}

function hasExpectedPrefix(value, allowedList) {
  if (!value || !Array.isArray(allowedList) || allowedList.length === 0) return false;
  return allowedList.some((prefix) => {
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
  const result = scoring.classifyMessage(testCase.message, catalog);
  const action = result.accion_n8n || "";
  const isBlocked = action === "BLOQUEAR" || action === "AGREGAR_ACTIVIDAD";
  const isPedir = action === "PEDIR_ACLARACION";
  const isSugerir = action === "SUGERIR";
  const selectedId = result.matched_id || null;
  const selectedFamily = normalizeResultValue(result.family) || "";
  const selectedType = normalizeResultValue(result.concept_type) || "";
  const selectedOpType = normalizeResultValue(result.operation_type) || "";

  const expectedActions = toList(testCase.expected);
  const passAction = expectedActions.includes(action);
  const passRevision = (result.requires_revision_humana === true) || (result.requiere_revision_humana === true);

  const passTop3 = Array.isArray(result.top_3) && result.top_3.length > 0;
  const passTop3Flag =
    isSugerir
      ? result.top_3.every((item) => item.candidatos_no_confirmados !== true)
      : result.top_3.every((item) => item.candidatos_no_confirmados === true);

  const passBlockPrimary = isBlocked || isPedir
    ? !hasPrimaryFacturable(result.concepto_sugerido) &&
      !hasPrimaryFacturable(result.concepto_factura) &&
      !hasPrimaryFacturable(result.clave_prod_serv) &&
      !hasPrimaryFacturable(result.clave_unidad) &&
      !hasPrimaryFacturable(result.unidad)
    : hasPrimaryFacturable(result.concepto_sugerido) &&
      hasPrimaryFacturable(result.clave_prod_serv) &&
      hasPrimaryFacturable(result.clave_unidad);

  if (testCase.expectBlockedPrimary && !isBlocked) {
    testCase.expected = ["BLOQUEAR", "AGREGAR_ACTIVIDAD"];
  }

  const expectedFamilies = toList(testCase.expected_family);
  const expectedTypes = toList(testCase.expected_type);
  const forbiddenFamilies = toList(testCase.forbidden_family);
  const forbiddenPrefixes = toList(testCase.forbidden_concept_prefix);
  const expectedPrefixes = toList(testCase.expected_concept_prefix);
  const forbiddenContains = toList(testCase.forbidden_concept_contains);
  const selectedName = normalizeResultValue(result.concepto_sugerido) || "";

  const passFamily = expectedFamilies.length === 0 || expectedFamilies.includes(selectedFamily);
  const passType = expectedTypes.length === 0 || expectedTypes.includes(selectedType) || expectedTypes.includes(selectedOpType);
  const passForbiddenFamily = forbiddenFamilies.length === 0 || !forbiddenFamilies.includes(selectedFamily);
  const passForbiddenPrefix =
    forbiddenPrefixes.length === 0
      ? true
      : !(hasForbiddenPrefix(selectedId, forbiddenPrefixes) || hasForbiddenPrefix(selectedFamily, forbiddenPrefixes));
  const passForbiddenContains =
    forbiddenContains.length === 0
      ? true
      : !(hasForbiddenContains(selectedId, forbiddenContains) || hasForbiddenContains(selectedName, forbiddenContains));
  const passExpectedPrefix =
    expectedPrefixes.length === 0
      ? true
      : hasExpectedPrefix(selectedId, expectedPrefixes);

  const pass = passAction &&
    passRevision &&
    passTop3 &&
    passTop3Flag &&
    passBlockPrimary &&
    passFamily &&
    passType &&
    passForbiddenFamily &&
    passForbiddenPrefix &&
    passForbiddenContains &&
    passExpectedPrefix;

  const top3 = (result.top_3 || [])
    .map(
      (item) =>
        `${item.id}:${item.accion_n8n}:${item.score}:${item.confidence}${item.candidatos_no_confirmados ? "[candidatos_no_confirmados]" : ""}:${item.family}:${item.concept_type || ""}`,
    )
    .join(" | ");

  return {
    message: testCase.message,
    accion: result.accion_n8n || "SIN_ACCION",
    confidence: result.confidence,
    concepto_sugerido: normalizeResultValue(result.concepto_sugerido) || "N/A",
    concepto_factura: normalizeResultValue(result.concepto_factura) || "N/A",
    clave_prod_serv: normalizeResultValue(result.clave_prod_serv) || "N/A",
    clave_unidad: normalizeResultValue(result.clave_unidad) || "N/A",
    unidad: normalizeResultValue(result.unidad) || "N/A",
    familia: selectedFamily || "N/A",
    tipo: selectedType || "N/A",
    operacion: selectedOpType || "N/A",
    concepto_id: selectedId || "N/A",
    top_3: top3 || "Sin resultados",
    motivo: result.reason,
    status: pass ? "PASS" : "FAIL",
    checks: {
      action: passAction,
      revision: passRevision,
      top3: passTop3,
      top3Flagged: passTop3Flag,
      primary: passBlockPrimary,
      family: passFamily,
      type: passType,
      forbiddenFamily: passForbiddenFamily,
      forbiddenPrefix: passForbiddenPrefix,
      forbiddenContains: passForbiddenContains,
      expectedPrefix: passExpectedPrefix,
    },
  };
}

function printCase(out) {
  console.log(`Mensaje: ${out.message}`);
  console.log(`Accion: ${out.accion}`);
  console.log(`Confianza: ${out.confidence}`);
  console.log(`Concepto sugerido: ${out.concepto_sugerido}`);
  console.log(`Concepto factura: ${out.concepto_factura}`);
  console.log(`Clave SAT: ${out.clave_prod_serv}`);
  console.log(`Clave unidad: ${out.clave_unidad}`);
  console.log(`Unidad: ${out.unidad}`);
  console.log(`Familia: ${out.familia}`);
  console.log(`Tipo: ${out.tipo}`);
  console.log(`Operacion: ${out.operacion}`);
  console.log(`Concepto id: ${out.concepto_id}`);
  console.log(`Top_3: ${out.top_3}`);
  console.log(`Motivo: ${out.motivo}`);
  console.log(
    `Validaciones: accion=${out.checks.action ? "PASS" : "FAIL"}, requiere_revision=${out.checks.revision ? "PASS" : "FAIL"}, principal=${out.checks.primary ? "PASS" : "FAIL"}, top3=${out.checks.top3 ? "PASS" : "FAIL"}, top3Flag=${out.checks.top3Flagged ? "PASS" : "FAIL"}, familia=${out.checks.family ? "PASS" : "FAIL"}, tipo=${out.checks.type ? "PASS" : "FAIL"}, forbiddenFamily=${out.checks.forbiddenFamily ? "PASS" : "FAIL"}, forbiddenPrefix=${out.checks.forbiddenPrefix ? "PASS" : "FAIL"}, forbiddenContains=${out.checks.forbiddenContains ? "PASS" : "FAIL"}, expectedPrefix=${out.checks.expectedPrefix ? "PASS" : "FAIL"}`,
  );
  console.log(`Resultado: ${out.status}`);
}

function main() {
  console.log(`Archivo de catálogo: ${catalogPath}`);
  console.log(`Total pruebas: ${cases.length}`);
  console.log("");

  let passCount = 0;
  const failed = [];
  for (const testCase of cases) {
    const output = evaluateCase(testCase);
    if (output.status === "PASS") {
      passCount += 1;
    } else {
      failed.push(output);
    }
    printCase(output);
    console.log("-----");
  }

  console.log(`Resumen: ${passCount}/${cases.length} PASS`);
  if (failed.length) {
    console.log("");
    console.log("Casos fallidos:");
    for (const fail of failed) {
      const expected = cases.find((it) => it.message === fail.message) || {};
      console.log(`- ${fail.message}`);
      console.log(`  Esperado: ${(toList(expected.expected).join(" / ")) || "sin-accion"}`);
      console.log(`  Obtenido: ${fail.accion}`);
      console.log(`  Familia/Tipo: ${fail.familia}/${fail.tipo}`);
      console.log(`  Concepto id: ${fail.concepto_id}`);
      console.log(`  Motivo: ${fail.motivo}`);
      console.log(`  Checks: ${JSON.stringify(fail.checks)}`);
    }
  }
}

main();

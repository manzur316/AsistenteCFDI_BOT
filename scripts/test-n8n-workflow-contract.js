const path = require("path");
const fs = require("fs");
const workflowPath = path.join("C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI", "workflow", "cfdi_manual_test.n8n.json");
const bundlePath = path.join("C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI", "workflow", "code-node-n8n-bundle.js");
const scoring = require("../workflow/code-node-n8n-bundle.js");

const FORBIDDEN_TEXTS = [
  "process.",
  "process.cwd",
  "process.env",
  "__dirname",
  "__filename",
  "require('C:",
  'require("C:',
  "require('./",
  'require("./',
  "require('../",
  'require("../',
  "scripts/scoring.js",
  "code-node-n8n-bundle.js",
  "scoringModulePath",
];

function evaluateWorkflow(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const workflow = JSON.parse(raw);

  const checks = [];
  checks.push({
    name: "manual_trigger",
    pass: Array.isArray(workflow.nodes) && workflow.nodes.some((node) => node.type === "n8n-nodes-base.manualTrigger"),
    value: "manual trigger",
  });
  checks.push({
    name: "set_message_node",
    pass:
      Array.isArray(workflow.nodes) &&
      workflow.nodes.some(
        (node) =>
          node.type === "n8n-nodes-base.set" &&
          node.name === "Set Manual Message" &&
          Array.isArray(node.parameters?.values?.string) &&
          node.parameters.values.string.some((item) => item.name === "message"),
      ),
    value: "Set Manual Message",
  });
  checks.push({
    name: "run_scoring_node",
    pass:
      Array.isArray(workflow.nodes) &&
      workflow.nodes.some(
        (node) =>
          node.type === "n8n-nodes-base.code" &&
          node.name === "Run Scoring" &&
          typeof node.parameters?.jsCode === "string" &&
          node.parameters.jsCode.includes("buildN8nResponse"),
      ),
    value: "Code node",
  });

  return { workflow, checks };
}

const contractCases = [
  {
    message: "revisé cámaras hikvision sin imagen",
    expectedActions: ["SUGERIR"],
    requireConcept: true,
    expectedReady: true,
    expectedFamily: ["CCTV"],
    expectedType: ["SERVICIO", "SERVICIO_INSTALACION", "MIXTO"],
    description: "Caso claro de CCTV",
  },
  {
    message: "revisé un sistema que fallaba",
    expectedActions: ["PEDIR_ACLARACION"],
    requireConcept: false,
    expectedReady: false,
    description: "Caso ambiguo",
  },
  {
    message: "desarrollé una app móvil",
    expectedActions: ["BLOQUEAR", "AGREGAR_ACTIVIDAD"],
    requireConcept: false,
    expectedReady: false,
    description: "Caso bloqueado",
  },
  {
    message: "venta de fuente de poder para cámara",
    expectedActions: ["SUGERIR"],
    expectedConceptPrefix: ["PROD-CCTV-007"],
    expectedFamily: ["CCTV", "ELECTRONICO"],
    expectedType: ["PRODUCTO"],
    requireConcept: true,
    expectedReady: true,
    expectNoDisallowedContains: ["DVR", "NVR", "GRABADOR", "DISCO", "ALMACENAMIENTO"],
    description: "Caso obligatorio de fuente de poder",
  },
];

function hasPrefix(value, allowedList) {
  if (!value) return false;
  return allowedList.some((prefix) => {
    const normalized = String(prefix || "").trim();
    return normalized && String(value).startsWith(normalized);
  });
}

function containsAny(value, forbiddenList) {
  if (!value) return false;
  const lower = String(value).toLowerCase();
  return forbiddenList.some((item) => {
    const normalized = String(item || "").toLowerCase().trim();
    return normalized && lower.includes(normalized);
  });
}

function readForbiddenTokens(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  return FORBIDDEN_TEXTS.filter((token) => text.includes(token));
}

function analyzeRequireCalls(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  const matches = [];
  let match = null;
  while ((match = pattern.exec(text))) {
    matches.push(match[1]);
  }
  const allowed = new Set(["fs", "path"]);
  const disallowed = matches.filter((moduleName) => {
    const normalized = String(moduleName || "").trim();
    if (!normalized) return true;
    if (normalized.startsWith(".")) return true;
    if (normalized.startsWith("..")) return true;
    return !allowed.has(normalized);
  });
  return {
    all: matches,
    disallowed,
  };
}

function evaluateCase(item) {
  const response = scoring.runManualScoring(item.message, {
    catalogPath: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json",
  });
  const checks = [];

  const action = response.action || "SIN_ACCION";
  const concept = response.concept || {};
  const conceptId = concept.id || "";

  const actionPass = item.expectedActions.includes(action);
  checks.push({ name: "action", pass: actionPass, value: action });

  checks.push({ name: "ready_to_copy", pass: response.ready_to_copy === item.expectedReady, value: response.ready_to_copy });

  checks.push({
    name: "requires_human_review",
    pass: response.requires_human_review === true,
    value: response.requires_human_review,
  });

  checks.push({
    name: "telegram_message",
    pass: typeof response.telegram_message === "string" && response.telegram_message.length > 10,
    value: "ok",
  });

  checks.push({
    name: "top3_exists",
    pass: Array.isArray(response.top_3),
    value: Array.isArray(response.top_3) ? response.top_3.length : 0,
  });

  const conceptFields = ["id", "concepto_factura", "clave_prod_serv", "clave_unidad", "unidad", "familia", "tipo"];
  const conceptComplete = conceptFields.every((field) => concept[field] !== null && concept[field] !== undefined && concept[field] !== "N/A");
  const conceptNull = conceptFields.every((field) => concept[field] === null);

  if (item.expectedActions.includes("SUGERIR")) {
    checks.push({ name: "concept_present", pass: conceptComplete, value: JSON.stringify(concept) });
    checks.push({
      name: "decision_confidence",
      pass: typeof response.decision_confidence === "number" && response.decision_confidence >= 80,
      value: response.decision_confidence,
    });
    if (item.expectedConceptPrefix && item.expectedConceptPrefix.length) {
      checks.push({
        name: "concept_prefix",
        pass: hasPrefix(conceptId, item.expectedConceptPrefix),
        value: conceptId,
      });
    }
    if (item.expectedFamily && item.expectedFamily.length) {
      checks.push({
        name: "family",
        pass: item.expectedFamily.includes(concept.familia || ""),
        value: concept.familia || "",
      });
    }
    if (item.expectedType && item.expectedType.length) {
      checks.push({
        name: "type",
        pass: item.expectedType.includes(concept.tipo || "") || item.expectedType.includes(concept.operacion || ""),
        value: `${concept.tipo || ""}/${concept.operacion || ""}`,
      });
    }
    if (item.expectNoDisallowedContains && item.expectNoDisallowedContains.length) {
      checks.push({
        name: "forbidden_contains",
        pass:
          !containsAny(conceptId, item.expectNoDisallowedContains) &&
          !containsAny((concept.concepto_factura || ""), item.expectNoDisallowedContains),
        value: `${conceptId}:${concept.concepto_factura || ""}`,
      });
    }
  } else if (item.expectedActions.includes("PEDIR_ACLARACION")) {
    checks.push({ name: "pedir_no_facturar", pass: conceptNull, value: JSON.stringify(concept) });
    checks.push({
      name: "top3_no_confirmados",
      pass:
        Array.isArray(response.top_3) &&
        response.top_3.length > 0 &&
        response.top_3.every((it) => it && it.candidatos_no_confirmados === true),
      value: JSON.stringify(response.top_3),
    });
  } else {
    checks.push({ name: "bloqueo_no_facturar", pass: conceptNull, value: JSON.stringify(concept) });
  }

  const allPass = checks.every((c) => c.pass);

  return {
    message: item.message,
    action,
    expected: item.expectedActions.join("/"),
    description: item.description,
    checks,
    pass: allPass,
  };
}

function printCase(output) {
  console.log(`Mensaje: ${output.message}`);
  console.log(`Descripcion: ${output.description}`);
  console.log(`Accion: ${output.action}`);
  console.log(`Esperado: ${output.expected}`);
  for (const check of output.checks) {
    console.log(`  - ${check.name}: ${check.pass ? "PASS" : "FAIL"} (${check.value})`);
  }
  console.log(`Resultado: ${output.pass ? "PASS" : "FAIL"}`);
}

function printForbidden(filePath, matches) {
  if (matches.length === 0) {
    console.log(` - ${path.basename(filePath)}: PASS`);
    return true;
  }

  console.log(` - ${path.basename(filePath)}: FAIL (${matches.join(", ")})`);
  return false;
}

function main() {
  const workflowResult = evaluateWorkflow(workflowPath);
  const structurePass = workflowResult.checks.every((item) => item.pass);
  console.log(`Workflow: ${workflowPath}`);
  console.log(`Validacion estructura: ${structurePass ? "PASS" : "FAIL"}`);
  for (const check of workflowResult.checks) {
    console.log(` - ${check.name}: ${check.pass ? "PASS" : "FAIL"} (${check.value})`);
  }
  console.log("");

  const workflowForbidden = readForbiddenTokens(workflowPath);
  const bundleForbidden = readForbiddenTokens(bundlePath);
  const workflowRequire = analyzeRequireCalls(workflowPath);
  const bundleRequire = analyzeRequireCalls(bundlePath);
  const forbiddenPass =
    workflowForbidden.length === 0 &&
    bundleForbidden.length === 0 &&
    workflowRequire.disallowed.length === 0 &&
    bundleRequire.disallowed.length === 0;
  console.log("Validacion anti-process en flujo y bundle:");
  const wfPass = printForbidden(workflowPath, workflowForbidden);
  const bundlePass = printForbidden(bundlePath, bundleForbidden);
  const wfReqPass = printForbidden(workflowPath, workflowRequire.disallowed.map((item) => `disallowed_require(${item})`));
  const bundleReqPass = printForbidden(bundlePath, bundleRequire.disallowed.map((item) => `disallowed_require(${item})`));
  console.log(`Resultado: ${forbiddenPass ? "PASS" : "FAIL"}`);
  console.log("");

  let passCount = 0;
  const failed = [];

  for (const item of contractCases) {
    const out = evaluateCase(item);
    if (out.pass) {
      passCount += 1;
    } else {
      failed.push(out);
    }
    printCase(out);
    console.log("-----");
  }

  console.log(`Resumen casos: ${passCount}/${contractCases.length} PASS`);
  console.log(`Resumen anti-process: ${forbiddenPass ? "PASS" : "FAIL"}`);
  if (failed.length > 0) {
    console.log("Casos fallidos:");
    for (const fail of failed) {
      const fails = fail.checks.filter((item) => !item.pass).map((item) => item.name);
      console.log(`- ${fail.message}`);
      console.log(`  Fallas: ${fails.join(", ")}`);
    }
  }
}

main();

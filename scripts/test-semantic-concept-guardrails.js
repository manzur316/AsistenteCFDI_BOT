const fs = require("fs");
const path = require("path");
const scoring = require("./scoring");

const root = path.resolve(__dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(root, "data", "concepts.normalized.json"), "utf8"));
const proposedPath = path.join(root, "data", "catalog_expansion", "proposed_concepts.resico_626.json");
const gapsReportPath = path.join(root, "docs", "CATALOG_GAPS_REPORT.md");
const proposed = fs.existsSync(proposedPath) ? JSON.parse(fs.readFileSync(proposedPath, "utf8")) : { concepts: [], gaps: [] };
const gapsReport = fs.existsSync(gapsReportPath) ? fs.readFileSync(gapsReportPath, "utf8") : "";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

function classify(text) {
  const result = scoring.classifyMessage(text, catalog);
  return {
    action: result.accion_n8n || result.action,
    id: result.concepto_id || result.concept_id || result.concept?.id || null,
    concept: result.concepto_sugerido || result.concept?.concepto_factura || "",
    family: result.family || result.concept?.familia || "",
    type: result.concept_type || result.concept?.tipo || "",
    operation: result.operation_type || result.concept?.operacion || "",
  };
}

function runtimePasses(result, rule) {
  const haystack = normalize(`${result.id} ${result.concept} ${result.family} ${result.type} ${result.operation}`);
  const actionOk = !rule.action || result.action === rule.action;
  const familyOk = !rule.family || haystack.includes(normalize(rule.family));
  const typeOk = !rule.type || haystack.includes(normalize(rule.type));
  const forbiddenOk = (rule.forbidden || []).every((term) => !haystack.includes(normalize(term)));
  const containsOk = (rule.contains || []).every((term) => haystack.includes(normalize(term)));
  return actionOk && familyOk && typeOk && forbiddenOk && containsOk;
}

function proposedOrGapCovers(rule) {
  const proposedConcepts = proposed.concepts || [];
  const gaps = proposed.gaps || [];
  const byId = (item) => item.id === rule.proposedId || item.id === rule.gapId;
  const proposedMatch = proposedConcepts.find(byId);
  if (proposedMatch) {
    const text = normalize(`${proposedMatch.concepto_factura_recomendado} ${proposedMatch.familia} ${proposedMatch.tipo}`);
    return Boolean(proposedMatch.clave_prod_serv && proposedMatch.clave_unidad && proposedMatch.source === "SAT_OFFICIAL" && !((rule.forbidden || []).some((term) => text.includes(normalize(term)))));
  }
  const gapMatch = gaps.find(byId);
  if (gapMatch) {
    return gapMatch.precision_level === "GAP_REQUIRES_REVIEW" && gapMatch.suggestible === false;
  }
  return false;
}

const semanticRules = [
  { name: "venta_camara_no_dvr", text: "venta de camara CCTV 1200 + IVA", family: "CCTV", type: "PRODUCTO", forbidden: ["DVR", "NVR", "GRABADOR"], contains: ["CAMARA"], proposedId: "EXP-PROD-CCTV-CAMERA", gapId: "EXP-PROD-CCTV-CAMERA" },
  { name: "venta_dvr_no_camara", text: "venta de DVR/NVR 1200 + IVA", family: "CCTV", type: "PRODUCTO", forbidden: ["CAMARA DE VIDEOVIGILANCIA"], contains: ["DVR"], proposedId: "EXP-PROD-CCTV-DVR-NVR", gapId: "EXP-PROD-CCTV-DVR-NVR" },
  { name: "venta_fuente_no_camara", text: "venta de fuente CCTV", family: "CCTV", type: "PRODUCTO", forbidden: ["CAMARA DE VIDEOVIGILANCIA", "DVR", "NVR", "GRABADOR"], contains: ["FUENTE"], proposedId: "EXP-PROD-CCTV-POWER", gapId: "EXP-PROD-CCTV-POWER" },
  { name: "instalacion_sistema_cctv_amplia", text: "instalacion de sistema CCTV con varias piezas", family: "CCTV", type: "SERVICIO", contains: ["SISTEMA"], proposedId: "EXP-SVC-CCTV-SYSTEM-INSTALL", gapId: "EXP-SVC-CCTV-SYSTEM-INSTALL" },
  { name: "instalacion_camara_conserva_camara", text: "instalacion de camara CCTV", family: "CCTV", type: "SERVICIO", contains: ["CAMARA"], forbidden: ["DVR", "NVR"], proposedId: "EXP-SVC-CCTV-CAMERA-INSTALL", gapId: "EXP-SVC-CCTV-CAMERA-INSTALL" },
  { name: "mantenimiento_cctv_servicio", text: "mantenimiento sistema CCTV", family: "CCTV", type: "SERVICIO", forbidden: ["VENTA"], proposedId: "EXP-SVC-CCTV-MAINT", gapId: "EXP-SVC-CCTV-MAINT" },
  { name: "venta_ssd_computo", text: "venta de SSD", family: "COMPUTO", type: "PRODUCTO", forbidden: ["CCTV", "CONTROL DE ACCESO", "RFID", "TAG"], proposedId: "EXP-PROD-PC-SSD", gapId: "EXP-PROD-PC-SSD" },
  { name: "mantenimiento_computadora_servicio", text: "mantenimiento de computadora", family: "COMPUTO", type: "SERVICIO", proposedId: "EXP-SVC-PC-MAINT", gapId: "EXP-SVC-PC-MAINT" },
  { name: "venta_ap_red", text: "venta de access point", family: "RED", type: "PRODUCTO", forbidden: ["COMPUTO", "CONTROL DE ACCESO"], proposedId: "EXP-PROD-RED-AP", gapId: "EXP-PROD-RED-AP" },
  { name: "venta_switch_red", text: "venta de switch", family: "RED", type: "PRODUCTO", forbidden: ["COMPUTO", "CONTROL DE ACCESO"], proposedId: "EXP-PROD-RED-SWITCH", gapId: "EXP-PROD-RED-SWITCH" },
  { name: "venta_router_red", text: "venta de router", family: "RED", type: "PRODUCTO", forbidden: ["COMPUTO", "CONTROL DE ACCESO"], proposedId: "EXP-PROD-RED-ROUTER", gapId: "EXP-PROD-RED-ROUTER" },
  { name: "instalacion_access_point_servicio", text: "instalacion de access point", family: "RED", type: "SERVICIO", proposedId: "EXP-SVC-RED-AP", gapId: "EXP-SVC-RED-AP" },
  { name: "instalacion_chapa_control_acceso", text: "instalacion de chapa magnetica", family: "CONTROL_ACCESO", type: "SERVICIO", proposedId: "EXP-SVC-AC-LOCK-INSTALL", gapId: "EXP-SVC-AC-LOCK-INSTALL" },
  { name: "mantenimiento_barrera_servicio", text: "mantenimiento de barrera vehicular", family: "BARRERA", type: "SERVICIO", proposedId: "EXP-SVC-BARRERA-MAINT", gapId: "EXP-SVC-BARRERA-MAINT" },
];

const blockedRules = [
  { name: "app_movil_bloqueada", text: "desarrollo de app movil" },
  { name: "pagina_web_bloqueada", text: "pagina web" },
  { name: "saas_bloqueado", text: "servicio SaaS" },
  { name: "n8n_bloqueado", text: "automatizacion n8n" },
  { name: "ia_bloqueada", text: "agente de inteligencia artificial" },
];

const checks = [];
for (const rule of semanticRules) {
  const result = classify(rule.text);
  const currentOk = runtimePasses(result, rule);
  const coveredByProposalOrGap = proposedOrGapCovers(rule);
  checks.push({
    name: rule.name,
    pass: currentOk || coveredByProposalOrGap,
    value: currentOk ? `runtime:${result.id}` : `gap/proposal:${result.id || "N/A"}`,
  });
}

for (const rule of blockedRules) {
  const result = classify(rule.text);
  checks.push({
    name: rule.name,
    pass: result.action === "BLOQUEAR" || result.action === "AGREGAR_ACTIVIDAD",
    value: `${result.action}/${result.id || "N/A"}`,
  });
}

checks.push({
  name: "catalog_gaps_report_mentions_camera_dvr_risk",
  pass: /camera_not_dvr|camara CCTV/i.test(gapsReport) && /DVR|NVR|GRABADOR/i.test(gapsReport),
  value: "report",
});
checks.push({
  name: "no_official_sat_means_no_suggestible_proposals",
  pass: /^BLOCKED_MISSING_/.test(proposed.status || "") ? (proposed.concepts || []).length === 0 : true,
  value: proposed.status || "N/A",
});

console.log("Semantic concept guardrails");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

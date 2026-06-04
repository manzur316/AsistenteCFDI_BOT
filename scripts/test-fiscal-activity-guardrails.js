const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const guardrailsPath = path.join(root, "docs", "FISCAL_ACTIVITY_GUARDRAILS.md");
const matrixPath = path.join(root, "docs", "BUSINESS_SCENARIO_MATRIX.md");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
let guardrails = "";
let matrix = "";
let workflowText = "";

try {
  guardrails = fs.readFileSync(guardrailsPath, "utf8");
  matrix = fs.readFileSync(matrixPath, "utf8");
  workflowText = fs.readFileSync(workflowPath, "utf8");
  JSON.parse(workflowText);
  checks.push({ name: "docs_and_workflow_exist", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "docs_and_workflow_exist", pass: false, value: error.message });
}

const combined = `${guardrails}\n${matrix}`;
for (const activity of [
  "Otras instalaciones y equipamiento en construcciones",
  "Reparacion y mantenimiento de maquinaria y equipo comercial y de servicios",
  "Reparacion y mantenimiento de otro equipo electronico y de equipo de precision",
  "Comercio al por menor de telefonos",
  "Comercio al por menor de computadoras",
]) {
  checks.push({ name: `constancia_activity:${activity.slice(0, 24)}`, pass: combined.includes(activity), value: activity });
}

for (const family of ["CCTV", "CONTROL_ACCESO", "BARRERA", "RED", "COMPUTO"]) {
  const row = new RegExp(`\\|\\s*${family}\\s*\\|[^\\n]+allowed|\\|\\s*${family}\\s*\\|[^\\n]+SERVICIO`, "i");
  checks.push({ name: `family_mapped:${family}`, pass: row.test(guardrails) && guardrails.includes("allowed_operations"), value: family });
}

for (const blocked of ["software", "app movil", "pagina web", "SaaS", "n8n", "AI implementation", "marketing digital", "plomeria", "renta de equipo"]) {
  checks.push({ name: `blocked_activity:${blocked}`, pass: guardrails.toLowerCase().includes(blocked.toLowerCase()), value: blocked });
}

checks.push({ name: "software_not_allowed_family", pass: !/\|\s*SOFTWARE\s*\|/i.test(guardrails), value: "no SOFTWARE family" });
checks.push({ name: "resico_626_documented", pass: guardrails.includes('"emitter_regimen": "626"') && guardrails.includes("Regimen Simplificado de Confianza"), value: "626" });
checks.push({ name: "human_review_documented", pass: (combined.match(/REVISION HUMANA/g) || []).length >= 4 && combined.includes("requires_human_review"), value: "review" });
checks.push({ name: "hard_stop_rules_documented", pass: ["actividad_actual_ok=false", "resico_626_ok=false", "accion_n8n=BLOQUEAR", "riesgo_fiscal=ALTO", "Concept without unit/key"].every((text) => guardrails.includes(text)), value: "hard stops" });
checks.push({ name: "workflow_has_guardrail_functions", pass: ["detectFiscalGuardrailIssue", "FISCAL_BLOCKED_PATTERNS", "fiscalGuardrailResponse"].every((text) => workflowText.includes(text)), value: "workflow" });
checks.push({ name: "workflow_blocks_software_marketing_construction", pass: ["software_app_web_saas_ia", "marketing_diseno_video", "oficio_construccion_general"].every((text) => workflowText.includes(text)), value: "blocked reasons" });
checks.push({ name: "no_token_no_pac_no_whatsapp", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(combined + workflowText) && !/\bPAC\b|WhatsApp/i.test(workflowText), value: "safe" });

console.log("Fiscal activity guardrails");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

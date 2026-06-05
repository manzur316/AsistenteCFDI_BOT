const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docPath = path.join(root, "docs", "PHASE_7_1B_TELEGRAM_N8N_WORKFLOW_TOPOLOGY.md");
const primaryWorkflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const sandboxWorkflowPath = path.join(root, "workflow", "cfdi_sandbox_action_router.n8n.json");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function includesAll(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

const checks = [];
const docExists = fs.existsSync(docPath);
const docText = docExists ? fs.readFileSync(docPath, "utf8") : "";

checks.push({
  name: "topology_document_exists",
  pass: docExists,
  value: "docs/PHASE_7_1B_TELEGRAM_N8N_WORKFLOW_TOPOLOGY.md",
});

checks.push({
  name: "primary_workflow_exists",
  pass: fs.existsSync(primaryWorkflowPath),
  value: "workflow/cfdi_telegram_local_ingest.n8n.json",
});

checks.push({
  name: "technical_admin_workflow_exists",
  pass: fs.existsSync(sandboxWorkflowPath),
  value: "workflow/cfdi_sandbox_action_router.n8n.json",
});

checks.push({
  name: "single_telegram_entry_point_documented",
  pass: docText.includes("Telegram debe tener un unico punto de entrada operativo")
    && includesAll(docText, [
      "Telegram",
      "runner/telegram-local-runner.js",
      "workflow/cfdi_telegram_local_ingest.n8n.json",
      "Router interno",
    ]),
  value: "Telegram -> runner -> local_ingest",
});

checks.push({
  name: "primary_workflow_defined",
  pass: docText.includes("Categoria: `PRIMARY`")
    && docText.includes("workflow/cfdi_telegram_local_ingest.n8n.json")
    && docText.includes("experiencia diaria del usuario"),
  value: "PRIMARY",
});

checks.push({
  name: "technical_admin_workflow_defined",
  pass: docText.includes("Categoria: `TECHNICAL_ADMIN`")
    && docText.includes("workflow/cfdi_sandbox_action_router.n8n.json")
    && docText.includes("No representa la experiencia diaria del usuario"),
  value: "TECHNICAL_ADMIN",
});

checks.push({
  name: "workflow_categories_documented",
  pass: includesAll(docText, ["`PRIMARY`", "`TECHNICAL_ADMIN`", "`AUXILIARY`", "`LEGACY`", "`FUTURE`"]),
  value: "PRIMARY/TECHNICAL_ADMIN/AUXILIARY/LEGACY/FUTURE",
});

checks.push({
  name: "growth_rules_documented",
  pass: includesAll(docText, [
    "scripts JS",
    "Action Layer",
    "PostgreSQL",
    "contratos",
    "modulos reutilizables",
    "componentes testeables",
    "No crear workflows independientes",
  ]),
  value: "modules before workflows",
});

checks.push({
  name: "future_workflow_criteria_documented",
  pass: includesAll(docText, [
    "Criterios Para Crear Workflows Futuros",
    "no recibe updates Telegram directamente",
    "no duplica comandos ni callbacks",
    "tiene test de contrato",
    "pasa repo safety",
  ]),
  value: "future workflow gate",
});

checks.push({
  name: "auxiliary_future_examples_documented",
  pass: includesAll(docText, [
    "scheduler",
    "webhook externo",
    "miniapp",
    "callback PAC futuro",
    "reporting batch",
    "mantenimiento",
  ]),
  value: "future examples",
});

checks.push({
  name: "legacy_workflows_classified",
  pass: includesAll(docText, [
    "workflow/cfdi_manual_test.n8n.json",
    "workflow/cfdi_telegram_postgres_polling.n8n.json",
    "workflow/cfdi_telegram_polling_local.n8n.json",
    "workflow/cfdi_telegram_polling_with_history.n8n.json",
    "`LEGACY`",
  ]),
  value: "legacy workflows",
});

checks.push({
  name: "phase_impact_documented",
  pass: includesAll(docText, [
    "Impacto En Fases 7.2, 7.3 Y 7.4",
    "7.2 Telegram Product Menu Renderer",
    "7.3 Telegram Product Menu Router Adapter",
    "7.4 Product Flow Integration",
  ]),
  value: "7.2/7.3/7.4",
});

checks.push({
  name: "no_go_restrictions_documented",
  pass: includesAll(docText, [
    "no modificar workflows",
    "tocar `runtime/`",
    "tocar `data/concepts.normalized.json`",
    "llamar PAC",
    "crear un segundo bot Telegram",
  ]),
  value: "no-go",
});

let passCount = 0;
for (const check of checks) {
  if (check.pass) passCount += 1;
  printCheck(check.name, check.pass, check.value);
}

console.log(`PASS total: ${passCount}/${checks.length}`);
if (passCount !== checks.length) {
  process.exit(1);
}

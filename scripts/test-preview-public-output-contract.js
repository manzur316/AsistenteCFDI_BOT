const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPaths = [
  path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json"),
  path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json"),
];
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function loadHandleCode(workflowPath) {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const node = (workflow.nodes || []).find((item) => item.name === "Handle Commands And Scoring");
  if (!node) throw new Error(`No Handle Commands And Scoring in ${workflowPath}`);
  return node.parameters.jsCode;
}

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

const client = {
  client_id: "CLI-DEMO-PM",
  display_name: "Cliente PM",
  razon_social: "Cliente PM Demo",
  rfc: "AAA010101AAA",
  tipo_persona: "MORAL",
  regimen_fiscal: "603",
  codigo_postal_fiscal: "00000",
  tax_profile: "PM_GENERAL",
  validated_by_human: true,
  enabled: true,
  aliases: [{ alias: "Cliente PM", normalized_alias: "cliente pm", weight: 100 }],
};

const taxRules = [
  { rule_id: "PM-SERVICIO", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "PM-INSTALACION", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "PM-PRODUCTO", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function input(text, updateId) {
  return {
    update_id: updateId,
    chat_id: `preview-public-${updateId}`,
    message_id: String(updateId + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: [client],
    tax_rules: taxRules,
    chat_state: null,
    recent_drafts: [],
    bot_state: {},
    today_summary: {},
    runtimePath: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime",
    runnerSecret: "CAMBIAR_SECRET_LOCAL",
    headers: { "x-cfdi-runner-secret": "CAMBIAR_SECRET_LOCAL" },
  };
}

function hasRequiredPublicFields(message) {
  return [
    "Cliente:",
    "RFC:",
    "Regimen receptor:",
    "Estado cliente:",
    "Revision humana:",
    "Descripcion:",
    "Clave SAT:",
    "Unidad / clave unidad:",
    "Precio unitario:",
    "Subtotal:",
    "IVA trasladado:",
    "ISR retenido:",
    "IVA retenido:",
    "Total neto estimado:",
    "BORRADOR SUJETO A REVISION HUMANA",
  ].every((needle) => message.includes(needle));
}

function hasNoInternalFields(message) {
  const forbidden = [
    /^Concept ID:/m,
    /^Familia:/m,
    /^Subfamilia:/m,
    /^Tipo:/m,
    /^Operacion:/m,
    /^Modo IVA:/m,
    /score/i,
    /keywords/i,
    /notas? guardrail/i,
    /source_catalog/i,
    /precision_level/i,
    /activity support/i,
  ];
  return forbidden.every((pattern) => !pattern.test(message));
}

const checks = [];
for (const workflowPath of workflowPaths) {
  const name = path.basename(workflowPath);
  let code = "";
  try {
    code = loadHandleCode(workflowPath);
    checks.push({ name: `${name}:workflow_valid`, pass: true, value: "parsed" });
  } catch (error) {
    checks.push({ name: `${name}:workflow_valid`, pass: false, value: error.message });
    continue;
  }

  const single = executeCode(code, input("Cliente PM, venta de fuente de poder para camara 350 + IVA", 501));
  const singleMsg = single.telegram_message || "";
  checks.push({ name: `${name}:single_preview_ready`, pass: single.action === "NEEDS_CONFIRM_DRAFT", value: single.action });
  checks.push({ name: `${name}:single_public_fields`, pass: hasRequiredPublicFields(singleMsg), value: "public fields" });
  checks.push({ name: `${name}:single_hides_internal_fields`, pass: hasNoInternalFields(singleMsg), value: "no internals" });
  checks.push({ name: `${name}:single_json_debug_keeps_internal_context`, pass: Boolean(single.json_debug) && Boolean(single.concept?.id), value: single.concept?.id || "N/A" });

  const multiText = [
    "Cliente PM",
    "1. venta de router 500 + IVA",
    "2. mantenimiento de computadora 800 + IVA",
  ].join("\n");
  const multi = executeCode(code, input(multiText, 502));
  const multiMsg = multi.telegram_message || "";
  checks.push({ name: `${name}:multi_preview_ready`, pass: multi.action === "NEEDS_CONFIRM_DRAFT", value: `${multi.action}/${multi.line_items?.length || 0}` });
  checks.push({ name: `${name}:multi_public_fields`, pass: hasRequiredPublicFields(multiMsg), value: "public fields" });
  checks.push({ name: `${name}:multi_hides_internal_fields`, pass: hasNoInternalFields(multiMsg), value: "no internals" });
}

console.log("Preview public output contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

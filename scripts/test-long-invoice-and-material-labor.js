const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json");
const localWorkflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

const client = {
  client_id: "CLI-DEMO-NO-LUCRO",
  display_name: "Areatza",
  razon_social: "Privada Areatza AC",
  rfc: "PAR211126A95",
  tipo_persona: "MORAL_SIN_FINES_LUCRO",
  regimen_fiscal: "603",
  codigo_postal_fiscal: "00000",
  tax_profile: "PM_NO_LUCRATIVA",
  validated_by_human: true,
  enabled: true,
  aliases: [
    { alias: "Areatza", normalized_alias: "areatza", weight: 100 },
    { alias: "Privada Areatza", normalized_alias: "privada areatza", weight: 100 },
  ],
};

const taxRules = [
  { rule_id: "NO-LUCRO-SERVICIO", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "NO-LUCRO-INSTALACION", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "NO-LUCRO-PRODUCTO", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 10301,
    chat_id: "chat-long-invoice-test",
    message_id: String((extra.update_id || 10301) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: [client],
    tax_rules: taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: [],
    bot_state: { lastTelegramUpdateId: 10300 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function run(code, text, updateId, extra = {}) {
  return executeCode(code, contextInput(text, { update_id: updateId, ...extra }));
}

function stateFrom(response, state) {
  return { state, original_text: response.message_original || "x", context: response.json_debug || {} };
}

const checks = [];
let workflow = null;
let localWorkflow = null;
let handleCode = "";
let localHandleCode = "";
let behavior = {};

try {
  workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  localWorkflow = JSON.parse(fs.readFileSync(localWorkflowPath, "utf8"));
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  localHandleCode = getNode(localWorkflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "postgres/local parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

const sevenLineText = "Areatza,\n1. instalacion de camara CCTV 800 + IVA\n2. mantenimiento equipo CCTV 500 + IVA\n3. venta de fuente de poder CCTV 350 + IVA\n4. configuracion DVR Hikvision 600 + IVA\n5. revision de red WiFi 700 + IVA\n6. venta de SSD 480GB para computadora 900 + IVA\n7. mantenimiento de computadora 500 + IVA";
const elevenLineText = `${sevenLineText}\n8. venta de router 600 + IVA\n9. venta de switch de red 500 + IVA\n10. mantenimiento de barrera vehicular 700 + IVA\n11. venta de camara CCTV 700 + IVA`;

try {
  behavior.seven = run(handleCode, sevenLineText, 10301);
  behavior.eleven = run(handleCode, elevenLineText, 10302);
  behavior.localSeven = run(localHandleCode, sevenLineText, 10303);
  behavior.material = run(handleCode, "Areatza, cambio de camara CCTV incluye material y mano de obra 1500 + IVA", 10304);
  behavior.materialSeparate = run(handleCode, "1", 10305, { chat_state: stateFrom(behavior.material, "NEEDS_MATERIAL_LABOR_DECISION") });
  behavior.materialService = run(handleCode, "2", 10306, { chat_state: stateFrom(behavior.material, "NEEDS_MATERIAL_LABOR_DECISION") });
  behavior.global = run(handleCode, "Areatza, instalacion de camara CCTV y mantenimiento DVR por 1300 + IVA", 10307);
  behavior.globalSplit = run(handleCode, "1", 10308, { chat_state: stateFrom(behavior.global, "NEEDS_GLOBAL_AMOUNT_DECISION") });
  behavior.globalIntegral = run(handleCode, "2", 10309, { chat_state: stateFrom(behavior.global, "NEEDS_GLOBAL_AMOUNT_DECISION") });
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.seven) {
  checks.push({ name: "five_plus_lines_supported", pass: behavior.seven.action === "NEEDS_CONFIRM_DRAFT" && behavior.seven.line_items?.length >= 5, value: behavior.seven.line_items?.length });
  checks.push({ name: "seven_lines_supported", pass: behavior.seven.line_items?.length === 7, value: behavior.seven.line_items?.length });
  checks.push({ name: "local_seven_lines_supported", pass: behavior.localSeven.action === "NEEDS_CONFIRM_DRAFT" && behavior.localSeven.line_items?.length === 7, value: `${behavior.localSeven.action}/${behavior.localSeven.line_items?.length}` });
  checks.push({ name: "line_amounts_preserved", pass: behavior.seven.line_items.map((line) => line.amount).join(",") === "800,500,350,600,700,900,500", value: behavior.seven.line_items.map((line) => line.amount).join(",") });
  checks.push({ name: "summary_correct_subtotal", pass: behavior.seven.amount === 4350 && behavior.seven.calc?.subtotal === 4350, value: `${behavior.seven.amount}/${behavior.seven.calc?.subtotal}` });
  checks.push({ name: "summary_has_iva", pass: Number(behavior.seven.calc?.iva_amount || 0) > 0 && String(behavior.seven.telegram_message).includes("IVA trasladado"), value: behavior.seven.calc?.iva_amount });
  checks.push({ name: "distinguishes_product_service", pass: behavior.seven.line_items.some((line) => line.operation_type === "PRODUCTO" && Number(line.iva_retention_amount || 0) === 0) && behavior.seven.line_items.some((line) => line.operation_type !== "PRODUCTO" && Number(line.iva_retention_amount || 0) > 0), value: behavior.seven.line_items.map((line) => `${line.operation_type}:${line.iva_retention_amount}`).join(" | ") });
  checks.push({ name: "no_draft_before_confirm", pass: !String(behavior.seven.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: "preview only" });
}

if (behavior.eleven) {
  checks.push({ name: "ten_plus_lines_do_not_fail", pass: behavior.eleven.action === "NEEDS_CONFIRM_DRAFT" && behavior.eleven.line_items?.length === 11, value: `${behavior.eleven.action}/${behavior.eleven.line_items?.length}` });
  checks.push({ name: "long_invoice_compact_preview", pass: String(behavior.eleven.telegram_message).includes("Factura larga") && String(behavior.eleven.telegram_message).includes("preview compacto"), value: "compact" });
}

if (behavior.material) {
  checks.push({ name: "material_labor_asks_decision", pass: behavior.material.action === "NEEDS_MATERIAL_LABOR_DECISION" && String(behavior.material.telegram_message).includes("Separar material y mano de obra"), value: behavior.material.action });
  checks.push({ name: "material_labor_no_draft", pass: !String(behavior.material.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: "no draft" });
  checks.push({ name: "material_labor_separate_asks_amounts", pass: behavior.materialSeparate.action === "NEEDS_MATERIAL_LABOR_SPLIT" && String(behavior.materialSeparate.telegram_message).includes("monto de material"), value: behavior.materialSeparate.action });
  checks.push({ name: "material_labor_service_integral_warns", pass: behavior.materialService.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.materialService.telegram_message).includes("Servicio integral con material incluido"), value: behavior.materialService.action });
}

if (behavior.global) {
  checks.push({ name: "global_amount_asks_decision", pass: behavior.global.action === "NEEDS_GLOBAL_AMOUNT_DECISION" && String(behavior.global.telegram_message).includes("varias actividades con un solo monto"), value: behavior.global.action });
  checks.push({ name: "global_amount_no_auto_split", pass: !String(behavior.global.telegram_message).includes("50/50") && !String(behavior.global.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: "no auto split" });
  checks.push({ name: "global_split_asks_line_amounts", pass: behavior.globalSplit.action === "NEEDS_LINE_AMOUNTS" && String(behavior.globalSplit.telegram_message).includes("No divido 50/50"), value: behavior.globalSplit.action });
  checks.push({ name: "global_integral_warns", pass: behavior.globalIntegral.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.globalIntegral.telegram_message).includes("servicio integral"), value: behavior.globalIntegral.action });
}

checks.push({ name: "review_required_all_outputs", pass: [behavior.seven, behavior.eleven, behavior.material, behavior.global].every((item) => String(item?.telegram_message || "").includes("BORRADOR SUJETO A REVISION HUMANA")), value: "review" });

console.log("Long invoice and material/labor contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

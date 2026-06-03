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

function demoClient(overrides = {}) {
  return {
    client_id: "CLI-DEMO-RIVERA",
    display_name: "Privada Rivera",
    razon_social: "Privada Rivera Demo",
    rfc: "AAA010101AAA",
    tipo_persona: "MORAL_SIN_FINES_LUCRO",
    regimen_fiscal: "603",
    codigo_postal_fiscal: "00000",
    tax_profile: "PM_NO_LUCRATIVA",
    validated_by_human: false,
    enabled: true,
    aliases: [
      { alias: "privada rivera", normalized_alias: "privada rivera", weight: 100 },
      { alias: "rivera", normalized_alias: "rivera", weight: 80 },
    ],
    ...overrides,
  };
}

const taxRules = [
  { rule_id: "RESICO-PM-NO-LUCRATIVA-INSTALACION-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 9801,
    chat_id: "chat-client-fuzzy-test",
    message_id: String((extra.update_id || 9801) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 9800 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function decisionStateFrom(response, originalText) {
  return {
    state: "NEEDS_CLIENT_DECISION",
    original_text: originalText,
    context: response.json_debug || {},
  };
}

function messageForClientQuery(query) {
  return `${query}, instalacion de camara CCTV 800 + IVA`;
}

function suggestsRivera(response) {
  const text = String(response.telegram_message || "");
  const candidates = response.json_debug?.candidate_clients || [];
  return response.action === "NEEDS_CLIENT_DECISION" &&
    text.includes("cliente parecido") &&
    text.includes("Privada Rivera") &&
    candidates.some((client) => client.client_id === "CLI-DEMO-RIVERA");
}

const checks = [];
let workflowText = "";
let localWorkflowText = "";
let workflow = null;
let localWorkflow = null;
let handleCode = "";
let localHandleCode = "";
let behavior = {};

try {
  workflowText = fs.readFileSync(workflowPath, "utf8");
  localWorkflowText = fs.readFileSync(localWorkflowPath, "utf8");
  workflow = JSON.parse(workflowText);
  localWorkflow = JSON.parse(localWorkflowText);
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  localHandleCode = getNode(localWorkflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "postgres/local parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

if (workflow) {
  for (const fn of ["resolveClientCandidates", "scoreClientAlias", "clientBestTokenSimilarity", "clientDecisionHelpMessage"]) {
    checks.push({ name: `fuzzy_fn:${fn}`, pass: handleCode.includes(`function ${fn}`) && localHandleCode.includes(`function ${fn}`), value: fn });
  }
  checks.push({ name: "threshold_092_present", pass: handleCode.includes("0.92") && handleCode.includes("0.65"), value: "0.92/0.65" });
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pac", pass: !/\bPAC\b/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_timbrado", pass: !/timbrad|timbre_fiscal|stamp_cfdi/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_whatsapp", pass: !/WhatsApp|whatsapp/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pdf", pass: !/\bPDF\b|constancia/i.test(workflowText + localWorkflowText), value: "none" });
}

try {
  for (const [key, query] of Object.entries({
    ricrsa: "Privada ricrsa",
    riveira: "Privada Riveira",
    riviera: "Privada Riviera",
    river: "privada river",
    pRiviera: "p riviera",
  })) {
    behavior[key] = executeCode(handleCode, contextInput(messageForClientQuery(query), { update_id: 9801 + Object.keys(behavior).length }));
  }
  behavior.rivera = executeCode(handleCode, contextInput(messageForClientQuery("Rivera"), { update_id: 9810 }));
  behavior.oldDecision = behavior.ricrsa;
  const oldState = decisionStateFrom(behavior.oldDecision, messageForClientQuery("Privada ricrsa"));
  behavior.research = executeCode(handleCode, contextInput("Privada Riviera", { update_id: 9811, chat_state: oldState }));
  behavior.help = executeCode(handleCode, contextInput("?", { update_id: 9812, chat_state: oldState }));
  behavior.useCandidate = executeCode(handleCode, contextInput("1", { update_id: 9813, chat_state: oldState }));
  behavior.createBasic = executeCode(handleCode, contextInput("3", { update_id: 9814, chat_state: oldState }));
  behavior.confirmAmbiguous = executeCode(handleCode, contextInput("confirmar", { update_id: 9815, chat_state: oldState }));
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.ricrsa) {
  checks.push({ name: "privada_ricrsa_suggests_rivera", pass: suggestsRivera(behavior.ricrsa), value: behavior.ricrsa.action });
  checks.push({ name: "privada_riveira_suggests_rivera", pass: suggestsRivera(behavior.riveira), value: behavior.riveira.action });
  checks.push({ name: "privada_riviera_suggests_rivera", pass: suggestsRivera(behavior.riviera), value: behavior.riviera.action });
  checks.push({ name: "rivera_finds_privada_rivera", pass: behavior.rivera.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.rivera.telegram_message).includes("Cliente: Privada Rivera"), value: behavior.rivera.action });
  checks.push({ name: "privada_river_suggests_rivera", pass: suggestsRivera(behavior.river), value: behavior.river.action });
  checks.push({ name: "p_riviera_suggests_rivera", pass: suggestsRivera(behavior.pRiviera), value: behavior.pRiviera.action });
  checks.push({ name: "decision_text_researches_new_query", pass: suggestsRivera(behavior.research) && behavior.research.json_debug?.client_query === "Privada Riviera", value: behavior.research.json_debug?.client_query });
  checks.push({ name: "decision_help_contextual", pass: behavior.help.action === "NEEDS_CLIENT_DECISION" && String(behavior.help.telegram_message).includes("Estoy intentando resolver el cliente") && String(behavior.help.telegram_message).includes("Cliente buscado: Privada ricrsa"), value: behavior.help.action });
  checks.push({ name: "decision_1_uses_candidate", pass: behavior.useCandidate.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.useCandidate.telegram_message).includes("Cliente: Privada Rivera"), value: behavior.useCandidate.action });
  checks.push({ name: "decision_3_creates_basic", pass: behavior.createBasic.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.createBasic.persistence_sql).includes("INSERT INTO cfdi_clients") && String(behavior.createBasic.telegram_message).includes("Cliente: Privada ricrsa"), value: behavior.createBasic.action });
  checks.push({ name: "confirm_with_ambiguous_client_blocks_draft", pass: behavior.confirmAmbiguous.action === "NEEDS_CLIENT_DECISION" && String(behavior.confirmAmbiguous.telegram_message).includes("cliente") && !String(behavior.confirmAmbiguous.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.confirmAmbiguous.action });
}

console.log("Client fuzzy contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

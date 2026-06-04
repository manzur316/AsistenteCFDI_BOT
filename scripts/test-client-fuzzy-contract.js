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
    validated_by_human: true,
    enabled: true,
    aliases: [
      { alias: "privada rivera", normalized_alias: "privada rivera", weight: 100 },
      { alias: "rivera", normalized_alias: "rivera", weight: 90 },
    ],
    ...overrides,
  };
}

function areatzaClient(overrides = {}) {
  return demoClient({
    client_id: "CLI-AREATZA",
    display_name: "Privada Areatza",
    razon_social: "Privada Areatza AC",
    rfc: "PAR211126A95",
    aliases: [
      { alias: "privada areatza", normalized_alias: "privada areatza", weight: 100 },
      { alias: "areatza", normalized_alias: "areatza", weight: 90 },
    ],
    ...overrides,
  });
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
    clients: extra.clients || [areatzaClient(), demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 9800 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function messageForClientQuery(query) {
  return `${query}, instalacion de camara CCTV 800 + IVA`;
}

function candidateNames(response) {
  const candidates = response.json_debug?.candidate_clients || response.json_debug?.top_client_candidates || [];
  return candidates.map((client) => client.display_name || client.client_id);
}

function resolvesTo(response, clientId) {
  if (response.client?.client_id === clientId) return true;
  const candidates = response.json_debug?.candidate_clients || response.json_debug?.top_client_candidates || [];
  return candidates.some((client) => client.client_id === clientId);
}

function notRivera(response) {
  return !resolvesTo(response, "CLI-DEMO-RIVERA") && !String(response.telegram_message || "").includes("Privada Rivera");
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
  for (const fn of ["resolveClientCandidates", "scoreClientAlias", "clientBestTokenSimilarity", "distinctiveClientTokens", "clientDecisionHelpMessage"]) {
    checks.push({ name: `fuzzy_fn:${fn}`, pass: handleCode.includes(`function ${fn}`) && localHandleCode.includes(`function ${fn}`), value: fn });
  }
  for (const stopword of ["privada", "residencial", "fraccionamiento", "condominio", "cliente", "sociedad", "asociacion", "sa", "ac"]) {
    checks.push({ name: `client_stopword:${stopword}`, pass: handleCode.includes(`"${stopword}"`) && localHandleCode.includes(`"${stopword}"`), value: stopword });
  }
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pac", pass: !/\bPAC\b/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_timbrado", pass: !/timbrad|timbre_fiscal|stamp_cfdi/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_whatsapp", pass: !/WhatsApp|whatsapp/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pdf", pass: !/\bPDF\b|constancia/i.test(workflowText + localWorkflowText), value: "none" });
}

try {
  behavior.ariatza = executeCode(handleCode, contextInput(messageForClientQuery("Ariatza"), { update_id: 9801 }));
  behavior.privadaAriatza = executeCode(handleCode, contextInput(messageForClientQuery("Privada Ariatza"), { update_id: 9802 }));
  behavior.areatza = executeCode(handleCode, contextInput(messageForClientQuery("Areatza"), { update_id: 9803 }));
  behavior.privadaAreatza = executeCode(handleCode, contextInput(messageForClientQuery("Privada Areatza"), { update_id: 9804 }));
  behavior.rivera = executeCode(handleCode, contextInput(messageForClientQuery("Rivera"), { update_id: 9805 }));
  behavior.ricrsa = executeCode(handleCode, contextInput(messageForClientQuery("Privada ricrsa"), { update_id: 9806 }));
  behavior.stopwordOnly = executeCode(handleCode, contextInput(messageForClientQuery("Privada"), { update_id: 9807 }));
  behavior.realMessage = executeCode(handleCode, contextInput("Ariatza, instalacion de camara CCTV 800 + IVA, servicio de mantenimiento Equipo CCTV 500 + IVA.", { update_id: 9808 }));
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.ariatza) {
  checks.push({ name: "ariatza_suggests_areatza", pass: behavior.ariatza.action === "NEEDS_CLIENT_DECISION" && resolvesTo(behavior.ariatza, "CLI-AREATZA"), value: `${behavior.ariatza.action}/${candidateNames(behavior.ariatza).join(",")}` });
  checks.push({ name: "privada_ariatza_suggests_areatza", pass: behavior.privadaAriatza.action === "NEEDS_CLIENT_DECISION" && resolvesTo(behavior.privadaAriatza, "CLI-AREATZA"), value: `${behavior.privadaAriatza.action}/${candidateNames(behavior.privadaAriatza).join(",")}` });
  checks.push({ name: "ariatza_does_not_suggest_rivera", pass: notRivera(behavior.ariatza), value: candidateNames(behavior.ariatza).join(",") });
  checks.push({ name: "privada_ricrsa_does_not_suggest_rivera", pass: notRivera(behavior.ricrsa), value: `${behavior.ricrsa.action}/${candidateNames(behavior.ricrsa).join(",")}` });
  checks.push({ name: "stopword_only_does_not_suggest_rivera", pass: notRivera(behavior.stopwordOnly), value: `${behavior.stopwordOnly.action}/${candidateNames(behavior.stopwordOnly).join(",")}` });
  checks.push({ name: "rivera_resolves_rivera", pass: resolvesTo(behavior.rivera, "CLI-DEMO-RIVERA"), value: `${behavior.rivera.action}/${behavior.rivera.client?.display_name || candidateNames(behavior.rivera).join(",")}` });
  checks.push({ name: "areatza_resolves_areatza", pass: resolvesTo(behavior.areatza, "CLI-AREATZA"), value: `${behavior.areatza.action}/${behavior.areatza.client?.display_name || candidateNames(behavior.areatza).join(",")}` });
  checks.push({ name: "privada_areatza_resolves_areatza", pass: resolvesTo(behavior.privadaAreatza, "CLI-AREATZA"), value: `${behavior.privadaAreatza.action}/${behavior.privadaAreatza.client?.display_name || candidateNames(behavior.privadaAreatza).join(",")}` });
  checks.push({ name: "real_message_only_lists_areatza", pass: behavior.realMessage.action === "NEEDS_CLIENT_DECISION" && candidateNames(behavior.realMessage).length === 1 && candidateNames(behavior.realMessage)[0] === "Privada Areatza", value: candidateNames(behavior.realMessage).join(",") });
}

console.log("Client fuzzy contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

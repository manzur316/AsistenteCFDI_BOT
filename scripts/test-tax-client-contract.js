const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json");
const migrationPath = path.join(root, "sql", "003_clients_amounts_tax.sql");
const seedPath = path.join(root, "sql", "003_seed_clients.example.sql");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0);
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
    uso_cfdi_default: "G03",
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

function pfClient() {
  return {
    client_id: "CLI-DEMO-PF",
    display_name: "Cliente PF Demo",
    rfc: "XAXX010101000",
    tipo_persona: "FISICA",
    regimen_fiscal: "612",
    codigo_postal_fiscal: "00000",
    tax_profile: "PF_GENERAL",
    validated_by_human: true,
    enabled: true,
    aliases: [{ alias: "cliente pf", normalized_alias: "cliente pf", weight: 100 }],
  };
}

const taxRules = [
  { rule_id: "RESICO-PF-SERVICIO-CONSERVADOR", receiver_tipo_persona: "FISICA", receiver_tax_profile: "PF_GENERAL", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-PRODUCTO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 7101,
    chat_id: "chat-tax-test",
    message_id: String((extra.update_id || 7101) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: extra.clients || [demoClient(), pfClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 7000 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

const checks = [];
checks.push({ name: "migration_exists", pass: fs.existsSync(migrationPath), value: migrationPath });
checks.push({ name: "seed_exists", pass: fs.existsSync(seedPath), value: seedPath });

let migration = "";
let seed = "";
let workflow = null;
let handleCode = "";
let buildContextCode = "";
try {
  migration = read(migrationPath);
  seed = read(seedPath);
  workflow = JSON.parse(read(workflowPath));
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  buildContextCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

for (const table of ["cfdi_clients", "cfdi_client_aliases", "cfdi_tax_rules", "cfdi_draft_line_items"]) {
  checks.push({ name: `table:${table}`, pass: migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`), value: table });
}

for (const column of ["client_id text", "client_snapshot jsonb", "amount numeric(12,2)", "tax_mode text", "subtotal numeric(12,2)", "tax_summary jsonb", "tax_review_required boolean"]) {
  checks.push({ name: `draft_column:${column}`, pass: migration.includes(`ADD COLUMN IF NOT EXISTS ${column}`), value: column });
}

checks.push({ name: "tax_rule_pf_service", pass: migration.includes("RESICO-PF-SERVICIO-CONSERVADOR") && migration.includes("'FISICA'") && migration.includes("'PF_GENERAL'"), value: "PF service" });
checks.push({ name: "tax_rule_pm_service_retention", pass: migration.includes("RESICO-PM-SERVICIO-CONSERVADOR") && migration.includes("0.0125") && migration.includes("0.106667"), value: "PM service retention" });
checks.push({ name: "tax_rule_pm_product_retention", pass: migration.includes("RESICO-PM-PRODUCTO-CONSERVADOR") && migration.includes("'PRODUCTO', 0.16, 0.0125, 0"), value: "PM product retention" });
checks.push({ name: "tax_rule_unknown_conservative", pass: migration.includes("RESICO-DESCONOCIDO-CONSERVADOR") && migration.includes("no se calculan retenciones"), value: "DESCONOCIDO" });

checks.push({ name: "seed_only_demo_client", pass: seed.includes("CLI-DEMO-RIVERA") && !seed.includes("Juandi") && !seed.includes("Emberhub") && !seed.includes("CLIENTE_REAL"), value: "demo only" });
checks.push({ name: "seed_demo_not_validated", pass: seed.includes("validated_by_human") && seed.includes("false"), value: "human=false" });
checks.push({ name: "seed_demo_aliases", pass: seed.includes("privada rivera") && seed.includes("rivera"), value: "aliases" });

if (workflow) {
  for (const command of ["/clientes", "/cliente", "/nuevocliente", "/setcliente", "/editarcliente"]) {
    checks.push({ name: `command:${command}`, pass: handleCode.includes(command), value: command });
  }
  for (const fn of ["extractClientQuery", "resolveClientByAlias", "extractAmount", "detectTaxMode", "detectOperationOverride", "calculateAmounts"]) {
    checks.push({ name: `parser_fn:${fn}`, pass: handleCode.includes(`function ${fn}`), value: fn });
  }
  checks.push({ name: "context_loads_clients", pass: buildContextCode.includes("cfdi_clients") && buildContextCode.includes("cfdi_client_aliases"), value: "clients" });
  checks.push({ name: "context_loads_tax_rules", pass: buildContextCode.includes("cfdi_tax_rules"), value: "tax rules" });
  checks.push({ name: "no_real_telegram_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(JSON.stringify(workflow)), value: "none" });
  const workflowText = JSON.stringify(workflow);
  checks.push({
    name: "no_webhook_no_pac_no_whatsapp",
    pass: !/(webhook|telegramTrigger|WhatsApp API|\bPAC\b)/i.test(workflowText),
    value: "local polling only",
  });
}

let behavior = {};
try {
  behavior.needsMode = executeCode(handleCode, contextInput("cliente privada rivera, revis\u00e9 c\u00e1maras hikvision, servicio y quiero cobrar 800 pesos"))[0].json;
  const state = {
    state: "NEEDS_TAX_MODE",
    original_text: "cliente privada rivera, revis\u00e9 c\u00e1maras hikvision, servicio y quiero cobrar 800 pesos",
    context: {
      draft_id: "DRAFT-TEST-TAX",
      amount: 800,
      client: demoClient(),
      operation_type: "SERVICIO",
      line: { concept_id: "SVC-CCTV-001", concepto_factura: "SERVICIO CCTV", operation_type: "SERVICIO" },
    },
  };
  behavior.modeReply = executeCode(handleCode, contextInput("1", { update_id: 7102, chat_state: state }))[0].json;
  behavior.productIncluded = executeCode(handleCode, contextInput("cliente privada rivera, venta de fuente de poder para c\u00e1mara por 350 iva incluido", { update_id: 7103 }))[0].json;
  behavior.pfService = executeCode(handleCode, contextInput("cliente cliente pf, revis\u00e9 c\u00e1maras hikvision por 800 mas iva", { update_id: 7104 }))[0].json;
  behavior.noClient = executeCode(handleCode, contextInput("revis\u00e9 c\u00e1maras hikvision por 800 mas iva", { update_id: 7105 }))[0].json;
  behavior.unvalidated = executeCode(handleCode, contextInput("cliente privada rivera, revis\u00e9 c\u00e1maras hikvision por 800 mas iva", { update_id: 7106 }))[0].json;
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.needsMode) {
  checks.push({ name: "parser_detects_demo_client", pass: behavior.needsMode.client?.client_id === "CLI-DEMO-RIVERA", value: behavior.needsMode.client?.client_id || "none" });
  checks.push({ name: "parser_detects_amount", pass: behavior.needsMode.amount === 800, value: behavior.needsMode.amount });
  checks.push({ name: "parser_detects_unknown_tax_mode", pass: behavior.needsMode.tax_mode === "UNKNOWN" && String(behavior.needsMode.telegram_message).includes("responde 1"), value: behavior.needsMode.tax_mode });
  checks.push({ name: "unknown_tax_mode_saves_state", pass: String(behavior.needsMode.persistence_sql).includes("NEEDS_TAX_MODE"), value: "chat_state" });
}

if (behavior.modeReply) {
  checks.push({ name: "mode_reply_applies_mas_iva", pass: behavior.modeReply.action === "TAX_MODE_UPDATED" && behavior.modeReply.tax_mode === "MAS_IVA", value: `${behavior.modeReply.action}/${behavior.modeReply.tax_mode}` });
  checks.push({ name: "pm_service_isr_125", pass: String(behavior.modeReply.telegram_message).includes("ISR retenido: 10.00") && behavior.modeReply.tax_summary?.tax_rule_id === "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", value: behavior.modeReply.tax_summary?.tax_rule_id || "none" });
  checks.push({ name: "pm_service_iva_retention", pass: String(behavior.modeReply.telegram_message).includes("IVA retenido: 85.33"), value: "IVA retencion" });
}

if (behavior.productIncluded) {
  checks.push({ name: "product_power_supply_concept", pass: behavior.productIncluded.action === "SUGERIR" && behavior.productIncluded.concept?.id === "PROD-CCTV-007", value: `${behavior.productIncluded.action}/${behavior.productIncluded.concept?.id}` });
  checks.push({ name: "product_iva_included", pass: behavior.productIncluded.tax_mode === "IVA_INCLUIDO" && behavior.productIncluded.amount === 350, value: `${behavior.productIncluded.tax_mode}/${behavior.productIncluded.amount}` });
  checks.push({ name: "product_review_required", pass: behavior.productIncluded.tax_review_required === true && String(behavior.productIncluded.telegram_message).includes("BORRADOR SUJETO A REVISION HUMANA"), value: "review=true" });
}

if (behavior.pfService) {
  checks.push({ name: "pf_no_retentions", pass: String(behavior.pfService.telegram_message).includes("ISR retenido: 0.00") && String(behavior.pfService.telegram_message).includes("IVA retenido: 0.00"), value: "PF no ret" });
}

if (behavior.noClient) {
  checks.push({ name: "no_client_no_retentions", pass: behavior.noClient.client === null && String(behavior.noClient.telegram_message).includes("Retenciones: no calculadas (sin_cliente)"), value: "sin_cliente" });
}

if (behavior.unvalidated) {
  checks.push({ name: "unvalidated_client_forces_review", pass: behavior.unvalidated.tax_review_required === true && behavior.unvalidated.tax_summary?.client_validated_by_human === false, value: "review=true" });
}

const changedFiles = git(["diff", "--name-only"]);
checks.push({ name: "catalog_not_modified", pass: !changedFiles.includes("data/concepts.normalized.json"), value: "data/concepts.normalized.json" });
checks.push({ name: "excel_not_modified", pass: !changedFiles.includes("data/base_cfdi_resico_n8n_emberhub_2026.xlsx"), value: "excel" });

const passCount = checks.filter((check) => check.pass).length;

console.log("Tax client contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

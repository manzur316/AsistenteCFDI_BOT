const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_postgres_polling.n8n.json");
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
  { rule_id: "RESICO-PF-SERVICIO-CONSERVADOR", receiver_tipo_persona: "FISICA", receiver_tax_profile: "PF_GENERAL", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRATIVA-INSTALACION-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-PRODUCTO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 9001,
    chat_id: "chat-wizard-test",
    message_id: String((extra.update_id || 9001) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 9000 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function confirmStateFrom(preview) {
  const draftId = preview.json_debug?.draft_id || "DRAFT-WIZARD-TEST";
  const concept = preview.concept || {};
  const line = {
    line_id: `LINE-${draftId}-1`,
    draft_id: draftId,
    line_number: 1,
    concept_id: concept.id,
    concepto_factura: concept.concepto_factura,
    clave_prod_serv: concept.clave_prod_serv,
    clave_unidad: concept.clave_unidad,
    unidad: concept.unidad,
    family: concept.familia,
    item_type: concept.tipo,
    operation_type: concept.operacion || "SERVICIO",
    unit_price: preview.amount,
    subtotal: 800,
    iva_rate: 0.16,
    iva_amount: 128,
    isr_retention_rate: 0,
    isr_retention_amount: 0,
    iva_retention_rate: 0,
    iva_retention_amount: 0,
    total: 928,
    tax_mode: preview.tax_mode,
  };
  return {
    state: "NEEDS_CONFIRM_DRAFT",
    original_text: preview.message_original,
    context: {
      pending_invoice_context: {
        draft_id: draftId,
        original_text: preview.message_original,
        client: demoClient(),
        amount: preview.amount,
        tax_mode: preview.tax_mode,
        concept,
        calc: { subtotal: 800, iva_amount: 128, isr_retention_amount: 0, iva_retention_amount: 0, total: 928 },
        tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
        line_items: [line],
        preview_draft: {
          draft_id: draftId,
          chat_id: "chat-wizard-test",
          update_id: preview.update_id,
          message_original: preview.message_original,
          status: "PENDIENTE",
          action: "SUGERIR",
          ready_to_copy: true,
          requires_human_review: true,
          concept,
          top_3: preview.top_3 || [],
          telegram_message: preview.telegram_message,
          client_id: "CLI-DEMO-RIVERA",
          client_snapshot: demoClient(),
          amount: preview.amount,
          tax_mode: preview.tax_mode,
          subtotal: 800,
          iva_amount: 128,
          isr_retention_amount: 0,
          iva_retention_amount: 0,
          total: 928,
          tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
          tax_review_required: true,
        },
      },
    },
  };
}

const checks = [];
let workflow = null;
let handleCode = "";
let behavior = {};

try {
  workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

if (workflow) {
  for (const fn of ["parseInvoiceIntent", "extractClientQuery", "resolveClientByAlias", "extractWorkText", "extractAmount", "detectTaxMode", "detectOperationType", "detectNumberedLineItems", "detectMultiConcept", "computeMissingFields", "buildDraftPreview"]) {
    checks.push({ name: `parser_fn:${fn}`, pass: handleCode.includes(`function ${fn}`), value: fn });
  }
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(JSON.stringify(workflow)), value: "none" });
  checks.push({ name: "no_webhook", pass: !/webhook|telegramTrigger/i.test(JSON.stringify(workflow)), value: "polling" });
  checks.push({ name: "no_pac_whatsapp_pdf", pass: !/\bPAC\b|WhatsApp|PDF|constancia/i.test(JSON.stringify(workflow)), value: "none" });
}

try {
  behavior.start = executeCode(handleCode, contextInput("/factura"));
  behavior.newPhrase = executeCode(handleCode, contextInput("factura nueva", { update_id: 9002 }));
  behavior.wizardWork = executeCode(handleCode, contextInput("Instale una camara de CCTV", { update_id: 9003, chat_state: { state: "INVOICE_WIZARD", original_text: "/factura", context: { invoice_context: { step: "COLLECTING_DATA" } } } }));
  behavior.wizardAmount = executeCode(handleCode, contextInput("Voy a cobrar 800 + IVA", { update_id: 9004, chat_state: { state: "INVOICE_WIZARD", original_text: "/factura", context: { invoice_context: { work_text: "Instale una camara de CCTV" } } } }));
  behavior.fast = executeCode(handleCode, contextInput("Privada Rivera, instalacion de camara de vigilancia, 800 +IVA", { update_id: 9005 }));
  behavior.unknownClient = executeCode(handleCode, contextInput("Cliente Fantasma, revise camaras por 800 +IVA", { update_id: 9006 }));
  behavior.createUnknown = executeCode(handleCode, contextInput("1", { update_id: 9007, chat_state: { state: "NEEDS_CLIENT_DECISION", original_text: "Cliente Fantasma, revise camaras por 800 +IVA", context: { client_query: "Fantasma", pending_invoice_context: { client_query: "Fantasma", work_text: "revise camaras", amount: 800, tax_mode: "MAS_IVA", original_text: "Cliente Fantasma, revise camaras por 800 +IVA" } } } }));
  behavior.newClient = executeCode(handleCode, contextInput("/nuevocliente", { update_id: 9008 }));
  behavior.clientTemplate = executeCode(handleCode, contextInput("Cliente: Cliente Demo\nAlias: demo uno, demo dos\nRazon social: Cliente Demo SA\nRFC: XAXX010101000\nRegimen fiscal: 601\nCP fiscal: 00000\nUso CFDI: G03\nTipo persona: MORAL", { update_id: 9009, chat_state: { state: "NEEDS_CLIENT_TEMPLATE", original_text: "/nuevocliente", context: {} } }));
  behavior.editClient = executeCode(handleCode, contextInput("/editarcliente CLI-DEMO-RIVERA rfc XAXX010101000", { update_id: 9010 }));
  behavior.validateClient = executeCode(handleCode, contextInput("/validarcliente CLI-DEMO-RIVERA", { update_id: 9011 }));
  behavior.needsTax = executeCode(handleCode, contextInput("revise camaras por 800", { update_id: 9012 }));
  behavior.taxReply = executeCode(handleCode, contextInput("1", { update_id: 9013, chat_state: { state: "NEEDS_TAX_MODE", original_text: "revise camaras por 800", context: { pending_invoice_context: { work_text: "revise camaras", amount: 800, original_text: "revise camaras por 800" } } } }));
  behavior.power = executeCode(handleCode, contextInput("cliente privada rivera, venta de fuente de poder para camara por 350 iva incluido", { update_id: 9014 }));
  behavior.numbered = executeCode(handleCode, contextInput("Privada Rivera,\n1. instalacion de camara de vigilancia, 800 +IVA\n2. venta de equipo de computo, 1200 IVA incluido", { update_id: 9015 }));
  behavior.unnumbered = executeCode(handleCode, contextInput("revise camaras hikvision\nservicio tecnico general", { update_id: 9016 }));
  behavior.cancel = executeCode(handleCode, contextInput("/cancelar", { update_id: 9017, chat_state: { state: "INVOICE_WIZARD", original_text: "/factura", context: {} } }));
  behavior.approved = executeCode(handleCode, contextInput("/aprobadas", { update_id: 9018 }));
  behavior.pending = executeCode(handleCode, contextInput("/pendientes", { update_id: 9019 }));
  behavior.idle = executeCode(handleCode, contextInput("hola", { update_id: 9020 }));
  behavior.confirm = executeCode(handleCode, contextInput("confirmar", { update_id: 9021, chat_state: confirmStateFrom(behavior.fast) }));
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.start) {
  checks.push({ name: "factura_starts_wizard", pass: behavior.start.action === "INVOICE_WIZARD" && String(behavior.start.persistence_sql).includes("INVOICE_WIZARD"), value: behavior.start.action });
  checks.push({ name: "factura_template", pass: String(behavior.start.telegram_message).includes("Cliente:") && String(behavior.start.telegram_message).includes("Trabajo:"), value: "template" });
  checks.push({ name: "factura_nueva_starts_wizard", pass: behavior.newPhrase.action === "INVOICE_WIZARD", value: behavior.newPhrase.action });
  checks.push({ name: "wizard_work_saved", pass: behavior.wizardWork.action === "INVOICE_WIZARD" && String(behavior.wizardWork.persistence_sql).includes("Instale una camara"), value: behavior.wizardWork.action });
  checks.push({ name: "wizard_amount_updates", pass: ["NEEDS_CONFIRM_DRAFT", "NEEDS_TAX_MODE"].includes(behavior.wizardAmount.action) && behavior.wizardAmount.amount === 800, value: `${behavior.wizardAmount.action}/${behavior.wizardAmount.amount}` });
  checks.push({ name: "fast_detects_demo_client", pass: behavior.fast.action === "NEEDS_CONFIRM_DRAFT" && behavior.fast.client?.client_id === "CLI-DEMO-RIVERA", value: behavior.fast.client?.client_id || "none" });
  checks.push({ name: "fast_preview_no_draft_yet", pass: String(behavior.fast.telegram_message).includes("BORRADOR CFDI") && !String(behavior.fast.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.fast.action });
  checks.push({ name: "unknown_client_decision", pass: behavior.unknownClient.action === "NEEDS_CLIENT_DECISION" && String(behavior.unknownClient.telegram_message).includes("Crear cliente basico"), value: behavior.unknownClient.action });
  checks.push({ name: "unknown_reply_creates_basic_client", pass: String(behavior.createUnknown.persistence_sql).includes("INSERT INTO cfdi_clients") && String(behavior.createUnknown.telegram_message).includes("no validado"), value: behavior.createUnknown.action });
  checks.push({ name: "newclient_template", pass: behavior.newClient.action === "NEEDS_CLIENT_TEMPLATE" && String(behavior.newClient.telegram_message).includes("Tipo persona"), value: behavior.newClient.action });
  checks.push({ name: "client_template_creates_unvalidated", pass: behavior.clientTemplate.action === "CLIENT_CREATED" && String(behavior.clientTemplate.persistence_sql).includes("validated_by_human") && String(behavior.clientTemplate.persistence_sql).includes("false"), value: behavior.clientTemplate.action });
  checks.push({ name: "edit_client_marks_unvalidated", pass: behavior.editClient.action === "COMMAND_EDITARCLIENTE" && String(behavior.editClient.persistence_sql).includes("validated_by_human = false"), value: behavior.editClient.action });
  checks.push({ name: "validate_client_marks_true", pass: behavior.validateClient.action === "COMMAND_VALIDARCLIENTE" && String(behavior.validateClient.persistence_sql).includes("validated_by_human = true"), value: behavior.validateClient.action });
  checks.push({ name: "amount_without_tax_mode_asks", pass: behavior.needsTax.action === "NEEDS_TAX_MODE" && String(behavior.needsTax.telegram_message).includes("1 = +IVA"), value: behavior.needsTax.action });
  checks.push({ name: "tax_reply_builds_preview", pass: behavior.taxReply.action === "NEEDS_CONFIRM_DRAFT" && behavior.taxReply.tax_mode === "MAS_IVA", value: `${behavior.taxReply.action}/${behavior.taxReply.tax_mode}` });
  checks.push({ name: "power_source_product", pass: behavior.power.action === "NEEDS_CONFIRM_DRAFT" && behavior.power.concept?.id === "PROD-CCTV-007", value: `${behavior.power.action}/${behavior.power.concept?.id}` });
  checks.push({ name: "numbered_multiline_preview", pass: behavior.numbered.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.numbered.persistence_sql).includes("LINE-") && String(behavior.numbered.telegram_message).includes("Lineas:"), value: behavior.numbered.action });
  checks.push({ name: "unnumbered_multiline_split", pass: behavior.unnumbered.action === "PEDIR_SEPARAR_MENSAJES", value: behavior.unnumbered.action });
  checks.push({ name: "cancel_clears_state", pass: behavior.cancel.action === "COMMAND_CANCELAR" && String(behavior.cancel.persistence_sql).includes("DELETE FROM chat_states"), value: behavior.cancel.action });
  checks.push({ name: "aprobadas_not_hoy", pass: behavior.approved.action === "COMMAND_APROBADAS" && !String(behavior.approved.telegram_message).includes("Resumen de hoy"), value: behavior.approved.action });
  checks.push({ name: "pendientes_no_draft", pass: behavior.pending.action === "COMMAND_PENDIENTES" && !String(behavior.pending.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.pending.action });
  checks.push({ name: "hola_idle", pass: behavior.idle.action === "IDLE_HELP" && !String(behavior.idle.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.idle.action });
  checks.push({ name: "confirm_creates_draft_and_line", pass: behavior.confirm.action === "DRAFT_CONFIRMED" && String(behavior.confirm.persistence_sql).includes("INSERT INTO cfdi_drafts") && String(behavior.confirm.persistence_sql).includes("INSERT INTO cfdi_draft_line_items"), value: behavior.confirm.action });
  checks.push({ name: "review_warning_every_tax_output", pass: [behavior.fast, behavior.taxReply, behavior.power, behavior.confirm].every((item) => String(item.telegram_message).includes("BORRADOR SUJETO A REVISION HUMANA")), value: "review" });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Invoice wizard contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

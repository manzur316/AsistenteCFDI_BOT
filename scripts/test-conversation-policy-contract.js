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
  { rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-PRODUCTO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 9601,
    chat_id: "chat-policy-test",
    message_id: String((extra.update_id || 9601) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: extra.clients || [demoClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 9600 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function rawLine(lineNumber, raw) {
  const amountMatch = String(raw).match(/(\d+(?:\.\d{1,2})?)\s*(?:\+?\s*IVA|mas\s+IVA|IVA\s+incluido|con\s+IVA)/i);
  return {
    line_number: lineNumber,
    raw,
    work_text: raw.replace(/(\d+(?:\.\d{1,2})?)\s*(?:\+?\s*IVA|mas\s+IVA|IVA\s+incluido|con\s+IVA)/ig, "").trim(),
    amount: amountMatch ? Number(amountMatch[1]) : null,
    tax_mode: /incluido|con\s+IVA/i.test(raw) ? "IVA_INCLUIDO" : "MAS_IVA",
    operation_type: /venta/i.test(raw) ? "PRODUCTO" : /instal/i.test(raw) ? "SERVICIO_INSTALACION" : "SERVICIO",
  };
}

function lineClarificationState() {
  const pending = {
    draft_id: "DRAFT-LINE-POLICY",
    original_text: "Privada Rivera,\n1. servicio tecnico general 800 +IVA\n2. venta de camara CCTV 700 +IVA",
    client: demoClient(),
    client_query: "Privada Rivera",
    client_confirmed: true,
    tax_mode: "MAS_IVA",
    line_items: [
      rawLine(1, "servicio tecnico general 800 +IVA"),
      rawLine(2, "venta de camara CCTV 700 +IVA"),
    ],
    blockers: [{ type: "linea_ambigua", line_number: 1, line_text: "servicio tecnico general 800 +IVA", missing_reason: "falta sistema/equipo atendido" }],
  };
  return {
    state: "LINE_NEEDS_CLARIFICATION",
    original_text: pending.original_text,
    context: {
      pending_invoice_context: pending,
      line_number: 1,
      line_text: "servicio tecnico general 800 +IVA",
      missing_reason: "falta sistema/equipo atendido",
      pending_lines: pending.line_items,
    },
  };
}

function previewState({ blockers = [] } = {}) {
  const concept = {
    id: "SVC-CCTV-001",
    concepto_factura: "SERVICIO DE DIAGNOSTICO Y REVISION DE SISTEMA DE VIDEOVIGILANCIA CCTV",
    clave_prod_serv: "81111811",
    clave_unidad: "E48",
    unidad: "Unidad de servicio",
    familia: "CCTV",
    tipo: "SERVICIO",
    operacion: "SERVICIO",
  };
  const line = {
    line_id: "LINE-DRAFT-POLICY-1",
    draft_id: "DRAFT-POLICY",
    line_number: 1,
    concept_id: concept.id,
    concepto_factura: concept.concepto_factura,
    clave_prod_serv: concept.clave_prod_serv,
    clave_unidad: concept.clave_unidad,
    unidad: concept.unidad,
    family: "CCTV",
    item_type: "SERVICIO",
    operation_type: "SERVICIO",
    unit_price: 800,
    subtotal: 800,
    iva_rate: 0.16,
    iva_amount: 128,
    isr_retention_rate: 0,
    isr_retention_amount: 0,
    iva_retention_rate: 0,
    iva_retention_amount: 0,
    total: 928,
    tax_mode: "MAS_IVA",
    line_status: "PENDIENTE",
    concept,
  };
  return {
    state: "PREVIEW_READY",
    original_text: "Privada Rivera, revise camaras por 800 +IVA",
    context: {
      pending_invoice_context: {
        draft_id: "DRAFT-POLICY",
        original_text: "Privada Rivera, revise camaras por 800 +IVA",
        client: demoClient(),
        client_query: "Privada Rivera",
        client_confirmed: true,
        work_text: "revise camaras",
        amount: 800,
        tax_mode: "MAS_IVA",
        concept,
        top_3: [],
        calc: { subtotal: 800, iva_amount: 128, isr_retention_amount: 0, iva_retention_amount: 0, total: 928 },
        tax_summary: { warning: "BORRADOR SUJETO A REVISION HUMANA" },
        line_items: [line],
        blockers,
        preview_draft: {
          draft_id: "DRAFT-POLICY",
          chat_id: "chat-policy-test",
          update_id: 9601,
          message_original: "Privada Rivera, revise camaras por 800 +IVA",
          status: "PENDIENTE",
          action: "SUGERIR",
          ready_to_copy: true,
          requires_human_review: true,
          concept,
          top_3: [],
          telegram_message: "BORRADOR CFDI\nBORRADOR SUJETO A REVISION HUMANA",
          client_id: "CLI-DEMO-RIVERA",
          client_snapshot: demoClient(),
          amount: 800,
          tax_mode: "MAS_IVA",
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
let workflowText = "";
let handleCode = "";
let behavior = {};

try {
  workflowText = fs.readFileSync(workflowPath, "utf8");
  workflow = JSON.parse(workflowText);
  handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
  checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
} catch (error) {
  checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
}

if (workflow) {
  for (const fn of ["similarityRatio", "levenshteinDistance", "lineClarificationMessage", "editingPreviewMessage", "stateSummaryMessage"]) {
    checks.push({ name: `conversation_fn:${fn}`, pass: handleCode.includes(`function ${fn}`), value: fn });
  }
  for (const command of ["/editlinea", "/quitarlinea", "/ver", "/estado"]) {
    checks.push({ name: `command:${command}`, pass: handleCode.includes(command), value: command });
  }
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText), value: "none" });
  checks.push({ name: "no_webhook", pass: !/webhook|telegramTrigger/i.test(workflowText), value: "polling" });
  checks.push({ name: "no_pac", pass: !/\bPAC\b/i.test(workflowText), value: "none" });
  checks.push({ name: "no_whatsapp", pass: !/WhatsApp/i.test(workflowText), value: "none" });
  checks.push({ name: "no_pdf_constancia", pass: !/PDF|constancia/i.test(workflowText), value: "none" });
  checks.push({ name: "no_timbrado_runtime", pass: !/timbre_fiscal|timbrado_cfdi|stamp_cfdi|pac_url|timbrar_endpoint/i.test(workflowText), value: "no timbrado" });
}

try {
  behavior.typoRiviera = executeCode(handleCode, contextInput("Privada Riviera, revise camaras, 1500 + IVA", { update_id: 9601 }));
  behavior.typoRiveira = executeCode(handleCode, contextInput("Privada Riveira, revise camaras, 1500 + IVA", { update_id: 9602 }));
  behavior.editPreview = executeCode(handleCode, contextInput("editar", { update_id: 9603, chat_state: previewState() }));
  behavior.numberedEdit = executeCode(handleCode, contextInput("1.instalacion de camaras 800 + IVA\n2.- VENTA DE camara CCTV 700 + IVA.", { update_id: 9604, chat_state: { state: "EDITING_PREVIEW", original_text: "x", context: { pending_invoice_context: { draft_id: "DRAFT-EDIT", client: demoClient(), client_query: "Privada Rivera", client_confirmed: true, original_text: "x", tax_mode: "MAS_IVA", line_items: [] } } } }));
  behavior.lineAmbiguous = executeCode(handleCode, contextInput("Privada Rivera,\n1. servicio tecnico general 800 +IVA\n2. venta de camara CCTV 700 +IVA", { update_id: 9605 }));
  behavior.lineHelp = executeCode(handleCode, contextInput("Que necesitas ?", { update_id: 9606, chat_state: lineClarificationState() }));
  behavior.lineClarified = executeCode(handleCode, contextInput("cctv", { update_id: 9607, chat_state: lineClarificationState() }));
  behavior.confirmBlocked = executeCode(handleCode, contextInput("confirmar", { update_id: 9608, chat_state: lineClarificationState() }));
  behavior.confirmReady = executeCode(handleCode, contextInput("confirmar", { update_id: 9609, chat_state: previewState() }));
  behavior.editLine = executeCode(handleCode, contextInput("/editlinea 1 instalacion de camara CCTV, 800 +IVA", { update_id: 9610, chat_state: lineClarificationState() }));
  behavior.removeLine = executeCode(handleCode, contextInput("/quitarlinea 2", { update_id: 9611, chat_state: { state: "PREVIEW_READY", original_text: "x", context: { pending_invoice_context: { draft_id: "DRAFT-REMOVE", client: demoClient(), client_query: "Privada Rivera", client_confirmed: true, original_text: "x", tax_mode: "MAS_IVA", line_items: [rawLine(1, "instalacion de camara CCTV 800 +IVA"), rawLine(2, "venta de camara de vigilancia 700 +IVA")], blockers: [] } } } }));
  behavior.ver = executeCode(handleCode, contextInput("/ver", { update_id: 9612, chat_state: previewState() }));
  behavior.estado = executeCode(handleCode, contextInput("/estado", { update_id: 9613, chat_state: previewState({ blockers: [{ type: "monto_faltante" }] }) }));
  behavior.multilineClear = executeCode(handleCode, contextInput("Privada Rivera,\n1. instalacion de camara de vigilancia, 800 +IVA\n2. venta de camara de vigilancia, 700 +IVA", { update_id: 9614 }));
  behavior.cancel = executeCode(handleCode, contextInput("/cancelar", { update_id: 9615, chat_state: previewState() }));
  behavior.idle = executeCode(handleCode, contextInput("hola", { update_id: 9616 }));
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.typoRiviera) {
  checks.push({ name: "typo_riviera_asks_confirmation", pass: behavior.typoRiviera.action === "NEEDS_CLIENT_DECISION" && String(behavior.typoRiviera.telegram_message).includes("Quisiste decir Privada Rivera") && !String(behavior.typoRiviera.persistence_sql).includes("INSERT INTO cfdi_clients"), value: behavior.typoRiviera.action });
  checks.push({ name: "typo_riveira_asks_confirmation", pass: behavior.typoRiveira.action === "NEEDS_CLIENT_DECISION" && String(behavior.typoRiveira.telegram_message).includes("Quisiste decir Privada Rivera"), value: behavior.typoRiveira.action });
  checks.push({ name: "preview_edit_enters_editing", pass: behavior.editPreview.action === "EDITING_PREVIEW" && String(behavior.editPreview.persistence_sql).includes("EDITING_PREVIEW"), value: behavior.editPreview.action });
  checks.push({ name: "numbered_edit_without_comma_previews", pass: behavior.numberedEdit.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.numberedEdit.telegram_message).includes("Lineas:"), value: behavior.numberedEdit.action });
  checks.push({ name: "numbered_line_parses_amount_tax", pass: String(behavior.numberedEdit.persistence_sql).includes("800") && String(behavior.numberedEdit.persistence_sql).includes("MAS_IVA"), value: "800/MAS_IVA" });
  checks.push({ name: "line_ambiguous_explains_missing", pass: behavior.lineAmbiguous.action === "LINE_NEEDS_CLARIFICATION" && String(behavior.lineAmbiguous.telegram_message).includes("Falta:") && String(behavior.lineAmbiguous.telegram_message).includes("falta sistema/equipo"), value: behavior.lineAmbiguous.action });
  checks.push({ name: "line_help_explains_context", pass: behavior.lineHelp.action === "LINE_NEEDS_CLARIFICATION" && String(behavior.lineHelp.telegram_message).includes("Texto:") && String(behavior.lineHelp.telegram_message).includes("Opciones:"), value: behavior.lineHelp.action });
  checks.push({ name: "line_cctv_retries_scoring", pass: behavior.lineClarified.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.lineClarified.telegram_message).includes("BORRADOR CFDI"), value: behavior.lineClarified.action });
  checks.push({ name: "confirm_with_blockers_no_draft", pass: behavior.confirmBlocked.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.confirmBlocked.telegram_message).includes("No puedo confirmar todavia") && !String(behavior.confirmBlocked.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.confirmBlocked.action });
  checks.push({ name: "confirm_without_blockers_creates_draft", pass: behavior.confirmReady.action === "DRAFT_CONFIRMED" && String(behavior.confirmReady.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.confirmReady.action });
  checks.push({ name: "editlinea_corrects_line", pass: behavior.editLine.action === "NEEDS_CONFIRM_DRAFT" && String(behavior.editLine.telegram_message).includes("BORRADOR CFDI"), value: behavior.editLine.action });
  checks.push({ name: "quitarlinea_removes_line", pass: behavior.removeLine.action === "NEEDS_CONFIRM_DRAFT" && !String(behavior.removeLine.telegram_message).includes("2."), value: behavior.removeLine.action });
  checks.push({ name: "ver_shows_current_state", pass: behavior.ver.action === "COMMAND_VER" && String(behavior.ver.telegram_message).includes("Estado actual"), value: behavior.ver.action });
  checks.push({ name: "estado_shows_current_state", pass: behavior.estado.action === "COMMAND_ESTADO" && String(behavior.estado.telegram_message).includes("monto"), value: behavior.estado.action });
  checks.push({ name: "clear_multiline_preview_not_final_draft", pass: behavior.multilineClear.action === "NEEDS_CONFIRM_DRAFT" && !String(behavior.multilineClear.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.multilineClear.action });
  checks.push({ name: "cancel_clears_state", pass: behavior.cancel.action === "COMMAND_CANCELAR" && String(behavior.cancel.persistence_sql).includes("DELETE FROM chat_states"), value: behavior.cancel.action });
  checks.push({ name: "idle_hola_no_invoice", pass: behavior.idle.action === "IDLE_HELP" && !String(behavior.idle.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.idle.action });
  checks.push({ name: "tax_outputs_review_warning", pass: [behavior.numberedEdit, behavior.lineClarified, behavior.confirmReady, behavior.multilineClear].every((item) => String(item.telegram_message).includes("BORRADOR SUJETO A REVISION HUMANA")), value: "review" });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Conversation policy contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

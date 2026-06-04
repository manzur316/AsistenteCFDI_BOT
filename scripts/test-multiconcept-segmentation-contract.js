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

function areatzaClient(overrides = {}) {
  return {
    client_id: "CLI-AREATZA",
    display_name: "Privada Areatza",
    razon_social: "Privada Areatza AC",
    rfc: "PAR211126A95",
    tipo_persona: "MORAL_SIN_FINES_LUCRO",
    regimen_fiscal: "603",
    codigo_postal_fiscal: "00000",
    tax_profile: "PM_NO_LUCRATIVA",
    validated_by_human: true,
    enabled: true,
    aliases: [
      { alias: "privada areatza", normalized_alias: "privada areatza", weight: 100 },
      { alias: "areatza", normalized_alias: "areatza", weight: 90 },
    ],
    ...overrides,
  };
}

function riveraClient() {
  return {
    client_id: "CLI-RIVERA",
    display_name: "Privada Rivera",
    razon_social: "Privada Rivera AC",
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
  };
}

const taxRules = [
  { rule_id: "RESICO-PM-NO-LUCRATIVA-INSTALACION-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-SERVICIO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "RESICO-PM-NO-LUCRO-PRODUCTO-CONSERVADOR", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 9901,
    chat_id: "chat-multiconcept-test",
    message_id: String((extra.update_id || 9901) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients: extra.clients || [areatzaClient(), riveraClient()],
    tax_rules: extra.tax_rules || taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: extra.recent_drafts || [],
    bot_state: { lastTelegramUpdateId: 9900 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function clientDecisionState(response, originalText) {
  return {
    state: "NEEDS_CLIENT_DECISION",
    original_text: originalText,
    context: response.json_debug || {},
  };
}

function previewStateFrom(response, originalText) {
  const draftId = response.json_debug?.draft_id || "DRAFT-MULTICONCEPT-TEST";
  return {
    state: "PREVIEW_READY",
    original_text: originalText,
    context: {
      pending_invoice_context: {
        draft_id: draftId,
        original_text: originalText,
        client: areatzaClient(),
        client_query: "Privada Areatza",
        client_confirmed: true,
        amount: response.amount,
        tax_mode: response.tax_mode,
        concept: response.concept,
        top_3: response.top_3 || [],
        calc: response.calc || {},
        tax_summary: response.tax_summary || {},
        line_items: response.line_items || [],
        blockers: response.blockers || [],
        preview_draft: {
          draft_id: draftId,
          chat_id: "chat-multiconcept-test",
          update_id: response.update_id,
          message_original: originalText,
          status: "PENDIENTE",
          action: "SUGERIR",
          ready_to_copy: true,
          requires_human_review: true,
          concept: response.concept,
          top_3: response.top_3 || [],
          telegram_message: response.telegram_message,
          client_id: "CLI-AREATZA",
          client_snapshot: areatzaClient(),
          amount: response.amount,
          tax_mode: response.tax_mode,
          subtotal: response.calc?.subtotal ?? null,
          iva_amount: response.calc?.iva_amount ?? null,
          isr_retention_amount: response.calc?.isr_retention_amount ?? null,
          iva_retention_amount: response.calc?.iva_retention_amount ?? null,
          total: response.calc?.total ?? null,
          tax_summary: response.tax_summary || {},
          tax_review_required: true,
          line_items: response.line_items || [],
        },
      },
    },
  };
}

function candidateNames(response) {
  const candidates = response.json_debug?.candidate_clients || response.json_debug?.top_client_candidates || [];
  return candidates.map((client) => client.display_name || client.client_id);
}

function hasLineSql(sql, lineNumber) {
  return new RegExp(`,\\s*${lineNumber}\\s*,\\s*'`).test(String(sql || ""));
}

const checks = [];
let workflow = null;
let localWorkflow = null;
let workflowText = "";
let localWorkflowText = "";
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
  for (const fn of ["detectImplicitLineItems", "splitImplicitLineItemSegments", "conceptHasRequiredFiscalKeys", "operationConceptWarning", "formatRate"]) {
    checks.push({ name: `multiconcept_fn:${fn}`, pass: handleCode.includes(`function ${fn}`) && localHandleCode.includes(`function ${fn}`), value: fn });
  }
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pac", pass: !/\bPAC\b/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_timbrado", pass: !/timbrad|timbre_fiscal|stamp_cfdi/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_whatsapp", pass: !/WhatsApp|whatsapp/i.test(workflowText + localWorkflowText), value: "none" });
  checks.push({ name: "no_pdf", pass: !/\bPDF\b|constancia/i.test(workflowText + localWorkflowText), value: "none" });
}

try {
  const realText = "Ariatza, instalacion de camara CCTV 800 + IVA, servicio de mantenimiento Equipo CCTV 500 + IVA.";
  behavior.initial = executeCode(handleCode, contextInput(realText, { update_id: 9901 }));
  behavior.afterClient = executeCode(handleCode, contextInput("1", { update_id: 9902, chat_state: clientDecisionState(behavior.initial, realText) }));
  behavior.confirm = executeCode(handleCode, contextInput("confirmar", { update_id: 9903, chat_state: previewStateFrom(behavior.afterClient, realText) }));
  behavior.productService = executeCode(handleCode, contextInput("Areatza, venta de camara CCTV 700 + IVA, instalacion de camara CCTV 800 +IVA", { update_id: 9904 }));
  behavior.numbered = executeCode(handleCode, contextInput("Areatza,\n1.instalacion de camara CCTV 800 + IVA\n2.- VENTA DE camara CCTV 700 + IVA\n3) mantenimiento equipo CCTV por 500 mas IVA", { update_id: 9905 }));
  behavior.ambiguousLine = executeCode(handleCode, contextInput("Areatza, servicio tecnico general 800 + IVA, venta de camara CCTV 700 + IVA", { update_id: 9906 }));
  behavior.unvalidated = executeCode(handleCode, contextInput("Privada Areatza, venta de camara CCTV 700 + IVA, instalacion de camara CCTV 800 +IVA", { update_id: 9907, clients: [areatzaClient({ validated_by_human: false }), riveraClient()] }));
  behavior.localInitial = executeCode(localHandleCode, contextInput(realText, { update_id: 9910 }));
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.initial) {
  checks.push({ name: "real_message_suggests_only_areatza", pass: behavior.initial.action === "NEEDS_CLIENT_DECISION" && candidateNames(behavior.initial).length === 1 && candidateNames(behavior.initial)[0] === "Privada Areatza", value: candidateNames(behavior.initial).join(",") });
  checks.push({ name: "local_real_message_suggests_only_areatza", pass: behavior.localInitial.action === "NEEDS_CLIENT_DECISION" && candidateNames(behavior.localInitial).length === 1 && candidateNames(behavior.localInitial)[0] === "Privada Areatza", value: candidateNames(behavior.localInitial).join(",") });
}

if (behavior.afterClient) {
  const lines = behavior.afterClient.line_items || [];
  checks.push({ name: "implicit_commas_detect_two_line_items", pass: behavior.afterClient.action === "NEEDS_CONFIRM_DRAFT" && lines.length === 2, value: `${behavior.afterClient.action}/${lines.length}` });
  checks.push({ name: "line1_amount_800", pass: lines[0]?.amount === 800 && lines[0]?.unit_price === 800, value: lines[0]?.amount });
  checks.push({ name: "line1_operation_installation", pass: lines[0]?.operation_type === "SERVICIO_INSTALACION", value: lines[0]?.operation_type });
  checks.push({ name: "line2_amount_500", pass: lines[1]?.amount === 500 && lines[1]?.unit_price === 500, value: lines[1]?.amount });
  checks.push({ name: "line2_operation_service", pass: lines[1]?.operation_type === "SERVICIO", value: lines[1]?.operation_type });
  checks.push({ name: "does_not_collapse_to_single_line", pass: lines.length === 2 && behavior.afterClient.amount === 1300, value: behavior.afterClient.amount });
  checks.push({ name: "preview_includes_both_lines", pass: String(behavior.afterClient.telegram_message).includes("Linea 1:") && String(behavior.afterClient.telegram_message).includes("Linea 2:"), value: "Linea 1/2" });
  checks.push({ name: "preview_includes_subtotal_1300", pass: String(behavior.afterClient.telegram_message).includes("Subtotal: 1300.00"), value: "1300" });
  checks.push({ name: "preview_includes_iva_208", pass: String(behavior.afterClient.telegram_message).includes("IVA trasladado: 208.00"), value: "208" });
  checks.push({ name: "preview_includes_total_with_retentions", pass: String(behavior.afterClient.telegram_message).includes("Total neto estimado: 1353.09"), value: "1353.09" });
  checks.push({ name: "each_line_has_unit_and_sat_keys", pass: lines.every((line) => line.clave_prod_serv && line.clave_unidad && line.unidad), value: lines.map((line) => `${line.concept_id}/${line.clave_unidad}/${line.unidad}`).join(" | ") });
  checks.push({ name: "install_diagnosis_warning_present", pass: String(lines[0]?.warning || behavior.afterClient.telegram_message).includes("instalacion"), value: lines[0]?.warning || "none" });
  checks.push({ name: "no_draft_before_confirm", pass: !String(behavior.afterClient.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: "preview only" });
  checks.push({ name: "review_warning_multiline", pass: String(behavior.afterClient.telegram_message).includes("BORRADOR SUJETO A REVISION HUMANA"), value: "review" });
}

if (behavior.confirm) {
  checks.push({ name: "confirm_creates_draft", pass: behavior.confirm.action === "DRAFT_CONFIRMED" && String(behavior.confirm.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.confirm.action });
  checks.push({ name: "confirm_creates_line_items", pass: String(behavior.confirm.persistence_sql).includes("INSERT INTO cfdi_draft_line_items") && String(behavior.confirm.persistence_sql).match(/INSERT INTO cfdi_draft_line_items/g)?.length >= 2, value: "line inserts" });
  checks.push({ name: "confirm_preserves_line_numbers", pass: hasLineSql(behavior.confirm.persistence_sql, 1) && hasLineSql(behavior.confirm.persistence_sql, 2), value: "line 1/2" });
}

if (behavior.productService) {
  const lines = behavior.productService.line_items || [];
  checks.push({ name: "product_plus_service_detects_two_lines", pass: behavior.productService.action === "NEEDS_CONFIRM_DRAFT" && lines.length === 2, value: `${behavior.productService.action}/${lines.length}` });
  checks.push({ name: "line1_product", pass: lines[0]?.operation_type === "PRODUCTO" && Number(lines[0]?.iva_retention_amount || 0) === 0, value: `${lines[0]?.operation_type}/${lines[0]?.iva_retention_amount}` });
  checks.push({ name: "line2_service_retention", pass: lines[1]?.operation_type === "SERVICIO_INSTALACION" && Number(lines[1]?.iva_retention_amount || 0) > 0, value: `${lines[1]?.operation_type}/${lines[1]?.iva_retention_amount}` });
}

if (behavior.numbered) {
  const lines = behavior.numbered.line_items || [];
  checks.push({ name: "numbered_without_spaces_detects_three_lines", pass: behavior.numbered.action === "NEEDS_CONFIRM_DRAFT" && lines.length === 3, value: `${behavior.numbered.action}/${lines.length}` });
  checks.push({ name: "numbered_amounts", pass: lines.map((line) => line.amount).join(",") === "800,700,500", value: lines.map((line) => line.amount).join(",") });
}

if (behavior.ambiguousLine) {
  checks.push({ name: "ambiguous_line_blocks_confirmation", pass: behavior.ambiguousLine.action === "LINE_NEEDS_CLARIFICATION" && !String(behavior.ambiguousLine.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.ambiguousLine.action });
}

if (behavior.unvalidated) {
  checks.push({ name: "unvalidated_client_review_required", pass: behavior.unvalidated.tax_review_required === true && String(behavior.unvalidated.telegram_message).includes("Cliente no validado"), value: behavior.unvalidated.action });
}

console.log("Multiconcept segmentation contract");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

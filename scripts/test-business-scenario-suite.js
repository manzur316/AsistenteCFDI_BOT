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

function demoClient(id, displayName, tipoPersona, taxProfile, overrides = {}) {
  return {
    client_id: id,
    display_name: displayName,
    razon_social: `${displayName} Demo`,
    rfc: id === "CLI-DEMO-PF" ? "XAXX010101000" : "AAA010101AAA",
    tipo_persona: tipoPersona,
    regimen_fiscal: tipoPersona === "FISICA" ? "612" : "603",
    codigo_postal_fiscal: "00000",
    tax_profile: taxProfile,
    validated_by_human: true,
    enabled: true,
    aliases: [
      { alias: displayName, normalized_alias: displayName.toLowerCase(), weight: 100 },
      { alias: displayName.replace("Cliente ", ""), normalized_alias: displayName.replace("Cliente ", "").toLowerCase(), weight: 80 },
    ],
    ...overrides,
  };
}

const clients = [
  demoClient("CLI-DEMO-PF", "Cliente PF", "FISICA", "PF_GENERAL"),
  demoClient("CLI-DEMO-PM", "Cliente PM", "MORAL", "PM_GENERAL"),
  demoClient("CLI-DEMO-NO-LUCRO", "Areatza", "MORAL_SIN_FINES_LUCRO", "PM_NO_LUCRATIVA", {
    rfc: "PAR211126A95",
    aliases: [
      { alias: "Areatza", normalized_alias: "areatza", weight: 100 },
      { alias: "Privada Areatza", normalized_alias: "privada areatza", weight: 100 },
    ],
  }),
  demoClient("CLI-DEMO-DESCONOCIDO", "Cliente Desconocido", "DESCONOCIDO", "DESCONOCIDO", {
    rfc: null,
    regimen_fiscal: null,
    codigo_postal_fiscal: null,
    validated_by_human: false,
  }),
];

const taxRules = [
  { rule_id: "PF-SERVICIO", receiver_tipo_persona: "FISICA", receiver_tax_profile: "PF_GENERAL", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "PF-INSTALACION", receiver_tipo_persona: "FISICA", receiver_tax_profile: "PF_GENERAL", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "PF-PRODUCTO", receiver_tipo_persona: "FISICA", receiver_tax_profile: "PF_GENERAL", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "PM-SERVICIO", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "PM-INSTALACION", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "PM-PRODUCTO", receiver_tipo_persona: "MORAL", receiver_tax_profile: "PM_GENERAL", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
  { rule_id: "NO-LUCRO-SERVICIO", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "NO-LUCRO-INSTALACION", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "SERVICIO_INSTALACION", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0.106667, applies: true, requires_human_review: true },
  { rule_id: "NO-LUCRO-PRODUCTO", receiver_tipo_persona: "MORAL_SIN_FINES_LUCRO", receiver_tax_profile: "PM_NO_LUCRATIVA", operation_type: "PRODUCTO", iva_rate: 0.16, isr_retention_rate: 0.0125, iva_retention_rate: 0, applies: true, requires_human_review: true },
];

function contextInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 10201,
    chat_id: "chat-business-suite-test",
    message_id: String((extra.update_id || 10201) + 1000),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_POSTGRES_POLLING_V1",
    clients,
    tax_rules: taxRules,
    chat_state: extra.chat_state ?? null,
    recent_drafts: [],
    bot_state: { lastTelegramUpdateId: 10200 },
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
  };
}

function previewStateFrom(response, originalText, blockers = []) {
  const draftId = response.json_debug?.draft_id || "DRAFT-BUSINESS-SUITE";
  return {
    state: "PREVIEW_READY",
    original_text: originalText,
    context: {
      pending_invoice_context: {
        draft_id: draftId,
        original_text: originalText,
        client: response.client || clients[1],
        client_query: response.client?.display_name || "Cliente PM",
        client_confirmed: true,
        amount: response.amount,
        tax_mode: response.tax_mode,
        concept: response.concept,
        top_3: response.top_3 || [],
        calc: response.calc || {},
        tax_summary: response.tax_summary || {},
        line_items: response.line_items || [],
        blockers,
        preview_draft: {
          draft_id: draftId,
          chat_id: "chat-business-suite-test",
          update_id: response.update_id,
          message_original: originalText,
          status: "PENDIENTE",
          action: "SUGERIR",
          ready_to_copy: true,
          requires_human_review: true,
          concept: response.concept,
          top_3: response.top_3 || [],
          telegram_message: response.telegram_message,
          client_id: response.client?.client_id || "CLI-DEMO-PM",
          client_snapshot: response.client || clients[1],
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

function run(code, text, updateId, extra = {}) {
  return executeCode(code, contextInput(text, { update_id: updateId, ...extra }));
}

function isPreview(result) {
  return result.action === "NEEDS_CONFIRM_DRAFT" && String(result.telegram_message || "").includes("BORRADOR");
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
  for (const fn of ["detectFiscalGuardrailIssue", "detectMaterialLaborDecisionNeed", "detectGlobalAmountDecisionNeed", "fiscalGuardrailResponse"]) {
    checks.push({ name: `guardrail_fn:${fn}`, pass: handleCode.includes(`function ${fn}`) && localHandleCode.includes(`function ${fn}`), value: fn });
  }
  checks.push({ name: "no_real_token", pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(workflowText + localWorkflowText), value: "none" });
}

try {
  behavior.cctvInstall = run(handleCode, "Cliente PM, instalacion de camara CCTV 800 + IVA", 10201);
  behavior.cctvMaintenance = run(handleCode, "Cliente PM, mantenimiento equipo CCTV 500 + IVA", 10202);
  behavior.cctvProduct = run(handleCode, "Cliente PM, venta de camara CCTV 700 + IVA", 10203);
  behavior.cctvMixed = run(handleCode, "Cliente PM, instalacion de camara CCTV 800 + IVA, venta de camara CCTV 700 + IVA", 10204);
  behavior.accessInstall = run(handleCode, "Cliente PM, instalacion de chapa magnetica y boton de salida 800 + IVA", 10205);
  behavior.accessMaintenance = run(handleCode, "Cliente PM, mantenimiento de control de acceso zkteco 600 + IVA", 10206);
  behavior.barrierMaintenance = run(handleCode, "Cliente PM, mantenimiento de barrera vehicular 700 + IVA", 10207);
  behavior.barrierProduct = run(handleCode, "Cliente PM, venta de brazo para barrera vehicular 900 + IVA", 10208);
  behavior.wifiConfig = run(handleCode, "Cliente PM, configuracion de red WiFi y access point 700 + IVA", 10209);
  behavior.redProduct = run(handleCode, "Cliente PM, venta de router switch access point 1200 + IVA", 10210);
  behavior.pcProduct = run(handleCode, "Cliente PM, venta de SSD RAM y computadora 2000 + IVA", 10211);
  behavior.pcService = run(handleCode, "Cliente PM, formateo y mantenimiento de computadora 500 + IVA", 10212);
  behavior.long7 = run(handleCode, "Areatza,\n1. instalacion de camara CCTV 800 + IVA\n2. mantenimiento equipo CCTV 500 + IVA\n3. venta de fuente de poder CCTV 350 + IVA\n4. configuracion DVR Hikvision 600 + IVA\n5. revision de red WiFi 700 + IVA\n6. venta de SSD 480GB para computadora 900 + IVA\n7. mantenimiento de computadora 500 + IVA", 10213);
  behavior.materialLabor = run(handleCode, "Areatza, cambio de camara CCTV incluye material y mano de obra 1500 + IVA", 10214);
  behavior.globalAmount = run(handleCode, "Areatza, instalacion de camara CCTV y mantenimiento DVR por 1300 + IVA", 10215);
  behavior.app = run(handleCode, "Cliente PM, desarrolle una app movil 1500 + IVA", 10216);
  behavior.web = run(handleCode, "Cliente PM, cree una pagina web 1500 + IVA", 10217);
  behavior.saas = run(handleCode, "Cliente PM, suscripcion SaaS 1500 + IVA", 10218);
  behavior.n8n = run(handleCode, "Cliente PM, automatizacion n8n vendida como servicio 1500 + IVA", 10219);
  behavior.marketing = run(handleCode, "Cliente PM, marketing digital y diseno grafico 1500 + IVA", 10220);
  behavior.electrical = run(handleCode, "Cliente PM, servicio electrico general 1500 + IVA", 10221);
  behavior.construction = run(handleCode, "Cliente PM, construccion general y pintura 1500 + IVA", 10222);
  behavior.pf = run(handleCode, "Cliente PF, revise camaras CCTV 800 + IVA", 10223);
  behavior.pmService = run(handleCode, "Cliente PM, revise camaras CCTV 800 + IVA", 10224);
  behavior.pmProduct = run(handleCode, "Cliente PM, venta de camara CCTV 800 + IVA", 10225);
  behavior.noLucroService = run(handleCode, "Areatza, revise camaras CCTV 800 + IVA", 10226);
  behavior.unknown = run(handleCode, "Cliente Desconocido, revise camaras CCTV 800 + IVA", 10227);
  behavior.preview = behavior.pmService;
  behavior.confirmBlocked = run(handleCode, "confirmar", 10229, { chat_state: previewStateFrom(behavior.preview, "Cliente PM, revise camaras CCTV 800 + IVA", [{ type: "concepto_incompleto", reason: "falta clave SAT o unidad" }]) });
  behavior.confirmOk = run(handleCode, "confirmar", 10230, { chat_state: previewStateFrom(behavior.preview, "Cliente PM, revise camaras CCTV 800 + IVA") });
} catch (error) {
  checks.push({ name: "behavior_execution", pass: false, value: error.message });
}

if (behavior.cctvInstall) {
  checks.push({ name: "01_cctv_install", pass: isPreview(behavior.cctvInstall) && behavior.cctvInstall.line_items?.[0]?.operation_type === "SERVICIO_INSTALACION", value: behavior.cctvInstall.action });
  checks.push({ name: "02_cctv_maintenance", pass: isPreview(behavior.cctvMaintenance) && behavior.cctvMaintenance.concept?.familia === "CCTV", value: behavior.cctvMaintenance.concept?.id });
  checks.push({ name: "03_cctv_product", pass: isPreview(behavior.cctvProduct) && behavior.cctvProduct.line_items?.[0]?.operation_type === "PRODUCTO", value: behavior.cctvProduct.concept?.id });
  checks.push({ name: "04_cctv_install_plus_sale", pass: isPreview(behavior.cctvMixed) && behavior.cctvMixed.line_items?.length === 2 && behavior.cctvMixed.line_items.some((line) => line.operation_type === "PRODUCTO"), value: behavior.cctvMixed.line_items?.length });
  checks.push({ name: "05_access_install", pass: isPreview(behavior.accessInstall) && behavior.accessInstall.concept?.familia === "CONTROL_ACCESO", value: behavior.accessInstall.concept?.id });
  checks.push({ name: "06_access_maintenance", pass: isPreview(behavior.accessMaintenance) && behavior.accessMaintenance.concept?.familia === "CONTROL_ACCESO", value: behavior.accessMaintenance.concept?.id });
  checks.push({ name: "07_barrier_maintenance", pass: isPreview(behavior.barrierMaintenance) && behavior.barrierMaintenance.concept?.familia === "BARRERA", value: behavior.barrierMaintenance.concept?.id });
  checks.push({ name: "08_barrier_product_or_allowed_review", pass: ["NEEDS_CONFIRM_DRAFT", "LINE_NEEDS_CLARIFICATION"].includes(behavior.barrierProduct.action), value: `${behavior.barrierProduct.action}/${behavior.barrierProduct.concept?.id || "review"}` });
  checks.push({ name: "09_wifi_config", pass: isPreview(behavior.wifiConfig) && behavior.wifiConfig.concept?.familia === "RED", value: behavior.wifiConfig.concept?.id });
  checks.push({ name: "10_red_product", pass: isPreview(behavior.redProduct) && behavior.redProduct.line_items?.[0]?.operation_type === "PRODUCTO", value: behavior.redProduct.concept?.id });
  checks.push({ name: "11_computo_product", pass: isPreview(behavior.pcProduct) && behavior.pcProduct.concept?.familia === "COMPUTO" && behavior.pcProduct.line_items?.[0]?.operation_type === "PRODUCTO", value: behavior.pcProduct.concept?.id });
  checks.push({ name: "12_computo_service", pass: isPreview(behavior.pcService) && behavior.pcService.concept?.familia === "COMPUTO" && behavior.pcService.line_items?.[0]?.operation_type === "SERVICIO", value: behavior.pcService.concept?.id });
  checks.push({ name: "13_long_7_lines", pass: isPreview(behavior.long7) && behavior.long7.line_items?.length === 7 && !String(behavior.long7.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.long7.line_items?.length });
  checks.push({ name: "14_material_labor_decision", pass: behavior.materialLabor.action === "NEEDS_MATERIAL_LABOR_DECISION" && !String(behavior.materialLabor.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.materialLabor.action });
  checks.push({ name: "15_global_amount_decision", pass: behavior.globalAmount.action === "NEEDS_GLOBAL_AMOUNT_DECISION" && !String(behavior.globalAmount.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.globalAmount.action });
  checks.push({ name: "16_app_blocked", pass: behavior.app.action === "BLOQUEAR", value: behavior.app.action });
  checks.push({ name: "17_web_blocked", pass: behavior.web.action === "BLOQUEAR", value: behavior.web.action });
  checks.push({ name: "18_saas_blocked", pass: behavior.saas.action === "BLOQUEAR", value: behavior.saas.action });
  checks.push({ name: "19_n8n_blocked", pass: behavior.n8n.action === "BLOQUEAR", value: behavior.n8n.action });
  checks.push({ name: "20_marketing_review", pass: behavior.marketing.action === "AGREGAR_ACTIVIDAD", value: behavior.marketing.action });
  checks.push({ name: "21_electrical_general_clarifies", pass: behavior.electrical.action === "PEDIR_ACLARACION", value: behavior.electrical.action });
  checks.push({ name: "22_construction_general_review", pass: ["AGREGAR_ACTIVIDAD", "PEDIR_ACLARACION"].includes(behavior.construction.action), value: behavior.construction.action });
  checks.push({ name: "23_pf_no_retentions", pass: isPreview(behavior.pf) && Number(behavior.pf.line_items?.[0]?.isr_retention_amount || 0) === 0 && Number(behavior.pf.line_items?.[0]?.iva_retention_amount || 0) === 0, value: `${behavior.pf.line_items?.[0]?.isr_retention_amount}/${behavior.pf.line_items?.[0]?.iva_retention_amount}` });
  checks.push({ name: "24_pm_service_retentions", pass: isPreview(behavior.pmService) && Number(behavior.pmService.line_items?.[0]?.isr_retention_amount || 0) > 0 && Number(behavior.pmService.line_items?.[0]?.iva_retention_amount || 0) > 0, value: `${behavior.pmService.line_items?.[0]?.isr_retention_amount}/${behavior.pmService.line_items?.[0]?.iva_retention_amount}` });
  checks.push({ name: "25_pm_product_no_service_iva_retention", pass: isPreview(behavior.pmProduct) && Number(behavior.pmProduct.line_items?.[0]?.iva_retention_amount || 0) === 0, value: behavior.pmProduct.line_items?.[0]?.iva_retention_amount });
  checks.push({ name: "26_no_lucro_service_retentions", pass: isPreview(behavior.noLucroService) && Number(behavior.noLucroService.line_items?.[0]?.isr_retention_amount || 0) > 0 && Number(behavior.noLucroService.line_items?.[0]?.iva_retention_amount || 0) > 0, value: `${behavior.noLucroService.line_items?.[0]?.isr_retention_amount}/${behavior.noLucroService.line_items?.[0]?.iva_retention_amount}` });
  checks.push({ name: "27_unknown_not_definitive", pass: isPreview(behavior.unknown) && behavior.unknown.tax_review_required === true && Number(behavior.unknown.line_items?.[0]?.iva_retention_amount || 0) === 0, value: `${behavior.unknown.action}/${behavior.unknown.tax_summary?.tax_rule_reason}` });
  checks.push({ name: "28_concept_gap_blocks_confirm", pass: behavior.confirmBlocked.action === "NEEDS_CONFIRM_DRAFT" && !String(behavior.confirmBlocked.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: behavior.confirmBlocked.action });
  checks.push({ name: "29_confirm_with_blockers_no_draft", pass: behavior.confirmBlocked.action === "NEEDS_CONFIRM_DRAFT" && !String(behavior.confirmBlocked.persistence_sql).includes("INSERT INTO cfdi_drafts"), value: "no draft" });
  checks.push({ name: "30_confirm_without_blockers_creates_draft", pass: behavior.confirmOk.action === "DRAFT_CONFIRMED" && String(behavior.confirmOk.persistence_sql).includes("INSERT INTO cfdi_drafts") && String(behavior.confirmOk.persistence_sql).includes("INSERT INTO cfdi_draft_line_items"), value: behavior.confirmOk.action });
  checks.push({ name: "all_tax_outputs_review", pass: [behavior.cctvInstall, behavior.cctvMixed, behavior.long7, behavior.pmService, behavior.confirmOk].every((item) => String(item.telegram_message).includes("BORRADOR SUJETO A REVISION HUMANA")), value: "review" });
}

console.log("Business scenario suite");
for (const check of checks) printCheck(check.name, check.pass, check.value);
const passed = checks.filter((check) => check.pass).length;
console.log(`Resumen: ${passed}/${checks.length} PASS`);
if (passed !== checks.length) process.exit(1);

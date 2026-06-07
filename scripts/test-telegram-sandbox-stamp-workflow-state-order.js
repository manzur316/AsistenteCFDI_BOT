const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-714E-${role}`,
    telegram_chat_id: "CHAT-714E",
    telegram_user_id: "TGUSER-714E",
    display_name: "Usuario 714E",
    role,
    enabled: true,
  };
}

function draft(overrides = {}) {
  return {
    draft_id: "DRAFT-714E-WF",
    status: "APROBADO",
    invoice_status: "SANDBOX_ERROR",
    payment_status: "NO_APLICA",
    chat_id: "CHAT-714E",
    total: 928,
    ready_to_copy: true,
    requires_human_review: true,
    blockers: [],
    client_id: "CLI-REAL-BILBAO",
    client_snapshot: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA CCTV",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
    },
    ...overrides,
  };
}

function callbackInput(token, action, item, extra = {}) {
  const user = authorizedUser();
  return {
    update_id: extra.update_id || 71401,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 71401,
    chat_id: "CHAT-714E",
    telegram_user_id: "TGUSER-714E",
    message_id: "71401",
    text: `cfdi:${token}`,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: {
      token,
      chat_id: "CHAT-714E",
      draft_id: item?.draft_id,
      action,
      payload: { draft_id: item?.draft_id, action },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    recent_callback_events: [],
    recent_drafts: item ? [item] : [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-714E-${extra.update_id || 71401}`,
    callback_message_id: "88",
    source_message_id: "88",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function actionStdout(status, output = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status,
    ok: status === "OK",
    duration_ms: 42,
    artifacts: [],
    warnings: output.warnings || [],
    errors: output.errors || [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-714E-WF",
      provider: "Factura.com Sandbox",
      invoice_status: status === "OK" ? "SANDBOX_TIMBRADO" : "SANDBOX_ERROR",
      draft_status: "APROBADO",
      payment_status: status === "OK" ? "PENDIENTE" : "NO_APLICA",
      client_display_name: "Real Bilbao",
      total: 928,
      ...output,
    },
  });
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

const checks = [];
function check(name, fn) {
  try { checks.push({ name, pass: true, value: fn() || "" }); }
  catch (error) { checks.push({ name, pass: false, value: error.message }); }
}

check("workflow_json_valid", () => {
  assert.strictEqual(Array.isArray(workflow.nodes), true);
  return `${workflow.nodes.length} nodes`;
});

check("stamp_command_uses_draft_id_without_stale_snapshot", () => {
  const result = executeCode(handleCode, callbackInput("STAMP714E0001", "STAMP_DRAFT_SANDBOX", draft()));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert(result.sandbox_execute_command.includes("sandbox.draft.stamp"));
  assert(result.sandbox_execute_command.includes("--draft-id DRAFT-714E-WF"));
  assert(result.sandbox_execute_command.includes("--idempotency-key "));
  assert(!result.sandbox_execute_command.includes("--draft-json-b64"));
  return result.requested_sandbox_action;
});

check("workflow_does_not_prewrite_timbrando_before_execute", () => {
  const result = executeCode(handleCode, callbackInput("STAMP714E0002", "STAMP_DRAFT_SANDBOX", draft(), { update_id: 71402 }));
  assert(result.callback_processing_sql.includes("DRAFT_SANDBOX_STAMP_IN_PROGRESS"));
  assert(result.callback_processing_sql.includes("passthrough_b64"));
  assert(!result.callback_processing_sql.includes("invoice_status = 'SANDBOX_TIMBRANDO'"));
  assert(!result.callback_processing_sql.includes("SET status = 'SANDBOX_TIMBRANDO'"));
  return "no prelock";
});

check("sandbox_error_retry_is_allowed_by_workflow", () => {
  const result = executeCode(handleCode, callbackInput("STAMP714E0003", "STAMP_DRAFT_SANDBOX", draft({ invoice_status: "SANDBOX_ERROR" }), { update_id: 71403 }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert(!result.telegram_message.includes("DRAFT_SANDBOX_IN_PROGRESS"));
  return "retry allowed";
});

check("success_summary_sets_invoice_timbrado_payment_pending_and_keeps_status", () => {
  const source = executeCode(handleCode, callbackInput("STAMP714E0004", "STAMP_DRAFT_SANDBOX", draft(), { update_id: 71404 }));
  const result = executeCode(summaryCode, { stdout: actionStdout("OK"), exitCode: 0 }, () => [{ json: source }]);
  assert(result.persistence_sql.includes("invoice_status = 'SANDBOX_TIMBRADO'"));
  assert(result.persistence_sql.includes("payment_status = CASE WHEN payment_status = 'NO_APLICA' THEN 'PENDIENTE'"));
  assert(!result.persistence_sql.includes("SET status = 'SANDBOX_TIMBRADO'"));
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_TIMBRADO");
  return result.sandbox_draft_status;
});

check("controlled_error_sets_sandbox_error_without_touching_status", () => {
  const source = executeCode(handleCode, callbackInput("STAMP714E0005", "STAMP_DRAFT_SANDBOX", draft(), { update_id: 71405 }));
  const result = executeCode(summaryCode, {
    stdout: actionStdout("ERROR", { errors: ["PAC_SANDBOX_TEST_ERROR"] }),
    exitCode: 0,
  }, () => [{ json: source }]);
  assert(result.persistence_sql.includes("invoice_status = 'SANDBOX_ERROR'"));
  assert(result.persistence_sql.includes("payment_status = 'NO_APLICA'"));
  assert(!result.persistence_sql.includes("SET status = 'SANDBOX_ERROR'"));
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_ERROR");
  return result.sandbox_draft_status;
});

check("foreign_in_progress_message_is_specific", () => {
  const source = executeCode(handleCode, callbackInput("STAMP714E0006", "STAMP_DRAFT_SANDBOX", draft(), { update_id: 71406 }));
  const result = executeCode(summaryCode, {
    stdout: actionStdout("ERROR", { errors: ["DRAFT_SANDBOX_IN_PROGRESS"], validation_errors: ["DRAFT_SANDBOX_IN_PROGRESS"] }),
    exitCode: 0,
  }, () => [{ json: source }]);
  assert(result.telegram_message.includes("Este borrador ya tiene un timbrado sandbox en proceso. Espera unos segundos y vuelve a consultar."));
  return "specific";
});

check("workflow_does_not_send_files_or_use_production_pac", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText));
  assert(!/https:\/\/api\.factura\.com|stampProduction|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(workflowText));
  return "safe";
});

check("runtime_not_versioned", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert(gitignore.includes("runtime/**"));
  return "runtime ignored";
});

for (const item of checks) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

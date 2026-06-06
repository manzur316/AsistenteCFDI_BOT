const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function validDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-MAP-OK",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    update_id: 71440,
    message_original: "venta de camara CCTV",
    amount: 800,
    subtotal: 800,
    iva_amount: 128,
    total: 928,
    tax_mode: "ADD_IVA",
    blockers: [],
    client_snapshot: { client_id: "CLIENT-DEMO", display_name: "Cliente Demo", rfc: "XAXX010101000", regimen_fiscal: "616", codigo_postal_fiscal: "77500", validated_by_human: true },
    concept: { id: "PROD-CCTV-001", concepto_factura: "VENTA DE CAMARA", clave_prod_serv: "45121500", clave_unidad: "H87", unidad: "Pieza" },
    ...overrides,
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 71440,
    max_seen_update_id: extra.update_id || 71440,
    chat_id: "CHAT-MAP",
    telegram_user_id: "USER-MAP",
    message_id: "71440",
    text,
    catalog_path: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: {},
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-MAP",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: { user_id: "OWNER-MAP", role: "OWNER", enabled: true },
    security_user_id: "OWNER-MAP",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbackSource(handleCode, draft = validDraft(), extra = {}) {
  return executeCode(handleCode, baseInput("cfdi:TOKENMAPSTAMP", {
    action_token: {
      token: "TOKENMAPSTAMP",
      chat_id: "CHAT-MAP",
      draft_id: draft.draft_id,
      action: "STAMP_DRAFT_SANDBOX",
      payload: { draft_id: draft.draft_id },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    recent_drafts: [draft],
    ...extra,
  }));
}

function actionStdout(status, output = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status,
    ok: status === "OK",
    error_class: status === "OK" ? null : "DRAFT_VALIDATION_ERROR",
    errors: output.errors || [],
    warnings: [],
    artifacts: [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-MAP-OK",
      provider: "Factura.com Sandbox",
      invoice_status: status === "OK" ? "SANDBOX_TIMBRADO" : "SANDBOX_ERROR",
      payment_status: status === "OK" ? "PENDIENTE" : "NO_APLICA",
      client_display_name: "Cliente Demo",
      total: 928,
      validation_error_codes: output.validation_error_codes || [],
      validation_errors: output.validation_errors || [],
    },
  });
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("stamp_lock_updates_invoice_status_not_legacy_status", () => {
  const source = callbackSource(handleCode);
  assert.strictEqual(source.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert(source.callback_processing_sql.includes("invoice_status = 'SANDBOX_TIMBRANDO'"));
  assert(source.callback_processing_sql.includes("payment_status = 'NO_APLICA'"));
  assert(!source.callback_processing_sql.includes("SET status = 'SANDBOX_TIMBRANDO'"));
  assert(source.sandbox_execute_command.includes("--draft-id DRAFT-MAP-OK"));
  return "invoice_status lock";
});

check("stamp_error_updates_invoice_status_sandbox_error_only", () => {
  const source = callbackSource(handleCode);
  const result = executeCode(summaryCode, {
    stdout: actionStdout("ERROR", { errors: ["DRAFT_NOT_APPROVED"], validation_errors: ["DRAFT_NOT_APPROVED"] }),
    exitCode: 0,
  }, () => [{ json: source }]);
  assert(result.persistence_sql.includes("invoice_status = 'SANDBOX_ERROR'"));
  assert(result.persistence_sql.includes("payment_status = 'NO_APLICA'"));
  assert(!result.persistence_sql.includes("SET status = 'SANDBOX_ERROR'"));
  assert(result.telegram_message.includes("No se pudo timbrar sandbox: el borrador no esta aprobado."));
  return result.sandbox_draft_status;
});

check("stamp_success_updates_invoice_status_and_payment_pending", () => {
  const source = callbackSource(handleCode);
  const result = executeCode(summaryCode, { stdout: actionStdout("OK"), exitCode: 0 }, () => [{ json: source }]);
  assert(result.persistence_sql.includes("invoice_status = 'SANDBOX_TIMBRADO'"));
  assert(result.persistence_sql.includes("payment_status = CASE WHEN payment_status = 'NO_APLICA' THEN 'PENDIENTE' ELSE payment_status END"));
  assert(!result.persistence_sql.includes("SET status = 'SANDBOX_TIMBRADO'"));
  return result.sandbox_draft_status;
});

check("missing_draft_message_is_user_actionable", () => {
  const source = callbackSource(handleCode);
  const result = executeCode(summaryCode, {
    stdout: actionStdout("ERROR", { errors: ["DRAFT_NOT_FOUND"], validation_error_codes: ["DRAFT_CONTEXT_MISSING"], validation_errors: ["DRAFT_NOT_FOUND"] }),
    exitCode: 0,
  }, () => [{ json: source }]);
  assert(result.telegram_message.includes("no se encontro el borrador"));
  assert(result.telegram_message.includes("Vuelve a abrir borradores aprobados"));
  assert(!result.telegram_message.includes("stdout no parseable"));
  return "friendly";
});

check("fiscal_blockers_are_specific", () => {
  const source = callbackSource(handleCode);
  const result = executeCode(summaryCode, {
    stdout: actionStdout("ERROR", {
      errors: ["client_not_validated", "client_rfc_required", "tax_method_required"],
      validation_error_codes: ["CLIENT_NOT_VALIDATED", "RFC_MISSING", "TAX_MODE_MISSING"],
      validation_errors: ["client_not_validated", "client_rfc_required", "tax_method_required"],
    }),
    exitCode: 0,
  }, () => [{ json: source }]);
  assert(result.telegram_message.includes("cliente no validado"));
  assert(result.telegram_message.includes("RFC faltante"));
  assert(result.telegram_message.includes("IVA/tax mode faltante"));
  return "specific";
});

check("workflow_no_file_send_or_pac_production", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto/i.test(workflowText));
  assert(!/stampProduction|https:\/\/api\.factura\.com/i.test(workflowText));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

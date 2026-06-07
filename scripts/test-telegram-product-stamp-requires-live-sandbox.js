const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function nodeCode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node.parameters.jsCode;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function callbackInput() {
  const draftId = "DRAFT-STAMP-LIVE-716B";
  const token = "stamprequirelive716b";
  return {
    update_id: 716401,
    max_seen_update_id: 716401,
    chat_id: "CHAT-716B",
    telegram_user_id: "USER-716B",
    message_id: "99",
    text: `cfdi:${token}`,
    catalog_path: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: {
      token,
      chat_id: "CHAT-716B",
      draft_id: draftId,
      action: "STAMP_DRAFT_SANDBOX",
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
      payload: { draft_id: draftId, state: "DRAFT_DETAIL" },
    },
    recent_callback_events: [],
    recent_drafts: [{
      draft_id: draftId,
      chat_id: "CHAT-716B",
      status: "APROBADO",
      invoice_status: "APROBADO",
      payment_status: "NO_APLICA",
      client_id: "CLIENT-716B",
      client_snapshot: { client_id: "CLIENT-716B", display_name: "Cliente Demo", validated_by_human: true },
      current_client: { client_id: "CLIENT-716B", display_name: "Cliente Demo", validated_by_human: true },
      concept: { id: "PROD-CCTV-001", concepto_factura: "VENTA DE CAMARA", clave_prod_serv: "46171610", clave_unidad: "H87" },
      amount: 100,
      subtotal: 100,
      total: 116,
      tax_mode: "ADD_IVA",
      iva_amount: 16,
      blockers: [],
    }],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-STAMP-716B",
    callback_message_id: "98",
    source_message_id: "",
    authorized_user: { user_id: "OWNER-716B", telegram_chat_id: "CHAT-716B", telegram_user_id: "USER-716B", role: "OWNER", enabled: true },
    security_user_id: "OWNER-716B",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
  };
}

check("telegram_stamp_button_includes_require_live_sandbox_flag", () => {
  const code = nodeCode("Handle Commands And Scoring");
  const result = executeCode(code, callbackInput());
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.stamp");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert(result.sandbox_execute_command.includes("--require-live-sandbox"), "Telegram product stamp must require live sandbox");
  assert(!/stampProduction|https:\/\/api\.factura\.com/i.test(result.sandbox_execute_command), "production leak");
  return "flagged";
});

check("telegram_stamp_missing_live_summary_is_human", () => {
  const code = nodeCode("Build PAC Sandbox Action Summary");
  const stdout = JSON.stringify({
    ok: false,
    status: "NEEDS_CONFIG",
    action: "sandbox.draft.stamp",
    artifacts: [],
    warnings: [],
    errors: ["FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED", "FACTURACOM_SANDBOX_LIVE_REQUIRED"],
    sensitive_findings: [],
    output: {
      error_class: "FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED",
      draft_id: "DRAFT-STAMP-LIVE-716B",
      client_display_name: "Cliente Demo",
      invoice_status: "APROBADO",
      payment_status: "NO_APLICA",
      validation_error_codes: ["FACTURACOM_SANDBOX_LIVE_OPERATIONAL_MODE_REQUIRED"],
    },
  });
  const result = executeCode(code, { stdout }, () => [{ json: { chat_id: "CHAT-716B", update_id: 716402, workflowVersion: "CFDI_LOCAL_INGEST_V1" } }]);
  assert(/Factura.com Sandbox Live no configurado/.test(result.telegram_message));
  assert(/El modo mock no se usa para timbrado operativo desde Telegram/.test(result.telegram_message));
  assert(/Sandbox Operativo Live/.test(result.telegram_message));
  assert(/Configuracion detectada:/.test(result.telegram_message));
  assert(/Modo live: no/.test(result.telegram_message));
  assert(/API key: faltante/.test(result.telegram_message));
  assert(/Fuente config: missing/.test(result.telegram_message));
  assert(!/Timbrado sandbox OK|SANDBOX_TIMBRADO/.test(result.telegram_message), "must not look stamped");
  assert(!/sendDocument|<\?xml|%PDF|https:\/\/api\.factura\.com/i.test(result.telegram_message), "unsafe output");
  return "human";
});

console.log("Telegram Product Stamp Requires Live Sandbox Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

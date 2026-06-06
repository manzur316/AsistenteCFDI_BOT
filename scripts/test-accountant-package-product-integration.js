const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  ROLES,
  getTelegramProductMenu,
  getTelegramSubmenu,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  buildAccountantPackageProductKeyboard,
  buildAccountantPackageProductSummary,
  renderAccountantPackageProductMessage,
} = require("./lib/accountant-package-product-view");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
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

function executeHandle(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function executeSummary(code, current, source) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  const items = (nodeName) => (nodeName === "Handle Commands And Scoring" ? [{ json: source }] : []);
  return fn(require, current, {}, items, 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-DEMO-${role}`,
    telegram_chat_id: "CHAT-DEMO-ACCTPKG",
    telegram_user_id: "TGUSER-DEMO-ACCTPKG",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(callbackData, role = ROLES.OWNER, extra = {}) {
  const user = authorizedUser(role);
  return {
    update_id: extra.update_id || 14101,
    chat_id: "CHAT-DEMO-ACCTPKG",
    telegram_user_id: "TGUSER-DEMO-ACCTPKG",
    message_id: "14199",
    text: callbackData,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    client_invoice_summary: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-ACCTPKG",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
  };
}

function flattenCallbacks(payload) {
  return (payload.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => String(button.callback_data || ""))
    .filter(Boolean);
}

function sampleFullPackageResult(status = "OK") {
  return {
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.full.monthly.package",
    status,
    ok: status === "OK",
    duration_ms: 345,
    artifacts: [
      { key: "manifest_path", path: "runtime/accountant-packages-sandbox/2026-06/manifest.json" },
      { key: "summary_path", path: "runtime/accountant-packages-sandbox/2026-06/summary.json" },
      { key: "latest_path", path: "runtime/action-results-sandbox/latest.json" },
    ],
    warnings: status === "OK" ? [] : ["Runtime mensual incompleto."],
    errors: status === "OK" ? [] : ["PACKAGE_SAFETY_ERROR"],
    sensitive_findings: [],
    output: {
      steps: [
        { action: "sandbox.storage.refresh", status: "OK", output: { period: "2026-06" } },
        { action: "sandbox.report.generate", status: "OK", output: { period: "2026-06" } },
        { action: "sandbox.package.generate", status: "OK", output: { period: "2026-06" } },
        { action: "sandbox.excel.generate", status: "OK", output: { period: "2026-06" } },
        { action: "sandbox.checklist.generate", status: "OK", output: { period: "2026-06" } },
        { action: "sandbox.package.analyze", status: "OK", output: { period: "2026-06" } },
      ],
    },
  };
}

function hasSensitiveOrFileDelivery(value) {
  const text = JSON.stringify(value);
  return /(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}|\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|[A-Za-z]:[\\/]|\.env|csd|secret|password|api[_-]?key|sendDocument|sendMediaGroup|sendPhoto|\.xml|\.pdf|\.zip|\.xlsx|accountant-package-\d{4}-\d{2}|accountant-review-\d{4}-\d{2}/i.test(text);
}

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("contract_hides_accountant_package_for_readonly", () => {
  const mainCallbacks = flattenCallbacks(getTelegramProductMenu(ROLES.ACCOUNTANT_READONLY));
  const reportCallbacks = flattenCallbacks(getTelegramSubmenu("reports", ROLES.ACCOUNTANT_READONLY));
  assert(!mainCallbacks.includes("cfdi_nav:acctpkg"));
  assert(!reportCallbacks.includes("cfdi_nav:acctpkg"));
  assert(mainCallbacks.includes("cfdi_nav:report"));
  return "readonly_summary_only";
});

check("owner_can_see_accountant_package_callback", () => {
  const mainCallbacks = flattenCallbacks(getTelegramProductMenu(ROLES.OWNER));
  const reportCallbacks = flattenCallbacks(getTelegramSubmenu("reports", ROLES.OWNER));
  assert(mainCallbacks.includes("cfdi_nav:acctpkg"));
  assert(reportCallbacks.includes("cfdi_nav:acctpkg"));
  const validation = validateTelegramCallbackData("cfdi_nav:acctpkg");
  assert(validation.ok, validation.errors.join(","));
  assert("cfdi_nav:acctpkg".length <= 32);
  return "cfdi_nav:acctpkg";
});

check("owner_callback_requests_action_layer_full_package", () => {
  const result = executeHandle(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.OWNER));
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_REQUESTED");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.full.monthly.package");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert(result.sandbox_execute_command.startsWith("node scripts/run-sandbox-action.js sandbox.full.monthly.package"));
  assert(result.sandbox_execute_command.includes("--audit-callback-data cfdi_nav:acctpkg"));
  assert(result.telegram_message.includes("Generando paquete contador sandbox."));
  assert(result.telegram_message.includes("Paquete sandbox local. No es declaracion fiscal."));
  assert(!hasSensitiveOrFileDelivery(result));
  return result.requested_sandbox_action;
});

check("accountant_readonly_cannot_generate_package", () => {
  const result = executeHandle(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.ACCOUNTANT_READONLY, { update_id: 14102 }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.should_execute_sandbox_action, undefined);
  assert(!String(result.persistence_sql || "").includes("sandbox.full.monthly.package"));
  return result.action;
});

check("normal_user_cannot_generate_package", () => {
  const result = executeHandle(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.ASSISTANT_OPERATOR, { update_id: 14103 }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.should_execute_sandbox_action, undefined);
  return result.action;
});

check("readonly_monthly_report_keyboard_has_no_package_generation", () => {
  const result = executeHandle(handleCode, baseInput("cfdi_nav:report", ROLES.ACCOUNTANT_READONLY, { update_id: 14104 }));
  const callbacks = flattenCallbacks(result);
  assert.strictEqual(result.action, "COMMAND_RESUMEN");
  assert(!callbacks.includes("cfdi_nav:acctpkg"));
  assert(callbacks.includes("cfdi_nav:menu"));
  return callbacks.join(",");
});

check("workflow_summary_renders_safe_package_result", () => {
  const source = executeHandle(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.OWNER, { update_id: 14105 }));
  const summary = executeSummary(summaryCode, { stdout: JSON.stringify(sampleFullPackageResult()) }, source);
  assert.strictEqual(summary.action, "PAC_SANDBOX_ACTION_RESULT");
  assert.strictEqual(summary.requested_sandbox_action, "sandbox.full.monthly.package");
  assert(summary.telegram_message.includes("Paquete contador sandbox generado"));
  assert(summary.telegram_message.includes("Periodo: 2026-06"));
  assert(summary.telegram_message.includes("Status: OK"));
  assert(summary.telegram_message.includes("Package generado: si"));
  assert(summary.telegram_message.includes("Excel generado: si"));
  assert(summary.telegram_message.includes("Checklist generado: si"));
  assert(summary.telegram_message.includes("Sensitive findings: 0"));
  assert(summary.telegram_message.includes("Paquete sandbox local. No es declaracion fiscal."));
  assert(summary.telegram_message.includes("Borrador sujeto a revision humana. No sustituye contador."));
  assert.strictEqual(summary.sandbox_action_summary.accountant_package.package_generated, true);
  assert.strictEqual(summary.sandbox_action_summary.accountant_package.excel_generated, true);
  assert.strictEqual(summary.sandbox_action_summary.accountant_package.checklist_generated, true);
  assert(!hasSensitiveOrFileDelivery(summary.telegram_message));
  return summary.sandbox_action_status;
});

check("workflow_summary_renders_safe_error_result", () => {
  const source = executeHandle(handleCode, baseInput("cfdi_nav:acctpkg", ROLES.OWNER, { update_id: 14106 }));
  const summary = executeSummary(summaryCode, { stdout: JSON.stringify(sampleFullPackageResult("PACKAGE_SAFETY_ERROR")) }, source);
  assert.strictEqual(summary.sandbox_action_status, "PACKAGE_SAFETY_ERROR");
  assert(summary.telegram_message.includes("Paquete contador sandbox no generado"));
  assert(summary.telegram_message.includes("Errors: 1"));
  assert(summary.telegram_message.includes("No se envian archivos por Telegram"));
  assert(!hasSensitiveOrFileDelivery(summary.telegram_message));
  return summary.sandbox_action_status;
});

check("pure_view_helper_renders_same_safety_contract", () => {
  const summary = buildAccountantPackageProductSummary(sampleFullPackageResult());
  const text = renderAccountantPackageProductMessage(summary);
  const keyboard = buildAccountantPackageProductKeyboard();
  assert.strictEqual(summary.period, "2026-06");
  assert.strictEqual(summary.package_generated, true);
  assert.strictEqual(summary.excel_generated, true);
  assert.strictEqual(summary.checklist_generated, true);
  assert(text.includes("Paquete sandbox local. No es declaracion fiscal."));
  assert(text.includes("No se envian archivos por Telegram."));
  assert(flattenCallbacks({ reply_markup: keyboard }).includes("cfdi_nav:report"));
  assert(!hasSensitiveOrFileDelivery({ text, keyboard }));
  return summary.version;
});

check("workflow_does_not_send_files_or_call_production_pac", () => {
  assert(!/sendDocument|sendMediaGroup|sendPhoto|sendVideo|sendAudio/i.test(workflowText));
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|timbre_fiscal|WhatsApp|whatsapp/i.test(workflowText));
  return "safe";
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`PASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

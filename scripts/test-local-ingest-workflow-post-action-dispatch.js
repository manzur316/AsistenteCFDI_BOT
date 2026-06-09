const assert = require("assert");

const { loadWorkflow } = require("./lib/test-telegram-delivery-workflow-harness");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

const workflow = loadWorkflow();

function getNode(name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

function code(name) {
  const node = getNode(name);
  if (!node.parameters?.jsCode) throw new Error(`${name} no tiene jsCode`);
  return node.parameters.jsCode;
}

check("post_action_route_reaches_telegram_dispatch_plan", () => {
  assert.strictEqual(workflow.connections["Build PAC Sandbox Action Summary"].main[0][0].node, "Postgres Persist Bot Result");
  assert.strictEqual(workflow.connections["Postgres Persist Bot Result"].main[0][0].node, "Restore Response After Persistence");
  assert.strictEqual(workflow.connections["Restore Response After Persistence"].main[0][0].node, "Build Telegram Dispatch Plan");
  assert.strictEqual(workflow.connections["Build Telegram Dispatch Plan"].main[0][0].node, "Should Send Telegram");
  assert.strictEqual(workflow.connections["Should Send Telegram"].main[0][0].node, "Should Edit Telegram Message");
  return "summary->dispatch";
});

check("workflow_has_visible_send_or_edit_dispatch_nodes", () => {
  assert.strictEqual(getNode("Telegram editMessageText").type, "n8n-nodes-base.httpRequest");
  assert.strictEqual(getNode("Telegram sendMessage").type, "n8n-nodes-base.httpRequest");
  assert.strictEqual(getNode("Telegram fallback sendMessage").type, "n8n-nodes-base.httpRequest");
  assert(String(getNode("Telegram editMessageText").parameters.url).includes("editMessageText"));
  assert(String(getNode("Telegram sendMessage").parameters.url).includes("sendMessage"));
  assert(String(getNode("Telegram fallback sendMessage").parameters.url).includes("sendMessage"));
  return "edit/send/fallback";
});

check("lifecycle_tracks_dispatch_attempt_and_result", () => {
  const summaryCode = code("Build PAC Sandbox Action Summary");
  const planCode = code("Build Telegram Dispatch Plan");
  const logCode = code("Log Send Result SQL");
  assert(summaryCode.includes("telegram_dispatch_attempted: false"), "summary initial dispatch field missing");
  assert(planCode.includes("telegram_dispatch_attempted"), "dispatch plan missing attempted field");
  assert(planCode.includes("reply_markup_built"), "dispatch plan missing reply_markup field");
  assert(logCode.includes("telegram_dispatch_ok = !failed"), "send log must record dispatch result");
  assert(logCode.includes("dispatchMethod"), "send log must record dispatch method");
  return "lifecycle";
});

check("token_used_recovery_loads_recent_confirm_tokens", () => {
  const loadCode = code("Build Load Context SQL");
  const handleCode = code("Handle Commands And Scoring");
  assert(loadCode.includes("recent_action_tokens"), "recent_action_tokens not loaded");
  assert(loadCode.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "provider confirm token not selected");
  assert(loadCode.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"), "telegram confirm token not selected");
  assert(handleCode.includes("findUnusedActionTokenForDraft"), "confirm token lookup helper missing");
  assert(handleCode.includes("buildConfirmTokenRecoveryKeyboard"), "confirm recovery keyboard helper missing");
  return "confirm-token-recovery";
});

console.log("Local Ingest Workflow Post-Action Dispatch Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

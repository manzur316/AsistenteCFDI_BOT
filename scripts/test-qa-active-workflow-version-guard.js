const assert = require("assert");
const { assertActiveWorkflowHasDispatchNodes } = require("./qa/qa-assertions");

function buildNode(name) {
  return { name, type: "n8n-nodes-base.function", parameters: {} };
}

const expected = [
  "Build Telegram Dispatch Plan",
  "Should Send Telegram",
  "Telegram editMessageText",
  "Telegram sendMessage",
  "Telegram fallback sendMessage",
  "Log Send Result SQL",
];

const healthyWorkflow = {
  id: "wf-healthy-001",
  name: "cfdi_telegram_local_ingest",
  active: true,
  nodes: expected.map((name) => buildNode(name)),
};

const staleWorkflow = {
  id: "wf-stale-001",
  name: "cfdi_telegram_local_ingest",
  active: true,
  nodes: [buildNode("Build Telegram Dispatch Plan"), buildNode("Should Send Telegram")],
};

const okResult = assertActiveWorkflowHasDispatchNodes(healthyWorkflow);
assert.strictEqual(okResult.pass, true);
assert.strictEqual(okResult.missing.length, 0);

assert.throws(() => assertActiveWorkflowHasDispatchNodes(staleWorkflow), (error) => /ACTIVE_WORKFLOW_OUT_OF_SYNC/.test(error.message));

console.log("QA Active Workflow Version Guard Tests");
console.log(" - active_workflow_guard_pass_when_dispatch_nodes_present: PASS");
console.log(" - active_workflow_guard_fails_when_nodes_missing: PASS");
console.log("\nPASS total: 2/2");

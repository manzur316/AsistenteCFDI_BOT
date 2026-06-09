const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runWorkflowSyncCheckScenario } = require("./qa/satbot-e2e-harness");

function buildNode(name) {
  return { name, type: "n8n-nodes-base.function", parameters: {} };
}

function workflowFixture(name = "cfdi_telegram_local_ingest", nodeSuffix = "") {
  return {
    name,
    nodes: [
      buildNode("Build Telegram Dispatch Plan"),
      buildNode("Should Send Telegram"),
      buildNode("Telegram editMessageText"),
      buildNode("Telegram sendMessage"),
      buildNode("Telegram fallback sendMessage"),
      buildNode("Log Send Result SQL"),
      buildNode(`DUMMY-${nodeSuffix}`),
    ],
    connections: {},
    settings: {},
    id: "repo-id-001",
    versionId: "v0",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    staticData: {},
    pinData: {},
  };
}

function writeWorkflow(file, data) {
  const fullPath = path.join(file, "cfdi_telegram_local_ingest.n8n.json");
  fs.writeFileSync(fullPath, JSON.stringify(data), "utf8");
  return fullPath;
}

function createN8nClient(activeWorkflow) {
  return {
    listWorkflows: async () => [activeWorkflow],
  };
}

async function run() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-sync-check-"));
  const workflowPath = writeWorkflow(root, workflowFixture());
  const activeMatch = {
    name: "cfdi_telegram_local_ingest",
    id: "wf-n8n-01",
    active: true,
    nodes: workflowFixture().nodes,
    connections: {},
    settings: {},
    versionId: "v-runtime",
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-02T00:00:00.000Z",
    staticData: {},
    pinData: {},
  };

  const inSync = await runWorkflowSyncCheckScenario({
    workflowPath,
    n8nClient: createN8nClient(activeMatch),
    args: {},
  });
  assert.strictEqual(inSync.scenario, "workflow-sync-check");
  assert.strictEqual(inSync.pass, true);
  assert.strictEqual(inSync.workflow_in_sync, true);

  const drift = await runWorkflowSyncCheckScenario({
    workflowPath,
    n8nClient: createN8nClient({
      ...activeMatch,
      nodes: [buildNode("Build Telegram Dispatch Plan"), buildNode("Should Send Telegram"), buildNode("LOGIC-CHANGED")],
    }),
    args: {},
  });
  assert.strictEqual(drift.pass, false);
  assert.strictEqual(drift.requires_import, true);
  assert.strictEqual(drift.workflow_in_sync, false);
}

run().then(() => {
  console.log("QA Workflow Sync Check Tests");
  console.log(" - workflow_sync_check_same_hash: PASS");
  console.log(" - workflow_sync_check_requires_import: PASS");
  console.log("\nPASS total: 2/2");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

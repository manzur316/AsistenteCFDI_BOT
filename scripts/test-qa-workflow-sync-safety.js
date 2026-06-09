const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { runWorkflowSyncScenario, runWorkflowActivateScenario } = require("./qa/satbot-e2e-harness");

function buildNode(name) {
  return { name, type: "n8n-nodes-base.function", parameters: {} };
}

function buildWorkflow(options = {}) {
  return {
    id: options.id || "wf-local-001",
    name: options.name || "cfdi_telegram_local_ingest",
    active: options.active !== false,
    nodes: [
      buildNode("Build Telegram Dispatch Plan"),
      buildNode("Should Send Telegram"),
      buildNode("Telegram editMessageText"),
      buildNode("Telegram sendMessage"),
      buildNode("Telegram fallback sendMessage"),
      buildNode("Log Send Result SQL"),
      buildNode("Execute PAC Sandbox Action"),
    ],
    connections: {},
    settings: {},
  };
}

function writeWorkflow(root, workflow) {
  const fullPath = path.join(root, "cfdi_telegram_local_ingest.n8n.json");
  fs.writeFileSync(fullPath, JSON.stringify(workflow, null, 2), "utf8");
  return fullPath;
}

function createWorkflowSyncClient(workflow) {
  let current = workflow;
  return {
    listWorkflows: async () => [current],
    updateWorkflow: async () => {
      current = { ...current, active: true };
      return current;
    },
    getWorkflow: async () => current,
  };
}

function createWorkflowActivateClient(workflow) {
  let current = workflow;
  let activated = false;
  return {
    listWorkflows: async () => [current],
    activateWorkflow: async () => {
      activated = true;
      current = { ...current, active: true };
    },
    getWorkflow: async () => current,
    getActivateState: () => activated,
  };
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-workflow-sync-safety-"));
  const workflowPath = writeWorkflow(root, buildWorkflow());
  const repoWorkflow = buildWorkflow();
  const repoWorkflowPath = writeWorkflow(root, repoWorkflow);

  const blockedSync = await runWorkflowSyncScenario({
    workflowPath,
    n8nClient: createWorkflowSyncClient(buildWorkflow()),
    args: { allowWorkflowUpdate: false },
  }).then(
    () => ({ pass: true }),
    (error) => ({ pass: false, error }),
  );
  assert.strictEqual(blockedSync.pass, false, "workflow-sync should fail without --allow-workflow-update");
  assert(blockedSync.error.message.includes("WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT"));

  const blockedActivate = await runWorkflowActivateScenario({
    workflowPath: repoWorkflowPath,
    n8nClient: createWorkflowActivateClient(buildWorkflow()),
    args: { allowWorkflowUpdate: false },
  }).then(
    () => ({ pass: true }),
    (error) => ({ pass: false, error }),
  );
  assert.strictEqual(blockedActivate.pass, false, "workflow-activate should fail without --allow-workflow-update");
  assert(blockedActivate.error.message.includes("WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT"));

  const syncResult = await runWorkflowSyncScenario({
    workflowPath: workflowPath,
    n8nClient: createWorkflowSyncClient(buildWorkflow({ active: false })),
    args: { allowWorkflowUpdate: true },
  });
  assert.strictEqual(syncResult.pass, true, "workflow-sync should pass when explicit allow flag is present");
  assert.strictEqual(syncResult.workflow_updated, true);
  assert.strictEqual(syncResult.workflow_in_sync, true);

  const activateClient = createWorkflowActivateClient(buildWorkflow({ active: false }));
  const activateResult = await runWorkflowActivateScenario({
    workflowPath: repoWorkflowPath,
    n8nClient: activateClient,
    args: { allowWorkflowUpdate: true },
  });
  assert.strictEqual(activateResult.pass, true, "workflow-activate should activate workflow with explicit flag");
  assert.strictEqual(activateClient.getActivateState(), true);

  console.log("QA Workflow Sync Safety Tests");
  console.log(" - workflow_sync_requires_flag: PASS");
  console.log(" - workflow_activate_requires_flag: PASS");
  console.log(" - workflow_sync_updates_with_flag: PASS");
  console.log(" - workflow_activate_runs_with_flag: PASS");
  console.log("\nPASS total: 4/4");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

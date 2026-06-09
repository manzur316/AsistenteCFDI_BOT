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
    settings: {
      executionOrder: "v1",
    },
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
    settings: {
      executionOrder: "v1",
    },
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

  const n8nManagedOnly = await runWorkflowSyncCheckScenario({
    workflowPath,
    n8nClient: createN8nClient({
      ...activeMatch,
      settings: {
        executionOrder: "v1",
        availableInMCP: false,
        callerPolicy: "workflowsFromSameOwner",
      },
    }),
    args: {},
  });
  assert.strictEqual(n8nManagedOnly.pass, true);
  assert.strictEqual(n8nManagedOnly.workflow_in_sync, true);
  assert.strictEqual(n8nManagedOnly.requires_import, false);
  assert.deepStrictEqual(n8nManagedOnly.changed_fields_summary, []);
  assert.deepStrictEqual(n8nManagedOnly.ignored_n8n_settings, ["availableInMCP", "callerPolicy"]);
  assert.strictEqual(n8nManagedOnly.settings_diff, null);

  const settingsDiff = await runWorkflowSyncCheckScenario({
    workflowPath,
    n8nClient: createN8nClient({
      ...activeMatch,
      settings: {
        executionOrder: "v2",
      },
    }),
    args: {},
  });
  assert.strictEqual(settingsDiff.pass, false);
  assert.strictEqual(settingsDiff.workflow_in_sync, false);
  assert.strictEqual(settingsDiff.requires_import, true);
  assert.deepStrictEqual(settingsDiff.changed_fields_summary, ["settings"]);
  assert.strictEqual(settingsDiff.settings_diff.executionOrder.repo, "v1");
  assert.strictEqual(settingsDiff.settings_diff.executionOrder.n8n, "v2");

  const connectionDiff = await runWorkflowSyncCheckScenario({
    workflowPath,
    n8nClient: createN8nClient({
      ...activeMatch,
      connections: {
        main: [
          [
            {
              node: "Build Telegram Dispatch Plan",
              type: "main",
              index: 0,
            },
          ],
        ],
      },
      settings: {
        executionOrder: "v1",
      },
    }),
    args: {},
  });
  assert.strictEqual(connectionDiff.pass, false);
  assert.strictEqual(connectionDiff.workflow_in_sync, false);
  assert.strictEqual(connectionDiff.requires_import, true);
  assert.deepStrictEqual(connectionDiff.changed_fields_summary, ["connections"]);
}

run().then(() => {
  console.log("QA Workflow Sync Check Tests");
  console.log(" - workflow_sync_check_same_hash: PASS");
  console.log(" - workflow_sync_check_requires_import: PASS");
  console.log(" - workflow_sync_check_ignores_n8n_managed_settings: PASS");
  console.log(" - workflow_sync_check_detects_real_settings_diff: PASS");
  console.log(" - workflow_sync_check_detects_connection_diff: PASS");
  console.log("\nPASS total: 5/5");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

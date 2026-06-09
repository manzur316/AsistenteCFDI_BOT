#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { createN8nApiClient } = require("./n8n-api-client");
const { createPostgresQaClient } = require("./postgres-qa-client");
const { analyzeExecution } = require("./qa-assertions");
const { writeQaReport } = require("./report-builder");
const { runCallbackTokenScenario } = require("./scenarios/sandbox-callback-dispatch");
const { runDeliveryPrepareScenario } = require("./scenarios/delivery-prepare-flow");
const { runSandboxExistingDraftScenario } = require("./scenarios/sandbox-existing-draft-document-flow");

function parseArgs(argv) {
  const args = { safe: true, noRealSend: true, noProviderCreate: true, noProduction: true };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    }
  }
  return args;
}

function printHelp() {
  console.log([
    "SATBOT Local E2E QA Harness",
    "",
    "Usage:",
    "  node scripts/qa/satbot-e2e-harness.js --scenario inspect-last-execution",
    "  node scripts/qa/satbot-e2e-harness.js --scenario inspect-execution --execution-id 2351",
    "  node scripts/qa/satbot-e2e-harness.js --scenario callback-token --token <TOKEN>",
    "  node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel TELEGRAM_DOCUMENT_CHANNEL",
    "  node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel PROVIDER_EMAIL",
    "  node scripts/qa/satbot-e2e-harness.js --scenario sandbox-existing-draft --draft-id <DRAFT_ID> --safe",
    "",
    "Defaults:",
    "  --safe=true --no-real-send=true --no-provider-create=true --no-production=true",
    "",
    "Required for n8n API scenarios:",
    "  N8N_API_KEY",
    "",
    "Safety:",
    "  This harness never confirms delivery real by default. Use --confirm-real-send only for explicit operator-approved tests.",
  ].join("\n"));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadLocalEnv() {
  const root = path.resolve(__dirname, "../..");
  loadEnvFile(path.join(root, ".env.local"));
  loadEnvFile(path.join(root, ".env.pac.sandbox.local"));
}

function reportRootFromEnv() {
  return process.env.QA_REPORT_ROOT || "runtime/qa-reports";
}

async function inspectExecutionScenario({ executionId, n8nClient }) {
  if (!executionId) throw new Error("NEEDS_INPUT: --execution-id requerido.");
  const execution = await n8nClient.getExecution({ executionId, includeData: true });
  const analysis = analyzeExecution(execution);
  return {
    pass: analysis.pass,
    scenario: "inspect-execution",
    execution_id: executionId,
    execution,
    analysis,
    failures: analysis.failures,
  };
}

async function inspectLastExecutionScenario({ n8nClient }) {
  const executions = await n8nClient.listExecutions({ limit: 1 });
  const latest = Array.isArray(executions?.data) ? executions.data[0] : Array.isArray(executions) ? executions[0] : executions?.results?.[0];
  const executionId = latest?.id || latest?.executionId;
  if (!executionId) throw new Error("NOT_FOUND: no encontre ejecuciones n8n.");
  return inspectExecutionScenario({ executionId, n8nClient });
}

async function runScenario(args) {
  loadLocalEnv();
  const scenario = String(args.scenario || "").trim();
  const n8nClient = createN8nApiClient({ env: process.env });
  const dbClient = createPostgresQaClient({ env: process.env, dbExecMode: args.dbExecMode || process.env.CFDI_DB_EXEC_MODE || "docker" });
  if (scenario === "inspect-execution") return inspectExecutionScenario({ executionId: args.executionId, n8nClient });
  if (scenario === "inspect-last-execution") return inspectLastExecutionScenario({ n8nClient });
  if (scenario === "callback-token") return runCallbackTokenScenario({ ...args, n8nClient, dbClient });
  if (scenario === "delivery-prepare") return runDeliveryPrepareScenario({ ...args, n8nClient, dbClient, draftId: args.draftId });
  if (scenario === "sandbox-existing-draft") return runSandboxExistingDraftScenario({ ...args, dbClient, draftId: args.draftId });
  throw new Error("NEEDS_INPUT: --scenario invalido o faltante.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const result = await runScenario(args);
  const scenario = args.scenario || result.scenario || "qa";
  const written = writeQaReport({
    reportRoot: reportRootFromEnv(),
    scenario,
    report: result,
    execution: result.execution,
    dbSnapshot: result.db_snapshot,
  });
  console.log(written.summary);
  console.log(`Report dir: ${written.dir}`);
  if (result.pass !== true) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || String(error));
    process.exitCode = 1;
  });
}

module.exports = {
  loadLocalEnv,
  parseArgs,
  printHelp,
  runScenario,
};

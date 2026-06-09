#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const { analyzeExecution, assertActiveWorkflowHasDispatchNodes, assertReplyMarkupReferencesToken } = require("./qa-assertions");
const {
  analyzeWorkflowVersion,
  buildWorkflowUpdatePayload,
  extractWebhookPath,
  extractWorkflowBackup,
  findActiveWorkflow,
  loadRepoWorkflow,
  workflowSyncCheck,
} = require("./workflow-sync");
const {
  createN8nApiClient,
  MULTIPLE_WORKFLOWS_MATCH,
  WORKFLOW_NOT_FOUND,
  WORKFLOW_SYNC_UNSUPPORTED_BY_LOCAL_N8N_API,
} = require("./n8n-api-client");
const { createPostgresQaClient } = require("./postgres-qa-client");
const { sanitizeReport } = require("./sanitize-report");
const { writeQaReport } = require("./report-builder");
const { runCallbackTokenScenario } = require("./scenarios/sandbox-callback-dispatch");
const { runDeliveryPrepareScenario } = require("./scenarios/delivery-prepare-flow");
const { runSandboxExistingDraftScenario } = require("./scenarios/sandbox-existing-draft-document-flow");

const EXPECTED_WORKFLOW_NAME = "cfdi_telegram_local_ingest";
const EXPECTED_WEBHOOK_PATH = "cfdi-local-ingest";
const EXPECTED_WORKFLOW_NODES = [
  "Build Telegram Dispatch Plan",
  "Should Send Telegram",
  "Telegram editMessageText",
  "Telegram sendMessage",
  "Telegram fallback sendMessage",
  "Log Send Result SQL",
];
const WORKFLOW_SYNC_SCENARIOS = new Set(["workflow-sync-check", "workflow-sync", "workflow-activate", "workflow-status"]);
const LIVE_DISPATCH_SCENARIOS = new Set([
  "callback-token",
  "delivery-prepare",
  "sandbox-button-smoke-safe",
  "telegram-document-real-smoke",
  "provider-email-real-smoke",
]);

function parseBool(value) {
  return value === true || value === "1" || value === 1 || String(value || "").toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return fallback;
}

function normalizeArgsBoolean(raw = {}, key, fallback = false) {
  return Object.prototype.hasOwnProperty.call(raw, key) ? parseBool(raw[key]) : fallback;
}

function toScenarioDefaults(raw = {}) {
  const sendRealProvided = Object.prototype.hasOwnProperty.call(raw, "sendReal");
  const noRealProvided = Object.prototype.hasOwnProperty.call(raw, "noRealSend");
  const noRealRaw = noRealProvided ? normalizeArgsBoolean(raw, "noRealSend", true) : true;
  const sendRealRaw = sendRealProvided ? normalizeArgsBoolean(raw, "sendReal", false) : !noRealRaw;
  const noRealSend = sendRealProvided ? !sendRealRaw : noRealRaw;

  return {
    safe: parseBool(raw.safe) !== false,
    noRealSend,
    sendReal: sendRealRaw,
    noProviderCreate: normalizeArgsBoolean(raw, "noProviderCreate", true),
    noProduction: normalizeArgsBoolean(raw, "noProduction", true),
    allowRemoteN8n: normalizeArgsBoolean(raw, "allowRemoteN8n", false),
    allowWorkflowUpdate: normalizeArgsBoolean(raw, "allowWorkflowUpdate", false) || normalizeArgsBoolean(raw, "applyWorkflowSync", false),
    confirmWorkflowSync: normalizeArgsBoolean(raw, "confirmWorkflowSync", false),
    confirmRealSend: normalizeArgsBoolean(raw, "confirmRealSend", false),
    allowSandboxReal: normalizeArgsBoolean(raw, "allowSandboxReal", false),
    forceRealSend: normalizeArgsBoolean(raw, "forceRealSend", false),
    maxRealSends: parseNumber(raw.maxRealSends, 1),
    applyWorkflowSync: normalizeArgsBoolean(raw, "applyWorkflowSync", false),
  };
}

function parseArgs(argv) {
  const args = {
    safe: true,
    noRealSend: true,
    noProviderCreate: true,
    noProduction: true,
    allowRemoteN8n: false,
    allowWorkflowUpdate: false,
    confirmWorkflowSync: false,
    confirmRealSend: false,
    allowSandboxReal: false,
    forceRealSend: false,
    maxRealSends: 1,
    applyWorkflowSync: false,
    sendReal: undefined,
    workflowSyncRefresh: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        if (key === "maxRealSends") {
          args[key] = parseNumber(next, 1);
          index += 1;
        } else {
          args[key] = ["safe", "noRealSend", "sendReal", "noProviderCreate", "noProduction", "allowRemoteN8n", "allowWorkflowUpdate", "confirmWorkflowSync", "confirmRealSend", "allowSandboxReal", "forceRealSend", "applyWorkflowSync", "confirmWorkflowSync", "workflowSyncRefresh", "applyWorkflowSync", "activateWorkflowAfterSync", "workflowSyncAfterActivate"].includes(key)
            ? parseBool(next)
            : next;
          index += 1;
        }
      }
    }
  }
  return { ...args, ...toScenarioDefaults(args) };
}

function printHelp() {
  console.log([
    "SATBOT Local E2E QA Harness",
    "",
    "Usage:",
    "  node scripts/qa/satbot-e2e-harness.js --scenario inspect-execution --execution-id 2351",
    "  node scripts/qa/satbot-e2e-harness.js --scenario workflow-status",
    "  node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check",
    "  node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --allow-workflow-update",
    "  node scripts/qa/satbot-e2e-harness.js --scenario workflow-activate --allow-workflow-update",
    "  node scripts/qa/satbot-e2e-harness.js --scenario callback-token --token <TOKEN>",
    "  node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel TELEGRAM_DOCUMENT_CHANNEL",
    "  node scripts/qa/satbot-e2e-harness.js --scenario delivery-prepare --draft-id <DRAFT_ID> --channel PROVIDER_EMAIL",
    "  node scripts/qa/satbot-e2e-harness.js --scenario sandbox-button-smoke-safe --draft-id <DRAFT_ID>",
    "  node scripts/qa/satbot-e2e-harness.js --scenario telegram-document-real-smoke --draft-id <DRAFT_ID> --send-real --confirm-real-send --allow-sandbox-real --max-real-sends 1",
    "  node scripts/qa/satbot-e2e-harness.js --scenario provider-email-real-smoke --draft-id <DRAFT_ID> --send-real --confirm-real-send --allow-sandbox-real --max-real-sends 1",
    "",
    "Workflow-sync flags:",
    "  --allow-workflow-update (reemplaza apply-workflow-sync)",
    "",
    "Real-send guardrails:",
    "  QA_ALLOW_REAL_SEND=1",
    "  --send-real",
    "  --confirm-real-send",
    "  --allow-sandbox-real",
    "  --max-real-sends 1",
    "",
    "Defaults:",
    "  --safe=true --no-real-send=true --no-provider-create=true --no-production=true",
    "",
    "Required for n8n API scenarios: N8N_API_KEY",
    "",
    "Safety:",
    "  Workflow sync/activate changes are opt-in and require explicit --allow-workflow-update.",
    "  This harness never confirms or sends real documents by default.",
    "  Real sandbox sends require the same explicit flags and additional environment guards.",
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
  if (parseBool(process.env.QA_ALLOW_REMOTE_N8N) || parseBool(process.env.ALLOW_REMOTE_N8N)) {
    process.env.QA_ALLOW_REMOTE_N8N = "1";
  }
}

function reportRootFromEnv() {
  return process.env.QA_REPORT_ROOT || "runtime/qa-reports";
}

function latestWorkflows(rawList) {
  if (Array.isArray(rawList)) return rawList;
  if (Array.isArray(rawList?.data)) return rawList.data;
  if (Array.isArray(rawList?.results)) return rawList.results;
  return [];
}

function first(value) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function listWorkflowsByName(workflows, name = EXPECTED_WORKFLOW_NAME) {
  const list = latestWorkflows(workflows).filter((item) => String(item?.name || "").trim() === name);
  if (list.length > 1) {
    const error = new Error(`MULTIPLE_WORKFLOWS_MATCH: ${name} (${list.length})`);
    error.code = MULTIPLE_WORKFLOWS_MATCH;
    throw error;
  }
  return list[0] || null;
}

function parseWorkflowPath(rawPath) {
  return path.resolve(rawPath || path.join(__dirname, "..", "..", "workflow", `${EXPECTED_WORKFLOW_NAME}.n8n.json`));
}

function summarizeExecution(execution, options = {}) {
  return analyzeExecution(execution, { ...options });
}

function failWithSuggestion(message) {
  return `${message}\nSugerir:\nnode scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check\nnode scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --allow-workflow-update\nnode scripts/qa/satbot-e2e-harness.js --scenario workflow-activate --allow-workflow-update`;
}

async function inspectExecutionScenario({ executionId, n8nClient, args }) {
  if (!executionId) throw new Error("NEEDS_INPUT: --execution-id requerido.");
  const execution = await n8nClient.getExecution({ executionId, includeData: true });
  const analysis = analyzeExecution(execution, { confirmToken: args?.confirmToken || null });
  return {
    pass: analysis.pass,
    scenario: "inspect-execution",
    execution_id: executionId,
    safe_mode: args?.safe === true,
    real_mode: parseBool(args?.sendReal) === true,
    send_real_allowed: parseBool(args?.sendReal) === true,
    send_real_executed: false,
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

function buildRealSendGuardResult({
  args,
  summary,
  channel,
  draftRecord,
  hasSent,
}) {
  const failures = [];
  const maxRealSends = Number(args.maxRealSends || 1);
  const draftProvider = String(summary?.provider || draftRecord?.provider || "factura_com").trim().toLowerCase();
  const draftEnv = String(summary?.environment || draftRecord?.environment || "SANDBOX").trim().toUpperCase();
  if (!parseBool(process.env.QA_ALLOW_REAL_SEND)) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: falta QA_ALLOW_REAL_SEND=1");
  if (!parseBool(args.sendReal)) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: falta --send-real");
  if (!parseBool(args.confirmRealSend)) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: falta --confirm-real-send");
  if (!parseBool(args.allowSandboxReal)) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: falta --allow-sandbox-real");
  if (!args.draftId) failures.push("NEEDS_INPUT: --draft-id requerido");
  if (String(process.env.FACTURACOM_SANDBOX_MODE || "").trim().toLowerCase() !== "live") failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: FACTURACOM_SANDBOX_MODE debe ser live");
  if (String(process.env.FACTURACOM_SANDBOX_LIVE || "").trim() !== "1") failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: FACTURACOM_SANDBOX_LIVE debe ser 1");
  if (maxRealSends !== 1) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: --max-real-sends debe ser 1 por corrida");
  if (draftProvider && draftProvider !== "factura_com") failures.push(`provider mismatch: ${draftProvider}`);
  if (draftEnv && draftEnv !== "SANDBOX") failures.push(`environment mismatch: ${draftEnv}`);
  if (summary?.production_blocked === false) failures.push("production_blocked must be true");
  if (summary?.documents_valid !== true) failures.push("documents_valid debe ser true");
  if (summary?.artifact_status !== "DOWNLOADED") failures.push("artifact_status debe ser DOWNLOADED");
  if (summary?.invoice_status !== "SANDBOX_TIMBRADO") failures.push("invoice_status debe ser SANDBOX_TIMBRADO");
  if (hasSent === true) failures.push("REAL_SEND_BLOCKED_BY_DEFAULT: ya existe delivery_status=SENT y ya tiene envío SENT");
  if (channel === "PROVIDER_EMAIL") {
    const providerEmail = summary?.provider_email || {};
    if (providerEmail?.ready !== true) failures.push("provider_email.ready debe ser true");
    if (providerEmail?.email_confirmed !== true) failures.push("provider_email.email_confirmed debe ser true");
    if (String(providerEmail?.provider_email_sync_status || "").toUpperCase() !== "SYNCED") {
      failures.push("provider_email.provider_email_sync_status debe ser SYNCED");
    }
  }
  if (channel === "TELEGRAM_DOCUMENT_CHANNEL") {
    const telegram = summary?.telegram_document_channel || {};
    if (telegram?.ready !== true) failures.push("telegram_document_channel.ready debe ser true");
  }
  return {
    pass: failures.length === 0,
    sendRealAllowed: failures.length === 0,
    failures,
    maxRealSends,
  };
}

function summarizeDeliveryRows(rows) {
  const snapshot = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
    const channel = String(row?.channel || "").toUpperCase();
    const merged = {
      delivery_status: row?.delivery_status || null,
      delivery_action: row?.delivery_action || null,
      provider: row?.provider || "factura_com",
      environment: row?.environment || "SANDBOX",
      sent_at: row?.sent_at || row?.sentAt || null,
      production_blocked: row?.production_blocked || null,
      last_row: row,
    };
    if (row && Object.prototype.hasOwnProperty.call(row, "provider_email_sync_status")) {
      merged.provider_email_sync_status = row.provider_email_sync_status;
    }
    if (row && Object.prototype.hasOwnProperty.call(row, "email_confirmed")) {
      merged.email_confirmed = row.email_confirmed;
    }
    acc[channel] = acc[channel] || [];
    acc[channel].push(merged);
    return acc;
  }, {});
  return snapshot;
}

async function loadDraftDeliveryContext(db, draftId) {
  const draft = first(await Promise.resolve(db.getDraft(draftId)));
  const ledger = first(await Promise.resolve(db.getDeliveryLedger(draftId)));
  const rows = await Promise.resolve(db.getDeliveryLedgerRows(draftId, { limit: 60 }));
  const summary = await Promise.resolve(db.getDocumentDeliverySummaryFromDraft(draftId));
  const rowByChannel = summarizeDeliveryRows(Array.isArray(rows) ? rows : rows?.rows || []);
  return {
    draft,
    ledger,
    rowsByChannel: rowByChannel,
    summary: {
      draft_id: draftId,
      invoice_status: draft?.invoice_status || summary?.invoice_status || draft?.sandbox_pac_summary?.invoice_status || null,
      artifact_status: draft?.artifact_status || draft?.sandbox_pac_summary?.artifact_status || summary?.artifact_status || null,
      documents_valid: draft?.documents_valid === true || summary?.documents_valid === true,
      provider: first(rows)?.provider || draft?.provider || "factura_com",
      environment: first(rows)?.environment || draft?.environment || "SANDBOX",
      production_blocked: draft?.production_blocked ?? summary?.production_blocked ?? null,
      provider_email: {
        ...summary?.provider_email,
        ...rowByChannel.PROVIDER_EMAIL?.[0],
      },
      telegram_document_channel: {
        ...summary?.telegram_document_channel,
        ...rowByChannel.TELEGRAM_DOCUMENT_CHANNEL?.[0],
      },
      ledger_summary: rowByChannel,
    },
  };
}

function findUnusedConfirmToken(rows, action) {
  return (rows || []).find((row) => String(row?.action || "").toUpperCase() === action && !row?.used_at) || null;
}

async function runActiveWorkflowVersionGuard({ n8nClient }) {
  const workflows = latestWorkflows(await n8nClient.listWorkflows({ limit: 200 }));
  const active = findActiveWorkflow(workflows, EXPECTED_WORKFLOW_NAME);
  if (!active) {
    const error = new Error(`ACTIVE_WORKFLOW_OUT_OF_SYNC: no workflow activo: ${EXPECTED_WORKFLOW_NAME}`);
    throw new Error(failWithSuggestion(error.message));
  }
  try {
    const result = assertActiveWorkflowHasDispatchNodes(active);
    if (result?.pass !== true) {
      throw new Error(`ACTIVE_WORKFLOW_OUT_OF_SYNC: workflow sin nodos requeridos`);
    }
  } catch (error) {
    if (error?.message && /ACTIVE_WORKFLOW_OUT_OF_SYNC/.test(error.message)) {
      throw new Error(failWithSuggestion(error.message));
    }
    throw error;
  }
  return active;
}

async function runWorkflowStatusScenario({ n8nClient, args }) {
  const workflows = latestWorkflows(await n8nClient.listWorkflows({ limit: 200 }));
  const active = findActiveWorkflow(workflows, EXPECTED_WORKFLOW_NAME);
  const workflow = active || listWorkflowsByName(workflows, EXPECTED_WORKFLOW_NAME);
  const analysis = workflow ? analyzeWorkflowVersion(workflow, {
    expectedNodes: EXPECTED_WORKFLOW_NODES,
    expectedWebhookPath: EXPECTED_WEBHOOK_PATH,
  }) : { ok: false, missingNodes: EXPECTED_WORKFLOW_NODES, hasExpectedWebhook: false, webhookPath: null };
  const criticalNodes = EXPECTED_WORKFLOW_NODES.map((name) => ({
    node: name,
    present: !analysis.missingNodes.includes(name),
  }));
  const pass = Boolean(workflow) && analysis.ok && workflow.active === true;
  const failures = [];
  if (!workflow) failures.push(`workflow_not_found: ${EXPECTED_WORKFLOW_NAME}`);
  if (!workflow?.active) failures.push("workflow active=false");
  return {
    pass,
    scenario: "workflow-status",
    safe_mode: args?.safe === true,
    real_mode: parseBool(args?.sendReal),
    n8n_available: true,
    n8n_workflow_id: workflow?.id || null,
    n8n_workflow_name: workflow?.name || null,
    workflow_active: workflow?.active === true,
    workflow_in_sync: null,
    workflow_updated: false,
    send_real_allowed: false,
    send_real_executed: false,
    workflow_path: path.relative(process.cwd(), parseWorkflowPath(args.workflowPath)),
    expected_workflow_nodes: EXPECTED_WORKFLOW_NODES,
    critical_nodes_present: criticalNodes,
    missing_nodes: analysis.missingNodes,
    webhook_path: analysis.webhookPath || extractWebhookPath(workflow || {}),
    has_expected_webhook: analysis.hasExpectedWebhook,
    workflow_active_id: workflow?.id || null,
    failures,
  };
}

async function runWorkflowSyncCheckScenario({ workflowPath, n8nClient, args }) {
  const resolvedPath = path.resolve(workflowPath || parseWorkflowPath(args.workflowPath));
  const repoWorkflow = loadRepoWorkflow(resolvedPath);
  const repoWorkflowName = String(repoWorkflow?.name || "").trim();
  const workflows = latestWorkflows(await n8nClient.listWorkflows({ limit: 200 }));
  const n8nWorkflow = listWorkflowsByName(workflows, EXPECTED_WORKFLOW_NAME);
  const diff = workflowSyncCheck({
    repoWorkflow,
    n8nWorkflow: n8nWorkflow || {},
  });
  return {
    pass: Boolean(diff.workflow_in_sync),
    scenario: "workflow-sync-check",
    safe_mode: args?.safe === true,
    real_mode: parseBool(args?.sendReal),
    workflow_updated: false,
    workflow_in_sync: diff.workflow_in_sync,
    repo_hash: diff.repo_hash,
    n8n_hash: n8nWorkflow ? diff.n8n_hash : null,
    active_workflow_id: diff.active_workflow_id,
    active_workflow_name: diff.active_workflow_name,
    repo_workflow_name: repoWorkflowName,
    expected_workflow_name: EXPECTED_WORKFLOW_NAME,
    requires_import: diff.requires_import,
    workflow_path: path.relative(process.cwd(), resolvedPath),
    send_real_allowed: false,
    send_real_executed: false,
    failures: diff.workflow_in_sync ? [] : ["workflow_diff_detected"],
  };
}

async function runWorkflowSyncScenario({ workflowPath, n8nClient, args }) {
  if (!parseBool(args.allowWorkflowUpdate)) {
    throw new Error("WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT: usa --allow-workflow-update");
  }
  const resolvedPath = path.resolve(workflowPath || parseWorkflowPath(args.workflowPath));
  const repoWorkflow = loadRepoWorkflow(resolvedPath);
  const repoWorkflowName = String(repoWorkflow?.name || "").trim();
  const workflows = latestWorkflows(await n8nClient.listWorkflows({ limit: 200 }));
  const active = findActiveWorkflow(workflows, EXPECTED_WORKFLOW_NAME);
  const target = listWorkflowsByName(workflows, EXPECTED_WORKFLOW_NAME);
  if (!target) {
    throw new Error(`NOT_FOUND: no se encontro workflow ${EXPECTED_WORKFLOW_NAME} en n8n`);
  }
  const previous = {
    sync: workflowSyncCheck({ repoWorkflow, n8nWorkflow: target }),
    active: target?.active === true,
    workflow_name: target.name || null,
  };
  const backup = extractWorkflowBackup(active || target);
  const payload = buildWorkflowUpdatePayload(repoWorkflow, null);
  const updatedWorkflow = await n8nClient.updateWorkflow({ workflowId: target.id, workflow: payload });
  const refreshed = await n8nClient.getWorkflow({ workflowId: target.id });
  const sync = workflowSyncCheck({ repoWorkflow, n8nWorkflow: refreshed || updatedWorkflow || target });
  return {
    pass: sync.workflow_in_sync === true,
    scenario: "workflow-sync",
    safe_mode: args?.safe === true,
    real_mode: parseBool(args?.sendReal),
    workflow_updated: true,
    workflow_path: path.relative(process.cwd(), resolvedPath),
    workflow_in_sync: sync.workflow_in_sync,
    workflow_in_sync_after: sync.workflow_in_sync,
    repo_hash: sync.repo_hash,
    n8n_hash: sync.n8n_hash,
    repo_workflow_name: repoWorkflowName,
    active_workflow_name: sync.active_workflow_name || target.name,
    active_workflow_id: sync.active_workflow_id || target.id,
    expected_workflow_name: EXPECTED_WORKFLOW_NAME,
    workflow_active: refreshed?.active === true || target.active === true,
    send_real_allowed: false,
    send_real_executed: false,
    workflow_diff: {
      before_update: previous,
      after_update: sync,
      backup,
    },
    failures: sync.workflow_in_sync ? [] : ["workflow_diff_detected"],
  };
}

async function runWorkflowActivateScenario({ workflowPath, n8nClient, args }) {
  if (!parseBool(args.allowWorkflowUpdate)) {
    throw new Error("WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT: usa --allow-workflow-update");
  }
  const workflows = latestWorkflows(await n8nClient.listWorkflows({ limit: 200 }));
  const target = listWorkflowsByName(workflows, EXPECTED_WORKFLOW_NAME);
  if (!target) {
    throw new Error(`NOT_FOUND: no se encontro workflow ${EXPECTED_WORKFLOW_NAME} para activar`);
  }
  try {
    assertActiveWorkflowHasDispatchNodes(target);
  } catch (error) {
    if (error.message.includes("ACTIVE_WORKFLOW_OUT_OF_SYNC")) {
      throw new Error(failWithSuggestion(error.message));
    }
    throw error;
  }
  if (target.active !== true) {
    await n8nClient.activateWorkflow({ workflowId: target.id });
  }
  const refreshed = await n8nClient.getWorkflow({ workflowId: target.id });
  const passed = refreshed?.active === true;
  return {
    pass: passed,
    scenario: "workflow-activate",
    safe_mode: args?.safe === true,
    real_mode: parseBool(args?.sendReal),
    workflow_active: passed,
    workflow_updated: false,
    workflow_in_sync: null,
    active_workflow_id: target.id,
    active_workflow_name: refreshed?.name || target.name,
    send_real_allowed: false,
    send_real_executed: false,
    failures: passed ? [] : ["workflow_activate_failed"],
  };
}

async function runCallbackWithActiveGuard({ n8nClient, dbClient, args }) {
  await runActiveWorkflowVersionGuard({ n8nClient });
  return runCallbackTokenScenario({ ...args, n8nClient, dbClient });
}

async function runDeliveryPrepareWithActiveGuard({ n8nClient, dbClient, args, fetchImpl }) {
  await runActiveWorkflowVersionGuard({ n8nClient });
  return runDeliveryPrepareScenario({ ...args, n8nClient, dbClient, fetchImpl });
}

function buildDraftReadinessSummary(summary) {
  return {
    invoice_status: summary?.invoice_status || null,
    artifact_status: summary?.artifact_status || null,
    documents_valid: summary?.documents_valid === true,
    provider_email: summary?.provider_email || null,
    telegram_document_channel: summary?.telegram_document_channel || null,
  };
}

async function runSandboxButtonSmokeSafeScenario({ args, n8nClient, dbClient, fetchImpl }) {
  const draftId = String(args.draftId || "").trim();
  if (!draftId) throw new Error("NEEDS_INPUT: --draft-id requerido.");
  const context = await loadDraftDeliveryContext(dbClient, draftId);
  const draftSummary = buildDraftReadinessSummary(context.summary);
  const failures = [];
  if (draftSummary.invoice_status !== "SANDBOX_TIMBRADO") failures.push("invoice_status mismatch");
  if (draftSummary.artifact_status !== "DOWNLOADED") failures.push("artifact_status debe ser DOWNLOADED");
  if (draftSummary.documents_valid !== true) failures.push("documents_valid debe ser true");
  if (failures.length) {
    return {
      pass: false,
      scenario: "sandbox-button-smoke-safe",
      safe_mode: true,
      real_mode: false,
      draft_id: draftId,
      channel: "MIXED",
      send_real_allowed: false,
      send_real_executed: false,
      failures,
    };
  }
  const telegramPrepare = await runDeliveryPrepareWithActiveGuard({
    n8nClient,
    dbClient,
    args: { ...args, draftId, channel: "TELEGRAM_DOCUMENT_CHANNEL" },
    fetchImpl,
  });
  const providerPrepare = await runDeliveryPrepareWithActiveGuard({
    n8nClient,
    dbClient,
    args: { ...args, draftId, channel: "PROVIDER_EMAIL" },
    fetchImpl,
  });
  const tokensAfterTelegram = await Promise.resolve(dbClient.getActionTokensByDraft(draftId));
  const tokensAfterProvider = await Promise.resolve(dbClient.getActionTokensByDraft(draftId));
  const telegramConfirmToken = findUnusedConfirmToken(tokensAfterTelegram, "DELIVERY_CONFIRM_TELEGRAM_CHANNEL");
  const providerConfirmToken = findUnusedConfirmToken(tokensAfterProvider, "DELIVERY_CONFIRM_PROVIDER_EMAIL");
  const postContext = await loadDraftDeliveryContext(dbClient, draftId);
  const postSummary = buildDraftReadinessSummary(postContext.summary);
  if (!telegramPrepare.pass) return telegramPrepare;
  if (!providerPrepare.pass) return providerPrepare;
  const tokenFailures = [];
  const telegramAnalysis = telegramPrepare.analysis || summarizeExecution(telegramPrepare.execution, { confirmToken: telegramConfirmToken?.token });
  const providerAnalysis = providerPrepare.analysis || summarizeExecution(providerPrepare.execution, { confirmToken: providerConfirmToken?.token });
  const finalFailures = [];
  if (!telegramConfirmToken) tokenFailures.push("NO_PREPARE_TOKEN_AVAILABLE: falta DELIVERY_CONFIRM_TELEGRAM_CHANNEL");
  if (!providerConfirmToken) tokenFailures.push("NO_PREPARE_TOKEN_AVAILABLE: falta DELIVERY_CONFIRM_PROVIDER_EMAIL");
  if (telegramConfirmToken) {
    try {
      assertReplyMarkupReferencesToken({ execution: telegramPrepare.execution, token: telegramConfirmToken.token });
    } catch (error) {
      tokenFailures.push(error.message);
    }
  }
  if (providerConfirmToken) {
    try {
      assertReplyMarkupReferencesToken({ execution: providerPrepare.execution, token: providerConfirmToken.token });
    } catch (error) {
      tokenFailures.push(error.message);
    }
  }
  if (!telegramAnalysis.dispatch_nodes_executed?.length && !telegramAnalysis.blocked_reason) finalFailures.push("telegram no dispatch");
  if (!providerAnalysis.dispatch_nodes_executed?.length && !providerAnalysis.blocked_reason) finalFailures.push("provider no dispatch");
  const telegramSent = String(postSummary.telegram_document_channel?.last_status || "").toUpperCase() === "SENT";
  const providerSent = String(postSummary.provider_email?.last_status || "").toUpperCase() === "SENT";
  if (telegramSent || providerSent) finalFailures.push("ledger indicates SENT");
  return {
    pass: tokenFailures.length === 0 && finalFailures.length === 0,
    scenario: "sandbox-button-smoke-safe",
    safe_mode: true,
    real_mode: false,
    draft_id: draftId,
    channel: "MIXED",
    telegram_dispatch_status: telegramAnalysis.telegram_dispatch_ok === true,
    confirm_token_created: Boolean(telegramConfirmToken || providerConfirmToken),
    reply_markup_references_confirm_token: Boolean(telegramConfirmToken && providerConfirmToken),
    ledger_status: {
      telegram_document_channel: postSummary.telegram_document_channel || null,
      provider_email: postSummary.provider_email || null,
    },
    execution_id: telegramPrepare.execution_id || providerPrepare.execution_id || null,
    execution: telegramPrepare.execution || providerPrepare.execution || null,
    analysis: telegramAnalysis,
    db_snapshot: {
      draft: context.draft || null,
      pre_summary: context.summary || null,
      post_summary: postContext.summary || null,
      summary: `invoice_status=${draftSummary.invoice_status} artifact_status=${draftSummary.artifact_status} documents_valid=${draftSummary.documents_valid}`,
      ledger_state: [telegramPrepare.db_snapshot?.summary, providerPrepare.db_snapshot?.summary].filter(Boolean).join(" | "),
    },
    send_real_allowed: false,
    send_real_executed: false,
    tokens_created: 0,
    failures: [...tokenFailures, ...finalFailures],
  };
}

async function runDeliveryRealSmokeScenario({ args, n8nClient, dbClient, channel, fetchImpl }) {
  const draftId = String(args.draftId || "").trim();
  if (!draftId) throw new Error("NEEDS_INPUT: --draft-id requerido.");
  const context = await loadDraftDeliveryContext(dbClient, draftId);
  const channelKey = channel === "PROVIDER_EMAIL" ? "PROVIDER_EMAIL" : "TELEGRAM_DOCUMENT_CHANNEL";
  const summary = buildDraftReadinessSummary(context.summary);
  const latestRow = first(context.rowsByChannel?.[channelKey] || []);
  const hasSent = String(latestRow?.delivery_status || "").toUpperCase() === "SENT";
  const guard = buildRealSendGuardResult({
    args,
    summary: {
      ...summary,
      provider: latestRow?.provider || context.summary.provider,
      environment: latestRow?.environment || context.summary.environment,
      production_blocked: context.summary.production_blocked,
    },
    channel: channelKey,
    hasSent,
    draftRecord: context.draft || {},
  });
  if (!guard.pass) {
    return {
      pass: false,
      scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
      safe_mode: false,
      real_mode: true,
      draft_id: draftId,
      channel: channelKey,
      send_real_allowed: false,
      send_real_executed: false,
      failures: guard.failures,
    };
  }
  if (hasSent && !parseBool(args.forceRealSend)) {
    return {
      pass: false,
      scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
      safe_mode: false,
      real_mode: true,
      draft_id: draftId,
      channel: channelKey,
      send_real_allowed: true,
      send_real_executed: false,
      failures: ["REAL_SEND_BLOCKED_BY_DEFAULT: ya tiene envío SENT y --force-real-send no está activo"],
    };
  }

  const prepare = await runDeliveryPrepareWithActiveGuard({
    n8nClient,
    dbClient,
    args: { ...args, draftId, channel: channelKey },
    fetchImpl,
  });
  if (!prepare.pass && !(channelKey === "PROVIDER_EMAIL" && !parseBool(args.safe))) {
    return {
      pass: false,
      scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
      safe_mode: false,
      real_mode: true,
      draft_id: draftId,
      channel: channelKey,
      send_real_allowed: true,
      send_real_executed: false,
      failures: prepare.failures || ["delivery prepare failed"],
      db_snapshot: prepare.db_snapshot || null,
    };
  }
  const confirmAction = channel === "PROVIDER_EMAIL" ? "DELIVERY_CONFIRM_PROVIDER_EMAIL" : "DELIVERY_CONFIRM_TELEGRAM_CHANNEL";
  const tokens = await Promise.resolve(dbClient.getActionTokensByDraft(draftId));
  const confirmToken = findUnusedConfirmToken(tokens, confirmAction);
  if (!confirmToken) {
    return {
      pass: false,
      scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
      safe_mode: false,
      real_mode: true,
      draft_id: draftId,
      channel: channelKey,
      send_real_allowed: true,
      send_real_executed: false,
      failures: ["NO_PREPARE_TOKEN_AVAILABLE: no confirm token listo para envío real"],
    };
  }
  let replyMarkupReferencesToken = true;
  try {
    assertReplyMarkupReferencesToken({ execution: prepare.execution, token: confirmToken.token });
  } catch (error) {
    if (parseBool(args.safe)) {
      return {
        pass: false,
        scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
        safe_mode: false,
        real_mode: true,
        draft_id: draftId,
        channel: channelKey,
        send_real_allowed: true,
        send_real_executed: false,
        failures: [error.message],
      };
      }
    replyMarkupReferencesToken = false;
  }

  const confirm = await runCallbackTokenScenario({
    ...args,
    token: confirmToken.token,
    n8nClient,
    dbClient,
    draftId,
    channel: channelKey,
    safe: false,
    sendReal: true,
    confirmRealSend: true,
    fetchImpl,
  });
  const postContext = await loadDraftDeliveryContext(dbClient, draftId);
  const postSummary = buildDraftReadinessSummary(postContext.summary);
  const channelSummary = channel === "PROVIDER_EMAIL" ? postSummary.provider_email : postSummary.telegram_document_channel;
  const sentByLedger = String(channelSummary?.last_status || channelSummary?.delivery_status || "").toUpperCase() === "SENT"
    || parseBool(channelSummary?.sent);
  const sentByWebhook = parseBool(confirm.webhook_response?.ok);
  const sent = sentByLedger || sentByWebhook;
  const analysis = summarizeExecution(confirm.execution);
  const failures = [];
  if (!sent) failures.push("ledger not SENT");
  const ignoreChannelAnalysis = channelKey === "PROVIDER_EMAIL";
  if (!analysis.pass && !ignoreChannelAnalysis) failures.push(...analysis.failures);
  return {
    pass: failures.length === 0,
    scenario: channel === "PROVIDER_EMAIL" ? "provider-email-real-smoke" : "telegram-document-real-smoke",
    safe_mode: false,
    real_mode: true,
    draft_id: draftId,
    channel: channelKey,
    send_real_allowed: true,
    send_real_executed: sent,
    execution_id: confirm.execution_id || confirm.execution?.id || null,
    execution: confirm.execution || null,
    analysis,
    confirmation_token: confirmToken.token,
    telegram_dispatch_status: analysis.telegram_dispatch_ok === true,
    confirm_token_created: true,
    reply_markup_references_confirm_token: replyMarkupReferencesToken,
    max_real_sends: guard.maxRealSends,
    db_snapshot: {
      pre_summary: summary,
      post_summary: postSummary,
      summary: `post_status=${channelSummary?.last_status || "N/A"}`,
      ledger_state: `${channel}: ${channelSummary?.delivery_status || channelSummary?.last_status || "N/A"}`,
    },
    workflow_updated: false,
    workflow_active: true,
    failures,
  };
}

async function runScenario(args) {
  loadLocalEnv();
  const options = { ...args };
  if (options.allowRemoteN8n) process.env.QA_ALLOW_REMOTE_N8N = "1";
  const n8nClient = createN8nApiClient({ env: process.env, allowRemote: options.allowRemoteN8n === true });
  const dbClient = createPostgresQaClient({
    env: process.env,
    dbExecMode: args.dbExecMode || process.env.CFDI_DB_EXEC_MODE || "docker",
  });

  const scenario = String(args.scenario || "").trim();
  if (scenario === "inspect-execution") return inspectExecutionScenario({ executionId: args.executionId, n8nClient, args });
  if (scenario === "inspect-last-execution") return inspectLastExecutionScenario({ n8nClient });
  if (scenario === "workflow-status") return runWorkflowStatusScenario({ n8nClient, args });
  if (scenario === "workflow-sync-check") return runWorkflowSyncCheckScenario({ workflowPath: args.workflowPath, n8nClient, args });
  if (scenario === "workflow-sync") return runWorkflowSyncScenario({ workflowPath: args.workflowPath, n8nClient, args });
  if (scenario === "workflow-activate") return runWorkflowActivateScenario({ workflowPath: args.workflowPath, n8nClient, args });
  if (scenario === "callback-token") return runCallbackWithActiveGuard({ n8nClient, dbClient, args });
  if (scenario === "delivery-prepare") return runDeliveryPrepareWithActiveGuard({ n8nClient, dbClient, args });
  if (scenario === "sandbox-existing-draft") return runSandboxExistingDraftScenario({ ...args, dbClient, draftId: args.draftId });
  if (scenario === "sandbox-button-smoke-safe") return runSandboxButtonSmokeSafeScenario({ args, n8nClient, dbClient });
  if (scenario === "telegram-document-real-smoke") return runDeliveryRealSmokeScenario({ args, n8nClient, dbClient, channel: "TELEGRAM_DOCUMENT_CHANNEL" });
  if (scenario === "provider-email-real-smoke") return runDeliveryRealSmokeScenario({ args, n8nClient, dbClient, channel: "PROVIDER_EMAIL" });
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
    dbSnapshot: result.db_snapshot || null,
  });
  console.log(written.summary);
  console.log(`Report dir: ${written.dir}`);
  if (result.pass !== true) process.exitCode = 1;
}

if (require.main === module) {
  const writeWorkflowSyncFailureReport = ({ args, error }) => {
    const body = sanitizeReport(error?.body || null);
    const status = error?.status != null ? Number(error.status) : null;
    const code = error?.code || null;
    const rootCause = `${error?.message || "N8N_API_HTTP_ERROR"}${Number.isFinite(status) ? `:${status}` : ""}`;
    const written = writeQaReport({
      reportRoot: reportRootFromEnv(),
      scenario: "workflow-sync",
      report: {
        pass: false,
        scenario: "workflow-sync",
        safe_mode: args?.safe === true,
        real_mode: parseBool(args?.sendReal),
        workflow_in_sync: false,
        workflow_in_sync_after: false,
        workflow_updated: false,
        send_real_allowed: false,
        send_real_executed: false,
        n8n_error_body_sanitized: body,
        n8n_error_code: code,
        n8n_error_method: error?.method || null,
        http_status: status,
        failures: [rootCause],
      },
      now: new Date(),
    });
    return written;
  };
  main().catch((error) => {
    const args = parseArgs(process.argv.slice(2));
    const scenario = String(args.scenario || "qa").trim();
    if (scenario === "workflow-sync") {
      const written = writeWorkflowSyncFailureReport({ args, error });
      console.log(written.summary);
      console.log(`Report dir: ${written.dir}`);
    }
    const safeError = sanitizeReport({
      status: error?.status || null,
      code: error?.code || null,
      method: error?.method || null,
      body: error?.body || null,
      message: error?.message || String(error),
    });
    if (safeError?.status) {
      console.error(`status=${safeError.status}`);
    }
    if (safeError?.code) {
      console.error(`code=${safeError.code}`);
    }
    if (safeError?.method) {
      console.error(`method=${safeError.method}`);
    }
    if (safeError?.body) {
      console.error(`body=${JSON.stringify(safeError.body)}`);
    }
    if (!safeError?.status && !safeError?.code && !safeError?.method && !safeError?.body) {
      console.error(safeError.message || String(error));
    }
    process.exitCode = 1;
  });
}

module.exports = {
  inspectExecutionScenario,
  inspectLastExecutionScenario,
  runScenario,
  runWorkflowStatusScenario,
  runWorkflowSyncCheckScenario,
  runWorkflowSyncScenario,
  runWorkflowActivateScenario,
  runSandboxButtonSmokeSafeScenario,
  runDeliveryRealSmokeScenario,
  buildDraftReadinessSummary,
  buildRealSendGuardResult,
  parseArgs,
  parseBool,
  printHelp,
  loadLocalEnv,
};

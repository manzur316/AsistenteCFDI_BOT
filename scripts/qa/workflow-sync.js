const fs = require("fs");
const path = require("path");
const { sanitizeReport } = require("./sanitize-report");

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
const MANAGED_KEYS = new Set([
  "id",
  "versionId",
  "createdAt",
  "updatedAt",
  "pinData",
  "staticData",
  "_id",
  "meta",
]);
const N8N_MANAGED_SETTINGS_KEYS = new Set([
  "availableInMCP",
  "callerPolicy",
]);
const SIGNIFICANT_SETTINGS_KEYS = ["executionOrder"];

function hashText(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stableStringify(value) {
  if (value === null || value === undefined) return `${value}`;
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function pruneObject(value) {
  if (Array.isArray(value)) return value.map((item) => pruneObject(item));
  if (value && typeof value === "object") {
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      if (MANAGED_KEYS.has(key)) continue;
      result[key] = pruneObject(val);
    }
    return result;
  }
  return value;
}

function workflowNodeNames(workflow) {
  return (Array.isArray(workflow?.nodes) ? workflow.nodes : [])
    .map((node) => String(node?.name || "").trim())
    .filter(Boolean);
}

function sanitizeSettingsForHash(settings) {
  const raw = settings && typeof settings === "object" ? settings : {};
  return SIGNIFICANT_SETTINGS_KEYS.reduce((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      acc[key] = raw[key];
    }
    return acc;
  }, {});
}

function sanitizeWorkflowForHash(workflow) {
  const raw = workflow || {};
  const sanitized = pruneObject({
    nodes: Array.isArray(raw.nodes) ? raw.nodes : [],
    connections: raw.connections || {},
    settings: sanitizeSettingsForHash(raw.settings || {}),
  });
  return sanitized;
}

function buildChangedFieldsSummary(repoWorkflow, n8nWorkflow) {
  const repo = sanitizeWorkflowForHash(repoWorkflow);
  const n8n = sanitizeWorkflowForHash(n8nWorkflow || {});
  const rawRepoSettings = repoWorkflow?.settings && typeof repoWorkflow.settings === "object" ? repoWorkflow.settings : {};
  const rawN8nSettings = n8nWorkflow?.settings && typeof n8nWorkflow.settings === "object" ? n8nWorkflow.settings : {};
  const summary = [];
  if (String(repoWorkflow?.name || "") !== String(n8nWorkflow?.name || "")) summary.push("name");
  if (stableStringify(repo.nodes) !== stableStringify(n8n.nodes)) summary.push("nodes");
  if (stableStringify(repo.connections) !== stableStringify(n8n.connections)) summary.push("connections");
  const repoHashSettings = sanitizeSettingsForHash(rawRepoSettings);
  const n8nHashSettings = sanitizeSettingsForHash(rawN8nSettings);
  if (stableStringify(repoHashSettings) !== stableStringify(n8nHashSettings)) summary.push("settings");
  return summary;
}

function buildIgnoredSettingsDiff(repoWorkflow = {}, n8nWorkflow = {}) {
  const rawRepoSettings = repoWorkflow?.settings && typeof repoWorkflow.settings === "object" ? repoWorkflow.settings : {};
  const rawN8nSettings = n8nWorkflow?.settings && typeof n8nWorkflow.settings === "object" ? n8nWorkflow.settings : {};
  const normalizedRepoSettings = sanitizeSettingsForHash(rawRepoSettings);
  const normalizedN8nSettings = sanitizeSettingsForHash(rawN8nSettings);
  const ignored_n8n_settings = [];
  for (const key of N8N_MANAGED_SETTINGS_KEYS) {
    if (rawRepoSettings[key] !== rawN8nSettings[key]) {
      ignored_n8n_settings.push(key);
    }
  }
  const repoExecutionOrder = Object.prototype.hasOwnProperty.call(normalizedRepoSettings, "executionOrder") ? normalizedRepoSettings.executionOrder : null;
  const n8nExecutionOrder = Object.prototype.hasOwnProperty.call(normalizedN8nSettings, "executionOrder") ? normalizedN8nSettings.executionOrder : null;
  const settings_diff = repoExecutionOrder === n8nExecutionOrder ? null : {
    executionOrder: {
      repo: repoExecutionOrder,
      n8n: n8nExecutionOrder,
    },
  };
  return {
    ignored_n8n_settings,
    settings_diff,
  };
}

function hashWorkflow(workflow) {
  return `sha256:${hashText(stableStringify(sanitizeWorkflowForHash(workflow)))}`;
}

function loadRepoWorkflow(filePath = path.join(__dirname, "..", "..", "workflow", "cfdi_telegram_local_ingest.n8n.json")) {
  const absolute = path.resolve(filePath);
  const raw = fs.readFileSync(absolute, "utf8");
  const workflow = JSON.parse(raw);
  if (!workflow || typeof workflow !== "object") {
    throw new Error("NEEDS_CONFIG: workflow file no parseable.");
  }
  return workflow;
}

function findWorkflowsByName(workflows, name = EXPECTED_WORKFLOW_NAME) {
  return (Array.isArray(workflows) ? workflows : []).filter((workflow) => String(workflow?.name || "").trim() === name);
}

function findActiveWorkflow(workflows, name = EXPECTED_WORKFLOW_NAME) {
  return findWorkflowsByName(workflows, name).find((workflow) => workflow?.active === true) || null;
}

function pickTargetWorkflow(workflows, name = EXPECTED_WORKFLOW_NAME) {
  return findWorkflowsByName(workflows, name).find((workflow) => workflow?.name === name) || null;
}

function extractWebhookPath(workflow) {
  const nodes = Array.isArray(workflow?.nodes) ? workflow.nodes : [];
  const webhookNode = nodes.find((node) => String(node?.type || "").toLowerCase().includes("webhook"))
    || nodes.find((node) => String(node?.name || "").toLowerCase().includes("webhook"));
  return webhookNode?.parameters?.path || webhookNode?.parameters?.pathReplace || null;
}

function analyzeWorkflowVersion(workflow, options = {}) {
  const nodeNames = new Set(
    (Array.isArray(workflow?.nodes) ? workflow.nodes : [])
      .map((node) => String(node?.name || "").trim())
      .filter(Boolean),
  );
  const expected = options.expectedNodes || EXPECTED_WORKFLOW_NODES;
  const missingNodes = expected.filter((name) => !nodeNames.has(name));
  return {
    ok: missingNodes.length === 0,
    missingNodes,
    hasExpectedWebhook: Boolean(extractWebhookPath(workflow)),
    webhookPath: extractWebhookPath(workflow) || options.expectedWebhookPath || null,
  };
}

function workflowSyncCheck({ repoWorkflow, n8nWorkflow }) {
  const repoHash = hashWorkflow(repoWorkflow);
  const n8nHash = hashWorkflow(n8nWorkflow || {});
  return {
    workflow_in_sync: repoHash === n8nHash,
    repo_hash: repoHash,
    n8n_hash: n8nHash,
    active_workflow_id: n8nWorkflow?.id || n8nWorkflow?.workflowId || n8nWorkflow?.workflow_id || null,
    active_workflow_name: n8nWorkflow?.name || null,
    requires_import: repoHash !== n8nHash,
  };
}

function buildWorkflowUpdatePayload(repoWorkflow) {
  const source = repoWorkflow || {};
  return {
    name: source.name || null,
    nodes: Array.isArray(source.nodes) ? source.nodes : [],
    connections: source.connections || {},
    settings: source.settings || {},
  };
}

function buildWorkflowDiffReport({
  repoWorkflow = {},
  n8nWorkflow = {},
  beforeUpdate = null,
  afterUpdate = null,
  backup = null,
} = {}) {
  const repoNodes = workflowNodeNames(repoWorkflow);
  const n8nNodes = workflowNodeNames(n8nWorkflow);
  const repoSet = new Set(repoNodes);
  const n8nSet = new Set(n8nNodes);
  const changed_fields_summary = buildChangedFieldsSummary(repoWorkflow, n8nWorkflow);
  const {
    ignored_n8n_settings,
    settings_diff,
  } = buildIgnoredSettingsDiff(repoWorkflow, n8nWorkflow);
  return sanitizeReport({
    before_update: beforeUpdate,
    after_update: afterUpdate,
    backup,
    repo_node_count: repoNodes.length,
    n8n_node_count: n8nNodes.length,
    missing_nodes: repoNodes.filter((name) => !n8nSet.has(name)),
    extra_nodes: n8nNodes.filter((name) => !repoSet.has(name)),
    changed_fields_summary,
    ignored_n8n_settings,
    settings_diff,
  });
}

function extractWorkflowBackup(workflow) {
  return sanitizeReport({
    ...workflow,
    backup_timestamp: new Date().toISOString(),
    backup_type: "workflow_sync_before_update",
  });
}

module.exports = {
  EXPECTED_WORKFLOW_NAME,
  EXPECTED_WEBHOOK_PATH,
  EXPECTED_WORKFLOW_NODES,
  analyzeWorkflowVersion,
  buildWorkflowUpdatePayload,
  extractWorkflowBackup,
  buildChangedFieldsSummary,
  buildWorkflowDiffReport,
  extractWebhookPath,
  findActiveWorkflow,
  pickTargetWorkflow,
  findWorkflowsByName,
  hashWorkflow,
  loadRepoWorkflow,
  workflowSyncCheck,
  sanitizeWorkflowForHash,
};

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
  "credentials",
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

function hasObjectEntries(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function nodeIdentity(node) {
  return String(node?.name || "").trim();
}

function workflowNodes(workflow) {
  return Array.isArray(workflow?.nodes) ? workflow.nodes : [];
}

function findMatchingNode(node, candidates) {
  const name = nodeIdentity(node);
  if (!name) return null;
  return candidates.find((candidate) => nodeIdentity(candidate) === name) || null;
}

function nodeCredentialSummary(node) {
  return {
    node: node?.name || null,
    type: node?.type || null,
    credential_keys: Object.keys(node?.credentials || {}).sort(),
  };
}

function credentialCriticality(node) {
  const type = String(node?.type || "").toLowerCase();
  const name = String(node?.name || "").toLowerCase();
  if (type.includes("postgres") || name.includes("postgres")) return "postgres";
  if (type.includes("telegram") || name.includes("telegram")) return "telegram";
  return "";
}

function mergeExistingNodeCredentials(repoNodes, n8nWorkflow) {
  const existingNodes = workflowNodes(n8nWorkflow);
  return (Array.isArray(repoNodes) ? repoNodes : []).map((node) => {
    const merged = { ...node };
    delete merged.credentials;
    const matchingNode = findMatchingNode(node, existingNodes);
    if (hasObjectEntries(matchingNode?.credentials)) {
      merged.credentials = cloneJson(matchingNode.credentials);
    }
    return merged;
  });
}

function buildCredentialPreservationReport(repoWorkflow = {}, n8nWorkflow = {}, payload = {}) {
  const repoCredentialNodes = workflowNodes(repoWorkflow).filter((node) => hasObjectEntries(node?.credentials));
  const existingCredentialNodes = workflowNodes(n8nWorkflow).filter((node) => hasObjectEntries(node?.credentials));
  const payloadNodes = workflowNodes(payload);
  const lostCredentialNodes = [];
  const preservedCredentialNodes = [];
  for (const existingNode of existingCredentialNodes) {
    const payloadNode = findMatchingNode(existingNode, payloadNodes);
    if (hasObjectEntries(payloadNode?.credentials)) preservedCredentialNodes.push(existingNode);
    else lostCredentialNodes.push(existingNode);
  }
  const criticalLostCredentials = lostCredentialNodes
    .map((node) => ({ ...nodeCredentialSummary(node), criticality: credentialCriticality(node) }))
    .filter((item) => item.criticality);
  return {
    repo_credential_nodes: repoCredentialNodes.map(nodeCredentialSummary),
    existing_credential_nodes: existingCredentialNodes.map(nodeCredentialSummary),
    preserved_credential_nodes: preservedCredentialNodes.map(nodeCredentialSummary),
    lost_credential_nodes: lostCredentialNodes.map(nodeCredentialSummary),
    critical_lost_credentials: criticalLostCredentials,
    credentials_preserved: lostCredentialNodes.length === 0,
  };
}

function assertCriticalCredentialPreservation(report) {
  const criticalLost = Array.isArray(report?.critical_lost_credentials) ? report.critical_lost_credentials : [];
  if (criticalLost.length) {
    const nodes = criticalLost.map((item) => `${item.node || "unknown"}:${item.criticality}`).join(", ");
    const error = new Error(`CRITICAL_CREDENTIALS_WOULD_BE_REMOVED: ${nodes}`);
    error.code = "CRITICAL_CREDENTIALS_WOULD_BE_REMOVED";
    error.credential_report = report;
    throw error;
  }
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

function buildWorkflowUpdatePayload(repoWorkflow, n8nWorkflow = {}) {
  const source = repoWorkflow || {};
  const payload = {
    name: source.name || null,
    nodes: mergeExistingNodeCredentials(source.nodes, n8nWorkflow),
    connections: source.connections || {},
    settings: source.settings || {},
  };
  const credentialReport = buildCredentialPreservationReport(repoWorkflow, n8nWorkflow, payload);
  assertCriticalCredentialPreservation(credentialReport);
  return payload;
}

function buildWorkflowUpdatePlan(repoWorkflow, n8nWorkflow = {}) {
  const payload = buildWorkflowUpdatePayload(repoWorkflow, n8nWorkflow);
  return {
    payload,
    credential_report: buildCredentialPreservationReport(repoWorkflow, n8nWorkflow, payload),
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
  assertCriticalCredentialPreservation,
  buildWorkflowUpdatePayload,
  buildWorkflowUpdatePlan,
  buildCredentialPreservationReport,
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

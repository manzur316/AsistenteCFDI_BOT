const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_polling_local.n8n.json");
const expectedPlaceholder = "REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N";
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

const forbiddenTexts = [
  "scripts/scoring.js",
  "code-node-n8n-bundle.js",
  "scoringModulePath",
  "process.",
  "process.cwd",
  "process.env",
  "__dirname",
  "__filename",
  "require('./",
  'require("./',
  "require('../",
  'require("../',
  "require('C:",
  'require("C:',
];

const requiredContractTexts = [
  "buildN8nResponse",
  "classifyMessage",
  "scoreConcept",
  "ready_to_copy",
  "requires_human_review",
  "message_original",
  "decision_confidence",
  "candidate_confidence",
  "safety_level",
  "telegram_message",
  "json_debug",
];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function requireCalls(text) {
  const pattern = /require\(\s*["']([^"']+)["']\s*\)/g;
  const calls = [];
  let match = null;
  while ((match = pattern.exec(text))) {
    calls.push(match[1]);
  }
  return calls;
}

function hasTelegramTokenLikeValue(text) {
  const tokenPattern = /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g;
  const matches = text.match(tokenPattern) || [];
  return matches.filter((value) => value !== expectedPlaceholder);
}

const checks = [];

checks.push({
  name: "workflow_exists",
  pass: fs.existsSync(workflowPath),
  value: workflowPath,
});

let raw = "";
let workflow = null;
let nodes = [];
let runScoringCode = "";

if (fs.existsSync(workflowPath)) {
  raw = fs.readFileSync(workflowPath, "utf8");
  try {
    workflow = JSON.parse(raw);
    nodes = Array.isArray(workflow.nodes) ? workflow.nodes : [];
    const runNode = nodes.find((node) => node.name === "Run Scoring");
    runScoringCode = runNode?.parameters?.jsCode || "";
    checks.push({ name: "workflow_valid_json", pass: true, value: "parsed" });
  } catch (error) {
    checks.push({ name: "workflow_valid_json", pass: false, value: error.message });
  }
}

const tokenLikeValues = raw ? hasTelegramTokenLikeValue(raw) : [];
checks.push({
  name: "no_real_telegram_token",
  pass: raw ? tokenLikeValues.length === 0 : false,
  value: tokenLikeValues.length ? tokenLikeValues.join(",") : "none",
});

checks.push({
  name: "contains_token_placeholder",
  pass: raw.includes(expectedPlaceholder),
  value: expectedPlaceholder,
});

checks.push({
  name: "no_telegram_trigger",
  pass: nodes.every((node) => !String(node.type || "").toLowerCase().includes("telegramtrigger")),
  value: "node types",
});

checks.push({
  name: "no_webhook_node",
  pass: nodes.every((node) => !String(node.type || "").toLowerCase().includes("webhook")),
  value: "node types",
});

checks.push({
  name: "uses_getUpdates",
  pass: raw.includes("getUpdates"),
  value: "Telegram getUpdates",
});

checks.push({
  name: "uses_sendMessage",
  pass: raw.includes("sendMessage"),
  value: "Telegram sendMessage",
});

checks.push({
  name: "has_schedule_trigger",
  pass: nodes.some((node) => node.type === "n8n-nodes-base.scheduleTrigger"),
  value: "Schedule Trigger",
});

checks.push({
  name: "has_set_config",
  pass: nodes.some((node) => node.name === "Set Config" && node.type === "n8n-nodes-base.set"),
  value: "Set Config",
});

checks.push({
  name: "has_http_request_nodes",
  pass: nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest").length >= 2,
  value: nodes.filter((node) => node.type === "n8n-nodes-base.httpRequest").length,
});

checks.push({
  name: "has_offset_control",
  pass: raw.includes("$getWorkflowStaticData") && raw.includes("lastTelegramUpdateId") && raw.includes("nextOffset"),
  value: "workflow static data",
});

checks.push({
  name: "catalogPath_absolute",
  pass: raw.includes(expectedCatalogPath),
  value: expectedCatalogPath,
});

for (const token of forbiddenTexts) {
  checks.push({
    name: `forbidden:${token}`,
    pass: !raw.includes(token),
    value: raw.includes(token) ? "found" : "not found",
  });
}

for (const token of requiredContractTexts) {
  checks.push({
    name: `contract:${token}`,
    pass: raw.includes(token),
    value: raw.includes(token) ? "found" : "missing",
  });
}

if (runScoringCode) {
  const calls = requireCalls(runScoringCode);
  const disallowed = calls.filter((item) => !["fs", "path"].includes(item));
  checks.push({
    name: "run_scoring_requires_only_fs_path",
    pass: disallowed.length === 0,
    value: calls.length ? calls.join(",") : "none",
  });
  checks.push({
    name: "run_scoring_self_contained",
    pass:
      runScoringCode.length > 10000 &&
      runScoringCode.includes("function normalizeText") &&
      runScoringCode.includes("function classifyMessage") &&
      runScoringCode.includes("function buildN8nResponse"),
    value: `${runScoringCode.length} chars`,
  });
}

const passCount = checks.filter((item) => item.pass).length;

console.log("Telegram polling workflow contract");
console.log(`Workflow: ${workflowPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");

for (const check of checks) {
  printCheck(check.name, check.pass, check.value);
}

console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) {
  process.exitCode = 1;
}

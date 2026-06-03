const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const expectedCatalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const workflowPath = path.join(root, "workflow", "cfdi_manual_test.n8n.json");

const requiredFiles = [
  "data/concepts.normalized.json",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/N8N_LOCAL_RUNBOOK.md",
  ".env.example",
  "workflow/TELEGRAM_POLLING_DESIGN.md",
];

const forbiddenWorkflowTexts = [
  "scripts/scoring.js",
  "code-node-n8n-bundle.js",
  "process.",
  "__dirname",
  "__filename",
  "scoringModulePath",
];

const requiredWorkflowTexts = [
  "concepts.normalized.json",
  "ready_to_copy",
  "telegram_message",
  "requires_human_review",
];

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function printCheck(name, pass, value = "") {
  const rendered = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${rendered}`);
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

const checks = [];

for (const relativePath of requiredFiles) {
  const fullPath = path.join(root, relativePath);
  checks.push({
    name: `exists:${relativePath}`,
    pass: fs.existsSync(fullPath),
    value: fullPath,
  });
}

let workflowRaw = "";
let workflow = null;
let runScoringCode = "";

if (fs.existsSync(workflowPath)) {
  workflowRaw = readText(workflowPath);
  try {
    workflow = JSON.parse(workflowRaw);
    const runNode = Array.isArray(workflow.nodes)
      ? workflow.nodes.find((node) => node.name === "Run Scoring" && node.type === "n8n-nodes-base.code")
      : null;
    runScoringCode = runNode?.parameters?.jsCode || "";

    checks.push({
      name: "workflow:valid_json",
      pass: true,
      value: "parsed",
    });
    checks.push({
      name: "workflow:run_scoring_code_node",
      pass: typeof runScoringCode === "string" && runScoringCode.length > 1000,
      value: runScoringCode ? "found" : "missing",
    });

    const setNode = Array.isArray(workflow.nodes)
      ? workflow.nodes.find((node) => node.name === "Set Manual Message" && node.type === "n8n-nodes-base.set")
      : null;
    const stringFields = setNode?.parameters?.values?.string || [];
    const catalogField = stringFields.find((item) => item.name === "catalogPath");
    checks.push({
      name: "workflow:catalogPath_expected",
      pass: catalogField?.value === expectedCatalogPath,
      value: catalogField?.value || "missing",
    });
  } catch (error) {
    checks.push({
      name: "workflow:valid_json",
      pass: false,
      value: error.message,
    });
  }
}

for (const token of forbiddenWorkflowTexts) {
  checks.push({
    name: `workflow:forbidden:${token}`,
    pass: workflowRaw ? !workflowRaw.includes(token) : false,
    value: workflowRaw && workflowRaw.includes(token) ? "found" : "not found",
  });
}

for (const token of requiredWorkflowTexts) {
  checks.push({
    name: `workflow:required:${token}`,
    pass: workflowRaw ? workflowRaw.includes(token) : false,
    value: workflowRaw && workflowRaw.includes(token) ? "found" : "missing",
  });
}

if (runScoringCode) {
  const calls = requireCalls(runScoringCode);
  const disallowed = calls.filter((item) => !["fs", "path"].includes(item));
  checks.push({
    name: "run_scoring:require_only_fs_path",
    pass: disallowed.length === 0,
    value: calls.length ? calls.join(",") : "none",
  });
  checks.push({
    name: "run_scoring:catalogPath_from_input",
    pass: runScoringCode.includes("input.catalogPath") || runScoringCode.includes("$json.catalogPath"),
    value: "catalogPath",
  });
  checks.push({
    name: "run_scoring:no_process_family",
    pass:
      !runScoringCode.includes("process.") &&
      !runScoringCode.includes("process.cwd") &&
      !runScoringCode.includes("process.env") &&
      !runScoringCode.includes("__dirname") &&
      !runScoringCode.includes("__filename"),
    value: "process guards",
  });
}

const passCount = checks.filter((item) => item.pass).length;

console.log("Project readiness checks");
console.log(`Workspace: ${root}`);
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

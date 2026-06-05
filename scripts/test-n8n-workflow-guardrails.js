const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowRoot = path.join(root, "workflow");

const supportedWorkflows = new Set([
  "workflow/cfdi_sandbox_action_router.n8n.json",
]);

const legacyWorkflowExceptions = new Set([
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
  "workflow/cfdi_telegram_polling_local.n8n.json",
  "workflow/cfdi_telegram_polling_with_history.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
]);

const forbiddenPatterns = [
  { rule: "no_require_fs_single_quote", pattern: /require\(\s*'fs'\s*\)/ },
  { rule: "no_require_fs_double_quote", pattern: /require\(\s*"fs"\s*\)/ },
  { rule: "no_require_path_single_quote", pattern: /require\(\s*'path'\s*\)/ },
  { rule: "no_require_path_double_quote", pattern: /require\(\s*"path"\s*\)/ },
  { rule: "no_readFileSync", pattern: /\breadFileSync\b/ },
  { rule: "no_writeFileSync", pattern: /\bwriteFileSync\b/ },
  { rule: "no_existsSync", pattern: /\bexistsSync\b/ },
  { rule: "no_readdirSync", pattern: /\breaddirSync\b/ },
  { rule: "no_process_env", pattern: /\bprocess\.env\b/ },
  { rule: "no_child_process", pattern: /\bchild_process\b/ },
  { rule: "no_exec_call", pattern: /\bexec\s*\(/ },
  { rule: "no_spawn_call", pattern: /\bspawn\s*\(/ },
  { rule: "no_eval_call", pattern: /\beval\s*\(/ },
  { rule: "no_function_constructor", pattern: /\bFunction\s*\(/ },
  { rule: "no_facturacom_production_url", pattern: /https:\/\/api\.factura\.com/i },
  { rule: "no_facturacom_api_header", pattern: /F-Api-Key/i },
  { rule: "no_facturacom_secret_header", pattern: /F-Secret-Key/i },
  { rule: "no_facturacom_plugin_header", pattern: /F-PLUGIN/i },
  { rule: "no_env_file_reference", pattern: /\.env\b/i },
  { rule: "no_certificate_file_reference", pattern: /\.(?:cer|key|pfx|p12)\b/i },
  { rule: "no_sendDocument", pattern: /\bsendDocument\b/i },
  { rule: "no_complete_cfdi_xml", pattern: /<cfdi:Comprobante/i },
  { rule: "no_complete_pdf_payload", pattern: /%PDF-/i },
];

function toRepoPath(filePath) {
  return path.relative(root, filePath).replace(/\\/g, "/");
}

function listWorkflowJsonFiles() {
  const files = [];
  const stack = [workflowRoot];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (/\.json$/i.test(entry.name) || /\.n8n\.json$/i.test(entry.name)) {
        files.push(full);
      }
    }
  }
  return files.sort();
}

function lineForIndex(text, index) {
  return text.slice(0, index).split(/\r?\n/).length;
}

function firstMatch(text, pattern) {
  const match = pattern.exec(text);
  if (!match) return null;
  return {
    index: match.index,
    value: match[0],
  };
}

function scanText(repoPath, text) {
  const findings = [];
  for (const rule of forbiddenPatterns) {
    const match = firstMatch(text, rule.pattern);
    if (!match) continue;
    findings.push({
      file: repoPath,
      rule: rule.rule,
      line: lineForIndex(text, match.index),
      pattern: match.value.replace(/\s+/g, " ").slice(0, 120),
    });
  }
  return findings;
}

function getNodeCode(workflow) {
  return (workflow.nodes || [])
    .map((node) => node.parameters?.jsCode || "")
    .filter(Boolean)
    .join("\n");
}

function validateExecuteCommands(repoPath, workflow, raw) {
  const findings = [];
  const executeNodes = (workflow.nodes || []).filter((node) => node.type === "n8n-nodes-base.executeCommand");
  for (const node of executeNodes) {
    const command = String(node.parameters?.command || "");
    if (repoPath === "workflow/cfdi_sandbox_action_router.n8n.json") {
      if (command !== "={{$json.execute_command}}") {
        findings.push({
          file: repoPath,
          rule: "execute_command_must_use_routed_allowlist_expression",
          line: 1,
          pattern: `${node.name}:${command}`,
        });
      }
      assert(raw.includes("'node scripts/run-sandbox-action.js ' + requestedAction"), "router must build command from allowlisted action");
      assert(raw.includes("ACTION_MAP"), "router must contain ACTION_MAP");
      assert(raw.includes("CALLBACK_ACTION_MAP"), "router must contain CALLBACK_ACTION_MAP");
      continue;
    }

    if (command && !/^={{\$json\.[A-Za-z0-9_]+}}$/.test(command) && !/^node scripts\/run-sandbox-action\.js [A-Za-z0-9_.-]+$/.test(command)) {
      findings.push({
        file: repoPath,
        rule: "execute_command_must_be_action_layer_only",
        line: 1,
        pattern: `${node.name}:${command}`,
      });
    }
  }
  return findings;
}

function classifyFinding(finding) {
  if (supportedWorkflows.has(finding.file)) return "FAIL";
  if (legacyWorkflowExceptions.has(finding.file)) return "LEGACY-WARN";
  return "FAIL";
}

function printFinding(prefix, finding) {
  console.log(` - ${prefix} ${finding.file}:${finding.line} ${finding.rule} (${finding.pattern})`);
}

function main() {
  assert(fs.existsSync(workflowRoot), "workflow directory not found");

  const files = listWorkflowJsonFiles();
  const findings = [];
  const parseFailures = [];
  const supportedSeen = new Set();

  for (const filePath of files) {
    const repoPath = toRepoPath(filePath);
    const raw = fs.readFileSync(filePath, "utf8");
    let workflow = null;
    try {
      workflow = JSON.parse(raw);
    } catch (error) {
      parseFailures.push({ file: repoPath, error: error.message });
      continue;
    }

    if (supportedWorkflows.has(repoPath)) supportedSeen.add(repoPath);
    findings.push(...scanText(repoPath, getNodeCode(workflow)));
    findings.push(...validateExecuteCommands(repoPath, workflow, raw));
  }

  const missingSupported = [...supportedWorkflows].filter((file) => !supportedSeen.has(file));
  const strictFindings = [];
  const legacyFindings = [];

  for (const finding of findings) {
    const kind = classifyFinding(finding);
    if (kind === "LEGACY-WARN") legacyFindings.push(finding);
    else strictFindings.push(finding);
  }

  console.log("n8n workflow guardrails");
  console.log(` - workflows_scanned: ${files.length}`);
  console.log(` - supported_workflows: ${[...supportedWorkflows].join(", ")}`);

  for (const item of parseFailures) console.log(` - FAIL ${item.file}:1 invalid_json (${item.error})`);
  for (const item of strictFindings) printFinding("FAIL", item);
  for (const item of legacyFindings) printFinding("LEGACY-WARN", item);

  const failed = parseFailures.length + strictFindings.length + missingSupported.length;
  for (const file of missingSupported) console.log(` - FAIL ${file}:1 supported_workflow_missing (${file})`);

  console.log(` - legacy_findings_reported: ${legacyFindings.length}`);
  console.log(`PASS total: ${failed === 0 ? "1/1" : "0/1"}`);

  if (failed) process.exit(1);
}

main();

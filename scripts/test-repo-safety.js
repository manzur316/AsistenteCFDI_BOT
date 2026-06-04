const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");

const safeFiles = [
  ".gitignore",
  "README.md",
  ".env.example",
  ".env.local.example",
  "data/concepts.normalized.json",
  "data/sat_official/README.md",
  "data/sat_official/imported_sat_catalog.normalized.json",
  "data/catalog_expansion/proposed_concepts.resico_626.json",
  "data/catalog_expansion/concepts.normalized.candidate.json",
  "data/knowledge_base/cfdi40_filling_rules.json",
  "data/knowledge_base/cfdi40_decision_engine.json",
  "data/knowledge_base/cfdi40_claveprodserv_index.json",
  "data/knowledge_base/cfdi40_claveunidad_index.json",
  "data/knowledge_base/cfdi40_master_knowledge.json",
  "data/knowledge_base/emitter_activity_scope.proposed.json",
  "runtime/.gitkeep",
  "runner/README.md",
  "runner/telegram-local-runner.js",
  "sql/001_init_cfdi_bot.sql",
  "sql/003_clients_amounts_tax.sql",
  "sql/003_seed_clients.example.sql",
  "sql/004_action_tokens.sql",
  "workflow/cfdi_manual_test.n8n.json",
  "workflow/cfdi_telegram_postgres_polling.n8n.json",
  "workflow/cfdi_telegram_local_ingest.n8n.json",
  "workflow/POSTGRES_LOCAL_SETUP.md",
  "workflow/POSTGRES_POLLING_RUNBOOK.md",
];

const forbiddenVersionedPaths = [
  /^\.env$/i,
  /^runtime\/.+\.(json|jsonl|db|sqlite|lock)$/i,
  /^logs\//i,
  /^clients\//i,
  /^constancias\//i,
  /^backups\//i,
  /^data\/base_cfdi_resico_n8n_emberhub_2026\.xlsx$/i,
  /\.(token|secret|key|pem|p12|pfx|cer|zip|7z|rar|pdf)$/i,
  /^data\/sat_official\/(?!README\.md$|imported_sat_catalog\.normalized\.json$).+/i,
];

const scanFiles = [
  ".env.example",
  ".env.local.example",
  "README.md",
  ".gitignore",
  ...listFiles("runner"),
  ...listFiles("scripts"),
  ...listFiles("sql"),
  ...listFiles("workflow"),
  ...listFiles("docs"),
  "data/concepts.normalized.json",
  "data/sat_official/README.md",
  "data/sat_official/imported_sat_catalog.normalized.json",
  "data/catalog_expansion/proposed_concepts.resico_626.json",
  "data/catalog_expansion/concepts.normalized.candidate.json",
  ...listFiles("data/knowledge_base"),
];

const tokenPatterns = [
  { name: "telegram_bot_token_literal", pattern: /\bbot\d{6,}:[A-Za-z0-9_-]{20,}\b/ },
  { name: "telegram_token_assignment", pattern: /TELEGRAM_BOT_TOKEN\s*=\s*(?!REEMPLAZAR|CHANGE|PLACEHOLDER)[^\s#]+/i },
  { name: "json_token_value", pattern: /["']token["']\s*:\s*["'](?!REEMPLAZAR|CHANGE|PLACEHOLDER|TEST_|CAMBIAR)[^"']{12,}["']/i },
  { name: "postgres_real_password_hint", pattern: /POSTGRES_PASSWORD\s*=\s*(?!CAMBIAR|REEMPLAZAR|CHANGE|PLACEHOLDER)[^\s#]+/i },
];

function toRepoPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" })
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(toRepoPath);
  } catch (_error) {
    return [];
  }
}

function listFiles(dir) {
  const abs = path.join(root, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(full);
      } else {
        out.push(toRepoPath(path.relative(root, full)));
      }
    }
  }
  return out;
}

function exists(repoPath) {
  return fs.existsSync(path.join(root, repoPath));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function isForbiddenVersionedPath(repoPath) {
  return forbiddenVersionedPaths.some((pattern) => pattern.test(repoPath));
}

function readText(repoPath) {
  return fs.readFileSync(path.join(root, repoPath), "utf8");
}

const tracked = git(["ls-files"]);
const staged = git(["diff", "--cached", "--name-only"]);
const versionedOrStaged = Array.from(new Set([...tracked, ...staged]));

const checks = [];

checks.push({ name: "gitignore_exists", pass: exists(".gitignore"), value: ".gitignore" });
checks.push({ name: "env_example_exists", pass: exists(".env.example"), value: ".env.example" });
checks.push({ name: "catalog_json_exists", pass: exists("data/concepts.normalized.json"), value: "data/concepts.normalized.json" });
checks.push({ name: "runtime_gitkeep_exists", pass: exists("runtime/.gitkeep"), value: "runtime/.gitkeep" });

for (const file of safeFiles) {
  checks.push({ name: `safe_file_exists:${file}`, pass: exists(file), value: file });
}

const forbiddenVersioned = versionedOrStaged.filter(isForbiddenVersionedPath);
checks.push({
  name: "no_forbidden_versioned_or_staged_paths",
  pass: forbiddenVersioned.length === 0,
  value: forbiddenVersioned.length ? forbiddenVersioned.join(", ") : "none",
});

const stagedExcel = staged.includes("data/base_cfdi_resico_n8n_emberhub_2026.xlsx");
checks.push({
  name: "excel_source_not_staged",
  pass: !stagedExcel,
  value: stagedExcel ? "staged" : "not staged",
});

const stagedEnv = staged.includes(".env");
checks.push({
  name: "env_not_staged",
  pass: !stagedEnv,
  value: stagedEnv ? "staged" : "not staged",
});

let tokenFindings = [];
for (const file of scanFiles) {
  const abs = path.join(root, file);
  if (!fs.existsSync(abs)) continue;
  let text = "";
  try {
    text = readText(file);
  } catch (_error) {
    continue;
  }
  for (const { name, pattern } of tokenPatterns) {
    if (pattern.test(text)) tokenFindings.push(`${file}:${name}`);
  }
}

checks.push({
  name: "no_obvious_real_tokens_or_passwords",
  pass: tokenFindings.length === 0,
  value: tokenFindings.length ? tokenFindings.join(", ") : "none",
});

let gitignore = "";
if (exists(".gitignore")) gitignore = readText(".gitignore");
for (const required of [".env", ".env.local", "runtime/*.jsonl", "runtime/*.json", "runtime/runner-offset.json", "runner/*.log", "logs/", "data/base_cfdi_resico_n8n_emberhub_2026.xlsx"]) {
  checks.push({
    name: `gitignore_contains:${required}`,
    pass: gitignore.includes(required),
    value: required,
  });
}
for (const required of ["data/sat_official/*", "!data/sat_official/README.md", "!data/sat_official/imported_sat_catalog.normalized.json"]) {
  checks.push({
    name: `gitignore_contains:${required}`,
    pass: gitignore.includes(required),
    value: required,
  });
}
checks.push({
  name: "gitignore_contains:local_client_seed",
  pass: gitignore.includes("sql/*clients*.local.sql"),
  value: "sql/*clients*.local.sql",
});

if (exists("sql/003_seed_clients.example.sql")) {
  const seed = readText("sql/003_seed_clients.example.sql");
  checks.push({
    name: "seed_clients_demo_only",
    pass: seed.includes("CLI-DEMO-RIVERA") && !seed.includes("Juandi") && !seed.includes("Emberhub") && !seed.includes("CLIENTE_REAL"),
    value: "CLI-DEMO-RIVERA",
  });
}

const workflowPath = "workflow/cfdi_telegram_postgres_polling.n8n.json";
if (exists(workflowPath)) {
  const workflow = readText(workflowPath);
  let parsedWorkflow = null;
  try {
    parsedWorkflow = JSON.parse(workflow);
  } catch (_error) {
    parsedWorkflow = null;
  }
  const getNodeCode = (name) => {
    const node = parsedWorkflow && Array.isArray(parsedWorkflow.nodes)
      ? parsedWorkflow.nodes.find((item) => item.name === name)
      : null;
    return node?.parameters?.jsCode || "";
  };
  const extractCode = getNodeCode("Extract Telegram Updates");
  const buildContextCode = getNodeCode("Build Load Context SQL");
  const handleCode = getNodeCode("Handle Commands And Scoring");
  const logCode = getNodeCode("Log Send Result SQL");

  checks.push({
    name: "workflow_uses_token_placeholder",
    pass: workflow.includes("REEMPLAZAR_TELEGRAM_BOT_TOKEN_EN_N8N"),
    value: "telegram placeholder",
  });
  checks.push({
    name: "workflow_no_webhook",
    pass: !workflow.toLowerCase().includes("webhook"),
    value: "no webhook text",
  });
  checks.push({
    name: "workflow_no_local_js_require",
    pass: !/require\(\s*["'][.]{1,2}\//.test(workflow) && !workflow.includes("scripts/scoring.js"),
    value: "self-contained",
  });
  checks.push({
    name: "workflow_no_sql_returned_telegram_token",
    pass: !workflow.includes("AS telegram_bot_token") && !workflow.includes("input.telegram_bot_token"),
    value: "no telegram_bot_token SQL field",
  });
  checks.push({
    name: "workflow_offset_advances_non_text_updates",
    pass: extractCode.includes("maxSeenUpdateId") && extractCode.includes("skip_send") && extractCode.includes("IGNORED_UPDATE"),
    value: "maxSeenUpdateId/skip_send",
  });
  checks.push({
    name: "workflow_does_not_insert_raw_telegram_payload",
    pass: !extractCode.includes("raw_payload") && !extractCode.includes("sqlJson(update)"),
    value: "telegram_updates raw_payload default",
  });
  checks.push({
    name: "workflow_postgres_sql_no_literal_newline_joins",
    pass: ![extractCode, buildContextCode, logCode].some((code) => code.includes("].join('\\n')") || code.includes('].join("\\n")')) &&
      !handleCode.includes("statements.join('\\n')") &&
      !handleCode.includes("'\\nSELECT '"),
    value: "SQL joins use spaces",
  });
  checks.push({
    name: "workflow_send_logs_sanitize_payload",
    pass: logCode.includes("stripSensitive") && logCode.includes("safeSource") && logCode.includes("safeCurrent") && !logCode.includes("{ source, send_result: current }"),
    value: "send_logs payload",
  });
  checks.push({
    name: "workflow_bot_events_do_not_reference_token_field",
    pass: !handleCode.includes("const telegramBotToken") && !handleCode.includes("telegram_bot_token"),
    value: "bot_events payload",
  });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Repository safety contract");
console.log(`Root: ${root}`);
console.log(`Tracked files: ${tracked.length}`);
console.log(`Staged files: ${staged.length}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

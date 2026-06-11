const assert = require("assert");
const fs = require("fs");
const { spawnSync } = require("child_process");

const RUNBOOK = "docs/PRIVATE_SATBOT_RUNTIME_SYNC_RUNBOOK.md";
const MASTER_PLAN = "docs/PRIVATE_SATBOT_UX_MASTER_PLAN_V0.1.md";

const checks = [];

function check(name, fn) {
  checks.push({ name, fn });
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function assertIncludes(text, terms) {
  for (const term of terms) assert(text.includes(term), term);
}

function gitStatusPorcelain() {
  const result = spawnSync("git", ["status", "--short"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim().split(/\r?\n/).filter(Boolean);
}

check("runbook_exists", () => {
  assert(fs.existsSync(RUNBOOK), RUNBOOK);
  assert(fs.existsSync(MASTER_PLAN), MASTER_PLAN);
  return RUNBOOK;
});

check("repo_push_does_not_update_n8n_is_explicit", () => {
  const text = read(RUNBOOK);
  assertIncludes(text, [
    "git commit",
    "git push",
    "no actualizan n8n",
    "workflow activo de n8n es runtime separado",
  ]);
  return "repo != runtime";
});

check("mandatory_sequence_is_documented", () => {
  const text = read(RUNBOOK);
  assertIncludes(text, [
    "Cambiar el workflow en el repo",
    "Correr pruebas locales",
    "Hacer commit y push",
    "Respaldar/exportar el workflow activo de n8n",
    "Promover/importar el workflow del repo a n8n",
    "workflow-sync-check",
    "workflow-status",
    "Validar en Telegram",
    "runtime/qa-reports",
  ]);
  return "sequence";
});

check("safe_and_mutating_commands_are_separated", () => {
  const text = read(RUNBOOK);
  assertIncludes(text, [
    "node scripts/qa/satbot-e2e-harness.js --scenario workflow-status",
    "node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync-check",
    "node scripts/qa/satbot-e2e-harness.js --scenario workflow-sync --allow-workflow-update",
    "node scripts/qa/satbot-e2e-harness.js --scenario workflow-activate --allow-workflow-update",
    "Solo usar en modo `PROMOTE_WORKFLOW_RUNTIME`",
    "WORKFLOW_UPDATE_BLOCKED_BY_DEFAULT",
  ]);
  return "guarded commands";
});

check("backup_rollback_and_no_commit_rules_are_documented", () => {
  const text = read(RUNBOOK);
  assertIncludes(text, [
    "Backup/export previo",
    "workflow-diff.sanitized.json",
    "Rollback basico",
    "No usar `git add .`",
    "No commitear `runtime/qa-reports`",
    "No tocar `.env`",
    "DEFERRED_RUNTIME_SYNC_EXPORT_SCRIPT",
  ]);
  return "backup/rollback";
});

check("protected_runtime_paths_not_modified", () => {
  const changed = gitStatusPorcelain();
  const forbidden = changed.filter((line) => {
    const file = line.replace(/^.. /, "");
    return /^workflow\//.test(file)
      || /^runtime\//.test(file)
      || /^\.env(?:$|\.)/.test(file)
      || /^scripts\/local\//.test(file)
      || /(?:\.xml|\.pdf)$/i.test(file);
  });
  assert.deepStrictEqual(forbidden, []);
  return "protected clean";
});

let passed = 0;
for (const item of checks) {
  try {
    const detail = item.fn();
    passed += 1;
    console.log(`PASS ${item.name}: ${detail}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}

console.log(`PASS total: ${passed}/${checks.length}`);

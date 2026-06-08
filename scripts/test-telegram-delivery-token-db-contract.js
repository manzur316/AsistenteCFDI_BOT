const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  baseSource,
  prepareStdout,
  runSummary,
} = require("./lib/test-telegram-delivery-workflow-harness");

const root = path.resolve(__dirname, "..");
const schema = fs.readFileSync(path.join(root, "sql", "004_action_tokens.sql"), "utf8");
const workflowText = fs.readFileSync(path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json"), "utf8");
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

check("action_token_table_has_required_delivery_fields", () => {
  for (const column of ["token text PRIMARY KEY", "chat_id text NOT NULL", "draft_id text", "action text NOT NULL", "expires_at timestamptz NOT NULL", "used_at timestamptz", "payload jsonb"]) {
    assert(schema.includes(column), `missing schema column: ${column}`);
  }
  return "schema";
});

check("workflow_persists_confirm_tokens_in_summary_sql", () => {
  const result = runSummary(prepareStdout("PROVIDER_EMAIL"), baseSource());
  const sql = String(result.persistence_sql || "");
  assert(sql.includes("INSERT INTO cfdi_action_tokens"), "token insert missing");
  assert(sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "confirm action missing");
  assert(sql.includes("now() + interval '30 minutes'"), "expiration missing");
  assert(sql.includes("used_at"), "one-time used_at column missing");
  assert(sql.includes("payload"), "payload missing");
  return "summary_sql";
});

check("workflow_contract_contains_delivery_action_family", () => {
  for (const action of [
    "DELIVERY_STATUS",
    "DELIVERY_PREPARE_PROVIDER_EMAIL",
    "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
    "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
    "DELIVERY_FORCE_PROVIDER_EMAIL",
    "DELIVERY_FORCE_TELEGRAM_CHANNEL",
  ]) {
    assert(workflowText.includes(action), `${action} missing from workflow`);
  }
  return "actions";
});

check("workflow_summary_restores_source_context_before_creating_delivery_tokens", () => {
  assert(workflowText.includes("sourceFromNode('Restore Processing Lock Context')"), "restore context lookup missing");
  assert(workflowText.includes("sourceFromNode('Handle Commands And Scoring')"), "handle fallback missing");
  assert(workflowText.indexOf("sourceFromNode('Restore Processing Lock Context')") < workflowText.indexOf("sourceFromNode('Handle Commands And Scoring')"));
  return "restored_context_first";
});

console.log("Telegram Delivery Token DB Contract Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

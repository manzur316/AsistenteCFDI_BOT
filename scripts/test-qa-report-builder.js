const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { buildSummaryMarkdown, writeQaReport } = require("./qa/report-builder");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "satbot-qa-report-"));
const report = {
  pass: false,
  scenario: "inspect-execution",
  execution_id: "2351",
  analysis: {
    execution_id: "2351",
    workflow_id: "wf-local",
    nodes_executed: ["Build Telegram Dispatch Plan", "Build Webhook Response"],
    telegram_dispatch_method: null,
    chat_id_present: false,
    callback_message_id_present: false,
    telegram_token_present: false,
    failures: ["chat_id missing"]
  },
  db_snapshot: {
    summary: "token=cfdi:SECRETSECRET12 email=test@example.com",
    ledger_state: "READY"
  }
};

const summary = buildSummaryMarkdown(report);
assert(summary.includes("Result: FAIL"));
assert(summary.includes("chat_id missing"));

const written = writeQaReport({ reportRoot: root, scenario: "inspect-execution", report, execution: { token: "123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ" }, dbSnapshot: report.db_snapshot, now: new Date("2026-06-09T12:00:00.000Z") });
assert(fs.existsSync(path.join(written.dir, "summary.md")));
assert(fs.existsSync(path.join(written.dir, "report.json")));
const serialized = fs.readFileSync(path.join(written.dir, "report.json"), "utf8");
assert(!serialized.includes("SECRETSECRET12"));
assert(!serialized.includes("test@example.com"));

console.log("QA Report Builder Tests");
console.log(" - summary_markdown_contains_result_and_root_cause: PASS");
console.log(" - report_files_are_written_and_sanitized: PASS");
console.log("\nPASS total: 2/2");

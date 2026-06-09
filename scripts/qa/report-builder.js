const fs = require("fs");
const path = require("path");
const { sanitizeReport } = require("./sanitize-report");

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function scenarioSlug(value) {
  return String(value || "qa").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "qa";
}

function buildSummaryMarkdown(report) {
  const sanitized = sanitizeReport(report || {});
  const analysis = sanitized.analysis || {};
  const db = sanitized.db_snapshot || {};
  const rootCause = (analysis.failures && analysis.failures.length) ? analysis.failures : (Array.isArray(sanitized.failures) ? sanitized.failures : []);
  const workflowSummary = new Set(["workflow-status", "workflow-sync-check", "workflow-sync", "workflow-activate"]);
  const isWorkflowScenario = workflowSummary.has(sanitized.scenario || "");
  const reportDir = sanitized.report_dir || "N/A";
  return [
    `# SATBOT Local E2E QA Report`,
    ``,
    `Result: ${sanitized.pass === true ? "PASS" : "FAIL"}`,
    `Scenario: ${sanitized.scenario || "N/A"}`,
    `Safe mode: ${sanitized.safe_mode === true ? "true" : "false"}`,
    `Real mode: ${sanitized.real_mode === true ? "true" : "false"}`,
    `Draft ID: ${sanitized.draft_id || db.draft_id || "N/A"}`,
    `Channel: ${sanitized.channel || "N/A"}`,
    `Workflow in sync: ${sanitized.workflow_in_sync === true}`,
    `Workflow updated: ${sanitized.workflow_updated === true}`,
    `Workflow active: ${sanitized.workflow_active === true}`,
    `Send real allowed: ${sanitized.send_real_allowed === true}`,
    `Send real executed: ${sanitized.send_real_executed === true}`,
    `n8n execution id: ${analysis.execution_id || sanitized.execution_id || "N/A"}`,
    `Workflow id: ${analysis.workflow_id || "N/A"}`,
    `Nodes executed: ${(analysis.nodes_executed || []).join(", ") || "N/A"}`,
    `Dispatch status: ${isWorkflowScenario ? "N/A" : (analysis.pass === true ? "PASS" : "FAIL")}`,
    `Telegram dispatch status: ${isWorkflowScenario ? "N/A" : analysis.telegram_dispatch_ok === true}`,
    `Telegram dispatch method: ${analysis.telegram_dispatch_method || "N/A"}`,
    `Telegram dispatch ok: ${isWorkflowScenario ? "N/A" : analysis.telegram_dispatch_ok === true}`,
    `chat_id_present: ${isWorkflowScenario ? "N/A" : analysis.chat_id_present === true}`,
    `callback_message_id_present: ${analysis.callback_message_id_present === true}`,
    `telegram_token_present: ${analysis.telegram_token_present === true}`,
    `confirm token created: ${analysis.confirm_token_created === true}`,
    `reply_markup references confirm token: ${analysis.reply_markup_references_confirm_token === true}`,
    `Tokens created: ${sanitized.tokens_created || 0}`,
    `Tokens used: ${sanitized.tokens_used || 0}`,
    `DB state before/after: ${db.summary || "N/A"}`,
    `Ledger state: ${db.ledger_state || "N/A"}`,
    `Ledger status: ${(db.ledger_state || "N/A")}`,
    `Max real sends: ${sanitized.max_real_sends || "N/A"}`,
    `Report dir: ${reportDir}`,
    `Root cause: ${rootCause.join(" | ") || "N/A"}`,
    ``,
  ].join("\n");
}

function writeQaReport({ reportRoot = "runtime/qa-reports", scenario = "qa", report = {}, execution = null, dbSnapshot = null, now = new Date() } = {}) {
  const suffix = report.execution_id ? `-${report.execution_id}` : "";
  const dir = path.join(reportRoot, `${timestampSlug(now)}-${scenarioSlug(scenario)}${suffix}`);
  fs.mkdirSync(dir, { recursive: true });
  const fullReport = sanitizeReport({ scenario, ...report, db_snapshot: dbSnapshot || report.db_snapshot || null });
  fullReport.report_dir = dir;
  fs.writeFileSync(path.join(dir, "report.json"), JSON.stringify(fullReport, null, 2) + "\n");
  fs.writeFileSync(path.join(dir, "summary.md"), buildSummaryMarkdown(fullReport));
  if (execution) {
    const executionId = fullReport.analysis?.execution_id || fullReport.execution_id || "unknown";
    const sanitizedExecution = JSON.stringify(sanitizeReport(execution), null, 2) + "\n";
    fs.writeFileSync(path.join(dir, "n8n-execution-unknown.sanitized.json"), sanitizedExecution);
    if (executionId && executionId !== "unknown") {
      fs.writeFileSync(path.join(dir, `n8n-execution-${executionId}.sanitized.json`), sanitizedExecution);
    }
  }
  if (fullReport.workflow_diff) {
    fs.writeFileSync(path.join(dir, "workflow-diff.sanitized.json"), JSON.stringify(sanitizeReport(fullReport.workflow_diff), null, 2) + "\n");
  }
  if (dbSnapshot) {
    fs.writeFileSync(path.join(dir, "db-snapshot.sanitized.json"), JSON.stringify(sanitizeReport(dbSnapshot), null, 2) + "\n");
  }
  return { dir, report: fullReport, summary: buildSummaryMarkdown(fullReport) };
}

module.exports = {
  buildSummaryMarkdown,
  scenarioSlug,
  timestampSlug,
  writeQaReport,
};

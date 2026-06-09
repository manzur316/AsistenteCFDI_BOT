const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { writeQaReport, buildSummaryMarkdown } = require("./qa/report-builder");

const root = fs.mkdtempSync(path.join(os.tmpdir(), "qa-report-real-mode-"));

const report = {
  pass: true,
  scenario: "provider-email-real-smoke",
  safe_mode: false,
  real_mode: true,
  workflow_in_sync: true,
  workflow_updated: false,
  workflow_active: true,
  draft_id: "DRAFT-REPORT-REAL",
  channel: "PROVIDER_EMAIL",
  send_real_allowed: true,
  send_real_executed: true,
  max_real_sends: 1,
  execution_id: "exec-qa-real-report",
  telegram_dispatch_status: true,
  confirm_token_created: true,
  reply_markup_references_confirm_token: true,
  workflow_diff: {
    before_update: {
      active: true,
      workflow_name: "cfdi_telegram_local_ingest",
      sync: { n8n_hash: "sha256:x", repo_hash: "sha256:x", requires_import: false },
    },
  },
  db_snapshot: {
    draft: {
      draft_id: "DRAFT-REPORT-REAL",
      provider: "factura_com",
      environment: "SANDBOX",
      invoice_status: "SANDBOX_TIMBRADO",
    },
    pre_summary: {
      email: "cliente-real@prueba.com",
      rfc: "ABC010203XYZ",
      file_path: "C:\\Users\\juandi\\Documents\\Flujo N8N CFDI\\runtime\\qa-reports\\secret.txt",
      summary: "provider_client_uid=cli_ABC123",
    },
  },
  failures: [],
  analysis: {
    execution_id: "exec-qa-real-report",
    workflow_id: "wf-qa-001",
    nodes_executed: ["Build Telegram Dispatch Plan", "Telegram editMessageText"],
    telegram_dispatch_ok: true,
    telegram_dispatch_payload_built: true,
    blocked_reason: null,
    confirm_token_created: true,
    reply_markup_references_confirm_token: true,
    telegram_token_present: true,
    tokens: ["cfdi:SECRET_TOKEN_123456"],
  },
};

const execution = {
  workflowId: "wf-qa-001",
  id: "exec-qa-real-report",
  data: {
    resultData: {
      runData: {
        "Build PAC Sandbox Action Summary": [{
          data: {
            main: [[{
              json: {
                telegram_message: "se envÃ­a documento",
                json_debug: { callback_lifecycle: { action_executed: true } },
              },
            }]],
          },
        }],
      },
    },
  },
  n8nApiKey: "N8N_API_KEY_SECRET",
  telegramBotToken: "123456789:AAAABBBBCCCCDDDDEEEE",
  facturaComApiKey: "FACTURACOM_SECRET",
  plugin: "provider_client_uid=cli-999",
};

const written = writeQaReport({ reportRoot: root, scenario: "provider-email-real-smoke", report, execution, dbSnapshot: report.db_snapshot });
const summary = buildSummaryMarkdown(written.report);
assert(summary.includes("Result: PASS"));
assert(summary.includes("Report dir"));
assert(fs.existsSync(path.join(written.dir, "summary.md")));
assert(fs.existsSync(path.join(written.dir, "report.json")));
assert(fs.existsSync(path.join(written.dir, "n8n-execution-unknown.sanitized.json")));
assert(fs.existsSync(path.join(written.dir, "db-snapshot.sanitized.json")));

const reportSerialized = fs.readFileSync(path.join(written.dir, "report.json"), "utf8");
const executionSerialized = fs.readFileSync(path.join(written.dir, "n8n-execution-unknown.sanitized.json"), "utf8");
const dbSerialized = fs.readFileSync(path.join(written.dir, "db-snapshot.sanitized.json"), "utf8");
assert(!reportSerialized.includes("N8N_API_KEY_SECRET"));
assert(!reportSerialized.includes("123456789:AAAABBBBCCCCDDDDEEEE"));
assert(!reportSerialized.includes("FACTURACOM_SECRET"));
assert(!reportSerialized.includes("cliente-real@prueba.com"));
assert(!reportSerialized.includes("ABC010203XYZ"));
assert(!executionSerialized.includes("N8N_API_KEY_SECRET"));
assert(!dbSerialized.includes("secret.txt"));

console.log("QA Report Real Mode Sanitization Tests");
console.log(" - real_mode_report_sanitizes_secrets: PASS");
console.log(" - real_mode_report_writes_required_files: PASS");
console.log(" - real_mode_report_summary_includes_report_dir: PASS");
console.log("\nPASS total: 3/3");

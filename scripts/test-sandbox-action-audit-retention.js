const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ACTION_AUDIT_SCHEMA_VERSION } = require("./lib/sandbox-action-runner");
const { analyzeAudit } = require("./analyze-sandbox-action-audit");
const {
  parseArgs,
  reviewAudit,
  splitRetention,
} = require("./review-sandbox-action-audit");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-action-audit-retention");
const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function paths(name) {
  const base = path.join(tempRoot, name);
  return {
    auditRoot: path.join(base, "sandbox-action-audit"),
    auditPath: path.join(base, "sandbox-action-audit", "actions.jsonl"),
    summaryPath: path.join(base, "sandbox-action-audit", "summary.json"),
  };
}

function makeRecord(index, overrides = {}) {
  const date = new Date(Date.UTC(2026, 5, index));
  return {
    schema_version: ACTION_AUDIT_SCHEMA_VERSION,
    timestamp: date.toISOString(),
    source_kind: index % 2 ? "MESSAGE" : "CALLBACK_QUERY",
    chat_id_redacted: "redacted:5:aaaa0000",
    user_id_redacted: "redacted:6:bbbb0000",
    callback_data: index % 2 ? null : "cfdi_sbx:full",
    command_token: index % 2 ? "/sandbox_preflight" : null,
    action: index % 3 === 0 ? "sandbox.full.monthly.package" : "sandbox.preflight",
    status: index % 5 === 0 ? "ERROR" : (index % 4 === 0 ? "NEEDS_RUNTIME" : (index % 3 === 0 ? "PACKAGE_SAFETY_ERROR" : "OK")),
    ok: index % 5 !== 0 && index % 4 !== 0 && index % 3 !== 0,
    duration_ms: index * 10,
    artifacts_count: index % 3,
    warnings_count: index % 2,
    errors_count: index % 5 === 0 ? 1 : 0,
    sensitive_findings_count: 0,
    workflow_version: "CFDI_SANDBOX_ACTION_ROUTER_V1",
    ...overrides,
  };
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + "\n", "utf8");
}

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function assertNoSensitive(value) {
  const text = JSON.stringify(value);
  assert(!/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(text), "telegram token");
  assert(!/FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "PAC secret");
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production URL");
  assert(!/\.env\b/i.test(text), ".env");
  assert(!/\.(?:cer|key|pfx|p12|pem)\b|PRIVATE KEY/i.test(text), "CSD/key");
  assert(!/<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i.test(text), "XML");
  assert(!/%PDF-/i.test(text), "PDF");
  assert(!/[A-Za-z]:[\\/]/.test(text), "absolute path");
  assert(!/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(text), "UUID");
  assert(!/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/i.test(text), "RFC");
}

cleanTemp();

check("split_retention_por_edad_y_max_records", () => {
  const records = [1, 2, 3, 4, 5, 6].map((index) => makeRecord(index));
  const result = splitRetention(records, {
    maxRecords: 2,
    maxAgeDays: 3,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  });
  assert.deepStrictEqual(result.retained.map((record) => record.timestamp), [
    "2026-06-05T00:00:00.000Z",
    "2026-06-06T00:00:00.000Z",
  ]);
  assert.strictEqual(result.archived.length, 4);
  return "2 retained/4 archived";
});

check("review_genera_summary_correcto", () => {
  const p = paths("summary");
  const records = [1, 2, 3, 4, 5].map((index) => makeRecord(index));
  writeJsonl(p.auditPath, records);
  const result = reviewAudit({
    auditPath: p.auditPath,
    summaryPath: p.summaryPath,
    maxRecords: 500,
    maxAgeDays: 30,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total_records, 5);
  assert.strictEqual(result.summary.first_timestamp, "2026-06-01T00:00:00.000Z");
  assert.strictEqual(result.summary.latest_timestamp, "2026-06-05T00:00:00.000Z");
  assert.strictEqual(result.summary.ok_count, records.filter((record) => record.ok).length);
  assert.strictEqual(result.summary.error_count, 1);
  assert.strictEqual(result.summary.needs_runtime_count, 1);
  assert.strictEqual(result.summary.package_safety_error_count, 1);
  assert.strictEqual(result.summary.latest_action, "sandbox.preflight");
  assert(fs.existsSync(p.summaryPath));
  assertNoSensitive(result.summary);
  return result.summary.latest_status;
});

check("dry_run_no_modifica_jsonl", () => {
  const p = paths("dry-run");
  const records = [1, 2, 3, 4, 5].map((index) => makeRecord(index));
  writeJsonl(p.auditPath, records);
  const before = fs.readFileSync(p.auditPath, "utf8");
  const result = reviewAudit({
    auditPath: p.auditPath,
    summaryPath: p.summaryPath,
    maxRecords: 2,
    maxAgeDays: 3,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  });
  const after = fs.readFileSync(p.auditPath, "utf8");
  assert.strictEqual(before, after);
  assert.strictEqual(result.dry_run, true);
  assert.strictEqual(result.archived_count, 3);
  assert.strictEqual(JSON.parse(fs.readFileSync(p.summaryPath, "utf8")).retention.would_modify, true);
  return `${result.retained_count}/${result.archived_count}`;
});

check("apply_retiene_archiva_y_deja_jsonl_parseable", () => {
  const p = paths("apply");
  const records = [1, 2, 3, 4, 5, 6].map((index) => makeRecord(index));
  writeJsonl(p.auditPath, records);
  const result = reviewAudit({
    auditPath: p.auditPath,
    summaryPath: p.summaryPath,
    maxRecords: 2,
    maxAgeDays: 3,
    apply: true,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  });
  assert.strictEqual(result.applied, true);
  assert.strictEqual(result.retained_count, 2);
  assert.strictEqual(result.archived_count, 4);
  const retained = readJsonl(p.auditPath);
  assert.strictEqual(retained.length, 2);
  assert.deepStrictEqual(retained.map((record) => record.timestamp), [
    "2026-06-05T00:00:00.000Z",
    "2026-06-06T00:00:00.000Z",
  ]);
  const summary = JSON.parse(fs.readFileSync(p.summaryPath, "utf8"));
  assert(summary.retention.backup_file);
  assert(summary.retention.archive_file);
  assert(fs.existsSync(path.join(p.auditRoot, "archives", summary.retention.backup_file)));
  assert(fs.existsSync(path.join(p.auditRoot, "archives", summary.retention.archive_file)));
  assertNoSensitive(summary);
  assert.strictEqual(analyzeAudit(p.auditPath).ok, true);
  return `${retained.length} retained`;
});

check("apply_no_vacia_audit_sin_revision_humana", () => {
  const p = paths("empty-block");
  writeJsonl(p.auditPath, [makeRecord(1)]);
  assert.throws(() => reviewAudit({
    auditPath: p.auditPath,
    summaryPath: p.summaryPath,
    maxRecords: 0,
    maxAgeDays: 0,
    apply: true,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  }), /RETENTION_WOULD_EMPTY_AUDIT_REQUIRES_HUMAN_REVIEW/);
  assert.strictEqual(readJsonl(p.auditPath).length, 1);
  return "blocked";
});

check("parse_args_defaults_y_apply", () => {
  const p = paths("args");
  const parsed = parseArgs([
    "--audit-path", p.auditPath,
    "--max-records", "10",
    "--max-age-days", "7",
    "--apply",
    "--now", "2026-06-07T00:00:00.000Z",
  ]);
  assert.strictEqual(parsed.maxRecords, 10);
  assert.strictEqual(parsed.maxAgeDays, 7);
  assert.strictEqual(parsed.apply, true);
  assert.strictEqual(new Date(parsed.nowMs).toISOString(), "2026-06-07T00:00:00.000Z");
  return "parsed";
});

check("summary_rechaza_payload_sensible", () => {
  const p = paths("unsafe-summary");
  writeJsonl(p.auditPath, [makeRecord(1, { chat_id_redacted: "runtime/leak/file.xml" })]);
  assert.throws(() => reviewAudit({
    auditPath: p.auditPath,
    summaryPath: p.summaryPath,
    nowMs: Date.parse("2026-06-07T00:00:00.000Z"),
  }), /AUDIT_ANALYSIS_FAILED/);
  return "blocked";
});

console.log("Sandbox Action Audit Retention Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

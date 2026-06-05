const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { analyzeAudit } = require("./analyze-sandbox-action-audit");
const { csvColumns, exportAuditReview, parseArgs } = require("./export-sandbox-action-audit-review");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-action-audit-export");

const forbiddenContentPatterns = [
  /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/,
  /FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN/i,
  /https:\/\/api\.factura\.com/i,
  /\.env\b/i,
  /\.(?:cer|key|pfx|p12|pem)\b|PRIVATE KEY/i,
  /<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i,
  /%PDF-/i,
  /\.(?:xml|pdf|zip|xlsx)\b/i,
  /runtime[\\/][A-Za-z0-9_.\\/-]+/i,
  /[A-Za-z]:[\\/]/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/i,
];

function resetTemp() {
  fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
}

function makeRecord(index, overrides = {}) {
  return {
    schema_version: "sandbox_action_audit.v1",
    timestamp: `2026-06-${String(index).padStart(2, "0")}T10:00:00.000Z`,
    source_kind: index % 2 === 0 ? "CALLBACK_QUERY" : "LOCAL_CLI",
    chat_id_redacted: "redacted:5:43c2c0d8",
    user_id_redacted: "redacted:6:f5537974",
    callback_data: index % 2 === 0 ? "cfdi_sbx:full" : null,
    command_token: index % 2 === 0 ? "cfdi_sbx:full" : "sandbox.full.monthly.package",
    action: index % 3 === 0 ? "sandbox.report.generate" : "sandbox.full.monthly.package",
    status: index === 3 ? "ERROR" : "OK",
    ok: index !== 3,
    duration_ms: 100 + index,
    artifacts_count: index === 2 ? 21 : 0,
    warnings_count: index === 4 ? 1 : 0,
    errors_count: index === 3 ? 2 : 0,
    sensitive_findings_count: 0,
    workflow_version: "CFDI_SANDBOX_ACTION_ROUTER_V1",
    ...overrides,
  };
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readAllExports(outputDir) {
  return ["audit-review.md", "audit-review.csv", "audit-review.json"]
    .map((fileName) => fs.readFileSync(path.join(outputDir, fileName), "utf8"))
    .join("\n");
}

function assertNoSensitive(content) {
  for (const pattern of forbiddenContentPatterns) {
    assert(!pattern.test(content), `contenido sensible detectado: ${pattern}`);
  }
}

function runTest(name, fn) {
  try {
    const detail = fn();
    console.log(` - ${name}: PASS${detail ? ` (${detail})` : ""}`);
    return true;
  } catch (error) {
    console.error(` - ${name}: FAIL (${error.message})`);
    return false;
  }
}

resetTemp();

const tests = [];

tests.push(runTest("genera_md_csv_json_seguro", () => {
  const dir = path.join(tempRoot, "normal");
  const auditPath = path.join(dir, "actions.jsonl");
  const summaryPath = path.join(dir, "summary.json");
  const outputDir = path.join(dir, "review");
  const records = [1, 2, 3, 4].map((index) => makeRecord(index));
  writeJsonl(auditPath, records);
  writeJson(summaryPath, { schema_version: "sandbox_action_audit_review.v1", total_records: records.length });
  const before = fs.readFileSync(auditPath, "utf8");
  const result = exportAuditReview({ auditPath, summaryPath, outputDir, nowMs: Date.parse("2026-06-10T00:00:00.000Z") });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total_actions, 4);
  assert.strictEqual(result.sensitive_findings_total, 0);
  assert.strictEqual(fs.readFileSync(auditPath, "utf8"), before);
  for (const fileName of ["audit-review.md", "audit-review.csv", "audit-review.json"]) {
    assert(fs.existsSync(path.join(outputDir, fileName)), `${fileName} no existe`);
  }
  const content = readAllExports(outputDir);
  assertNoSensitive(content);
  assert(content.includes("Sandbox Action Audit Review"));
  assert(content.includes("sandbox_only"));
  return "3 files";
}));

tests.push(runTest("csv_tiene_columnas_seguras", () => {
  const dir = path.join(tempRoot, "csv");
  const auditPath = path.join(dir, "actions.jsonl");
  const outputDir = path.join(dir, "review");
  writeJsonl(auditPath, [makeRecord(1)]);
  exportAuditReview({ auditPath, summaryPath: path.join(dir, "summary.json"), outputDir });
  const csv = fs.readFileSync(path.join(outputDir, "audit-review.csv"), "utf8");
  assert.strictEqual(csv.split(/\r?\n/)[0], csvColumns.join(","));
  assert(!csv.includes("chat_id_redacted"));
  assert(!csv.includes("user_id_redacted"));
  return csvColumns.length;
}));

tests.push(runTest("audit_vacio_controlado", () => {
  const dir = path.join(tempRoot, "empty");
  const auditPath = path.join(dir, "actions.jsonl");
  const outputDir = path.join(dir, "review");
  writeJsonl(auditPath, []);
  const result = exportAuditReview({ auditPath, summaryPath: path.join(dir, "summary.json"), outputDir });
  assert.strictEqual(result.total_actions, 0);
  assertNoSensitive(readAllExports(outputDir));
  const json = JSON.parse(fs.readFileSync(path.join(outputDir, "audit-review.json"), "utf8"));
  assert.strictEqual(json.period.first_timestamp, null);
  return "0 records";
}));

tests.push(runTest("audit_missing_controlado", () => {
  const dir = path.join(tempRoot, "missing");
  const auditPath = path.join(dir, "actions.jsonl");
  const outputDir = path.join(dir, "review");
  const result = exportAuditReview({ auditPath, summaryPath: path.join(dir, "summary.json"), outputDir });
  assert.strictEqual(result.total_actions, 0);
  assertNoSensitive(readAllExports(outputDir));
  return "missing -> empty export";
}));

tests.push(runTest("rechaza_audit_con_datos_sensibles", () => {
  const dir = path.join(tempRoot, "unsafe");
  const auditPath = path.join(dir, "actions.jsonl");
  const outputDir = path.join(dir, "review");
  writeJsonl(auditPath, [makeRecord(1, { callback_data: "cfdi_sbx:full 550e8400-e29b-41d4-a716-446655440000" })]);
  assert.throws(
    () => exportAuditReview({ auditPath, summaryPath: path.join(dir, "summary.json"), outputDir }),
    /AUDIT_ANALYSIS_FAILED/,
  );
  return "blocked";
}));

tests.push(runTest("analyzer_sigue_pass_despues_de_export", () => {
  const dir = path.join(tempRoot, "analyzer");
  const auditPath = path.join(dir, "actions.jsonl");
  const outputDir = path.join(dir, "review");
  writeJsonl(auditPath, [makeRecord(1), makeRecord(2)]);
  exportAuditReview({ auditPath, summaryPath: path.join(dir, "summary.json"), outputDir });
  const analysis = analyzeAudit(auditPath);
  assert.strictEqual(analysis.ok, true);
  assert.strictEqual(analysis.total_records, 2);
  return "ok";
}));

tests.push(runTest("parse_args_runtime_only", () => {
  const parsed = parseArgs([
    "--audit-path", "runtime/test-sandbox-action-audit-export/args/actions.jsonl",
    "--summary-path", "runtime/test-sandbox-action-audit-export/args/summary.json",
    "--output-dir", "runtime/test-sandbox-action-audit-export/args/review",
    "--latest-limit", "3",
    "--now", "2026-06-10T00:00:00.000Z",
  ]);
  assert.strictEqual(parsed.latestLimit, 3);
  assert.throws(() => parseArgs(["--output-dir", "docs/not-runtime"]), /debe vivir bajo runtime/);
  return "parsed";
}));

const passed = tests.filter(Boolean).length;
console.log(`\nPASS total: ${passed}/${tests.length}`);
if (passed !== tests.length) process.exit(1);

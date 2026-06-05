const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { analyzeAudit } = require("./analyze-sandbox-action-audit");
const { generateSignoffChecklist, parseArgs } = require("./generate-sandbox-audit-signoff-checklist");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-audit-signoff-checklist");

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
  /\b(chat_id|user_id)\b/i,
  /\b(RFC|UUID|UID|CSD)\b/i,
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
    status: "OK",
    ok: true,
    duration_ms: 100 + index,
    artifacts_count: index === 2 ? 21 : 0,
    warnings_count: 0,
    errors_count: 0,
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

function writeFixture(dir, records, options = {}) {
  const auditPath = path.join(dir, "actions.jsonl");
  const summaryPath = path.join(dir, "summary.json");
  const reviewPath = path.join(dir, "review", "audit-review.json");
  const outputDir = path.join(dir, "signoff");
  writeJsonl(auditPath, records);
  if (options.summary !== false) {
    writeJson(summaryPath, {
      schema_version: "sandbox_action_audit_review.v1",
      total_records: records.length,
      policy: { delete_requires_apply: true },
    });
  }
  if (options.review !== false) {
    writeJson(reviewPath, {
      schema_version: "sandbox_action_audit_human_review.v1",
      total_actions: records.length,
      sensitive_findings_total: 0,
    });
  }
  return { auditPath, summaryPath, reviewPath, outputDir };
}

function readOutputs(outputDir) {
  return [
    "SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md",
    "sandbox-audit-signoff-checklist.json",
    "sandbox-audit-signoff-checklist.csv",
  ].map((fileName) => fs.readFileSync(path.join(outputDir, fileName), "utf8")).join("\n");
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

tests.push(runTest("genera_md_json_csv", () => {
  const paths = writeFixture(path.join(tempRoot, "normal"), [makeRecord(1), makeRecord(2)]);
  const before = fs.readFileSync(paths.auditPath, "utf8");
  const result = generateSignoffChecklist({ ...paths, nowMs: Date.parse("2026-06-10T00:00:00.000Z") });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total_fail, 0);
  assert(result.total_pass > 0);
  assert(result.total_manual_review > 0);
  for (const fileName of ["SANDBOX_AUDIT_SIGNOFF_CHECKLIST.md", "sandbox-audit-signoff-checklist.json", "sandbox-audit-signoff-checklist.csv"]) {
    assert(fs.existsSync(path.join(paths.outputDir, fileName)), `${fileName} no existe`);
  }
  assert.strictEqual(fs.readFileSync(paths.auditPath, "utf8"), before);
  assertNoSensitive(readOutputs(paths.outputDir));
  return result.checklist_status;
}));

tests.push(runTest("detecta_pass_warn_fail_manual_review", () => {
  const records = [
    makeRecord(1),
    makeRecord(2, { status: "ERROR", ok: false, warnings_count: 1, errors_count: 2 }),
  ];
  const paths = writeFixture(path.join(tempRoot, "mixed"), records, { review: false });
  const result = generateSignoffChecklist({ ...paths });
  assert(result.total_pass > 0);
  assert(result.total_warn > 0);
  assert(result.total_fail > 0);
  assert(result.total_manual_review > 0);
  const statuses = new Set(result.checklist.items.map((entry) => entry.status));
  assert(statuses.has("PASS"));
  assert(statuses.has("WARN"));
  assert(statuses.has("FAIL"));
  assert(statuses.has("MANUAL_REVIEW"));
  assertNoSensitive(readOutputs(paths.outputDir));
  return `${result.total_pass}/${result.total_warn}/${result.total_fail}/${result.total_manual_review}`;
}));

tests.push(runTest("jsonl_invalido_genera_fail_controlado", () => {
  const dir = path.join(tempRoot, "invalid-jsonl");
  const paths = writeFixture(dir, [makeRecord(1)]);
  fs.writeFileSync(paths.auditPath, "{bad json}\n", "utf8");
  const result = generateSignoffChecklist({ ...paths });
  assert.strictEqual(result.checklist_status, "FAIL");
  assert(result.checklist.items.some((entry) => entry.id === "AUDIT-003" && entry.status === "FAIL"));
  assertNoSensitive(readOutputs(paths.outputDir));
  return "FAIL";
}));

tests.push(runTest("mark_reviewed_falla_sin_nota", () => {
  const paths = writeFixture(path.join(tempRoot, "no-note"), [makeRecord(1)]);
  assert.throws(() => generateSignoffChecklist({ ...paths, markReviewed: true }), /REVIEWER_NOTE_REQUIRED/);
  return "blocked";
}));

tests.push(runTest("mark_reviewed_falla_con_fail", () => {
  const paths = writeFixture(path.join(tempRoot, "has-fail"), [makeRecord(1)], { summary: false });
  assert.throws(
    () => generateSignoffChecklist({ ...paths, markReviewed: true, reviewerNote: "Reviewed locally" }),
    /SIGNOFF_HAS_FAIL_ITEMS_REQUIRES_FIX/,
  );
  return "blocked";
}));

tests.push(runTest("mark_reviewed_crea_archivo_local_sin_fail", () => {
  const paths = writeFixture(path.join(tempRoot, "reviewed"), [makeRecord(1), makeRecord(2)]);
  const result = generateSignoffChecklist({
    ...paths,
    markReviewed: true,
    reviewerNote: "Reviewed locally for 6A sandbox transition",
    nowMs: Date.parse("2026-06-10T00:00:00.000Z"),
  });
  const reviewedPath = path.join(paths.outputDir, "HUMAN_REVIEWED.local.json");
  assert.strictEqual(result.total_fail, 0);
  assert(fs.existsSync(reviewedPath));
  const reviewed = JSON.parse(fs.readFileSync(reviewedPath, "utf8"));
  assert.strictEqual(reviewed.reviewer_note, "Reviewed locally for 6A sandbox transition");
  assertNoSensitive(fs.readFileSync(reviewedPath, "utf8"));
  return reviewed.checklist_status;
}));

tests.push(runTest("analyzer_sigue_pass_despues_de_checklist", () => {
  const paths = writeFixture(path.join(tempRoot, "analyzer"), [makeRecord(1), makeRecord(2)]);
  generateSignoffChecklist({ ...paths });
  const analysis = analyzeAudit(paths.auditPath);
  assert.strictEqual(analysis.ok, true);
  assert.strictEqual(analysis.total_records, 2);
  return "ok";
}));

tests.push(runTest("parse_args_runtime_only", () => {
  const parsed = parseArgs([
    "--audit-path", "runtime/test-sandbox-audit-signoff-checklist/args/actions.jsonl",
    "--summary-path", "runtime/test-sandbox-audit-signoff-checklist/args/summary.json",
    "--review-path", "runtime/test-sandbox-audit-signoff-checklist/args/review/audit-review.json",
    "--output-dir", "runtime/test-sandbox-audit-signoff-checklist/args/signoff",
    "--mark-reviewed",
    "--reviewer-note", "Reviewed locally",
    "--now", "2026-06-10T00:00:00.000Z",
  ]);
  assert.strictEqual(parsed.markReviewed, true);
  assert.strictEqual(parsed.reviewerNote, "Reviewed locally");
  assert.throws(() => parseArgs(["--output-dir", "docs/not-runtime"]), /debe vivir bajo runtime/);
  return "parsed";
}));

const passed = tests.filter(Boolean).length;
console.log(`\nPASS total: ${passed}/${tests.length}`);
if (passed !== tests.length) process.exit(1);

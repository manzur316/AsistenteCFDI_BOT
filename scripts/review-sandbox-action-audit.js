const fs = require("fs");
const path = require("path");
const { analyzeAudit, forbiddenPatterns } = require("./analyze-sandbox-action-audit");

const root = path.resolve(__dirname, "..");
const defaultAuditPath = path.join(root, "runtime", "sandbox-action-audit", "actions.jsonl");
const DEFAULT_MAX_RECORDS = 500;
const DEFAULT_MAX_AGE_DAYS = 30;

function rel(filePath) {
  const resolved = path.resolve(filePath);
  const relative = path.relative(root, resolved).replace(/\\/g, "/");
  if (relative.startsWith("..") || path.isAbsolute(relative)) return "[BLOCKED_PATH]";
  return relative;
}

function ensureRuntimePath(filePath, label = "path") {
  const runtimeRoot = path.join(root, "runtime");
  const resolved = path.resolve(filePath);
  const relative = path.relative(runtimeRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} debe vivir bajo runtime/`);
  }
  return resolved;
}

function parseJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`JSON invalido en linea ${index + 1}: ${error.message}`);
      }
    });
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonl(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""), "utf8");
}

function countBy(records, key) {
  const out = {};
  for (const record of records) {
    const value = String(record[key] ?? "NULL");
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function safeDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function isoStamp(value = new Date()) {
  return new Date(value).toISOString().replace(/[:.]/g, "-");
}

function summarize(records, retention, options) {
  const first = records[0] || null;
  const latest = records[records.length - 1] || null;
  return {
    schema_version: "sandbox_action_audit_review.v1",
    generated_at: new Date(options.nowMs).toISOString(),
    dry_run: options.apply !== true,
    applied: options.apply === true,
    policy: {
      max_records: options.maxRecords,
      max_age_days: options.maxAgeDays,
      delete_requires_apply: true,
      empty_audit_requires_human_review: true,
    },
    audit_file: "actions.jsonl",
    summary_file: "summary.json",
    total_records: records.length,
    first_timestamp: first?.timestamp || null,
    latest_timestamp: latest?.timestamp || null,
    by_action: countBy(records, "action"),
    by_status: countBy(records, "status"),
    by_source_kind: countBy(records, "source_kind"),
    ok_count: records.filter((record) => record.ok === true).length,
    error_count: records.filter((record) => record.status === "ERROR").length,
    needs_config_count: records.filter((record) => record.status === "NEEDS_CONFIG").length,
    needs_runtime_count: records.filter((record) => record.status === "NEEDS_RUNTIME").length,
    package_safety_error_count: records.filter((record) => record.status === "PACKAGE_SAFETY_ERROR").length,
    sensitive_findings_total: records.reduce((sum, record) => sum + Number(record.sensitive_findings_count || 0), 0),
    latest_action: latest?.action || null,
    latest_status: latest?.status || null,
    retention: {
      retained_count: retention.retained.length,
      archived_count: retention.archived.length,
      would_modify: retention.archived.length > 0,
      backup_file: retention.backupFile || null,
      archive_file: retention.archiveFile || null,
    },
  };
}

function assertSafeSummary(summary) {
  const raw = JSON.stringify(summary);
  for (const item of forbiddenPatterns) {
    if (item.pattern.test(raw)) throw new Error(`SUMMARY_CONTAINS_SENSITIVE_PATTERN:${item.name}`);
  }
}

function splitRetention(records, options) {
  const cutoff = options.maxAgeDays === null
    ? null
    : options.nowMs - (options.maxAgeDays * 24 * 60 * 60 * 1000);
  const withIndex = records.map((record, index) => ({ record, index, time: safeDate(record.timestamp) }));
  let eligible = withIndex;
  if (cutoff !== null) {
    eligible = eligible.filter((item) => item.time !== null && item.time >= cutoff);
  }
  if (Number.isFinite(options.maxRecords) && options.maxRecords >= 0) {
    eligible = eligible.slice(Math.max(0, eligible.length - options.maxRecords));
  }
  const retainedIndexes = new Set(eligible.map((item) => item.index));
  return {
    retained: withIndex.filter((item) => retainedIndexes.has(item.index)).map((item) => item.record),
    archived: withIndex.filter((item) => !retainedIndexes.has(item.index)).map((item) => item.record),
  };
}

function parseArgs(argv) {
  const options = {
    auditPath: defaultAuditPath,
    summaryPath: null,
    maxRecords: DEFAULT_MAX_RECORDS,
    maxAgeDays: DEFAULT_MAX_AGE_DAYS,
    apply: false,
    nowMs: Date.now(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--audit-path") options.auditPath = path.resolve(argv[++index]);
    else if (key === "--summary-path") options.summaryPath = path.resolve(argv[++index]);
    else if (key === "--max-records") options.maxRecords = Number(argv[++index]);
    else if (key === "--max-age-days") options.maxAgeDays = Number(argv[++index]);
    else if (key === "--no-age-limit") options.maxAgeDays = null;
    else if (key === "--dry-run") options.apply = false;
    else if (key === "--apply") options.apply = true;
    else if (key === "--now") options.nowMs = Date.parse(argv[++index]);
  }
  if (!Number.isFinite(options.maxRecords) || options.maxRecords < 0) throw new Error("--max-records debe ser >= 0");
  if (options.maxAgeDays !== null && (!Number.isFinite(options.maxAgeDays) || options.maxAgeDays < 0)) throw new Error("--max-age-days debe ser >= 0");
  if (!Number.isFinite(options.nowMs)) throw new Error("--now invalido");
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath || path.join(path.dirname(options.auditPath), "summary.json"), "summaryPath");
  return options;
}

function reviewAudit(inputOptions = {}) {
  const options = {
    auditPath: inputOptions.auditPath || defaultAuditPath,
    summaryPath: inputOptions.summaryPath || null,
    maxRecords: inputOptions.maxRecords ?? DEFAULT_MAX_RECORDS,
    maxAgeDays: inputOptions.maxAgeDays === undefined ? DEFAULT_MAX_AGE_DAYS : inputOptions.maxAgeDays,
    apply: inputOptions.apply === true,
    nowMs: inputOptions.nowMs || Date.now(),
  };
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath || path.join(path.dirname(options.auditPath), "summary.json"), "summaryPath");

  const analysis = analyzeAudit(options.auditPath);
  if (!analysis.ok && !analysis.errors?.includes("AUDIT_FILE_MISSING")) {
    throw new Error(`AUDIT_ANALYSIS_FAILED:${analysis.errors.join("|")}`);
  }

  const records = parseJsonl(options.auditPath);
  const retention = splitRetention(records, options);
  if (options.apply && records.length > 0 && retention.retained.length === 0) {
    throw new Error("RETENTION_WOULD_EMPTY_AUDIT_REQUIRES_HUMAN_REVIEW");
  }

  const stamp = isoStamp(options.nowMs);
  let backupFile = null;
  let archiveFile = null;
  if (options.apply && retention.archived.length > 0) {
    const archiveRoot = ensureRuntimePath(path.join(path.dirname(options.auditPath), "archives"), "archiveRoot");
    fs.mkdirSync(archiveRoot, { recursive: true });
    backupFile = `backup-${stamp}.jsonl`;
    archiveFile = `archive-${stamp}.jsonl`;
    fs.copyFileSync(options.auditPath, path.join(archiveRoot, backupFile));
    writeJsonl(path.join(archiveRoot, archiveFile), retention.archived);
    retention.backupFile = backupFile;
    retention.archiveFile = archiveFile;
    writeJsonl(options.auditPath, retention.retained);
  }

  const summary = summarize(records, retention, options);
  assertSafeSummary(summary);
  writeJson(options.summaryPath, summary);

  return {
    ok: true,
    summary_path: rel(options.summaryPath),
    audit_file: "actions.jsonl",
    total_records: summary.total_records,
    retained_count: summary.retention.retained_count,
    archived_count: summary.retention.archived_count,
    dry_run: summary.dry_run,
    applied: summary.applied,
    latest_action: summary.latest_action,
    latest_status: summary.latest_status,
    sensitive_findings_total: summary.sensitive_findings_total,
    summary,
  };
}

function printReview(result) {
  console.log("Sandbox action audit review");
  console.log(`OK: ${result.ok}`);
  console.log(`Summary: ${result.summary_path}`);
  console.log(`Audit file: ${result.audit_file}`);
  console.log(`Dry run: ${result.dry_run}`);
  console.log(`Applied: ${result.applied}`);
  console.log(`Total records: ${result.total_records}`);
  console.log(`Retained: ${result.retained_count}`);
  console.log(`Archived: ${result.archived_count}`);
  console.log(`Latest action: ${result.latest_action || "none"}`);
  console.log(`Latest status: ${result.latest_status || "none"}`);
  console.log(`Sensitive findings total: ${result.sensitive_findings_total}`);
}

if (require.main === module) {
  try {
    const result = reviewAudit(parseArgs(process.argv.slice(2)));
    printReview(result);
  } catch (error) {
    console.error(`SANDBOX_ACTION_AUDIT_REVIEW_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_MAX_AGE_DAYS,
  DEFAULT_MAX_RECORDS,
  parseArgs,
  reviewAudit,
  splitRetention,
  summarize,
};

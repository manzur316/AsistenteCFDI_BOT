const fs = require("fs");
const path = require("path");
const { analyzeAudit, forbiddenPatterns } = require("./analyze-sandbox-action-audit");

const root = path.resolve(__dirname, "..");
const runtimeRoot = path.join(root, "runtime");
const defaultAuditPath = path.join(runtimeRoot, "sandbox-action-audit", "actions.jsonl");
const defaultSummaryPath = path.join(runtimeRoot, "sandbox-action-audit", "summary.json");
const defaultOutputDir = path.join(runtimeRoot, "sandbox-action-audit", "review");
const DEFAULT_LATEST_LIMIT = 10;

const csvColumns = [
  "timestamp",
  "source_kind",
  "action",
  "status",
  "ok",
  "duration_ms",
  "artifacts_count",
  "warnings_count",
  "errors_count",
  "sensitive_findings_count",
  "callback_data",
  "command_token",
  "workflow_version",
];

function ensureRuntimePath(filePath, label = "path") {
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`SUMMARY_JSON_INVALID:${error.message}`);
  }
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, "utf8");
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function countBy(records, key) {
  const counts = {};
  for (const record of records) {
    const value = String(record[key] ?? "NULL");
    counts[value] = (counts[value] || 0) + 1;
  }
  return counts;
}

function sumBy(records, key) {
  return records.reduce((sum, record) => sum + Number(record[key] || 0), 0);
}

function safeCell(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function csvEscape(value) {
  const cell = safeCell(value);
  if (/[",\r\n]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

function toSafeEvent(record) {
  const safe = {};
  for (const column of csvColumns) safe[column] = record[column] ?? null;
  return safe;
}

function buildCsv(records) {
  const rows = [csvColumns.join(",")];
  for (const record of records) {
    const event = toSafeEvent(record);
    rows.push(csvColumns.map((column) => csvEscape(event[column])).join(","));
  }
  return `${rows.join("\n")}\n`;
}

function buildRecommendations(summary) {
  const recommendations = [
    "Confirmar que este reporte es solo sandbox y no representa produccion ni timbrado real.",
    "Revisar manualmente cualquier accion con status distinto de OK antes de usar la evidencia operativa.",
  ];
  if (summary.error_count > 0) recommendations.push("Priorizar errores agregados y validar causa antes de repetir acciones sandbox.");
  if (summary.needs_config_count > 0) recommendations.push("Atender eventos NEEDS_CONFIG en ambiente local antes de pruebas nuevas.");
  if (summary.needs_runtime_count > 0) recommendations.push("Validar prerequisitos locales cuando aparezcan eventos NEEDS_RUNTIME.");
  if (summary.package_safety_error_count > 0) recommendations.push("Revisar bloqueos PACKAGE_SAFETY_ERROR antes de compartir paquetes de revision.");
  if (summary.sensitive_findings_total > 0) recommendations.push("Detener uso del export y revisar hallazgos sensibles antes de distribuir evidencia.");
  return recommendations;
}

function buildReview(records, existingSummary, options) {
  const first = records[0] || null;
  const latest = records[records.length - 1] || null;
  const latestEvents = records.slice(-options.latestLimit).map(toSafeEvent);
  const summaryTotal = existingSummary?.total_records;
  const review = {
    schema_version: "sandbox_action_audit_human_review.v1",
    generated_at: new Date(options.nowMs).toISOString(),
    sandbox_only: true,
    production_disabled: true,
    source_file: "actions.jsonl",
    summary_source: existingSummary ? "summary.json" : null,
    summary_matches_audit: Number.isFinite(Number(summaryTotal)) ? Number(summaryTotal) === records.length : null,
    export_files: ["audit-review.md", "audit-review.csv", "audit-review.json"],
    period: {
      first_timestamp: first?.timestamp || null,
      latest_timestamp: latest?.timestamp || null,
    },
    total_actions: records.length,
    by_action: countBy(records, "action"),
    by_status: countBy(records, "status"),
    by_source_kind: countBy(records, "source_kind"),
    ok_count: records.filter((record) => record.ok === true).length,
    error_count: records.filter((record) => record.status === "ERROR").length,
    needs_config_count: records.filter((record) => record.status === "NEEDS_CONFIG").length,
    needs_runtime_count: records.filter((record) => record.status === "NEEDS_RUNTIME").length,
    package_safety_error_count: records.filter((record) => record.status === "PACKAGE_SAFETY_ERROR").length,
    warnings_total: sumBy(records, "warnings_count"),
    errors_total: sumBy(records, "errors_count"),
    sensitive_findings_total: sumBy(records, "sensitive_findings_count"),
    artifacts_total: sumBy(records, "artifacts_count"),
    latest_action: latest?.action || null,
    latest_status: latest?.status || null,
    latest_events: latestEvents,
  };
  review.recommendations = buildRecommendations(review);
  return review;
}

function markdownTableFromCounts(counts) {
  const entries = Object.entries(counts || {});
  if (!entries.length) return "| Tipo | Total |\n| --- | --- |\n| none | 0 |\n";
  return [
    "| Tipo | Total |",
    "| --- | ---: |",
    ...entries.map(([key, value]) => `| ${key} | ${value} |`),
  ].join("\n") + "\n";
}

function buildMarkdown(review) {
  const latestRows = review.latest_events.length
    ? review.latest_events.map((event) => `| ${event.timestamp || ""} | ${event.source_kind || ""} | ${event.action || ""} | ${event.status || ""} | ${event.ok === null ? "" : event.ok} | ${event.warnings_count ?? ""} | ${event.errors_count ?? ""} | ${event.sensitive_findings_count ?? ""} |`).join("\n")
    : "| none | none | none | none | none | 0 | 0 | 0 |";
  return `# Sandbox Action Audit Review

Estado: sandbox solamente. No produccion. No timbrado real.

## Periodo Analizado

- Primer evento: ${review.period.first_timestamp || "none"}
- Ultimo evento: ${review.period.latest_timestamp || "none"}
- Total de acciones: ${review.total_actions}
- Sensitive findings total: ${review.sensitive_findings_total}

## Acciones Por Tipo

${markdownTableFromCounts(review.by_action)}
## Estados Por Tipo

${markdownTableFromCounts(review.by_status)}
## Fuentes Por Tipo

${markdownTableFromCounts(review.by_source_kind)}
## Errores Y Warnings Agregados

- OK: ${review.ok_count}
- ERROR: ${review.error_count}
- NEEDS_CONFIG: ${review.needs_config_count}
- NEEDS_RUNTIME: ${review.needs_runtime_count}
- PACKAGE_SAFETY_ERROR: ${review.package_safety_error_count}
- Warnings agregados: ${review.warnings_total}
- Errors agregados: ${review.errors_total}
- Artifacts contados: ${review.artifacts_total}

## Ultimos Eventos

| Timestamp | Source | Action | Status | OK | Warnings | Errors | Sensitive |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
${latestRows}

## Recomendaciones De Revision Humana

${review.recommendations.map((item) => `- ${item}`).join("\n")}

## Advertencia Fiscal

Este reporte es una salida local de observabilidad sandbox. No sustituye
revision humana, no presenta declaraciones, no timbra CFDI y no acredita una
operacion productiva ante ningun PAC.
`;
}

function assertSafeExport(contentsByFile) {
  for (const [fileName, content] of Object.entries(contentsByFile)) {
    for (const item of forbiddenPatterns) {
      if (item.pattern.test(content)) {
        throw new Error(`EXPORT_CONTAINS_SENSITIVE_PATTERN:${fileName}:${item.name}`);
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    auditPath: defaultAuditPath,
    summaryPath: defaultSummaryPath,
    outputDir: defaultOutputDir,
    latestLimit: DEFAULT_LATEST_LIMIT,
    nowMs: Date.now(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--audit-path") options.auditPath = path.resolve(argv[++index]);
    else if (key === "--summary-path") options.summaryPath = path.resolve(argv[++index]);
    else if (key === "--output-dir") options.outputDir = path.resolve(argv[++index]);
    else if (key === "--latest-limit") options.latestLimit = Number(argv[++index]);
    else if (key === "--now") options.nowMs = Date.parse(argv[++index]);
  }
  if (!Number.isFinite(options.latestLimit) || options.latestLimit < 0) throw new Error("--latest-limit debe ser >= 0");
  if (!Number.isFinite(options.nowMs)) throw new Error("--now invalido");
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath, "summaryPath");
  options.outputDir = ensureRuntimePath(options.outputDir, "outputDir");
  return options;
}

function exportAuditReview(inputOptions = {}) {
  const options = {
    auditPath: inputOptions.auditPath || defaultAuditPath,
    summaryPath: inputOptions.summaryPath || defaultSummaryPath,
    outputDir: inputOptions.outputDir || defaultOutputDir,
    latestLimit: inputOptions.latestLimit ?? DEFAULT_LATEST_LIMIT,
    nowMs: inputOptions.nowMs || Date.now(),
  };
  options.auditPath = ensureRuntimePath(options.auditPath, "auditPath");
  options.summaryPath = ensureRuntimePath(options.summaryPath, "summaryPath");
  options.outputDir = ensureRuntimePath(options.outputDir, "outputDir");
  if (!Number.isFinite(options.latestLimit) || options.latestLimit < 0) throw new Error("latestLimit debe ser >= 0");

  const analysis = analyzeAudit(options.auditPath);
  if (!analysis.ok && !analysis.errors?.includes("AUDIT_FILE_MISSING")) {
    throw new Error(`AUDIT_ANALYSIS_FAILED:${analysis.errors.join("|")}`);
  }

  const records = parseJsonl(options.auditPath);
  const existingSummary = readJsonIfExists(options.summaryPath);
  if (existingSummary) assertSafeExport({ "summary.json": JSON.stringify(existingSummary) });

  const review = buildReview(records, existingSummary, options);
  const csv = buildCsv(records);
  const json = `${JSON.stringify(review, null, 2)}\n`;
  const markdown = buildMarkdown(review);
  assertSafeExport({
    "audit-review.md": markdown,
    "audit-review.csv": csv,
    "audit-review.json": json,
  });

  const files = {
    markdown: path.join(options.outputDir, "audit-review.md"),
    csv: path.join(options.outputDir, "audit-review.csv"),
    json: path.join(options.outputDir, "audit-review.json"),
  };
  writeText(files.markdown, markdown);
  writeText(files.csv, csv);
  writeJson(files.json, review);

  return {
    ok: true,
    output_dir: "review",
    files: {
      markdown: "audit-review.md",
      csv: "audit-review.csv",
      json: "audit-review.json",
    },
    total_actions: review.total_actions,
    first_timestamp: review.period.first_timestamp,
    latest_timestamp: review.period.latest_timestamp,
    sensitive_findings_total: review.sensitive_findings_total,
    summary_matches_audit: review.summary_matches_audit,
    latest_action: review.latest_action,
    latest_status: review.latest_status,
    review,
  };
}

function printResult(result) {
  console.log("Sandbox action audit human review export");
  console.log(`OK: ${result.ok}`);
  console.log(`Output: ${result.output_dir}`);
  console.log(`Files: ${Object.values(result.files).join(", ")}`);
  console.log(`Total actions: ${result.total_actions}`);
  console.log(`First timestamp: ${result.first_timestamp || "none"}`);
  console.log(`Latest timestamp: ${result.latest_timestamp || "none"}`);
  console.log(`Latest action: ${result.latest_action || "none"}`);
  console.log(`Latest status: ${result.latest_status || "none"}`);
  console.log(`Sensitive findings total: ${result.sensitive_findings_total}`);
}

if (require.main === module) {
  try {
    const result = exportAuditReview(parseArgs(process.argv.slice(2)));
    printResult(result);
  } catch (error) {
    console.error(`SANDBOX_ACTION_AUDIT_EXPORT_ERROR: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  buildCsv,
  buildMarkdown,
  buildReview,
  csvColumns,
  exportAuditReview,
  parseArgs,
};

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const defaultRuntimeDir = path.join(root, "runtime", "telegram-latency");
const defaultEventsPath = path.join(defaultRuntimeDir, "telegram-latency-events.jsonl");
const defaultSummaryJsonPath = path.join(defaultRuntimeDir, "telegram-latency-summary.json");
const defaultSummaryMdPath = path.join(defaultRuntimeDir, "telegram-latency-summary.md");

const THRESHOLDS = Object.freeze({
  ack_warning_ms: 1000,
  interactive_warning_ms: 3000,
  total_warning_ms: 5000,
  ack_blocker_ms: 5000,
});

const REQUIRED_FIELDS = [
  "schema_version",
  "source_kind",
  "action",
  "status",
  "ack_ms",
  "total_ms",
  "workflow_version",
];

const FORBIDDEN_PATTERNS = [
  { name: "telegram_token", pattern: /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/ },
  { name: "provider_secret", pattern: /FACTURACOM_|F-Api-Key|F-Secret-Key|F-PLUGIN/i },
  { name: "production_url", pattern: /https:\/\/api\.factura\.com/i },
  { name: "env_reference", pattern: /\.env\b/i },
  { name: "csd_or_private_key", pattern: /\.(?:cer|key|pfx|p12|pem)\b|PRIVATE KEY/i },
  { name: "xml_content", pattern: /<\?xml|<cfdi:Comprobante|<tfd:TimbreFiscalDigital/i },
  { name: "pdf_content", pattern: /%PDF-/i },
  { name: "artifact_file_reference", pattern: /\.(?:xml|pdf|zip|xlsx)\b/i },
  { name: "runtime_path", pattern: /runtime[\\/][A-Za-z0-9_.\\/-]+/i },
  { name: "windows_absolute_path", pattern: /[A-Za-z]:[\\/]/ },
  { name: "uuid_value", pattern: /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i },
  { name: "rfc_like_value", pattern: /\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/i },
];

function parseArgs(argv = process.argv.slice(2)) {
  const args = { inputPath: "", outDir: defaultRuntimeDir };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out-dir") {
      args.outDir = path.resolve(argv[index + 1] || defaultRuntimeDir);
      index += 1;
    } else if (!item.startsWith("--") && !args.inputPath) {
      args.inputPath = path.resolve(item);
    }
  }
  if (!args.inputPath) args.inputPath = defaultEventsPath;
  return args;
}

function readJsonl(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
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

function normalizeRecord(record) {
  if (record && record.event_type === "TELEGRAM_LATENCY_EVENT" && record.payload && typeof record.payload === "object") {
    return record.payload;
  }
  if (record && record.payload && record.payload.schema_version === "telegram_latency_event.v1") return record.payload;
  return record;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  const numbers = values.map(numberOrNull).filter((value) => value !== null);
  if (!numbers.length) return null;
  return Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length);
}

function percentile(values, percentileValue) {
  const numbers = values.map(numberOrNull).filter((value) => value !== null).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil((percentileValue / 100) * numbers.length) - 1));
  return Math.round(numbers[index]);
}

function countBy(records, key) {
  const output = {};
  for (const record of records) {
    const value = String(record[key] ?? "NULL");
    output[value] = (output[value] || 0) + 1;
  }
  return output;
}

function topByAverage(records, key, metric, limit = 10) {
  const groups = new Map();
  for (const record of records) {
    const groupKey = String(record[key] || "NULL");
    const value = numberOrNull(record[metric]);
    if (value === null) continue;
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push(value);
  }
  return Array.from(groups.entries())
    .map(([groupKey, values]) => ({
      key: groupKey,
      count: values.length,
      average_ms: average(values),
      p95_ms: percentile(values, 95),
      max_ms: Math.max(...values),
    }))
    .sort((a, b) => (b.average_ms || 0) - (a.average_ms || 0))
    .slice(0, limit);
}

function validateRecords(records) {
  const errors = [];
  records.forEach((record, index) => {
    for (const field of REQUIRED_FIELDS) {
      if (!(field in record)) errors.push(`linea ${index + 1}: falta ${field}`);
    }
    if (record.schema_version !== "telegram_latency_event.v1") errors.push(`linea ${index + 1}: schema_version invalido`);
    const raw = JSON.stringify(record);
    for (const item of FORBIDDEN_PATTERNS) {
      if (item.pattern.test(raw)) errors.push(`linea ${index + 1}: patron sensible ${item.name}`);
    }
  });
  return errors;
}

function slowStageSummary(records) {
  const stageKeys = [
    "ack_ms",
    "db_insert_ms",
    "load_context_ms",
    "scoring_ms",
    "routing_ms",
    "action_ms",
    "send_message_ms",
    "total_ms",
  ];
  return stageKeys
    .map((key) => ({
      stage: key,
      average_ms: average(records.map((record) => record[key])),
      p95_ms: percentile(records.map((record) => record[key]), 95),
      max_ms: Math.max(0, ...records.map((record) => numberOrNull(record[key])).filter((value) => value !== null)),
    }))
    .filter((item) => item.average_ms !== null)
    .sort((a, b) => (b.p95_ms || 0) - (a.p95_ms || 0));
}

function buildRecommendations(summary) {
  const recommendations = [];
  if (summary.callback_ack_blockers.length) {
    recommendations.push("ACK de callback supera 5000 ms: separar ACK de procesamiento pesado o usar cola local.");
  }
  if (summary.slow_callbacks.length) {
    recommendations.push("Hay callbacks lentos: revisar nodo previo a answerCallbackQuery, Postgres Load Context y Code Node principal.");
  }
  if ((summary.metrics.total_ms.p95 || 0) > THRESHOLDS.total_warning_ms) {
    recommendations.push("p95 total_ms supera 5000 ms: instrumentar o separar acciones largas en Action Layer async.");
  }
  if ((summary.metrics.send_message_ms.p95 || 0) > THRESHOLDS.interactive_warning_ms) {
    recommendations.push("sendMessage lento: revisar red local, Telegram API, continueOnFail y volumen de mensajes.");
  }
  if (!recommendations.length) recommendations.push("Latencia dentro de umbrales iniciales. Puede continuar a 7.11 si pruebas reales confirman estabilidad.");
  return recommendations;
}

function summarizeLatency(records, options = {}) {
  const normalized = records.map(normalizeRecord);
  const validation_errors = validateRecords(normalized);
  const totalValues = normalized.map((record) => record.total_ms);
  const ackValues = normalized.map((record) => record.ack_ms);
  const sendValues = normalized.map((record) => record.send_message_ms);
  const summary = {
    schema_version: "telegram_latency_summary.v1",
    generated_at: new Date().toISOString(),
    source_file: options.sourceFile ? path.basename(options.sourceFile) : "",
    thresholds: THRESHOLDS,
    total_events: normalized.length,
    validation_errors,
    metrics: {
      total_ms: {
        average: average(totalValues),
        p50: percentile(totalValues, 50),
        p95: percentile(totalValues, 95),
        p99: percentile(totalValues, 99),
      },
      ack_ms: {
        average: average(ackValues),
        p50: percentile(ackValues, 50),
        p95: percentile(ackValues, 95),
        p99: percentile(ackValues, 99),
      },
      send_message_ms: {
        average: average(sendValues),
        p50: percentile(sendValues, 50),
        p95: percentile(sendValues, 95),
        p99: percentile(sendValues, 99),
      },
    },
    by_action: countBy(normalized, "action"),
    by_status: countBy(normalized, "status"),
    by_source_kind: countBy(normalized, "source_kind"),
    top_callback_data_by_latency: topByAverage(normalized.filter((record) => record.source_kind === "CALLBACK_QUERY"), "callback_data", "total_ms"),
    slow_stages: slowStageSummary(normalized),
    slow_callbacks: normalized
      .filter((record) => record.source_kind === "CALLBACK_QUERY" && (numberOrNull(record.total_ms) || 0) > THRESHOLDS.total_warning_ms)
      .map((record) => ({ callback_data: record.callback_data, action: record.action, total_ms: record.total_ms, ack_ms: record.ack_ms }))
      .slice(0, 25),
    callback_ack_blockers: normalized
      .filter((record) => record.source_kind === "CALLBACK_QUERY" && (numberOrNull(record.ack_ms) || 0) > THRESHOLDS.ack_blocker_ms)
      .map((record) => ({ callback_data: record.callback_data, action: record.action, ack_ms: record.ack_ms, total_ms: record.total_ms }))
      .slice(0, 25),
    duplicate_blocked_count: normalized.filter((record) => record.duplicate_blocked === true).length,
    lock_blocked_count: normalized.filter((record) => record.lock_blocked === true).length,
    errors_by_node: countBy(normalized.filter((record) => record.error_node), "error_node"),
    recommendations: [],
  };
  summary.recommendations = buildRecommendations(summary);
  return summary;
}

function renderMarkdown(summary) {
  const lines = [
    "# Telegram Latency Summary",
    "",
    `Generated at: ${summary.generated_at}`,
    `Total events: ${summary.total_events}`,
    "",
    "## Metrics",
    "",
    `- total_ms average: ${summary.metrics.total_ms.average ?? "N/A"}`,
    `- total_ms p50/p95/p99: ${summary.metrics.total_ms.p50 ?? "N/A"} / ${summary.metrics.total_ms.p95 ?? "N/A"} / ${summary.metrics.total_ms.p99 ?? "N/A"}`,
    `- ack_ms average: ${summary.metrics.ack_ms.average ?? "N/A"}`,
    `- ack_ms p50/p95/p99: ${summary.metrics.ack_ms.p50 ?? "N/A"} / ${summary.metrics.ack_ms.p95 ?? "N/A"} / ${summary.metrics.ack_ms.p99 ?? "N/A"}`,
    `- send_message_ms average: ${summary.metrics.send_message_ms.average ?? "N/A"}`,
    "",
    "## Counts",
    "",
    `- Duplicate blocked: ${summary.duplicate_blocked_count}`,
    `- Lock blocked: ${summary.lock_blocked_count}`,
    `- Validation errors: ${summary.validation_errors.length}`,
    "",
    "## Recommendations",
    "",
    ...summary.recommendations.map((item) => `- ${item}`),
  ];
  if (summary.slow_callbacks.length) {
    lines.push("", "## Slow Callbacks", "");
    for (const item of summary.slow_callbacks) {
      lines.push(`- ${item.callback_data} | ${item.action} | total_ms=${item.total_ms} | ack_ms=${item.ack_ms}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function analyzeLatencyFile(inputPath = defaultEventsPath, options = {}) {
  const explicit = options.explicit === true;
  const outDir = options.outDir || defaultRuntimeDir;
  let records = [];
  const warnings = [];
  if (!fs.existsSync(inputPath)) {
    if (explicit) throw new Error(`LATENCY_EVENTS_FILE_MISSING: ${inputPath}`);
    warnings.push("LATENCY_EVENTS_FILE_MISSING");
  } else {
    records = readJsonl(inputPath);
  }
  const summary = summarizeLatency(records, { sourceFile: inputPath });
  summary.warnings = warnings;
  ensureDir(outDir);
  const jsonPath = path.join(outDir, "telegram-latency-summary.json");
  const mdPath = path.join(outDir, "telegram-latency-summary.md");
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  fs.writeFileSync(mdPath, renderMarkdown(summary), "utf8");
  return {
    ok: summary.validation_errors.length === 0,
    summary,
    json_path: jsonPath,
    md_path: mdPath,
  };
}

function printSummary(result) {
  const { summary } = result;
  console.log("Telegram bot latency analysis");
  console.log(`Total events: ${summary.total_events}`);
  console.log(`Average total_ms: ${summary.metrics.total_ms.average ?? "N/A"}`);
  console.log(`p50/p95/p99 total_ms: ${summary.metrics.total_ms.p50 ?? "N/A"} / ${summary.metrics.total_ms.p95 ?? "N/A"} / ${summary.metrics.total_ms.p99 ?? "N/A"}`);
  console.log(`Average ack_ms: ${summary.metrics.ack_ms.average ?? "N/A"}`);
  console.log(`Slow callbacks: ${summary.slow_callbacks.length}`);
  console.log(`Duplicate blocked: ${summary.duplicate_blocked_count}`);
  console.log(`Lock blocked: ${summary.lock_blocked_count}`);
  console.log(`Validation errors: ${summary.validation_errors.join(" | ") || "none"}`);
  console.log(`Summary JSON: ${path.relative(root, result.json_path).replace(/\\/g, "/")}`);
  console.log(`Summary MD: ${path.relative(root, result.md_path).replace(/\\/g, "/")}`);
  console.log(`Recommendations: ${summary.recommendations.join(" | ")}`);
}

if (require.main === module) {
  const args = parseArgs();
  try {
    const result = analyzeLatencyFile(args.inputPath, {
      explicit: Boolean(process.argv.slice(2).find((item) => !item.startsWith("--"))),
      outDir: args.outDir,
    });
    printSummary(result);
    if (!result.ok) process.exit(1);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  THRESHOLDS,
  FORBIDDEN_PATTERNS,
  analyzeLatencyFile,
  summarizeLatency,
  parseArgs,
};

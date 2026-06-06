const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const {
  FORBIDDEN_PATTERNS,
  normalizeRecord,
  validateRecords,
} = require("./analyze-telegram-bot-latency");

const root = path.resolve(__dirname, "..");
const defaultRuntimeDir = path.join(root, "runtime", "telegram-latency");
const defaultOutputPath = path.join(defaultRuntimeDir, "telegram-latency-events.jsonl");

const DEFAULT_CONNECTION = Object.freeze({
  host: "127.0.0.1",
  port: "15432",
  database: "cfdi_bot",
  user: "cfdi_bot_user",
});

const ALLOWED_FIELDS = Object.freeze([
  "schema_version",
  "created_at",
  "update_id",
  "callback_query_id_redacted",
  "chat_id_redacted",
  "telegram_user_id_redacted",
  "source_kind",
  "callback_data",
  "command_token",
  "action",
  "route",
  "status",
  "duplicate_blocked",
  "lock_blocked",
  "answer_callback_query_executed",
  "ack_ms",
  "ack_kind",
  "db_insert_ms",
  "load_context_ms",
  "scoring_ms",
  "routing_ms",
  "action_token_resolve_ms",
  "action_ms",
  "action_layer_ms",
  "send_message_ms",
  "total_ms",
  "error_node",
  "workflow_version",
  "thresholds",
]);

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = {
    outPath: defaultOutputPath,
    limit: 1000,
    psqlBin: env.CFDI_PSQL_BIN || env.PSQL_BIN || "psql",
    host: env.CFDI_PGHOST || env.PGHOST || DEFAULT_CONNECTION.host,
    port: env.CFDI_PGPORT || env.PGPORT || DEFAULT_CONNECTION.port,
    database: env.CFDI_PGDATABASE || env.PGDATABASE || DEFAULT_CONNECTION.database,
    user: env.CFDI_PGUSER || env.PGUSER || DEFAULT_CONNECTION.user,
    password: env.CFDI_PGPASSWORD || env.PGPASSWORD || "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--out") {
      args.outPath = path.resolve(argv[index + 1] || defaultOutputPath);
      index += 1;
    } else if (item === "--limit") {
      args.limit = Number(argv[index + 1] || args.limit);
      index += 1;
    } else if (item === "--psql-bin") {
      args.psqlBin = argv[index + 1] || args.psqlBin;
      index += 1;
    } else if (item === "--host") {
      args.host = argv[index + 1] || args.host;
      index += 1;
    } else if (item === "--port") {
      args.port = argv[index + 1] || args.port;
      index += 1;
    } else if (item === "--database") {
      args.database = argv[index + 1] || args.database;
      index += 1;
    } else if (item === "--user") {
      args.user = argv[index + 1] || args.user;
      index += 1;
    }
  }

  args.limit = Number.isFinite(args.limit) && args.limit > 0 ? Math.min(Math.trunc(args.limit), 5000) : 1000;
  return args;
}

function buildLatencyQuery(limit = 1000) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Math.trunc(Number(limit)), 1), 5000) : 1000;
  return [
    "SELECT jsonb_build_object(",
    "'event_type', event_type,",
    "'created_at', created_at,",
    "'payload', payload",
    ")::text",
    "FROM bot_events",
    "WHERE event_type = 'TELEGRAM_LATENCY_EVENT'",
    "ORDER BY created_at ASC",
    `LIMIT ${safeLimit}`,
  ].join(" ");
}

function runPsqlQuery(config, execFileSync = childProcess.execFileSync) {
  const env = { ...process.env, PGCONNECT_TIMEOUT: "8" };
  if (config.password) env.PGPASSWORD = config.password;

  const args = [
    "-w",
    "-h", String(config.host),
    "-p", String(config.port),
    "-d", String(config.database),
    "-U", String(config.user),
    "-At",
    "-F", "",
    "-c", buildLatencyQuery(config.limit),
  ];

  try {
    return execFileSync(config.psqlBin, args, {
      cwd: root,
      env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    const message = stderr || error.message || "psql failed";
    throw new Error(`EXPORT_NEEDS_POSTGRES_CONNECTION: ${message}`);
  }
}

function parsePsqlJsonLines(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`PSQL_JSON_INVALID line ${index + 1}: ${error.message}`);
      }
    });
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function booleanOrFalse(value) {
  return value === true;
}

function safeString(value, maxLength = 120) {
  const text = String(value === null || value === undefined ? "" : value).replace(/\r?\n/g, " ").trim();
  for (const item of FORBIDDEN_PATTERNS) {
    if (item.pattern.test(text)) return "[redacted]";
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function safeCallbackData(value) {
  const text = safeString(value, 64);
  if (!text) return "";
  if (text.startsWith("cfdi:")) return "cfdi:<token>";
  if (/^cfdi_nav:[a-z0-9_.:-]+$/i.test(text)) return text.slice(0, 32);
  if (/^cfdi_sbx:[a-z0-9_.:-]+$/i.test(text)) return text.slice(0, 32);
  if (/^\/[a-z0-9_]+$/i.test(text)) return text.slice(0, 32);
  return "[redacted-callback]";
}

function safeRedactedIdentifier(value) {
  const text = safeString(value, 80);
  if (!text) return "";
  if (/^redacted:\d+:[a-f0-9]{8,}$/i.test(text)) return text;
  return "[redacted]";
}

function sanitizeLatencyPayload(record) {
  const payload = normalizeRecord(record) || {};
  const output = {};
  for (const field of ALLOWED_FIELDS) {
    if (!(field in payload)) continue;
    if (field === "callback_data") output[field] = safeCallbackData(payload[field]);
    else if (field === "command_token") output[field] = safeCallbackData(payload[field]);
    else if (field.endsWith("_redacted")) output[field] = safeRedactedIdentifier(payload[field]);
    else if (field.endsWith("_ms")) output[field] = numberOrNull(payload[field]);
    else if (field === "update_id") output[field] = Number.isFinite(Number(payload[field])) ? Math.trunc(Number(payload[field])) : null;
    else if (field === "duplicate_blocked" || field === "lock_blocked" || field === "answer_callback_query_executed") output[field] = booleanOrFalse(payload[field]);
    else if (field === "thresholds" && payload[field] && typeof payload[field] === "object") output[field] = payload[field];
    else output[field] = safeString(payload[field], 120);
  }

  if (!output.schema_version) output.schema_version = "telegram_latency_event.v1";
  if (!output.source_kind) output.source_kind = "UNKNOWN";
  if (!output.action) output.action = "UNKNOWN";
  if (!output.status) output.status = "UNKNOWN";
  if (!("ack_ms" in output)) output.ack_ms = null;
  if (!("total_ms" in output)) output.total_ms = null;
  if (!output.workflow_version) output.workflow_version = "UNKNOWN";
  return output;
}

function assertSafeRecords(records) {
  const validationErrors = validateRecords(records);
  const sensitiveErrors = [];
  records.forEach((record, index) => {
    const raw = JSON.stringify(record);
    for (const item of FORBIDDEN_PATTERNS) {
      if (item.pattern.test(raw)) sensitiveErrors.push(`linea ${index + 1}: patron sensible ${item.name}`);
    }
    if (/"(?:chat_id|telegram_user_id|user_id)"\s*:/.test(raw)) {
      sensitiveErrors.push(`linea ${index + 1}: raw identifier key`);
    }
  });
  const errors = [...validationErrors, ...sensitiveErrors];
  if (errors.length) throw new Error(`LATENCY_EXPORT_UNSAFE: ${errors.join(" | ")}`);
}

function writeJsonl(outPath, records) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = records.length ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
  fs.writeFileSync(outPath, body, "utf8");
}

function exportLatencyEvents(options = {}) {
  const config = {
    ...parseArgs([], options.env || process.env),
    ...options,
  };
  const raw = options.rawOutput !== undefined ? options.rawOutput : runPsqlQuery(config, options.execFileSync);
  const rows = parsePsqlJsonLines(raw);
  const records = rows.map(sanitizeLatencyPayload);
  assertSafeRecords(records);
  writeJsonl(config.outPath, records);
  return {
    ok: true,
    exported_count: records.length,
    out_path: config.outPath,
    connection: {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password ? "[redacted]" : "",
    },
  };
}

function printResult(result) {
  console.log("Telegram latency DB export");
  console.log(`Exported events: ${result.exported_count}`);
  console.log(`Output JSONL: ${path.relative(root, result.out_path).replace(/\\/g, "/")}`);
  console.log(`Connection: ${result.connection.user}@${result.connection.host}:${result.connection.port}/${result.connection.database}`);
  console.log("Sensitive findings: none");
}

if (require.main === module) {
  try {
    const args = parseArgs();
    const result = exportLatencyEvents(args);
    printResult(result);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_CONNECTION,
  ALLOWED_FIELDS,
  buildLatencyQuery,
  parseArgs,
  parsePsqlJsonLines,
  sanitizeLatencyPayload,
  exportLatencyEvents,
};

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  exportLatencyEvents,
  buildLatencyQuery,
  sanitizeLatencyPayload,
} = require("./export-telegram-latency-events");
const {
  analyzeLatencyFile,
  FORBIDDEN_PATTERNS,
} = require("./analyze-telegram-bot-latency");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-telegram-latency-db-export");
const exportPath = path.join(tempRoot, "telegram-latency-events.jsonl");

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

function latencyPayload(overrides = {}) {
  return {
    schema_version: "telegram_latency_event.v1",
    created_at: "2026-06-05T21:00:00.000Z",
    update_id: 991,
    callback_query_id_redacted: "redacted:15:abc12345",
    chat_id_redacted: "redacted:8:def67890",
    telegram_user_id_redacted: "redacted:9:ca55e777",
    source_kind: "CALLBACK_QUERY",
    callback_data: "cfdi_nav:new",
    command_token: "",
    action: "INVOICE_WIZARD",
    route: "INVOICE_WIZARD",
    status: "OK",
    duplicate_blocked: false,
    lock_blocked: false,
    answer_callback_query_executed: true,
    ack_ms: 72,
    db_insert_ms: 18,
    load_context_ms: 45,
    scoring_ms: null,
    routing_ms: 95,
    action_ms: null,
    send_message_ms: 240,
    total_ms: 21655,
    error_node: "",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    thresholds: { ack_warning_ms: 1000, interactive_warning_ms: 3000, total_warning_ms: 5000, ack_blocker_ms: 5000 },
    ...overrides,
  };
}

function wrapper(payload, createdAt = "2026-06-05T21:00:00.000Z") {
  return {
    event_type: "TELEGRAM_LATENCY_EVENT",
    created_at: createdAt,
    payload,
  };
}

function jsonlFromRows(rows) {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function assertNoSensitive(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (const item of FORBIDDEN_PATTERNS) {
    assert(!item.pattern.test(text), `sensitive ${item.name}`);
  }
  assert(!/CHAT-REAL|USER-REAL|CALLBACK-REAL|AAA010101AAA|C:[\\/]|<\?xml|%PDF-/i.test(text), "raw sensitive fixture leaked");
}

cleanTemp();

check("query_lee_bot_events_latency", () => {
  const query = buildLatencyQuery(250);
  assert(query.includes("FROM bot_events"));
  assert(query.includes("event_type = 'TELEGRAM_LATENCY_EVENT'"));
  assert(query.includes("LIMIT 250"));
  assert(!query.includes("telegram_bot_token"));
  return "bot_events";
});

check("exporta_eventos_simulados_a_jsonl_seguro", () => {
  const rawRows = jsonlFromRows([
    wrapper(latencyPayload({
      callback_data: "cfdi_nav:new",
      raw_extra_chat_id: "CHAT-REAL-123",
      suspicious_path: "C:/Users/Juandi Gamer/Documents/secret.xml",
      xml_blob: "<?xml version=\"1.0\"?>",
    })),
    wrapper(latencyPayload({
      update_id: 992,
      callback_data: "cfdi:<REAL-ACTION-TOKEN-THAT-MUST-NOT-LEAK>",
      total_ms: 1300,
      ack_ms: 80,
    })),
  ]);
  const result = exportLatencyEvents({ rawOutput: rawRows, outPath: exportPath });
  assert.strictEqual(result.exported_count, 2);
  assert(fs.existsSync(exportPath));
  const exported = fs.readFileSync(exportPath, "utf8");
  assert(exported.includes("cfdi_nav:new"));
  assert(exported.includes("cfdi:<token>"));
  assertNoSensitive(exported);
  return "2 events";
});

check("analyzer_lee_jsonl_exportado_y_detecta_callback_lento", () => {
  const result = analyzeLatencyFile(exportPath, { explicit: true, outDir: path.join(tempRoot, "summary") });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.summary.total_events, 2);
  assert(result.summary.slow_callbacks.some((item) => item.callback_data === "cfdi_nav:new"));
  assert(result.summary.metrics.total_ms.p95 >= 21655);
  assertNoSensitive(result.summary);
  return `slow=${result.summary.slow_callbacks.length}`;
});

check("detecta_ack_bajo_con_total_alto", () => {
  const result = analyzeLatencyFile(exportPath, { explicit: true, outDir: path.join(tempRoot, "summary-ack") });
  assert(result.summary.ack_fast_total_slow_callbacks.some((item) => item.callback_data === "cfdi_nav:new"));
  assert(result.summary.recommendations.some((item) => item.includes("ACK parece rapido")));
  return "ack_fast_total_slow";
});

check("reporta_missing_stage_metrics_sin_fallar", () => {
  const missingPath = path.join(tempRoot, "missing-stage.jsonl");
  const missingPayload = sanitizeLatencyPayload(wrapper(latencyPayload({
    update_id: 993,
    callback_data: "cfdi_nav:admin",
    total_ms: 21648,
    ack_ms: 40,
  })).payload);
  delete missingPayload.send_message_ms;
  delete missingPayload.scoring_ms;
  fs.writeFileSync(missingPath, `${JSON.stringify(missingPayload)}\n`, "utf8");
  const result = analyzeLatencyFile(missingPath, { explicit: true, outDir: path.join(tempRoot, "summary-missing") });
  assert.strictEqual(result.ok, true);
  assert(result.summary.missing_stage_metrics.some((item) => item.code === "MISSING_STAGE_METRIC" && item.stage === "send_message_ms"));
  assert(result.summary.recommendations.some((item) => item.includes("MISSING_STAGE_METRIC")));
  return "MISSING_STAGE_METRIC";
});

check("no_exporta_secretos_rutas_xml_pdf", () => {
  const payload = sanitizeLatencyPayload(wrapper(latencyPayload({
    callback_data: "cfdi:<SECRET-TOKEN-123>",
    command_token: "/detalle",
    error_node: "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/runtime/file.pdf",
    leaked_uuid: "123e4567-e89b-12d3-a456-426614174000",
    leaked_rfc: "AAA010101AAA",
  })).payload);
  const text = JSON.stringify(payload);
  assert(text.includes("cfdi:<token>"));
  assert(!text.includes("SECRET-TOKEN"));
  assertNoSensitive(payload);
  return "safe";
});

check("runtime_no_se_versiona", () => {
  const tracked = require("child_process").execFileSync("git", ["ls-files", "runtime"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(tracked.trim(), "runtime/.gitkeep");
  return "runtime/.gitkeep";
});

console.log("Telegram Latency DB Export Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

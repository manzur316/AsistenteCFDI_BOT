const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  analyzeLatencyFile,
  summarizeLatency,
  FORBIDDEN_PATTERNS,
} = require("./analyze-telegram-bot-latency");
const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const tempRoot = path.join(root, "runtime", "test-telegram-latency");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

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

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, nodeMap = {}, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, nodeMap, itemsProvider, 0)[0].json;
}

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-LAT-${role}`,
    telegram_chat_id: "CHAT-LAT",
    telegram_user_id: "TGUSER-LAT",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseLoadedInput(extra = {}) {
  const user = authorizedUser();
  return {
    update_id: 10901,
    max_seen_update_id: 10901,
    chat_id: "CHAT-LAT",
    telegram_user_id: "TGUSER-LAT",
    message_id: "109",
    text: "cfdi_nav:status",
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CALLBACK-LAT-1",
    callback_message_id: "99",
    source_message_id: "99",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    ...extra,
  };
}

function latencyRecord(overrides = {}) {
  return {
    schema_version: "telegram_latency_event.v1",
    created_at: "2026-06-05T20:00:00.000Z",
    update_id: overrides.update_id || 1,
    callback_query_id_redacted: "redacted:12:abcdef12",
    chat_id_redacted: "redacted:8:12345678",
    telegram_user_id_redacted: "redacted:9:87654321",
    source_kind: "CALLBACK_QUERY",
    callback_data: "cfdi_nav:status",
    command_token: "",
    action: "PRODUCT_STATUS",
    route: "PRODUCT_STATUS",
    status: "OK",
    duplicate_blocked: false,
    lock_blocked: false,
    answer_callback_query_executed: true,
    ack_ms: 120,
    db_insert_ms: 20,
    load_context_ms: 45,
    scoring_ms: null,
    routing_ms: 80,
    action_ms: null,
    send_message_ms: 200,
    total_ms: 900,
    error_node: "",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    thresholds: { ack_warning_ms: 1000, interactive_warning_ms: 3000, total_warning_ms: 5000, ack_blocker_ms: 5000 },
    ...overrides,
  };
}

function assertNoSensitive(value) {
  const text = JSON.stringify(value);
  for (const item of FORBIDDEN_PATTERNS) {
    assert(!item.pattern.test(text), `sensitive ${item.name}`);
  }
  assert(!/CHAT-LAT|TGUSER-LAT|CALLBACK-LAT/.test(text), "raw telegram identifiers");
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
}

cleanTemp();

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const extractCode = getNode(workflow, "Extract Local Ingest Update").parameters.jsCode;
const buildLoadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const logSendCode = getNode(workflow, "Log Send Result SQL").parameters.jsCode;

check("workflow_json_valido_y_contiene_telemetria", () => {
  assert(workflow.nodes.length > 0);
  assert(workflowText.includes("latency_trace"));
  assert(workflowText.includes("TELEGRAM_LATENCY_EVENT"));
  assert(workflowText.includes("ack_ms"));
  assert(workflowText.includes("send_message_ms"));
  assert(workflowText.includes("total_ms"));
  return `${workflow.nodes.length} nodes`;
});

check("extract_update_agrega_latency_trace_seguro", () => {
  const result = executeCode(
    extractCode,
    {
      headers: { "x-cfdi-runner-secret": "LOCAL_SECRET" },
      body: {
        update_id: 10901,
        callback_query: {
          id: "CALLBACK-LAT-1",
          data: "cfdi_nav:status",
          from: { id: "TGUSER-LAT" },
          message: { message_id: 99, chat: { id: "CHAT-LAT" } },
        },
      },
    },
    { "Set Config": { json: { workflowVersion: "CFDI_LOCAL_INGEST_V1", catalogPath, runnerSecret: "LOCAL_SECRET" } } },
  );
  assert.strictEqual(result.source_kind, "CALLBACK_QUERY");
  assert(result.latency_trace);
  assert.strictEqual(result.latency_trace.schema_version, "telegram_latency_trace.v1");
  assert(result.insert_update_sql.includes("latency_trace"));
  assert(!JSON.stringify(result.latency_trace).includes("CALLBACK-LAT-1"));
  assert(!JSON.stringify(result.latency_trace).includes("TGUSER-LAT"));
  return result.latency_trace.schema_version;
});

check("build_load_context_conserva_latency_trace", () => {
  const result = executeCode(buildLoadCode, {
    update_id: 10901,
    chat_id: "CHAT-LAT",
    telegram_user_id: "TGUSER-LAT",
    text: "cfdi_nav:status",
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    source_kind: "CALLBACK_QUERY",
    latency_trace: { schema_version: "telegram_latency_trace.v1", extract_end_ms: Date.now() - 5, workflow_start_ms: Date.now() - 20 },
  });
  assert(result.latency_trace);
  assert("db_insert_ms" in result.latency_trace);
  assert(result.load_context_sql.includes("latency_trace"));
  assert(!result.load_context_sql.includes("LOCAL_SECRET"));
  return "trace_ok";
});

check("handle_y_send_log_persisten_latency_event_seguro", () => {
  const loaded = baseLoadedInput({
    latency_trace: {
      schema_version: "telegram_latency_trace.v1",
      workflow_start_ms: Date.now() - 500,
      extract_end_ms: Date.now() - 450,
      build_load_context_end_ms: Date.now() - 300,
      db_insert_ms: 50,
      load_context_ms: 80,
    },
  });
  const handleResult = executeCode(handleCode, loaded);
  assert.strictEqual(handleResult.action, "PRODUCT_STATUS");
  assert(handleResult.latency_trace);
  assert.strictEqual(handleResult.latency_trace.answer_callback_query_executed, true);
  assert(handleResult.latency_trace.ack_ms !== null);
  const source = {
    ...handleResult,
    latency_trace: { ...handleResult.latency_trace, before_send_message_ms: Date.now() - 30 },
  };
  const logResult = executeCode(
    logSendCode,
    { ok: true, statusCode: 200, result: { message_id: 200 } },
    {},
    () => [{ json: source }],
  );
  assert(logResult.send_log_sql.includes("TELEGRAM_LATENCY_EVENT"));
  assert(logResult.send_log_sql.includes("send_message_ms"));
  assert(logResult.send_log_sql.includes("cfdi_nav:status"));
  assert(!logResult.send_log_sql.includes("TGUSER-LAT"));
  assert(!logResult.send_log_sql.includes("CALLBACK-LAT-1"));
  return "event_sql";
});

check("analyzer_calcula_percentiles_y_detecta_lentos", () => {
  const records = [
    latencyRecord({ update_id: 1, total_ms: 900, ack_ms: 120, callback_data: "cfdi_nav:status" }),
    latencyRecord({ update_id: 2, total_ms: 7000, ack_ms: 6200, callback_data: "cfdi_sbx:smoke_create", action: "PAC_SANDBOX_ACTION_REQUESTED" }),
    latencyRecord({ update_id: 3, total_ms: 1400, ack_ms: 250, callback_data: "cfdi_sbx:smoke_create", action: "CALLBACK_DUPLICATE_BLOCKED", duplicate_blocked: true, lock_blocked: true }),
  ];
  const summary = summarizeLatency(records, { sourceFile: "fixture.jsonl" });
  assert.strictEqual(summary.total_events, 3);
  assert.strictEqual(summary.metrics.total_ms.p50, 1400);
  assert.strictEqual(summary.metrics.total_ms.p95, 7000);
  assert.strictEqual(summary.metrics.ack_ms.p95, 6200);
  assert.strictEqual(summary.slow_callbacks.length, 1);
  assert.strictEqual(summary.callback_ack_blockers.length, 1);
  assert.strictEqual(summary.duplicate_blocked_count, 1);
  assert.strictEqual(summary.lock_blocked_count, 1);
  assert(summary.recommendations.some((item) => item.includes("ACK")));
  assertNoSensitive(summary);
  return "p50/p95/p99";
});

check("analyzer_genera_summary_runtime_seguro", () => {
  const fixture = path.join(tempRoot, "telegram-latency-events.jsonl");
  const outDir = path.join(tempRoot, "summary");
  writeJsonl(fixture, [
    latencyRecord({ update_id: 1, source_kind: "MESSAGE", callback_data: "", total_ms: 500, ack_ms: null, action: "COMMAND_CLIENTES" }),
    { event_type: "TELEGRAM_LATENCY_EVENT", payload: latencyRecord({ update_id: 2, total_ms: 750, ack_ms: 100, callback_data: "cfdi_nav:clients" }) },
  ]);
  const result = analyzeLatencyFile(fixture, { explicit: true, outDir });
  assert.strictEqual(result.ok, true);
  assert(fs.existsSync(path.join(outDir, "telegram-latency-summary.json")));
  assert(fs.existsSync(path.join(outDir, "telegram-latency-summary.md")));
  const summaryText = fs.readFileSync(path.join(outDir, "telegram-latency-summary.json"), "utf8");
  assert(summaryText.includes("\"total_events\": 2"));
  assert(!/[A-Za-z]:[\\/]/.test(summaryText));
  assertNoSensitive(JSON.parse(summaryText));
  return "summary";
});

check("analyzer_detecta_datos_sensibles", () => {
  const summary = summarizeLatency([
    latencyRecord({ callback_data: "cfdi_nav:status", leaked: "AAA010101AAA" }),
  ]);
  assert(summary.validation_errors.some((error) => error.includes("rfc_like_value")));
  return "blocked";
});

check("runtime_no_versionado", () => {
  const tracked = require("child_process").execFileSync("git", ["ls-files", "runtime"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(tracked.trim(), "runtime/.gitkeep");
  return "not_tracked";
});

console.log("Telegram Bot Latency Observability Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

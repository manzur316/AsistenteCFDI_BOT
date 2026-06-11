const assert = require("assert");

const { runPsqlJson, runPsqlRaw } = require("./lib/local-db-psql-runner");
const {
  baseSource,
  callbackInput,
  executeCode,
  getNodeCode,
  loadWorkflow,
  runSummary,
} = require("./lib/test-telegram-delivery-workflow-harness");

const DB_OPTIONS = {
  env: process.env,
  dbExecMode: process.env.CFDI_DB_EXEC_MODE || "docker",
};

function check(name, fn) {
  try {
    const value = fn();
    console.log(` - ${name}: PASS${value ? ` (${value})` : ""}`);
  } catch (error) {
    console.log(` - ${name}: FAIL (${error.message})`);
    process.exitCode = 1;
  }
}

function sqlBuilderNodes() {
  return [
    "Extract Local Ingest Update",
    "Build Load Context SQL",
    "Handle Commands And Scoring",
    "Log Send Result SQL",
    "Build PAC Sandbox Action Summary",
  ];
}

function extractHelperCode(nodeName) {
  const code = getNodeCode(nodeName);
  const starts = [
    code.indexOf("function sanitizeJsonForSql"),
    code.indexOf("function sqlLiteralPart"),
  ].filter((index) => index >= 0);
  const start = Math.min(...starts);
  const sqlJsonStart = code.indexOf("function sqlJson", start);
  const end = code.indexOf("\n", sqlJsonStart);
  if (!Number.isFinite(start) || start < 0 || sqlJsonStart < 0 || end < 0) {
    throw new Error(`No pude extraer helpers SQL de ${nodeName}`);
  }
  return code.slice(start, end);
}

function loadSqlHelpers() {
  const helperCode = extractHelperCode("Handle Commands And Scoring");
  return new Function(`${helperCode}; return { sqlQuote, sqlJson, sanitizeJsonForSql };`)();
}

function assertNoPlaceholderLikeDollar(sql, label) {
  assert(!/\$\d+/.test(String(sql)), `${label} contiene placeholder aparente: ${String(sql).match(/\$\d+/)?.[0]}`);
}

function assertRoundTripsThroughPostgres(expression, expected, key = "payload") {
  const safeKey = String(key).replace(/'/g, "''");
  const row = runPsqlJson(`SELECT jsonb_build_object('${safeKey}', ${expression})::text;`, DB_OPTIONS);
  assert.deepStrictEqual(row[key], expected);
}

function stripPassthroughSelect(sql) {
  const stripped = String(sql || "").replace(/\s*SELECT\s+'[A-Za-z0-9+/=]+'::text AS passthrough_b64;\s*$/s, "");
  if (stripped === sql) throw new Error("No pude retirar SELECT passthrough_b64 final");
  return stripped;
}

function generatedSummaryResult() {
  const handleCode = getNodeCode("Handle Commands And Scoring");
  const token = "sqljsonsafe001";
  return executeCode(handleCode, callbackInput(token, "VIEW_SUMMARY", {
    update_id: 982001,
    max_seen_update_id: 982001,
    recent_drafts: [],
    client_invoice_ledger: [{
      client_id: "CLI-SQL-JSON",
      client_display: "Cliente SQL JSON",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 101410.68,
      created_at: "2026-06-11T10:20:00.000Z",
    }],
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
  }));
}

function generatedSandboxSummaryResult() {
  return runSummary(JSON.stringify({
    ok: true,
    status: "OK",
    action: "sandbox.audit.summary",
    duration_ms: 42,
    artifacts: [],
    warnings: ["warning MXN $1,234.56\nsegunda linea"],
    errors: [],
    sensitive_findings: [],
    diagnostics: {
      note: "diagnostico $999 O'Hara \"demo\"\nlinea 2 C:\\runtime\\qa ? : {} []",
    },
    output: {},
  }), baseSource({
    update_id: 982002,
    max_seen_update_id: 982002,
    requested_sandbox_action: "sandbox.audit.summary",
  }));
}

console.log("Telegram SQL/JSON Persistence Hardening");

check("workflow_sql_helpers_no_mxn_dollar_hotfix", () => {
  const workflowText = JSON.stringify(loadWorkflow());
  assert(!/replace\(\s*\/\\?\$\/g\s*,\s*['"]MXN\s/.test(workflowText), "workflow aun reemplaza $ por MXN");
  assert(!workflowText.includes("MXN 101410.68"), "workflow contiene evidencia vieja MXN");
  return "no_mxn_rewrite";
});

check("all_workflow_sql_builders_use_safe_dollar_literal", () => {
  for (const nodeName of sqlBuilderNodes()) {
    const code = getNodeCode(nodeName);
    assert(code.includes("function sqlLiteralPart"), `${nodeName} no tiene sqlLiteralPart`);
    assert(code.includes("char === '$' ? 36"), `${nodeName} no detecta dollar literal`);
    assert(code.includes("parts.push('chr(' + code + ')')"), `${nodeName} no emite chr(code)`);
  }
  return `${sqlBuilderNodes().length} nodos`;
});

check("sql_json_payload_matrix_roundtrips", () => {
  const { sqlJson } = loadSqlHelpers();
  const payload = {
    amount_raw: "$101410.68",
    placeholder_one: "$1",
    placeholder_big: "$999",
    formatted_amount: "MXN $1,234.56",
    single_quote: "O'Hara",
    double_quote: "Factura \"demo\"",
    newlines: "linea 1\nlinea 2\r\nlinea 3",
    backslashes: "C:\\runtime\\qa\\file.json",
    nested: {
      list: ["$1", "$999", { amount: "MXN $1,234.56", punctuation: "?:{}[]" }],
    },
    emoji: "emoji \\u{1F9EA} \\u{1F4C4}",
    punctuation: "?:{}[]",
  };
  payload.emoji = payload.emoji.replace("\\u{1F9EA}", "\u{1F9EA}").replace("\\u{1F4C4}", "\u{1F4C4}");
  const expression = sqlJson(payload);
  assert(expression.includes("chr(36)"), "sqlJson no codifico $ con chr(36)");
  assert(expression.includes("chr(92)"), "sqlJson no codifico backslash con chr(92)");
  assertNoPlaceholderLikeDollar(expression, "sqlJson expression");
  assertRoundTripsThroughPostgres(expression, payload);
  return "matrix";
});

check("sql_text_literal_matrix_roundtrips", () => {
  const { sqlQuote } = loadSqlHelpers();
  const value = "$101410.68 $1 $999 MXN $1,234.56 O'Hara \"demo\"\nlinea 2\r\nC:\\runtime\\qa ? : {} []";
  const expression = sqlQuote(value);
  for (const expected of ["chr(36)", "chr(10)", "chr(13)", "chr(92)"]) {
    assert(expression.includes(expected), `sqlQuote no contiene ${expected}`);
  }
  assertNoPlaceholderLikeDollar(expression, "sqlQuote expression");
  const row = runPsqlJson(`SELECT jsonb_build_object('value', ${expression})::text;`, DB_OPTIONS);
  assert.strictEqual(row.value, value);
  return "text";
});

check("telegram_visible_currency_preserved_and_sql_safe", () => {
  const result = generatedSummaryResult();
  assert.strictEqual(result.action, "COMMAND_RESUMEN");
  assert(String(result.telegram_message || "").includes("$101410.68"), "Telegram perdio el simbolo $ visible");
  assert(String(result.persistence_sql || "").includes("chr(36)"), "persistence_sql no usa chr(36)");
  assertNoPlaceholderLikeDollar(result.persistence_sql, "generated persistence_sql");
  return "COMMAND_RESUMEN";
});

check("generated_persistence_sql_executes_and_reads_payload", () => {
  const result = generatedSummaryResult();
  const bodySql = stripPassthroughSelect(result.persistence_sql);
  const raw = runPsqlRaw([
    "BEGIN;",
    bodySql,
    "SELECT jsonb_build_object('payload', payload)::text FROM bot_events WHERE update_id = 982001 AND event_type = 'COMMAND_RESUMEN' ORDER BY created_at DESC LIMIT 1;",
    "ROLLBACK;",
  ].join(" "), DB_OPTIONS);
  const jsonLine = String(raw || "").split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert(jsonLine, "No se pudo leer payload insertado en transaccion");
  const row = JSON.parse(jsonLine);
  const telegramMessage = row.payload?.response?.telegram_message || "";
  assert(telegramMessage.includes("$101410.68"), "payload persistido no conserva $101410.68");
  assert(!telegramMessage.includes("MXN 101410.68"), "payload persistido contiene sustitucion MXN vieja");
  return "rollback";
});

check("sandbox_summary_payload_preserves_special_chars", () => {
  const result = generatedSandboxSummaryResult();
  assert.strictEqual(result.action, "PAC_SANDBOX_ACTION_RESULT");
  assert(String(result.persistence_sql || "").includes("chr(36)"), "sandbox summary SQL no usa chr(36)");
  assertNoPlaceholderLikeDollar(result.persistence_sql, "sandbox summary persistence_sql");
  const bodySql = stripPassthroughSelect(result.persistence_sql);
  const raw = runPsqlRaw([
    "BEGIN;",
    bodySql,
    "SELECT jsonb_build_object('payload', payload)::text FROM bot_events WHERE update_id = 982002 AND event_type = 'PAC_SANDBOX_ACTION_RESULT' ORDER BY created_at DESC LIMIT 1;",
    "ROLLBACK;",
  ].join(" "), DB_OPTIONS);
  const jsonLine = String(raw || "").split(/\r?\n/).map((line) => line.trim()).find((line) => line.startsWith("{"));
  assert(jsonLine, "No se pudo leer payload sandbox insertado en transaccion");
  const row = JSON.parse(jsonLine);
  const note = row.payload?.sandbox_action_summary?.diagnostics?.note || "";
  assert(note.includes("$999"), "diagnostico persistido perdio $999");
  assert(note.includes("\nlinea 2"), "diagnostico persistido perdio salto de linea");
  assert(note.includes("O'Hara"), "diagnostico persistido perdio comilla simple");
  assert(note.includes("?: {} []") || note.includes("? : {} []"), "diagnostico persistido perdio puntuacion");
  return "sandbox_summary";
});

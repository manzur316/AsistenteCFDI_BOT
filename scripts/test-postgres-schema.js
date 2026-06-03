const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const sqlPath = path.join(root, "sql", "001_init_cfdi_bot.sql");

const requiredTables = {
  bot_state: ["key text primary key", "value jsonb", "updated_at timestamptz"],
  telegram_updates: ["update_id bigint primary key", "chat_id text", "message_id text", "text text", "received_at timestamptz", "processed_at timestamptz", "status text", "raw_payload jsonb"],
  chat_states: ["chat_id text primary key", "state text", "original_text text", "context jsonb", "expires_at timestamptz", "updated_at timestamptz"],
  cfdi_drafts: ["draft_id text primary key", "chat_id text", "update_id bigint", "message_original text", "status text", "action text", "ready_to_copy boolean", "requires_human_review boolean", "concept jsonb", "top_3 jsonb", "telegram_message text", "created_at timestamptz", "updated_at timestamptz"],
  bot_events: ["event_id text primary key", "chat_id text", "update_id bigint", "event_type text", "payload jsonb", "created_at timestamptz"],
  send_logs: ["send_log_id text primary key", "chat_id text", "update_id bigint", "ok boolean", "error text", "payload jsonb", "created_at timestamptz"],
};

const requiredIndexes = [
  "idx_telegram_updates_chat_id",
  "idx_telegram_updates_status",
  "idx_telegram_updates_received_at",
  "idx_chat_states_expires_at",
  "idx_cfdi_drafts_chat_id",
  "idx_cfdi_drafts_status",
  "idx_cfdi_drafts_created_at",
  "idx_bot_events_chat_id",
  "idx_bot_events_event_type",
  "idx_bot_events_created_at",
  "idx_send_logs_chat_id",
  "idx_send_logs_update_id",
  "idx_send_logs_ok",
  "idx_send_logs_created_at",
];

function normalize(value) {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
checks.push({ name: "sql_exists", pass: fs.existsSync(sqlPath), value: sqlPath });

let raw = "";
let normalized = "";
if (fs.existsSync(sqlPath)) {
  raw = fs.readFileSync(sqlPath, "utf8");
  normalized = normalize(raw);
}

for (const [table, columns] of Object.entries(requiredTables)) {
  checks.push({
    name: `table:${table}`,
    pass: normalized.includes(`create table if not exists ${table}`),
    value: table,
  });
  for (const column of columns) {
    checks.push({
      name: `column:${table}.${column.split(" ")[0]}`,
      pass: normalized.includes(normalize(column)),
      value: column,
    });
  }
}

checks.push({
  name: "bot_state_seed",
  pass: normalized.includes("insert into bot_state")
    && normalized.includes("lasttelegramupdateid")
    && normalized.includes("processedupdateids")
    && normalized.includes("cfdi_postgres_polling_v1")
    && normalized.includes("on conflict (key) do nothing"),
  value: "initial telegram state V1",
});

checks.push({
  name: "grant_schema_usage",
  pass: normalized.includes("grant usage on schema public to cfdi_bot_user"),
  value: "cfdi_bot_user schema usage",
});

checks.push({
  name: "grant_table_dml",
  pass: normalized.includes("grant select, insert, update, delete on all tables in schema public to cfdi_bot_user"),
  value: "cfdi_bot_user DML",
});

checks.push({
  name: "grant_default_privileges",
  pass: normalized.includes("alter default privileges in schema public grant select, insert, update, delete on tables to cfdi_bot_user"),
  value: "future tables DML",
});

for (const indexName of requiredIndexes) {
  checks.push({
    name: `index:${indexName}`,
    pass: normalized.includes(`create index if not exists ${indexName}`),
    value: indexName,
  });
}

const passCount = checks.filter((check) => check.pass).length;

console.log("Postgres schema contract");
console.log(`SQL: ${sqlPath}`);
console.log(`Total checks: ${checks.length}`);
console.log("");
for (const check of checks) printCheck(check.name, check.pass, check.value);
console.log("");
console.log(`Resumen: ${passCount}/${checks.length} PASS`);

if (passCount !== checks.length) process.exitCode = 1;

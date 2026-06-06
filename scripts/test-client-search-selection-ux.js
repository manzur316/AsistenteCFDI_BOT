const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function executeCode(code, input) {
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, {}, () => [], 0)[0].json;
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

function client(id, name, aliases = []) {
  return {
    client_id: id,
    display_name: name,
    razon_social: name,
    rfc: "XAXX010101000",
    regimen_fiscal: "601",
    codigo_postal_fiscal: "77500",
    uso_cfdi_default: "G03",
    tipo_persona: "MORAL",
    validated_by_human: true,
    enabled: true,
    aliases: aliases.map((alias, index) => ({ alias, normalized_alias: alias.toLowerCase(), weight: 100 - index })),
  };
}

const clients = [
  client("CLI-REAL-BILBAO", "Real Bilbao", ["bilbao", "real bilbao"]),
  client("CLI-REAL-CAMPESTRE", "Real Campestre", ["real", "campestre"]),
  client("CLI-OTRO", "Otro Cliente", ["otro"]),
];

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 71420,
    chat_id: "CHAT-SEARCH-714D",
    telegram_user_id: "USER-SEARCH-714D",
    message_id: "MSG",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients,
    tax_rules: [],
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: { user_id: "OWNER", role: "OWNER", enabled: true, telegram_chat_id: "CHAT-SEARCH-714D", telegram_user_id: "USER-SEARCH-714D" },
    security_user_id: "OWNER",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().filter(Boolean);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const checks = [];
function check(name, fn) {
  try { checks.push({ name, pass: true, value: fn() || "" }); } catch (error) { checks.push({ name, pass: false, value: error.message }); }
}

check("alias_search_opens_exact_client", () => {
  const result = executeCode(handleCode, baseInput("/cliente bilbao", { update_id: 71421 }));
  assert.strictEqual(result.action, "CLIENT_DETAIL");
  assert(result.telegram_message.includes("CLI-REAL-BILBAO"));
  return result.action;
});

check("ambiguous_search_shows_tokenized_options", () => {
  const result = executeCode(handleCode, baseInput("/cliente real", { update_id: 71422 }));
  assert.strictEqual(result.action, "CLIENT_SEARCH_OPTIONS");
  assert(callbacks(result).some((button) => button.text === "Ver 1"));
  assert(callbacks(result).some((button) => button.text === "Ver 2"));
  assert(result.persistence_sql.includes("CLIENT_LIST_SELECTION"));
  return callbacks(result).map((button) => button.text).join(",");
});

check("numeric_reply_in_selection_opens_client_not_invoice", () => {
  const result = executeCode(handleCode, baseInput("2", {
    update_id: 71423,
    chat_state: {
      state: "CLIENT_LIST_SELECTION",
      context: { client_selection: [{ index: 1, client_id: "CLI-REAL-BILBAO" }, { index: 2, client_id: "CLI-REAL-CAMPESTRE" }] },
    },
  }));
  assert.strictEqual(result.action, "CLIENT_DETAIL");
  assert(result.telegram_message.includes("CLI-REAL-CAMPESTRE"));
  assert(!String(result.persistence_sql).includes("INSERT INTO cfdi_drafts"));
  return result.action;
});

check("unknown_search_offers_create_new_client", () => {
  const result = executeCode(handleCode, baseInput("/cliente inexistente xyz", { update_id: 71424 }));
  assert.strictEqual(result.action, "COMMAND_CLIENTE");
  assert(callbacks(result).some((button) => button.callback_data === "cfdi_nav:client_new"));
  return result.action;
});

for (const item of checks) console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

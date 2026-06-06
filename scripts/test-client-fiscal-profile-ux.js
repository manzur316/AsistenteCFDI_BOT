const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value ? ` (${value})` : ""}`);
}

function executeCode(code, input) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, () => [], 0)[0].json;
}

function getNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

function client(id, displayName, overrides = {}) {
  return {
    client_id: id,
    display_name: displayName,
    razon_social: `${displayName} AC`,
    rfc: "PRB150731II8",
    regimen_fiscal: "603",
    codigo_postal_fiscal: "77723",
    uso_cfdi_default: "G03",
    tipo_persona: "MORAL_SIN_FINES_LUCRO",
    tax_profile: "PM_NO_LUCRATIVA",
    validated_by_human: false,
    enabled: true,
    aliases: [{ alias: displayName, normalized_alias: displayName.toLowerCase(), weight: 100 }],
    ...overrides,
  };
}

const clients = [
  client("CLI-UNO", "Cliente Uno"),
  client("CLI-DOS", "Cliente Dos"),
  client("CLI-TRES", "Cliente Tres"),
  client("CLI-REAL-BILBAO", "Real Bilbao"),
];

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 71401,
    max_seen_update_id: extra.update_id || 71401,
    chat_id: "CHAT-7-14D",
    telegram_user_id: "USER-7-14D",
    message_id: "MSG-7-14D",
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
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER-7-14D",
      telegram_chat_id: "CHAT-7-14D",
      telegram_user_id: "USER-7-14D",
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-7-14D",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().filter(Boolean);
}

function callbackByText(result, label) {
  return callbacks(result).find((button) => String(button.text || "") === label)?.callback_data || "";
}

const checks = [];
function check(name, fn) {
  try {
    checks.push({ name, pass: true, value: fn() || "" });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;

check("client_list_generates_safe_view_buttons", () => {
  const result = executeCode(handleCode, baseInput("/clientes"));
  const ver4 = callbackByText(result, "Ver 4");
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(ver4.startsWith("cfdi:"), ver4);
  assert(ver4.length <= 32, ver4);
  assert(!/CLI-REAL-BILBAO|PRB150731II8|Real Bilbao|9148/.test(ver4), ver4);
  assert(result.persistence_sql.includes("CLIENT_LIST_SELECTION"));
  return ver4;
});

check("view_4_token_opens_real_client_id", () => {
  const result = executeCode(handleCode, baseInput("cfdi:CLIENTVIEW714D", {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-CLIENT-VIEW",
    action_token: {
      token: "CLIENTVIEW714D",
      chat_id: "CHAT-7-14D",
      action: "VIEW_CLIENT",
      payload: { client_id: "CLI-REAL-BILBAO", list_index: 4 },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
  }));
  assert.strictEqual(result.action, "CLIENT_DETAIL");
  assert(result.telegram_message.includes("CLI-REAL-BILBAO"));
  assert(result.telegram_message.includes("Real Bilbao"));
  assert(!result.telegram_message.includes("PRB150731II8"));
  assert(callbacks(result).some((button) => button.text === "Marcar validado"));
  return result.action;
});

check("validarcliente_numeric_without_context_is_blocked", () => {
  const result = executeCode(handleCode, baseInput("/validarcliente 4", { update_id: 71403 }));
  assert.strictEqual(result.action, "COMMAND_VALIDARCLIENTE_BLOCKED");
  assert(result.telegram_message.includes("No puedo resolver el numero de cliente"));
  assert(!result.persistence_sql.includes("client_id = '4'"));
  assert(!result.telegram_message.includes("marcado como validado"));
  return result.action;
});

check("validarcliente_numeric_with_context_resolves_real_client", () => {
  const result = executeCode(handleCode, baseInput("/validarcliente 4", {
    update_id: 71404,
    chat_state: {
      state: "CLIENT_LIST_SELECTION",
      context: { client_selection: clients.map((item, index) => ({ index: index + 1, client_id: item.client_id })) },
    },
  }));
  assert.strictEqual(result.action, "COMMAND_VALIDARCLIENTE");
  assert(result.telegram_message.includes("CLI-REAL-BILBAO"));
  assert(result.persistence_sql.includes("client_id = 'CLI-REAL-BILBAO'"));
  assert(result.persistence_sql.includes("RETURNING client_id"));
  assert(result.persistence_sql.includes("CLIENT_FISCAL_PROFILE_VALIDATED"));
  assert(!result.persistence_sql.includes("client_id = '4'"));
  return result.action;
});

check("validate_button_blocks_missing_tax_fields", () => {
  const result = executeCode(handleCode, baseInput("cfdi:CLIENTVAL714D", {
    update_id: 71405,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-CLIENT-VAL",
    clients: [client("CLI-INCOMPLETE", "Cliente Incompleto", { rfc: "", regimen_fiscal: "", codigo_postal_fiscal: "" })],
    action_token: {
      token: "CLIENTVAL714D",
      chat_id: "CHAT-7-14D",
      action: "VALIDATE_CLIENT",
      payload: { client_id: "CLI-INCOMPLETE" },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
  }));
  assert.strictEqual(result.action, "COMMAND_VALIDARCLIENTE_BLOCKED");
  assert(result.telegram_message.includes("faltan RFC"));
  assert(!result.persistence_sql.includes("validated_by_human = true"));
  return result.action;
});

check("edit_rfc_flow_persists_and_unvalidates", () => {
  const prompt = executeCode(handleCode, baseInput("cfdi:EDITRFC714D1", {
    update_id: 71406,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-EDIT-RFC",
    action_token: {
      token: "EDITRFC714D1",
      chat_id: "CHAT-7-14D",
      action: "EDIT_CLIENT_RFC",
      payload: { client_id: "CLI-REAL-BILBAO" },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
  }));
  assert.strictEqual(prompt.action, "EDIT_CLIENT_FIELD");
  const saved = executeCode(handleCode, baseInput("XAXX010101000", {
    update_id: 71407,
    chat_state: { state: "EDIT_CLIENT_FIELD", context: { client_id: "CLI-REAL-BILBAO", field: "rfc" } },
  }));
  assert.strictEqual(saved.action, "CLIENT_FISCAL_PROFILE_UPDATED");
  assert(saved.persistence_sql.includes("UPDATE cfdi_clients SET rfc = 'XAXX010101000', validated_by_human = false"));
  assert(saved.persistence_sql.includes("CLIENT_FISCAL_PROFILE_UPDATED"));
  return saved.action;
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

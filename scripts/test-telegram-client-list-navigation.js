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
    aliases: [name, ...aliases].map((alias, index) => ({
      alias,
      normalized_alias: alias.toLowerCase(),
      weight: 100 - index,
    })),
  };
}

const clients = [
  client("CLI-REAL-BILBAO", "Real Bilbao", ["bilbao"]),
  client("CLI-PRIVADA-RIVERA", "Privada Rivera", ["rivera"]),
  client("CLI-PRIVADA-ARETZA", "Privada Aretza", ["aretza"]),
  client("CLI-CUATRO", "Cliente Cuatro"),
  client("CLI-CINCO", "Cliente Cinco"),
  client("CLI-SEIS", "Cliente Seis"),
];

const ambiguousClients = [
  client("CLI-REAL-BILBAO", "Real Bilbao", ["real"]),
  client("CLI-REAL-CAMPESTRE", "Real Campestre", ["real"]),
  client("CLI-OTRO", "Otro Cliente"),
];

function ledgerRows() {
  return [
    {
      client_id: "CLI-REAL-BILBAO",
      client_display: "Real Bilbao",
      draft_id: "DRAFT-CLIENT-NAV-001",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1000,
      updated_at: "2026-06-10T10:00:00Z",
    },
  ];
}

function clientListState(sourceClients = clients, page = 1, overrides = {}) {
  return {
    state: "CLIENT_LIST_SELECTION",
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    context: {
      client_selection: sourceClients.map((item, index) => ({
        index: index + 1,
        client_id: item.client_id,
        display_name: item.display_name,
      })),
      list_context: {
        schema_version: "telegram_list_context.v1",
        context_id: `TEST-CLIENTS-${page}`,
        chat_id: "CHAT-CLIENT-NAV",
        telegram_user_id: "USER-CLIENT-NAV",
        kind: "CLIENTS",
        page,
        page_size: 5,
        total_items: sourceClients.length,
        filter: { source: "CLIENTS" },
        expires_at: overrides.context_expires_at || overrides.expires_at || "2099-01-01T00:00:00.000Z",
        items: sourceClients.map((item, index) => ({
          visibleIndex: index + 1,
          entityType: "CLIENT",
          entityId: item.client_id,
          client_id: item.client_id,
          displayLabel: item.display_name,
        })),
      },
    },
  };
}

function draftListState() {
  return {
    state: "LIST_NAVIGATION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "DRAFTS_APPROVED",
        page: 1,
        page_size: 5,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: [{ visibleIndex: 1, draft_id: "DRAFT-APPROVED-001" }],
      },
    },
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 81601,
    chat_id: "CHAT-CLIENT-NAV",
    telegram_user_id: "USER-CLIENT-NAV",
    message_id: "MSG-CLIENT-NAV",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || ledgerRows(),
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-CLIENT-NAV",
      telegram_user_id: "USER-CLIENT-NAV",
    },
    security_user_id: "OWNER",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().filter(Boolean);
}

function hasButton(result, text) {
  return callbacks(result).some((button) => button.text === text);
}

function assertNoLiteralEscapedLineBreaks(result, label = result.action) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("\\n"), `${label} contiene \\\\n literal: ${JSON.stringify(text)}`);
  assert(!text.includes("\\r"), `${label} contiene \\\\r literal: ${JSON.stringify(text)}`);
}

function assertHasRealLineBreak(result, label = result.action) {
  const text = String(result.telegram_message || "");
  assert(text.includes("\n"), `${label} no contiene saltos reales: ${JSON.stringify(text)}`);
}

function callbackInput(action, payload, extra = {}) {
  const token = `CLIENTNAV${String(extra.update_id || 81699).slice(-4)}`;
  return baseInput(`cfdi:${token}`, {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CB-${token}`,
    callback_message_id: "MSG-CB",
    source_message_id: "MSG-CB",
    action_token: {
      token,
      chat_id: "CHAT-CLIENT-NAV",
      action,
      payload,
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    ...extra,
  });
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const checks = [];

function check(name, fn) {
  try {
    checks.push({ name, pass: true, value: fn() || "" });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("clientes_crea_contexto_clients_y_lista_limpia", () => {
  const result = executeCode(handleCode, baseInput("/clientes", { update_id: 81602 }));
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert.strictEqual(result.screen_id, "CLIENTS_LIST_SELECTION");
  assertNoLiteralEscapedLineBreaks(result, "/clientes");
  assertHasRealLineBreak(result, "/clientes");
  assert(result.telegram_message.includes("Clientes\nSelecciona con cliente N o facturas N."));
  assert(result.persistence_sql.includes('"kind":"CLIENTS"'));
  assert(hasButton(result, "Ver 1"));
  assert(hasButton(result, "Ver 5"));
  assert(hasButton(result, "Mas clientes 6-6"));
  assert(!result.telegram_message.includes("CLI-REAL-BILBAO"));
  assert(!result.telegram_message.includes("validado=no"));
  assert(!result.telegram_message.includes("facturas=0"));
  return result.screen_id;
});

check("cliente_1_resuelve_primer_cliente", () => {
  const result = executeCode(handleCode, baseInput("cliente 1", {
    update_id: 81603,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_DETAIL");
  assert.strictEqual(result.json_debug.client_id, "CLI-REAL-BILBAO");
  assert.strictEqual(result.return_to, "CLIENTS_LIST_SELECTION");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_DETAIL");
  assertHasRealLineBreak(result, "CLIENT_DETAIL");
  return result.json_debug.client_id;
});

check("slash_cliente_5_resuelve_quinto_cliente", () => {
  const result = executeCode(handleCode, baseInput("/cliente 5", {
    update_id: 81604,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_DETAIL");
  assert.strictEqual(result.json_debug.client_id, "CLI-CINCO");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_DETAIL");
  assert(!String(result.telegram_message || "").includes("No encontre cliente para: 5"));
  return result.json_debug.client_id;
});

check("cliente_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("cliente 99", {
    update_id: 81605,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_LIST_INDEX_NOT_FOUND");
  assert.strictEqual(result.screen_id, "RECOVERY");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_LIST_INDEX_NOT_FOUND");
  return result.action;
});

check("cliente_5_sin_contexto_no_busca_texto_ambiguo", () => {
  const result = executeCode(handleCode, baseInput("cliente 5", { update_id: 81606 }));
  assert.strictEqual(result.action, "CLIENT_LIST_CONTEXT_MISSING");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_LIST_CONTEXT_MISSING");
  assert(!String(result.telegram_message || "").includes("No encontre cliente para: 5"));
  return result.action;
});

check("facturas_1_abre_ledger_del_cliente_sin_pago", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", {
    update_id: 81607,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER");
  assert.strictEqual(result.json_debug.client_id, "CLI-REAL-BILBAO");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_INVOICE_LEDGER");
  assertHasRealLineBreak(result, "CLIENT_INVOICE_LEDGER");
  assert(!String(result.persistence_sql || "").includes("SET payment_status"));
  return result.action;
});

check("facturas_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("facturas 99", {
    update_id: 81608,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_LIST_INDEX_NOT_FOUND");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_LIST_INDEX_NOT_FOUND");
  return result.action;
});

check("contexto_drafts_no_contamina_cliente_n", () => {
  const result = executeCode(handleCode, baseInput("/cliente 1", {
    update_id: 81609,
    chat_state: draftListState(),
  }));
  assert.strictEqual(result.action, "CLIENT_LIST_CONTEXT_MISSING");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_LIST_CONTEXT_MISSING");
  assert.notStrictEqual(result.action, "COMMAND_DETALLE");
  return result.action;
});

check("buscar_cliente_inicia_awaiting_client_search", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:client_find", {
    update_id: 81610,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-CLIENT-FIND",
    callback_message_id: "MSG-CB",
    source_message_id: "MSG-CB",
  }));
  assert.strictEqual(result.action, "AWAITING_CLIENT_SEARCH");
  assertNoLiteralEscapedLineBreaks(result, "AWAITING_CLIENT_SEARCH");
  assertHasRealLineBreak(result, "AWAITING_CLIENT_SEARCH");
  assert(result.persistence_sql.includes("AWAITING_CLIENT_SEARCH"));
  return result.action;
});

check("siguiente_mensaje_busca_y_crea_lista_accionable", () => {
  const result = executeCode(handleCode, baseInput("real", {
    update_id: 81611,
    clients: ambiguousClients,
    chat_state: {
      state: "AWAITING_CLIENT_SEARCH",
      expires_at: "2099-01-01T00:00:00.000Z",
      context: { state: "AWAITING_CLIENT_SEARCH" },
    },
  }));
  assert.strictEqual(result.action, "CLIENT_SEARCH_OPTIONS");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_SEARCH_OPTIONS");
  assertHasRealLineBreak(result, "CLIENT_SEARCH_OPTIONS");
  assert(result.persistence_sql.includes('"kind":"CLIENTS"'));
  assert(hasButton(result, "Ver 1"));
  assert(hasButton(result, "Ver 2"));
  return result.action;
});

check("volver_desde_detalle_regresa_a_lista_clientes", () => {
  const result = executeCode(handleCode, callbackInput("LIST_CLIENTS", {
    nav_return: true,
    page: 1,
    return_to: "CLIENTS_LIST_SELECTION",
    return_context: { kind: "CLIENTS", page: 1, expires_at: "2099-01-01T00:00:00.000Z", source: "CLIENTS" },
    source_list_kind: "CLIENTS",
    source_page: 1,
    return_expires_at: "2099-01-01T00:00:00.000Z",
  }, {
    update_id: 81612,
    chat_state: clientListState(),
  }));
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert.strictEqual(result.screen_id, "CLIENTS_LIST_SELECTION");
  assertNoLiteralEscapedLineBreaks(result, "COMMAND_CLIENTES");
  assertHasRealLineBreak(result, "COMMAND_CLIENTES");
  assert(hasButton(result, "Ver 1"));
  return result.action;
});

check("contexto_expirado_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("cliente 1", {
    update_id: 81613,
    chat_state: clientListState(clients, 1, { expires_at: "2020-01-01T00:00:00.000Z" }),
  }));
  assert.strictEqual(result.action, "CLIENT_LIST_CONTEXT_EXPIRED");
  assertNoLiteralEscapedLineBreaks(result, "CLIENT_LIST_CONTEXT_EXPIRED");
  return result.action;
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

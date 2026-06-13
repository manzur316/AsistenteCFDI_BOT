const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function getNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

function executeCode(code, input) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath,
        runnerSecret: "TEST_SECRET",
      },
    },
  };
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, nodeContext, () => [], 0)[0].json;
}

function invoice(overrides = {}) {
  return {
    client_id: "CLIENT-REAL-BILBAO",
    client_display: "Real Bilbao",
    draft_id: "DRAFT-COLLECT-001",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    total: 1000,
    payment_amount_paid: 0,
    updated_at: "2026-06-10T10:00:00Z",
    ...overrides,
  };
}

const ledger = [
  invoice(),
  invoice({
    client_id: "CLIENT-PARCIAL",
    client_display: "Privada Rivera",
    draft_id: "DRAFT-COLLECT-PARTIAL",
    payment_status: "PARCIAL",
    total: 3000,
    payment_amount_paid: 1000,
    updated_at: "2026-06-11T10:00:00Z",
  }),
  invoice({
    client_id: "CLIENT-VENCIDO",
    client_display: "Privada Aretza",
    draft_id: "DRAFT-COLLECT-OVERDUE",
    payment_status: "VENCIDO",
    total: 2000,
    updated_at: "2026-06-09T10:00:00Z",
  }),
  invoice({
    client_id: "CLIENT-PAID",
    client_display: "Cliente Pagado",
    draft_id: "DRAFT-COLLECT-PAID",
    payment_status: "PAGADO",
    total: 5000,
    payment_amount_paid: 5000,
  }),
  invoice({
    client_id: "CLIENT-CANCEL",
    client_display: "Cliente Cancelado",
    draft_id: "DRAFT-COLLECT-CANCEL",
    invoice_status: "SANDBOX_CANCELADO",
    payment_status: "NO_APLICA",
    total: 700,
  }),
];

function clients() {
  return [
    { client_id: "CLIENT-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] },
    { client_id: "CLIENT-PARCIAL", display_name: "Privada Rivera", enabled: true, aliases: [] },
    { client_id: "CLIENT-VENCIDO", display_name: "Privada Aretza", enabled: true, aliases: [] },
    { client_id: "CLIENT-PAID", display_name: "Cliente Pagado", enabled: true, aliases: [] },
  ];
}

function authorizedUser() {
  return {
    user_id: "OWNER",
    telegram_chat_id: "CHAT-COLLECTION",
    telegram_user_id: "USER-COLLECTION",
    role: "OWNER",
    enabled: true,
  };
}

function baseInput(text, extra = {}) {
  const user = authorizedUser();
  return {
    update_id: extra.update_id || 93001,
    chat_id: "CHAT-COLLECTION",
    telegram_user_id: "USER-COLLECTION",
    message_id: String(extra.update_id || 93001),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients(),
    client_invoice_ledger: extra.client_invoice_ledger || ledger,
    client_invoice_summary: [],
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function callbackInput(action, draftId, extra = {}) {
  const token = extra.token || "COLLECTPAYTOKEN1";
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 93101,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-COLLECTION",
    callback_message_id: "99",
    source_message_id: "99",
    action_token: {
      token,
      chat_id: "CHAT-COLLECTION",
      draft_id: draftId,
      action,
      expires_at: "2099-01-01T00:00:00.000Z",
      used_at: extra.used_at || null,
      payload: { draft_id: draftId, action, state: "PAYMENT_CONFIRMATION", source_list_kind: "COLLECTION_INVOICES" },
    },
    ...extra,
  });
}

function collectionClientsState(items, overrides = {}) {
  return {
    state: "COLLECTION_CLIENTS",
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "COLLECTION_CLIENTS",
        chat_id: "CHAT-COLLECTION",
        telegram_user_id: "USER-COLLECTION",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: overrides.context_expires_at || overrides.expires_at || "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
      },
    },
  };
}

function collectionInvoicesState(items, overrides = {}) {
  return {
    state: "COLLECTION_INVOICES",
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "COLLECTION_INVOICES",
        chat_id: "CHAT-COLLECTION",
        telegram_user_id: "USER-COLLECTION",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: overrides.context_expires_at || overrides.expires_at || "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
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
        items: [{ visibleIndex: 1, draft_id: "DRAFT-APPROVED-001" }],
      },
    },
  };
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text);
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data);
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const checks = [];

function check(name, fn) {
  try {
    checks.push({ name, pass: true, value: fn() || "" });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("cobranza_default_muestra_solo_clientes_con_saldo_abierto", () => {
  const result = executeCode(handleCode, baseInput("cobranza", { update_id: 93002 }));
  assert.strictEqual(result.action, "COLLECTION_CLIENTS");
  assert.strictEqual(result.screen_id, "COLLECTION_CLIENTS");
  assert(result.telegram_message.includes("Real Bilbao"));
  assert(result.telegram_message.includes("Privada Rivera"));
  assert(result.telegram_message.includes("Privada Aretza"));
  assert(!result.telegram_message.includes("Cliente Pagado"));
  assert(!result.telegram_message.includes("Cliente Cancelado"));
  assert(result.persistence_sql.includes('"kind":"COLLECTION_CLIENTS"'));
  return result.action;
});

check("facturas_1_abre_facturas_del_cliente_de_cobranza", () => {
  const state = collectionClientsState([{ client_id: "CLIENT-PARCIAL" }]);
  const result = executeCode(handleCode, baseInput("facturas 1", { update_id: 93003, chat_state: state }));
  assert.strictEqual(result.action, "COLLECTION_INVOICES");
  assert.strictEqual(result.screen_id, "COLLECTION_INVOICES");
  assert(result.telegram_message.includes("Privada Rivera"));
  assert(result.telegram_message.includes("pagar N"));
  assert(result.persistence_sql.includes('"kind":"COLLECTION_INVOICES"'));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return result.action;
});

check("facturas_99_falla_seguro_en_cobranza", () => {
  const state = collectionClientsState([{ client_id: "CLIENT-PARCIAL" }]);
  const result = executeCode(handleCode, baseInput("facturas 99", { update_id: 93004, chat_state: state }));
  assert.strictEqual(result.action, "COLLECTION_CLIENT_INDEX_NOT_FOUND");
  assert.strictEqual(result.screen_id, "RECOVERY");
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return result.action;
});

check("pagar_1_prepara_confirmacion_sin_mutar", () => {
  const state = collectionInvoicesState([{ draft_id: "DRAFT-COLLECT-PARTIAL", client_id: "CLIENT-PARCIAL" }]);
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 93005, chat_state: state }));
  assert.strictEqual(result.action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED");
  assert.strictEqual(result.screen_id, "PAYMENT_CONFIRMATION");
  assert(result.telegram_message.includes("Confirmar pago"));
  assert(result.telegram_message.includes("Saldo abierto"));
  assert(buttonTexts(result).includes("Confirmar pagada"));
  assert(result.persistence_sql.includes("'MARK_PAYMENT_PAID'"));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return result.action;
});

check("confirmacion_pago_marca_pagada_solo_factura_concreta", () => {
  const result = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", "DRAFT-COLLECT-PARTIAL", { update_id: 93006 }));
  assert.strictEqual(result.action, "PAYMENT_STATUS_MARKED_PAID");
  assert(result.telegram_message.includes("Pago actualizado"));
  assert(result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status = 'PAGADO'"));
  assert(result.persistence_sql.includes("draft_id = 'DRAFT-COLLECT-PARTIAL'"));
  assert(!result.persistence_sql.includes("draft_id = 'DRAFT-COLLECT-001'"));
  return result.action;
});

check("doble_confirmacion_token_usado_no_duplica_efecto", () => {
  const result = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", "DRAFT-COLLECT-PARTIAL", {
    update_id: 93007,
    token: "COLLECTPAYUSED1",
    used_at: "2026-06-12T00:00:00.000Z",
  }));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  assert(!result.persistence_sql.includes("INSERT INTO cfdi_payment_status_events"));
  assert(["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_INVALID", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action));
  return result.action;
});

check("pagar_99_falla_seguro", () => {
  const state = collectionInvoicesState([{ draft_id: "DRAFT-COLLECT-PARTIAL", client_id: "CLIENT-PARCIAL" }]);
  const result = executeCode(handleCode, baseInput("pagar 99", { update_id: 93008, chat_state: state }));
  assert.strictEqual(result.action, "COLLECTION_INVOICE_INDEX_NOT_FOUND");
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status"));
  return result.action;
});

check("pagar_sin_contexto_o_contexto_incorrecto_falla_seguro", () => {
  const missing = executeCode(handleCode, baseInput("pagar 1", { update_id: 93009 }));
  assert.strictEqual(missing.action, "PAYMENT_ACTION_REQUIRES_INVOICE_CONTEXT");
  const clientsContext = executeCode(handleCode, baseInput("pagar 1", {
    update_id: 93010,
    chat_state: collectionClientsState([{ client_id: "CLIENT-PARCIAL" }]),
  }));
  assert.strictEqual(clientsContext.action, "PAYMENT_ACTION_REQUIRES_INVOICE_CONTEXT");
  const draftsContext = executeCode(handleCode, baseInput("pagar 1", {
    update_id: 93011,
    chat_state: draftListState(),
  }));
  assert.strictEqual(draftsContext.action, "PAYMENT_ACTION_REQUIRES_INVOICE_CONTEXT");
  return "safe";
});

check("factura_cancelada_o_pagada_no_permite_pago", () => {
  const paidState = collectionInvoicesState([{ draft_id: "DRAFT-COLLECT-PAID", client_id: "CLIENT-PAID" }]);
  const paid = executeCode(handleCode, baseInput("pagar 1", { update_id: 93012, chat_state: paidState }));
  assert.strictEqual(paid.action, "PAYMENT_ACTION_NOT_ALLOWED");
  const cancelledState = collectionInvoicesState([{ draft_id: "DRAFT-COLLECT-CANCEL", client_id: "CLIENT-CANCEL" }]);
  const cancelled = executeCode(handleCode, baseInput("pagar 1", { update_id: 93013, chat_state: cancelledState }));
  assert.strictEqual(cancelled.action, "PAYMENT_ACTION_NOT_ALLOWED");
  return "blocked";
});

check("factura_parcial_permite_pago", () => {
  const state = collectionInvoicesState([{ draft_id: "DRAFT-COLLECT-PARTIAL", client_id: "CLIENT-PARCIAL" }]);
  const result = executeCode(handleCode, baseInput("/pagar 1", { update_id: 93014, chat_state: state }));
  assert.strictEqual(result.action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED");
  return result.action;
});

check("ledger_general_no_muestra_botones_pago_ambiguos", () => {
  const result = executeCode(handleCode, baseInput("cfdi_nav:client_ledger", {
    update_id: 93015,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-LEDGER",
    callback_message_id: "99",
  }));
  assert.strictEqual(result.action, "CLIENT_INVOICE_LEDGER_DEPRECATED");
  const texts = buttonTexts(result);
  assert(!texts.includes("Marcar pagada"), texts.join(","));
  assert(!texts.includes("Marcar parcial"), texts.join(","));
  assert(!texts.includes("Marcar vencida"), texts.join(","));
  assert(!result.persistence_sql.includes("'MARK_PAYMENT_PAID'"));
  return result.action;
});

check("payment_status_dispatch_visible", () => {
  const result = executeCode(handleCode, callbackInput("MARK_PAYMENT_PAID", "DRAFT-COLLECT-001", { update_id: 93016 }));
  assert.strictEqual(result.should_send_telegram, true);
  assert(result.telegram_message.includes("Pago actualizado"));
  assert(result.send_text.includes("Pago actualizado"));
  return result.action;
});

check("clientes_y_drafts_no_se_rompen", () => {
  const clientes = executeCode(handleCode, baseInput("/clientes", { update_id: 93017 }));
  assert.strictEqual(clientes.action, "COMMAND_CLIENTES");
  const pendientes = executeCode(handleCode, baseInput("/pendientes", { update_id: 93018, recent_drafts: [invoice({ status: "PENDIENTE" })] }));
  assert.strictEqual(pendientes.action, "COMMAND_PENDIENTES");
  const aprobadas = executeCode(handleCode, baseInput("/aprobadas", { update_id: 93019, recent_drafts: [invoice({ status: "APROBADO", invoice_status: "APROBADO", payment_status: "NO_APLICA" })] }));
  assert.strictEqual(aprobadas.action, "COMMAND_APROBADAS");
  return "regression_ok";
});

check("watcher_audit_terms_present", () => {
  assert(workflowText.includes("COLLECTION_CLIENTS"));
  assert(workflowText.includes("COLLECTION_INVOICES"));
  assert(workflowText.includes("PAYMENT_ACTION_CONFIRMATION_REQUIRED"));
  assert(workflowText.includes("DEFERRED_PROVIDER_PAYMENT_RECONCILIATION"));
  for (const callbackData of callbacks(executeCode(handleCode, baseInput("cobranza", { update_id: 93020 })))) {
    assert(callbackData.length <= 32, callbackData);
  }
  return "terms_present";
});

console.log("Telegram Actionable Collection Flow");
for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
console.log(`PASS total: ${checks.filter((item) => item.pass).length}/${checks.length}`);
if (checks.some((item) => !item.pass)) process.exit(1);

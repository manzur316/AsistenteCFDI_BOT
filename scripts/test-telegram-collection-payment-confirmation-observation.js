const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = workflow.nodes.find((item) => item.name === "Handle Commands And Scoring").parameters.jsCode;
const checks = [];

function executeCode(code, input) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath: "data/concepts.normalized.json",
        runnerSecret: "TEST_SECRET",
      },
    },
  };
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, nodeContext, () => [], 0)[0].json;
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

function invoice(overrides = {}) {
  return {
    client_id: "CLIENT-PAYMENT-OBS",
    client_display: "Real Bilbao",
    draft_id: "DRAFT-PAYMENT-OBS-001",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    total: 1000,
    payment_amount_paid: 0,
    updated_at: "2026-06-13T10:00:00Z",
    ...overrides,
  };
}

function collectionInvoicesState(items) {
  return {
    state: "COLLECTION_INVOICES",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "COLLECTION_INVOICES",
        chat_id: "CHAT-PAYMENT-OBS",
        telegram_user_id: "USER-PAYMENT-OBS",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const ledger = extra.client_invoice_ledger || [invoice()];
  return {
    update_id: extra.update_id || 101001,
    chat_id: "CHAT-PAYMENT-OBS",
    telegram_user_id: "USER-PAYMENT-OBS",
    message_id: String(extra.update_id || 101001),
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [{ client_id: "CLIENT-PAYMENT-OBS", display_name: "Real Bilbao", enabled: true, aliases: [] }],
    client_invoice_ledger: ledger,
    client_invoice_summary: [],
    tax_rules: [],
    recent_drafts: [],
    provider_invoice_links: [],
    document_delivery_ledger: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "MESSAGE",
    callback_query_id: "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-PAYMENT-OBS",
      telegram_chat_id: "CHAT-PAYMENT-OBS",
      telegram_user_id: "USER-PAYMENT-OBS",
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-PAYMENT-OBS",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? collectionInvoicesState([{ draft_id: ledger[0].draft_id, client_id: ledger[0].client_id }]),
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

check("pagar_n_abre_confirmacion_no_marca_pagada_directo", () => {
  const result = executeCode(handleCode, baseInput("pagar 1"));
  assert.strictEqual(result.action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED");
  assert.strictEqual(result.screen_id, "COLLECTION_PAYMENT_CONFIRM");
  assert(result.telegram_message.includes("Confirmar pago local"), result.telegram_message);
  assert(result.telegram_message.includes("No actualiza SAT, PAC ni proveedor"), result.telegram_message);
  assert(result.telegram_message.includes("No emite complemento de pago"), result.telegram_message);
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status = 'PAGADO'"), result.persistence_sql);
});

check("confirmacion_muestra_confirmar_pagada", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 101002 }));
  assert(buttonTexts(result).includes("Confirmar pagada"), buttonTexts(result).join(","));
  assert(result.persistence_sql.includes("'MARK_PAYMENT_PAID'"), result.persistence_sql);
});

check("sin_callback_confirmacion_no_reporta_pago_aplicado", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 101003 }));
  assert(!result.telegram_message.includes("Pago actualizado"), result.telegram_message);
  assert(!result.telegram_message.includes("Pagada"), result.telegram_message);
  assert.notStrictEqual(result.action, "PAYMENT_STATUS_MARKED_PAID");
});

check("confirmacion_no_afirma_actualizacion_pac_proveedor", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 101004 }));
  const text = `${result.telegram_message}\n${result.persistence_sql}`;
  assert(!/PAC actualizado|proveedor actualizado|complemento de pago emitido/i.test(text), text);
});

check("pago_no_se_muestra_pagado_hasta_accion_confirmada", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 101005 }));
  assert(!/Estado:\s*Pagada/i.test(result.telegram_message), result.telegram_message);
  assert(!/Pago:\s*Pagada/i.test(result.telegram_message), result.telegram_message);
});

check("acepta_pagar_1_y_documenta_deuda_2_4m", () => {
  assert(workflowPath.endsWith("cfdi_telegram_local_ingest.n8n.json"));
  assert.strictEqual(executeCode(handleCode, baseInput("pagar 1", { update_id: 101006 })).action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED");
  assert(fs.readFileSync(workflowPath, "utf8").includes("MARK_PAYMENT_PAID"));
  return "COLLECTION-PAYMENT-CONFIRMATION-001 repaired in Slice 2.4S";
});

console.log("Telegram Collection Payment Confirmation Observation Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

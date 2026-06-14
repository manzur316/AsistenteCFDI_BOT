const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  classifyExecution,
} = require("./qa/telegram-ui-session-watch");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "data/concepts.normalized.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = workflow.nodes.find((item) => item.name === "Handle Commands And Scoring").parameters.jsCode;
const checks = [];

function executeCode(input) {
  const nodeContext = {
    "Set Config": {
      json: {
        workflowVersion: "CFDI_LOCAL_INGEST_V1",
        catalogPath,
        runnerSecret: "TEST_SECRET",
      },
    },
  };
  return new Function("require", "$json", "$node", "$items", "$itemIndex", handleCode)(require, input, nodeContext, () => [], 0)[0].json;
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function invoice(overrides = {}) {
  return {
    client_id: "CLIENT-REAL-BILBAO",
    client_display: "Real Bilbao",
    draft_id: "DRAFT-COLLECTION-LOCAL-001",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    total: 928,
    payment_amount_paid: 0,
    payment_paid_at: "",
    provider_invoice_link_id: "PIL-COLLECTION-001",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_serie: "F",
    provider_folio: "72",
    provider_uuid: "12345678-1234-1234-1234-123456789abc",
    provider_invoice_uid: "FAC-SBX-UID-ABCDEFGH",
    provider_invoice_id: "FAC-SBX-ID-ABCDEFGH",
    xml_downloaded: true,
    pdf_downloaded: true,
    updated_at: "2026-06-13T10:00:00Z",
    ...overrides,
  };
}

const folioInvoice = invoice();
const fallbackInvoice = invoice({
  draft_id: "DRAFT-COLLECTION-LOCAL-002",
  provider_invoice_link_id: "PIL-COLLECTION-002",
  provider_serie: "",
  provider_folio: "",
  provider_uuid: "",
  provider_invoice_uid: "",
  provider_invoice_id: "",
  total: 1160,
});
const paidInvoice = invoice({
  draft_id: "DRAFT-COLLECTION-LOCAL-PAID",
  payment_status: "PAGADO",
  payment_amount_paid: 928,
  payment_paid_at: "2026-06-14T10:00:00Z",
  provider_status: "active",
});
const cancelledInvoice = invoice({
  draft_id: "DRAFT-COLLECTION-LOCAL-CANCELLED",
  invoice_status: "SANDBOX_CANCELADO",
  payment_status: "NO_APLICA",
  payment_amount_paid: 0,
});

function clients() {
  return [{ client_id: "CLIENT-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] }];
}

function authorizedUser() {
  return {
    user_id: "OWNER-COLLECTION",
    telegram_chat_id: "CHAT-COLLECTION",
    telegram_user_id: "USER-COLLECTION",
    role: "OWNER",
    enabled: true,
  };
}

function baseInput(text, extra = {}) {
  const user = authorizedUser();
  return {
    update_id: extra.update_id || 240001,
    chat_id: "CHAT-COLLECTION",
    telegram_user_id: "USER-COLLECTION",
    message_id: String(extra.update_id || 240001),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients(),
    client_invoice_ledger: extra.client_invoice_ledger || [folioInvoice, fallbackInvoice],
    client_invoice_summary: [],
    recent_drafts: extra.recent_drafts || [],
    provider_invoice_links: [],
    document_delivery_ledger: [],
    tax_rules: [],
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

function collectionClientsState(items) {
  return {
    state: "COLLECTION_CLIENTS",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "COLLECTION_CLIENTS",
        chat_id: "CHAT-COLLECTION",
        telegram_user_id: "USER-COLLECTION",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
      },
    },
  };
}

function collectionInvoicesState(items) {
  return {
    state: "COLLECTION_INVOICES",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "COLLECTION_INVOICES",
        chat_id: "CHAT-COLLECTION",
        telegram_user_id: "USER-COLLECTION",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
      },
    },
  };
}

function callbackInput(row, overrides = {}) {
  const token = overrides.token || "PAYLOCALCONF01";
  return baseInput(`cfdi:${token}`, {
    update_id: overrides.update_id || 240100,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-PAYLOCAL",
    callback_message_id: "901",
    source_message_id: "901",
    client_invoice_ledger: overrides.client_invoice_ledger || [row],
    action_token: {
      token,
      chat_id: "CHAT-COLLECTION",
      draft_id: row.draft_id,
      action: "MARK_PAYMENT_PAID",
      expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: overrides.used_at || null,
      payload: {
        action: "MARK_PAYMENT_PAID",
        draft_id: row.draft_id,
        provider_invoice_link_id: row.provider_invoice_link_id,
        display_id: "F-72",
        client_id: row.client_id,
        amount_total: row.total,
        current_payment_status: row.payment_status,
        target_payment_status: "PAGADO",
        source_module: "COLLECTION",
        source_capability: "LOCAL_PAYMENT_STATUS",
        screen_id: "COLLECTION_PAYMENT_CONFIRM",
        state: "COLLECTION_PAYMENT_CONFIRM",
        provider_update: false,
        pac_update: false,
      },
    },
    ...overrides,
  });
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function buttonCallbacks(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data).filter(Boolean);
}

function allButtonsHaveHandlers(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().every((button) => Boolean(button.callback_data));
}

function nodeRun(json) {
  return [{ data: { main: [[{ json }]] } }];
}

function execution({ handle = {}, plan = {}, startedAt = "2026-06-13T12:00:00.000Z", stoppedAt = "2026-06-13T12:00:01.000Z" } = {}) {
  return {
    id: `exec-${handle.action || "test"}`,
    workflowId: "workflow-test",
    finished: true,
    status: "success",
    startedAt,
    stoppedAt,
    data: {
      resultData: {
        runData: {
          "Handle Commands And Scoring": nodeRun(handle),
          "Build Telegram Dispatch Plan": nodeRun(plan),
        },
      },
    },
  };
}

function dbMock({ draftRow = null } = {}) {
  return {
    getDraftFull() { return draftRow; },
    getTokensForDraft() { return []; },
    getLedgerFull() { return []; },
    getSendLogs() { return []; },
  };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

const collection = executeCode(baseInput("/cobranza", { update_id: 240001 }));
const invoices = executeCode(baseInput("facturas 1", {
  update_id: 240002,
  chat_state: collectionClientsState([{ client_id: "CLIENT-REAL-BILBAO" }]),
}));
const fallbackList = executeCode(baseInput("facturas 1", {
  update_id: 240003,
  client_invoice_ledger: [fallbackInvoice],
  chat_state: collectionClientsState([{ client_id: "CLIENT-REAL-BILBAO" }]),
}));
const confirm = executeCode(baseInput("pagar 1", {
  update_id: 240004,
  chat_state: collectionInvoicesState([{ draft_id: folioInvoice.draft_id, client_id: folioInvoice.client_id }]),
}));
const confirmAlias = executeCode(baseInput("pagar1", {
  update_id: 240005,
  chat_state: collectionInvoicesState([{ draft_id: folioInvoice.draft_id, client_id: folioInvoice.client_id }]),
}));
const applied = executeCode(callbackInput(folioInvoice, { update_id: 240006 }));
const paidView = executeCode(baseInput("cfdi_nav:pay_paid", {
  update_id: 240012,
  source_kind: "CALLBACK_QUERY",
  callback_query_id: "CB-PAY-PAID",
  callback_message_id: "912",
  client_invoice_ledger: [paidInvoice, folioInvoice],
}));
const cancelledView = executeCode(baseInput("cfdi_nav:pay_cancel", {
  update_id: 240013,
  source_kind: "CALLBACK_QUERY",
  callback_query_id: "CB-PAY-CANCEL",
  callback_message_id: "913",
  client_invoice_ledger: [cancelledInvoice, paidInvoice],
}));

check("1_cobranza_abre_menu_lista", () => assert.strictEqual(collection.action, "COLLECTION_CLIENTS"));
check("2_cliente_con_saldo_aparece", () => assert(collection.telegram_message.includes("Real Bilbao"), collection.telegram_message));
check("3_facturas_n_abre_pendientes_cliente", () => assert.strictEqual(invoices.action, "COLLECTION_INVOICES"));
check("4_lista_usa_folio_proveedor", () => assert(invoices.telegram_message.includes("F-72"), invoices.telegram_message));
check("5_lista_no_usa_bor_si_hay_folio", () => assert(!/^1\\.\\s+BOR-/m.test(invoices.telegram_message), invoices.telegram_message));
check("6_sin_folio_usa_fac_sbx", () => assert(/FAC-SBX-[A-Z0-9]+/.test(fallbackList.telegram_message), fallbackList.telegram_message));
check("7_pagar_1_abre_confirmacion", () => assert.strictEqual(confirm.action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED"));
check("8_pagar1_abre_misma_confirmacion", () => assert.strictEqual(confirmAlias.screen_id, "COLLECTION_PAYMENT_CONFIRM"));
check("9_confirmacion_muestra_display_id", () => assert(confirm.telegram_message.includes("Factura: F-72"), confirm.telegram_message));
check("10_confirmacion_muestra_total", () => assert(confirm.telegram_message.includes("$928.00"), confirm.telegram_message));
check("11_confirmacion_dice_local", () => assert(/local/i.test(confirm.telegram_message), confirm.telegram_message));
check("12_confirmacion_dice_no_sat_pac_proveedor", () => assert(confirm.telegram_message.includes("No actualiza SAT, PAC ni proveedor"), confirm.telegram_message));
check("13_confirmacion_dice_no_complemento", () => assert(confirm.telegram_message.includes("No emite complemento de pago"), confirm.telegram_message));
check("14_confirmar_pagada_usa_mark_payment_paid", () => assert(confirm.persistence_sql.includes("'MARK_PAYMENT_PAID'"), confirm.persistence_sql));
check("15_token_source_capability_local_payment", () => assert(confirm.persistence_sql.includes('"source_capability":"LOCAL_PAYMENT_STATUS"'), confirm.persistence_sql));
check("16_token_screen_collection_payment_confirm", () => assert(confirm.persistence_sql.includes('"screen_id":"COLLECTION_PAYMENT_CONFIRM"'), confirm.persistence_sql));
check("17_confirma_persiste_cfdi_drafts_pagado", () => assert(applied.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status = 'PAGADO'"), applied.persistence_sql));
check("18_persiste_provider_payment_status_local", () => assert(applied.persistence_sql.includes("UPDATE provider_invoice_links SET payment_status_local = 'PAGADO'"), applied.persistence_sql));
check("19_no_modifica_payment_status_provider", () => assert(!/payment_status_provider\\s*=/.test(applied.persistence_sql), applied.persistence_sql));
check("20_no_modifica_folio_uuid_provider_ids", () => assert(!/\\b(folio|uuid|provider_invoice_uid|provider_invoice_id)\\s*=/.test(applied.persistence_sql), applied.persistence_sql));
check("21_no_modifica_xml_pdf", () => assert(!/xml_downloaded\\s*=|pdf_downloaded\\s*=/.test(applied.persistence_sql), applied.persistence_sql));
check("22_no_modifica_delivery_ledger", () => assert(!/UPDATE\\s+document_delivery_ledger|INSERT\\s+INTO\\s+document_delivery_ledger/i.test(applied.persistence_sql), applied.persistence_sql));
check("23_no_llama_pac_proveedor", () => assert(!applied.should_execute_sandbox_action && !applied.requested_sandbox_action, JSON.stringify(applied)));
check("24_no_emite_complemento", () => assert(!/complemento.*emitido/i.test(applied.telegram_message + applied.persistence_sql), applied.telegram_message));
check("25_resultado_post_confirmacion_local", () => assert(applied.telegram_message.includes("Pago registrado localmente"), applied.telegram_message));
check("26_resultado_dice_no_sat_pac_proveedor", () => assert(applied.telegram_message.includes("No se actualizo SAT, PAC ni proveedor"), applied.telegram_message));
check("27_resultado_no_deja_pendiente_visible", () => assert(!/Estado local:\\s*Pendiente/i.test(applied.telegram_message), applied.telegram_message));
check("28_pagada_no_aparece_en_pendientes", () => {
  const paidList = executeCode(baseInput("facturas 1", {
    update_id: 240007,
    client_invoice_ledger: [paidInvoice],
    chat_state: collectionClientsState([{ client_id: paidInvoice.client_id }]),
  }));
  assert(!paidList.telegram_message.includes("F-72 | Real Bilbao | $928.00 | Pendiente"), paidList.telegram_message);
});
check("29_ya_pagada_idempotente", () => {
  const result = executeCode(callbackInput({ ...folioInvoice, payment_status: "PAGADO", payment_amount_paid: 928 }, { update_id: 240008 }));
  assert.strictEqual(result.action, "PAYMENT_STATUS_ALREADY_PAGADO");
  assert(result.telegram_message.includes("ya estaba marcada como pagada localmente"), result.telegram_message);
});
check("29b_ver_pagadas_abre_lista_local", () => {
  assert.strictEqual(paidView.action, "COLLECTION_PAID_INVOICES");
  assert(paidView.telegram_message.includes("Facturas pagadas"), paidView.telegram_message);
  assert(!paidView.telegram_message.includes("CLIENT_INVOICE_LEDGER_DEPRECATED"), paidView.telegram_message);
});
check("29c_ver_pagadas_muestra_factura_pagada", () => {
  assert(paidView.telegram_message.includes("F-72"), paidView.telegram_message);
  assert(paidView.telegram_message.includes("Pagada"), paidView.telegram_message);
  assert(paidView.telegram_message.includes("Estado proveedor: active (solo lectura)"), paidView.telegram_message);
});
check("29d_ver_pagadas_no_ofrece_confirmar_pago", () => {
  assert(!buttonTexts(paidView).includes("Confirmar pagada"), buttonTexts(paidView).join(","));
  assert(!paidView.persistence_sql.includes("'MARK_PAYMENT_PAID'"), paidView.persistence_sql);
});
check("29e_resultado_tiene_acceso_a_pagadas", () => {
  assert(buttonTexts(applied).includes("Ver facturas pagadas"), buttonTexts(applied).join(","));
  assert(buttonCallbacks(applied).includes("cfdi_nav:pay_paid"), buttonCallbacks(applied).join(","));
});
check("29f_ver_canceladas_abre_lista_solo_lectura", () => {
  assert.strictEqual(cancelledView.action, "COLLECTION_CANCELLED_INVOICES");
  assert(cancelledView.telegram_message.includes("Facturas canceladas"), cancelledView.telegram_message);
  assert(!cancelledView.persistence_sql.includes("'MARK_PAYMENT_PAID'"), cancelledView.persistence_sql);
});
check("30_token_expirado_no_aplica_pago", () => {
  const result = executeCode(callbackInput(folioInvoice, { update_id: 240009, token: "PAYLOCALOLD001", expires_at: "2000-01-01T00:00:00.000Z" }));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status = 'PAGADO'"), result.persistence_sql);
});
check("31_token_usado_no_duplica_pago", () => {
  const result = executeCode(callbackInput(folioInvoice, { update_id: 240010, token: "PAYLOCALUSED01", used_at: "2026-06-13T10:00:00.000Z" }));
  assert(!result.persistence_sql.includes("UPDATE cfdi_drafts SET payment_status = 'PAGADO'"), result.persistence_sql);
});
check("32_pagar_fuera_contexto_ayuda_segura", () => {
  const result = executeCode(baseInput("pagar 1", { update_id: 240011, chat_state: null }));
  assert.strictEqual(result.action, "PAYMENT_ACTION_REQUIRES_INVOICE_CONTEXT");
});
check("33_no_rfc_completo", () => assert(!/[A-ZÑ&]{3,4}\\d{6}[A-Z0-9]{3}/.test(invoices.telegram_message + confirm.telegram_message + applied.telegram_message)));
check("34_no_uuid_completo", () => assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(invoices.telegram_message + confirm.telegram_message + applied.telegram_message)));
check("35_no_draft_como_identidad_principal", () => assert(!/^\\d+\\.\\s+DRAFT-/m.test(invoices.telegram_message + fallbackList.telegram_message)));
check("36_no_html_crudo", () => assert(!new RegExp("</?(?:b|i|code|pre|a)\\b", "i").test(invoices.telegram_message + confirm.telegram_message + applied.telegram_message)));
check("37_no_newline_literal", () => assert(!/\\\\n/.test(invoices.telegram_message + confirm.telegram_message + applied.telegram_message)));
check("37b_vistas_pagadas_canceladas_sin_datos_sensibles", () => {
  const text = paidView.telegram_message + cancelledView.telegram_message;
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/^\\d+\\.\\s+DRAFT-/m.test(text), text);
  assert(!new RegExp("</?(?:b|i|code|pre|a)\\b", "i").test(text), text);
  assert(!/\\\\n/.test(text), text);
});
check("38_no_botones_sin_handler", () => assert(allButtonsHaveHandlers(collection) && allButtonsHaveHandlers(invoices) && allButtonsHaveHandlers(confirm) && allButtonsHaveHandlers(applied) && allButtonsHaveHandlers(paidView) && allButtonsHaveHandlers(cancelledView)));
check("39_watcher_payment_without_state_change", () => {
  const result = classifyExecution(execution({
    handle: {
      action: "PAYMENT_STATUS_MARKED_PAID",
      callback_action: "MARK_PAYMENT_PAID",
      draft_id: folioInvoice.draft_id,
      display_id: "F-72",
      telegram_message: "Pago registrado localmente",
    },
  }), {
    db: dbMock({ draftRow: folioInvoice }),
    previousDraftSnapshots: new Map([[folioInvoice.draft_id, folioInvoice]]),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
  assert(failureCodes(result).includes("PAYMENT_CONFIRM_WITHOUT_STATE_CHANGE"));
});
check("40_watcher_boundary_missing", () => {
  const result = classifyExecution(execution({
    handle: {
      action: "PAYMENT_ACTION_CONFIRMATION_REQUIRED",
      screen_id: "COLLECTION_PAYMENT_CONFIRM",
      telegram_message: "Confirmar pago\\nFactura: F-72",
    },
  }), { db: null, previousDraftSnapshots: new Map(), previousTokenSnapshots: new Map(), counters: {} });
  assert(failureCodes(result).includes("PAYMENT_CONFIRM_PROVIDER_BOUNDARY_MISSING"));
});
check("41_watcher_collection_uses_bor_with_provider", () => {
  const result = classifyExecution(execution({
    handle: {
      action: "COLLECTION_INVOICES",
      screen_id: "COLLECTION_INVOICES",
      provider_folio: "72",
      telegram_message: "Facturas pendientes\\n\\n1. BOR-0001 | Real Bilbao | $928.00 | Pendiente",
    },
  }), { db: dbMock({ draftRow: { ...folioInvoice, provider_folio: "72" } }), previousDraftSnapshots: new Map(), previousTokenSnapshots: new Map(), counters: {} });
  assert(failureCodes(result).includes("COLLECTION_USES_LOCAL_DRAFT_ID_WHEN_PROVIDER_ID_AVAILABLE"));
});
check("42_watcher_paid_still_listed_pending", () => {
  const counters = {};
  classifyExecution(execution({
    handle: {
      action: "PAYMENT_STATUS_MARKED_PAID",
      callback_action: "MARK_PAYMENT_PAID",
      draft_id: folioInvoice.draft_id,
      display_id: "F-72",
      payment_status: "PAGADO",
      telegram_message: "Pago registrado localmente\\nFactura: F-72",
    },
  }), {
    db: dbMock({ draftRow: { ...folioInvoice, payment_status: "PAGADO" } }),
    previousDraftSnapshots: new Map([[folioInvoice.draft_id, folioInvoice]]),
    previousTokenSnapshots: new Map(),
    counters,
  });
  const listed = classifyExecution(execution({
    handle: {
      action: "COLLECTION_INVOICES",
      screen_id: "COLLECTION_INVOICES",
      telegram_message: "Facturas pendientes\\n\\n1. F-72 | Real Bilbao | $928.00 | Pendiente",
    },
  }), { db: null, previousDraftSnapshots: new Map(), previousTokenSnapshots: new Map(), counters });
  assert(failureCodes(listed).includes("PAYMENT_CONFIRMED_BUT_STILL_LISTED_PENDING"));
});
check("43_repo_safety_pass", () => {
  const output = execFileSync("node", ["scripts/test-repo-safety.js"], { cwd: root, encoding: "utf8" });
  assert(output.includes("Resumen: 60/60 PASS"), output);
});

console.log("Telegram Collection Payment Local State And Provider Boundary Tests");
for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");
const { spawnSync } = require("child_process");

const {
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const { classifyExecution } = require("./qa/telegram-ui-session-watch");

const handleCode = getNodeCode("Handle Commands And Scoring");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";
const freeText = "Privada Bilbao, revise camaras Hikvision por 800 + IVA";
const checks = [];

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

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => String(button.text || ""))
    .filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => String(button.callback_data || ""))
    .filter(Boolean);
}

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F72",
    draft_id: overrides.draft_id || "DRAFT-20260614-FREE-TEXT",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-72" : overrides.provider_folio,
    provider_serie: "",
    provider_uuid: "",
    provider_invoice_uid: overrides.provider_invoice_uid || "UID-F72-001",
    provider_invoice_id: overrides.provider_invoice_id || "PACINV-F72-001",
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: "2026-06-14T10:00:00.000Z",
    sandbox_pac_summary: {},
  };
}

const downloaded = providerLink();
const downloadReady = providerLink({
  artifact_status: "DOWNLOAD_READY",
  xml_downloaded: false,
  pdf_downloaded: false,
});

function draftForLink(link) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-FREE-TEXT";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.invoice_status = link.invoice_status;
  draft.payment_status = link.payment_status;
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: link.artifact_status,
    uuid: "",
    cfdi_uid: link.provider_invoice_uid,
    pac_invoice_id: link.provider_invoice_id,
    folio: link.provider_folio,
    xml_downloaded: link.xml_downloaded === true,
    pdf_downloaded: link.pdf_downloaded === true,
    xml_content_valid: link.xml_downloaded === true,
    pdf_content_valid: link.pdf_downloaded === true,
  };
  return draft;
}

function documentListState(rows) {
  return {
    state: "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "DOCUMENTS_RECENT",
        chat_id: "CHAT-FREE-TEXT",
        telegram_user_id: "USER-FREE-TEXT",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        source_module: "DOCUMENTS",
        return_to: "DOCUMENTS_MENU",
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType: "DOCUMENT",
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
          display_id: row.provider_folio || "F-72",
        })),
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
        chat_id: "CHAT-FREE-TEXT",
        telegram_user_id: "USER-FREE-TEXT",
        page: 1,
        page_size: 5,
        total_items: items.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: items.map((item, index) => ({ visibleIndex: index + 1, ...item })),
      },
    },
  };
}

const collectionInvoice = {
  client_id: "CLIENT-REAL-BILBAO",
  client_display: "Real Bilbao",
  draft_id: "DRAFT-COLLECT-001",
  invoice_status: "SANDBOX_TIMBRADO",
  payment_status: "PENDIENTE",
  total: 1000,
  payment_amount_paid: 0,
  updated_at: "2026-06-10T10:00:00Z",
};

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? [downloaded] : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 150001,
    max_seen_update_id: extra.update_id || 150001,
    chat_id: "CHAT-FREE-TEXT",
    telegram_user_id: "USER-FREE-TEXT",
    message_id: String(extra.update_id || 150001),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [
      { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: ["privada bilbao"] },
      { client_id: "CLIENT-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, aliases: [] },
    ],
    tax_rules: [],
    recent_drafts: rows.map(draftForLink),
    provider_invoice_links: rows,
    document_delivery_ledger: [],
    client_invoice_ledger: [collectionInvoice],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-FREE-TEXT",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-FREE-TEXT",
      telegram_user_id: "USER-FREE-TEXT",
    },
    security_user_id: "OWNER-FREE-TEXT",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function runMessage(text, chatState, extra = {}) {
  return executeCode(handleCode, baseInput(text, {
    chat_state: chatState,
    update_id: extra.update_id || 150100,
    ...extra,
  }));
}

function recoveryCallbackInput({ token, action, sourceModule, screenId, usedAt = null, expiresAt = "2000-01-01T00:00:00.000Z" }) {
  return baseInput(`cfdi:${token}`, {
    update_id: 151000,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CB-${token}`,
    callback_message_id: "88",
    action_token: {
      token,
      chat_id: "CHAT-FREE-TEXT",
      draft_id: downloaded.draft_id,
      action,
      used_at: usedAt,
      expires_at: expiresAt,
      payload: {
        action,
        draft_id: downloaded.draft_id,
        provider_invoice_link_id: downloaded.provider_invoice_link_id,
        display_id: "F-72",
        source_module: sourceModule,
        source_capability: "DOCUMENT_DELIVERY",
        state: screenId,
        screen_id: screenId,
      },
    },
  });
}

function classify(sample) {
  return classifyExecution(sample, {
    db: null,
    args: {},
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
}

function execution({ id, sourceKind, text, action, telegramMessage }) {
  return {
    id,
    workflowId: "workflow-test",
    finished: true,
    status: "success",
    data: {
      resultData: {
        runData: {
          "Handle Commands And Scoring": [{
            data: {
              main: [[{
                json: {
                  source_kind: sourceKind,
                  text,
                  action,
                  telegram_message: telegramMessage,
                },
              }]],
            },
          }],
          "Build Telegram Dispatch Plan": [{
            data: {
              main: [[{
                json: {
                  source_kind: sourceKind,
                  text,
                  action,
                  telegram_message: telegramMessage,
                },
              }]],
            },
          }],
        },
      },
    },
  };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

function assertInvoiceWizard(result) {
  assert.strictEqual(result.action, "NEEDS_CONFIRM_DRAFT", result.telegram_message);
  const labels = buttonTexts(result);
  for (const label of ["Confirmar", "Editar", "Cancelar", "Ver detalle"]) assert(labels.includes(label), labels.join(","));
  assertNoButtonRecoveryCopy(result);
}

function assertNoButtonRecoveryCopy(result) {
  const text = String(result.telegram_message || "");
  assert(!/El boton de|El bot[oó]n de|bot[oó]n ya no corresponde|accion vigente|acci[oó]n vigente/i.test(text), text);
}

function assertNoRecoveryKeyboard(result) {
  const labels = buttonTexts(result).join(",");
  assert(!/Documentos|Facturas|Menu principal|Men[uú] principal|Ayuda/.test(labels), labels);
}

function assertNoUnsafeUx(result) {
  const text = String(result.telegram_message || "");
  assert(!/DRAFT-/i.test(text), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!text.includes("\\n"), text);
  if (/<[a-z][\s\S]*>/i.test(text)) assert.strictEqual(String(result.parse_mode || "").toUpperCase(), "HTML", text);
}

function assertNoButtonsWithoutHandler(result) {
  for (const callbackData of callbackDataList(result)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:|^cfdi_doc:/.test(callbackData), callbackData);
  }
}

const states = {
  documentsRecent: documentListState([downloaded]),
  documentDetail: { state: "DOCUMENT_DETAIL", expires_at: "2099-01-01T00:00:00.000Z", context: {} },
  invoiceDetail: { state: "INVOICE_DETAIL", expires_at: "2099-01-01T00:00:00.000Z", context: {} },
  collectionInvoices: collectionInvoicesState([{ draft_id: collectionInvoice.draft_id, client_id: collectionInvoice.client_id }]),
  productMenu: { state: "PRODUCT_MENU_MAIN", expires_at: "2099-01-01T00:00:00.000Z", context: {} },
  callbackRecovered: { state: "CALLBACK_TOKEN_CONTEXT_RECOVERED", expires_at: "2099-01-01T00:00:00.000Z", context: {} },
};

check("1_texto_libre_desde_documentos_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.documentsRecent, { update_id: 150101 })));
check("2_texto_libre_desde_document_detail_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.documentDetail, { update_id: 150102 })));
check("3_texto_libre_desde_invoice_detail_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.invoiceDetail, { update_id: 150103 })));
check("4_texto_libre_desde_cobranza_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.collectionInvoices, { update_id: 150104 })));
check("5_texto_libre_desde_product_menu_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.productMenu, { update_id: 150105 })));
check("6_texto_libre_desde_recuperacion_inicia_wizard", () => assertInvoiceWizard(runMessage(freeText, states.callbackRecovered, { update_id: 150106 })));
check("7_texto_observado_no_muestra_boton", () => assertNoButtonRecoveryCopy(runMessage(freeText, states.documentsRecent, { update_id: 150107 })));
check("8_message_libre_no_muestra_pantalla_anterior_documentos", () => {
  const result = runMessage(freeText, states.documentsRecent, { update_id: 150108 });
  assert(!/Pantalla anterior:\s*Documentos/i.test(result.telegram_message), result.telegram_message);
});
check("9_message_libre_no_muestra_teclado_recuperacion", () => assertNoRecoveryKeyboard(runMessage(freeText, states.documentsRecent, { update_id: 150109 })));
check("10_message_documentos_abre_documentos", () => assert.strictEqual(runMessage("/documentos", null, { update_id: 150110 }).action, "DOCUMENTS_RECENT_LIST"));
check("11_message_facturas_abre_facturas", () => assert.strictEqual(runMessage("/facturas", null, { update_id: 150111 }).action, "INVOICES_RECENT_LIST"));
check("12_message_borradores_abre_borradores", () => assert.strictEqual(runMessage("/borradores", null, { update_id: 150112 }).action, "DRAFTS_MENU"));
check("13_ver_1_desde_documentos_abre_detalle", () => assert.strictEqual(runMessage("ver 1", documentListState([downloadReady]), { provider_invoice_links: [downloadReady], update_id: 150113 }).action, "DOCUMENT_DETAIL"));
check("14_descargar_1_desde_documentos_prepara_descarga", () => assert.strictEqual(runMessage("descargar 1", documentListState([downloadReady]), { provider_invoice_links: [downloadReady], update_id: 150114 }).action, "DOCUMENT_DOWNLOAD_CONFIRM"));
check("15_enviar_1_desde_documentos_prepara_envio", () => assert.strictEqual(runMessage("enviar 1", states.documentsRecent, { update_id: 150115 }).action, "DOCUMENT_DELIVERY_CONFIRM"));
check("16_correo_1_desde_documentos_prepara_correo", () => {
  const result = runMessage("correo 1", states.documentsRecent, { update_id: 150116 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(/correo/i.test(result.telegram_message), result.telegram_message);
});
check("17_canal_1_desde_documentos_prepara_canal", () => {
  const result = runMessage("canal 1", states.documentsRecent, { update_id: 150117 });
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(/canal/i.test(result.telegram_message), result.telegram_message);
});
check("18_pagar_1_desde_cobranza_abre_confirmacion", () => assert.strictEqual(runMessage("pagar 1", states.collectionInvoices, { update_id: 150118 }).action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED"));
check("19_pagar1_alias_abre_confirmacion", () => assert.strictEqual(runMessage("pagar1", states.collectionInvoices, { update_id: 150119 }).action, "PAYMENT_ACTION_CONFIRMATION_REQUIRED"));
check("20_callback_expirado_documentos_muestra_recuperacion", () => {
  const result = executeCode(handleCode, recoveryCallbackInput({
    token: "OLDDOCBTN001",
    action: "VIEW_DOCUMENT_DETAIL",
    sourceModule: "DOCUMENTS",
    screenId: "DOCUMENTS_RECENT_LIST",
  }));
  assert.strictEqual(result.source_kind, "CALLBACK_QUERY");
  assert(["CALLBACK_TOKEN_INVALID", "CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action), result.action);
  const labels = buttonTexts(result).join(",");
  assert(/Documentos/.test(labels) && /Facturas/.test(labels) && /Menu principal|Men[uú] principal/.test(labels), labels);
});
check("21_callback_usado_facturas_muestra_recuperacion", () => {
  const result = executeCode(handleCode, recoveryCallbackInput({
    token: "OLDFACBTN001",
    action: "VIEW_INVOICE_DETAIL",
    sourceModule: "FACTURAS",
    screenId: "INVOICES_RECENT_LIST",
    usedAt: "2026-06-14T10:00:00.000Z",
    expiresAt: "2099-01-01T00:00:00.000Z",
  }));
  assert.strictEqual(result.source_kind, "CALLBACK_QUERY");
  assert(["CALLBACK_TOKEN_INVALID", "CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(result.action), result.action);
});
check("22_callback_invalido_no_inicia_wizard", () => {
  const result = executeCode(handleCode, baseInput("cfdi:missingtoken", {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "CB-MISSING",
    callback_message_id: "90",
    action_token: null,
    update_id: 150122,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  assert.notStrictEqual(result.action, "NEEDS_CONFIRM_DRAFT");
});
check("23_estado_modal_text_input_captura_texto", () => {
  const result = runMessage("Bilbao", {
    state: "AWAITING_CLIENT_SEARCH",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      client_query: "Bilbao",
      pending_invoice_context: {
        original_text: "Servicio tecnico CCTV privada X 1200 + IVA",
        client_query: "Bilbao",
      },
    },
  }, { update_id: 150123 });
  assert.strictEqual(result.action, "CLIENT_SEARCH_OPTIONS", result.telegram_message);
});
check("24_estado_navegacion_no_captura_texto_libre", () => assertInvoiceWizard(runMessage(freeText, states.productMenu, { update_id: 150124 })));
check("25_watcher_detecta_free_text_hijacked", () => {
  const result = classify(execution({
    id: "exec-free-hijack",
    sourceKind: "MESSAGE",
    text: freeText,
    action: "CALLBACK_TOKEN_CONTEXT_RECOVERED",
    telegramMessage: "El boton de Documentos ya no corresponde a una accion vigente.",
  }));
  assert(failureCodes(result).includes("FREE_TEXT_HIJACKED_BY_CALLBACK_RECOVERY"));
});
check("26_watcher_detecta_copy_boton_en_message", () => {
  const result = classify(execution({
    id: "exec-free-button-copy",
    sourceKind: "MESSAGE",
    text: freeText,
    action: "IDLE_HELP",
    telegramMessage: "El boton de Facturas ya no corresponde a una accion vigente.",
  }));
  assert(failureCodes(result).includes("BUTTON_RECOVERY_COPY_ON_MESSAGE"));
});
check("27_watcher_no_marca_callback_invalido_real", () => {
  const result = classify(execution({
    id: "exec-real-callback-invalid",
    sourceKind: "CALLBACK_QUERY",
    text: "cfdi:oldtoken",
    action: "CALLBACK_TOKEN_INVALID",
    telegramMessage: "El boton de Documentos ya no corresponde a una accion vigente.",
  }));
  const codes = failureCodes(result);
  assert(!codes.includes("FREE_TEXT_HIJACKED_BY_CALLBACK_RECOVERY"), codes.join(","));
  assert(!codes.includes("BUTTON_RECOVERY_COPY_ON_MESSAGE"), codes.join(","));
});
check("28_no_hay_html_crudo", () => {
  [
    runMessage(freeText, states.documentsRecent, { update_id: 150128 }),
    runMessage("canal 1", states.documentsRecent, { update_id: 150129 }),
  ].forEach(assertNoUnsafeUx);
});
check("29_no_hay_newline_literal", () => {
  [
    runMessage(freeText, states.documentsRecent, { update_id: 150130 }),
    executeCode(handleCode, recoveryCallbackInput({
      token: "OLDDOCBTN002",
      action: "VIEW_DOCUMENT_DETAIL",
      sourceModule: "DOCUMENTS",
      screenId: "DOCUMENTS_RECENT_LIST",
    })),
  ].forEach(assertNoUnsafeUx);
});
check("30_no_hay_botones_sin_handler", () => {
  [
    runMessage(freeText, states.documentsRecent, { update_id: 150131 }),
    runMessage("canal 1", states.documentsRecent, { update_id: 150132 }),
    runMessage("/documentos", null, { update_id: 150133 }),
  ].forEach(assertNoButtonsWithoutHandler);
});
check("31_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Free Text Precedence And Callback Recovery Boundary Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

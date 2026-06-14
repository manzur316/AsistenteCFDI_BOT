const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  normalizeProviderInvoiceIdentity,
} = require("./lib/provider-contracts/provider-contract-index");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function getNode(workflow, name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}`);
  return node;
}

function executeCode(code, input) {
  return new Function("require", "$json", "$node", "$items", "$itemIndex", code)(require, input, {}, () => [], 0)[0].json;
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function client(id, name) {
  return {
    client_id: id,
    display_name: name,
    razon_social: name,
    enabled: true,
    validated_by_human: true,
    aliases: [{ alias: name, normalized_alias: name.toLowerCase(), weight: 100 }],
  };
}

const clients = [client("CLI-REAL-BILBAO", "Real Bilbao")];

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-PLACEHOLDER",
    draft_id: overrides.draft_id || "DRAFT-20260612-5412",
    client_id: "CLI-REAL-BILBAO",
    client_display: "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio ?? "",
    provider_serie: overrides.provider_serie ?? "",
    provider_uuid: overrides.provider_uuid ?? "",
    provider_invoice_uid: overrides.provider_invoice_uid ?? "",
    provider_invoice_id: overrides.provider_invoice_id ?? "",
    sandbox_pac_summary: {
      uuid: overrides.provider_uuid ?? "",
      cfdi_uid: overrides.provider_invoice_uid ?? "",
      pac_invoice_id: overrides.provider_invoice_id ?? "",
      artifact_status: overrides.artifact_status || "DOWNLOAD_READY",
    },
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    artifact_status: overrides.artifact_status || "DOWNLOAD_READY",
    xml_downloaded: overrides.xml_downloaded === true,
    pdf_downloaded: overrides.pdf_downloaded === true,
    total: 928,
    updated_at: "2026-06-12T10:00:00.000Z",
  };
}

function approvedDraft(overrides = {}) {
  return {
    draft_id: overrides.draft_id || "DRAFT-20260612-6001",
    status: "APROBADO",
    invoice_status: overrides.invoice_status || "",
    payment_status: "NO_APLICA",
    client_id: "CLI-REAL-BILBAO",
    client_snapshot: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao" },
    title: "Servicio listo",
    total: 928,
    updated_at: "2026-06-12T09:00:00.000Z",
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99501,
    chat_id: "CHAT-CONTEXT",
    telegram_user_id: "USER-CONTEXT",
    message_id: "MSG-CONTEXT",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [approvedDraft()],
    client_invoice_ledger: [],
    provider_invoice_links: extra.provider_invoice_links === undefined ? [providerLink()] : extra.provider_invoice_links,
    document_delivery_ledger: [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-CONTEXT",
      telegram_user_id: "USER-CONTEXT",
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

function invoiceListState(rows) {
  return {
    state: "INVOICES_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "INVOICES_RECENT",
        source_module: "FACTURAS",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType: "INVOICE",
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
        })),
      },
    },
  };
}

function documentListState(rows) {
  return {
    state: "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "DOCUMENTS_RECENT",
        source_module: "DOCUMENTS",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: rows.map((row, index) => ({
          visibleIndex: index + 1,
          entityType: "DOCUMENT",
          draft_id: row.draft_id,
          provider_invoice_link_id: row.provider_invoice_link_id,
          client_id: row.client_id,
        })),
      },
    },
  };
}

function draftState() {
  return {
    state: "DRAFTS_MENU",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: { state: "DRAFTS_MENU" },
  };
}

function callbackInput(token, extra = {}) {
  return baseInput(`cfdi:${token}`, {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-${token}`,
    callback_message_id: "CALLBACK-MSG",
    update_id: extra.update_id || 99601,
    ...extra,
  });
}

function tokenRecord(token, action, overrides = {}) {
  return {
    token,
    chat_id: "CHAT-CONTEXT",
    draft_id: overrides.draft_id || null,
    action,
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    used_at: overrides.used_at ?? null,
    payload: overrides.payload || {},
    created_at: "2026-06-13T10:00:00.000Z",
  };
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.text || ""));
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertNoPlaceholderIdentity(result) {
  const text = String(result.telegram_message || "");
  assert(!/UUID-00000000/i.test(text), text);
  assert(!/00000000-0000-0000-0000-000000000000/i.test(text), text);
  assert(!/SANDBOX-INV-DRAFT/i.test(text), text);
  assert(!/DRAFT-/i.test(text), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
}

function assertNoRawUi(result) {
  const text = String(result.telegram_message || "");
  assert(!/<[a-z][\s\S]*>/i.test(text), text);
  assert(!text.includes("\\n"), JSON.stringify(text));
}

function assertCallbacksHandled(result) {
  for (const callback of callbackDataList(result)) {
    assert(/^cfdi:[A-Za-z0-9_-]{12,40}$/.test(callback) || /^cfdi_nav:[a-z0-9_:-]+$/.test(callback) || /^cfdi_doc:[a-z0-9_:-]+$/.test(callback), callback);
  }
}

function assertNoDraftRecoveryButtons(result) {
  const labels = buttonTexts(result).join("|");
  assert(!labels.includes("Por revisar"), labels);
  assert(!labels.includes("Listos para facturar"), labels);
  assert(!labels.includes("Crear nuevo borrador"), labels);
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("contract_rejects_zero_uuid_placeholder", () => {
  const identity = normalizeProviderInvoiceIdentity({
    local_draft_id: "DRAFT-20260612-5412",
    provider_uuid: "00000000-0000-0000-0000-000000000000",
  });
  assert.strictEqual(identity.provider_uuid, null);
  assert(!/^UUID-00000000/i.test(identity.ui_display_id), identity.ui_display_id);
  assert.strictEqual(identity.identity_confidence, "NONE");
  return identity.ui_display_id;
});

check("facturas_no_usa_uuid_00000000", () => {
  const result = executeCode(handleCode, baseInput("/facturas", {
    provider_invoice_links: [providerLink({ provider_uuid: "00000000-0000-4000-8000-000000000716" })],
  }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoPlaceholderIdentity(result);
});

check("facturas_no_usa_uuid_all_zero", () => {
  const result = executeCode(handleCode, baseInput("/facturas", {
    provider_invoice_links: [providerLink({ provider_uuid: "00000000-0000-0000-0000-000000000000" })],
  }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoPlaceholderIdentity(result);
});

check("facturas_no_usa_provider_id_draft", () => {
  const result = executeCode(handleCode, baseInput("/facturas", {
    provider_invoice_links: [providerLink({ provider_invoice_id: "SANDBOX-INV-DRAFT-20260612-5412" })],
  }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoPlaceholderIdentity(result);
});

check("detalle_factura_no_muestra_uuid_placeholder", () => {
  const rows = [providerLink({ provider_uuid: "UUID-00000000" })];
  const result = executeCode(handleCode, baseInput("ver 1", {
    chat_state: invoiceListState(rows),
    provider_invoice_links: rows,
  }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(result.telegram_message.startsWith("Factura FAC-SBX-"), result.telegram_message);
  assertNoPlaceholderIdentity(result);
});

check("documentos_no_muestra_uuid_placeholder", () => {
  const result = executeCode(handleCode, baseInput("/documentos", {
    provider_invoice_links: [providerLink({ provider_uuid: "00000000-0000-4000-8000-000000000716" })],
  }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoPlaceholderIdentity(result);
});

check("confirmacion_documental_no_muestra_uuid_placeholder", () => {
  const rows = [providerLink({ provider_uuid: "00000000-0000-4000-8000-000000000716" })];
  const result = executeCode(handleCode, baseInput("descargar 1", {
    chat_state: documentListState(rows),
    provider_invoice_links: rows,
  }));
  assert(["DOCUMENT_DOWNLOAD_CONFIRM", "DOCUMENT_ACTION_BLOCKED"].includes(result.action), result.action);
  assertNoPlaceholderIdentity(result);
});

check("recuperacion_token_invalido_documentos_es_contextual", () => {
  const result = executeCode(handleCode, callbackInput("UNKNOWNDOC0001", {
    chat_state: documentListState([providerLink()]),
    action_token: null,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  const labels = buttonTexts(result).join("|");
  assert(labels.includes("Documentos"), labels);
  assert(labels.includes("Facturas"), labels);
  assert(labels.includes("Menu principal"), labels);
  assert(labels.includes("Ayuda"), labels);
  assertNoDraftRecoveryButtons(result);
  assert(!/Abre el borrador o el menu principal/i.test(result.telegram_message), result.telegram_message);
});

check("recuperacion_token_usado_documentos_no_muestra_borradores", () => {
  const token = "USEDDOCRECOV01";
  const draft = approvedDraft({ draft_id: "DRAFT-20260612-5412", invoice_status: "SANDBOX_TIMBRADO" });
  draft.sandbox_pac_summary = { artifact_status: "DOWNLOADED", xml_downloaded: true, pdf_downloaded: true };
  const result = executeCode(handleCode, callbackInput(token, {
    recent_drafts: [draft],
    chat_state: documentListState([providerLink()]),
    action_token: tokenRecord(token, "DOWNLOAD_SANDBOX_ARTIFACTS", {
      draft_id: draft.draft_id,
      used_at: "2026-06-13T10:00:00.000Z",
      payload: {
        draft_id: draft.draft_id,
        source_module: "DOCUMENTS",
        screen_id: "DOCUMENT_DETAIL",
        display_id: "Factura",
      },
    }),
  }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(!/Factura: Factura/i.test(result.telegram_message), result.telegram_message);
  assert(!/Documento: Documento/i.test(result.telegram_message), result.telegram_message);
  assert(buttonTexts(result).includes("Volver a Documentos"), buttonTexts(result).join("|"));
  assert(buttonTexts(result).includes("Facturas"), buttonTexts(result).join("|"));
  assertNoDraftRecoveryButtons(result);
});

check("recuperacion_token_expirado_documentos_no_muestra_borradores", () => {
  const token = "EXPIREDDOCREC1";
  const result = executeCode(handleCode, callbackInput(token, {
    chat_state: documentListState([providerLink()]),
    action_token: tokenRecord(token, "DELIVERY_STATUS", {
      draft_id: "DRAFT-20260612-5412",
      expires_at: "2000-01-01T00:00:00.000Z",
      payload: {
        draft_id: "DRAFT-20260612-5412",
        source_module: "DOCUMENTS",
        screen_id: "DOCUMENT_DETAIL",
      },
    }),
  }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(buttonTexts(result).includes("Volver a Documentos"), buttonTexts(result).join("|"));
  assertNoDraftRecoveryButtons(result);
});

check("recuperacion_action_invalida_facturas_es_contextual", () => {
  const result = executeCode(handleCode, callbackInput("UNKNOWNINV001", {
    chat_state: invoiceListState([providerLink()]),
    action_token: null,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  const labels = buttonTexts(result).join("|");
  assert(labels.includes("Facturas"), labels);
  assert(labels.includes("Documentos"), labels);
  assert(labels.includes("Menu principal"), labels);
  assertNoDraftRecoveryButtons(result);
});

check("recuperacion_default_no_abre_borradores_por_default", () => {
  const result = executeCode(handleCode, callbackInput("UNKNOWNDEFAULT1", {
    chat_state: null,
    action_token: null,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  const labels = buttonTexts(result).join("|");
  assert(labels.includes("Menu principal"), labels);
  assert(labels.includes("Facturas"), labels);
  assert(labels.includes("Documentos"), labels);
  assertNoDraftRecoveryButtons(result);
});

check("recuperacion_draft_si_muestra_borradores", () => {
  const result = executeCode(handleCode, callbackInput("UNKNOWNDRAFT01", {
    chat_state: draftState(),
    action_token: null,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  const labels = buttonTexts(result).join("|");
  assert(labels.includes("Por revisar"), labels);
  assert(labels.includes("Listos para facturar"), labels);
  assert(labels.includes("Crear nuevo borrador"), labels);
});

check("start_menu_y_rutas_principales_siguen_funcionando", () => {
  assert.strictEqual(executeCode(handleCode, baseInput("/start", { chat_state: documentListState([providerLink()]) })).action, "PRODUCT_MENU_MAIN");
  assert.strictEqual(executeCode(handleCode, baseInput("/menu", { chat_state: invoiceListState([providerLink()]) })).action, "PRODUCT_MENU_MAIN");
  assert.strictEqual(executeCode(handleCode, baseInput("/facturas")).action, "INVOICES_RECENT_LIST");
  assert.strictEqual(executeCode(handleCode, baseInput("/documentos")).action, "DOCUMENTS_RECENT_LIST");
  assert.strictEqual(executeCode(handleCode, baseInput("/clientes")).action, "COMMAND_CLIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("/borradores")).action, "DRAFTS_MENU");
  assert.strictEqual(executeCode(handleCode, baseInput("/pendientes")).action, "COMMAND_PENDIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("/aprobadas")).action, "COMMAND_APROBADAS");
  assert.strictEqual(executeCode(handleCode, baseInput("/cobranza")).action, "COLLECTION_CLIENTS");
});

check("sin_texto_basura_html_newline_y_botones_sin_handler", () => {
  const samples = [
    executeCode(handleCode, baseInput("/facturas")),
    executeCode(handleCode, baseInput("/documentos")),
    executeCode(handleCode, callbackInput("UNKNOWNDOC0002", { chat_state: documentListState([providerLink()]), action_token: null })),
  ];
  for (const result of samples) {
    assert(!/Factura: Factura|Documento: Documento/i.test(result.telegram_message), result.telegram_message);
    assertNoRawUi(result);
    assertCallbacksHandled(result);
  }
});

check("repo_safety_surface", () => {
  assert(handleCode.includes("invoiceIsPlaceholderIdentity"));
  assert(handleCode.includes("recoveryModuleFromContext"));
  assert(handleCode.includes("contextualRecoveryResult"));
});

console.log("Telegram Contextual Recovery And Placeholder Identity Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

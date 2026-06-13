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

const clients = [
  client("CLI-REAL-BILBAO", "Real Bilbao"),
  client("CLI-PRIVADA-RIVERA", "Privada Rivera"),
];

function technicalProviderLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-TECH",
    draft_id: overrides.draft_id || "DRAFT-20260612-5412",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "SANDBOX-INV-DRAFT-20260612-5412" : overrides.provider_invoice_id,
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status || "DOWNLOAD_READY",
    xml_downloaded: overrides.xml_downloaded === undefined ? false : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? false : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-12T10:00:00.000Z",
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
    concept: { concepto_factura: "Servicio tecnico" },
    updated_at: "2026-06-12T09:00:00.000Z",
  };
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99401,
    chat_id: "CHAT-FALLBACK",
    telegram_user_id: "USER-FALLBACK",
    message_id: "MSG-FALLBACK",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [approvedDraft()],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    provider_invoice_links: extra.provider_invoice_links === undefined ? [technicalProviderLink()] : extra.provider_invoice_links,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: extra.source_message_id || "",
    authorized_user: {
      user_id: "OWNER",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-FALLBACK",
      telegram_user_id: "USER-FALLBACK",
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
        chat_id: "CHAT-FALLBACK",
        telegram_user_id: "USER-FALLBACK",
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
        chat_id: "CHAT-FALLBACK",
        telegram_user_id: "USER-FALLBACK",
        page: 1,
        page_size: 5,
        total_items: rows.length,
        source_module: "DOCUMENTS",
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

function clientListState() {
  return {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "CLIENTS",
        chat_id: "CHAT-FALLBACK",
        telegram_user_id: "USER-FALLBACK",
        page: 1,
        page_size: 5,
        total_items: clients.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: clients.map((item, index) => ({
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

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.text || ""));
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertNoUnsafeInvoiceIdentity(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("SANDBOX-INV-DRAFT"), text);
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes(" | "), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
}

function assertCallbacksHandled(result) {
  for (const callback of callbackDataList(result)) {
    assert(/^cfdi:[A-Za-z0-9_-]{12,40}$/.test(callback) || /^cfdi_nav:[a-z0-9_:-]+$/.test(callback), callback);
  }
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

check("facturas_recientes_no_muestra_sandbox_inv_draft", () => {
  const result = executeCode(handleCode, baseInput("/facturas"));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoUnsafeInvoiceIdentity(result);
});

check("detalle_factura_no_muestra_sandbox_inv_draft", () => {
  const rows = [technicalProviderLink()];
  const result = executeCode(handleCode, baseInput("ver 1", { chat_state: invoiceListState(rows), provider_invoice_links: rows }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(result.telegram_message.startsWith("Factura FAC-SBX-"), result.telegram_message);
  assert(result.telegram_message.includes("Borrador origen: BOR-5412"), result.telegram_message);
  assert(!result.telegram_message.includes("Opciones:"), result.telegram_message);
  assert(!result.telegram_message.includes("- Ver documentos"), result.telegram_message);
  assertNoUnsafeInvoiceIdentity(result);
});

check("documentos_no_muestra_sandbox_inv_draft", () => {
  const result = executeCode(handleCode, baseInput("/documentos"));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoUnsafeInvoiceIdentity(result);
});

check("document_detail_sin_opciones_redundantes", () => {
  const rows = [technicalProviderLink()];
  const result = executeCode(handleCode, baseInput("ver 1", { chat_state: documentListState(rows), provider_invoice_links: rows }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(result.telegram_message.startsWith("Documentos"), result.telegram_message);
  assert(!result.telegram_message.includes("Opciones:"), result.telegram_message);
  assertNoUnsafeInvoiceIdentity(result);
});

check("borradores_muestra_nombres_nuevos", () => {
  const result = executeCode(handleCode, baseInput("/borradores"));
  const labels = buttonTexts(result).join(",");
  assert(result.telegram_message.includes("Por revisar"), result.telegram_message);
  assert(result.telegram_message.includes("Listos para facturar"), result.telegram_message);
  assert(labels.includes("Por revisar"), labels);
  assert(labels.includes("Listos para facturar"), labels);
});

check("borradores_no_muestra_documentos", () => {
  const result = executeCode(handleCode, baseInput("/borradores"));
  const surface = `${result.telegram_message}\n${buttonTexts(result).join("\n")}`;
  assert(!surface.includes("Documentos"), surface);
  assert(!surface.includes("XML/PDF"), surface);
});

check("aprobadas_abre_listos_para_facturar", () => {
  const result = executeCode(handleCode, baseInput("/aprobadas"));
  assert.strictEqual(result.action, "COMMAND_APROBADAS");
  assert(result.telegram_message.includes("Listos para facturar"), result.telegram_message);
  assert(result.telegram_message.includes("BOR-6001"), result.telegram_message);
  assert(!result.telegram_message.includes("Facturas"), result.telegram_message);
});

check("listos_para_facturar_no_llama_factura_a_borrador", () => {
  const result = executeCode(handleCode, baseInput("/aprobadas"));
  assert(result.telegram_message.includes("BOR-"), result.telegram_message);
  assert(!/Factura F|Factura FAC-SBX/i.test(result.telegram_message), result.telegram_message);
});

check("start_y_menu_abren_menu_limpio", () => {
  const start = executeCode(handleCode, baseInput("/start", { chat_state: documentListState([technicalProviderLink()]) }));
  const menu = executeCode(handleCode, baseInput("/menu", { chat_state: invoiceListState([technicalProviderLink()]) }));
  assert.strictEqual(start.action, "PRODUCT_MENU_MAIN");
  assert.strictEqual(menu.action, "PRODUCT_MENU_MAIN");
  assertCallbacksHandled(start);
  assertCallbacksHandled(menu);
});

check("rutas_principales_siguen_funcionando", () => {
  assert.strictEqual(executeCode(handleCode, baseInput("/facturas")).action, "INVOICES_RECENT_LIST");
  assert.strictEqual(executeCode(handleCode, baseInput("/documentos")).action, "DOCUMENTS_RECENT_LIST");
  assert.strictEqual(executeCode(handleCode, baseInput("/clientes")).action, "COMMAND_CLIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("cliente 1", { chat_state: clientListState() })).action, "CLIENT_DETAIL");
  assert.strictEqual(executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState() })).action, "CLIENT_INVOICES_LIST");
  assert.strictEqual(executeCode(handleCode, baseInput("/borradores")).action, "DRAFTS_MENU");
  assert.strictEqual(executeCode(handleCode, baseInput("/pendientes")).action, "COMMAND_PENDIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("/aprobadas")).action, "COMMAND_APROBADAS");
  assert.strictEqual(executeCode(handleCode, baseInput("/cobranza")).action, "COLLECTION_CLIENTS");
});

check("sin_html_crudo_ni_newlines_literales", () => {
  const result = executeCode(handleCode, baseInput("/facturas"));
  assert(!/<[a-z][\s\S]*>/i.test(result.telegram_message), result.telegram_message);
  assert(!String(result.telegram_message || "").includes("\\n"), JSON.stringify(result.telegram_message));
});

check("botones_tienen_handler", () => {
  assertCallbacksHandled(executeCode(handleCode, baseInput("/facturas")));
  assertCallbacksHandled(executeCode(handleCode, baseInput("/documentos")));
  assertCallbacksHandled(executeCode(handleCode, baseInput("/borradores")));
});

check("repo_safety_surface", () => {
  assert(handleCode.includes("invoiceIsLocalTechnicalIdentity"));
  assert(handleCode.includes("Listos para facturar"));
});

console.log("Telegram Invoice Fallback And Borradores Naming Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

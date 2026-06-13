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
  client("CLI-CLIENTE-03", "Cliente Tres"),
  client("CLI-CLIENTE-04", "Cliente Cuatro"),
  client("CLI-CLIENTE-05", "Cliente Cinco"),
  client("CLI-CLIENTE-06", "Cliente Seis"),
];

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F66",
    draft_id: overrides.draft_id || "DRAFT-20260612-5412",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F66" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174000" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-F66-001" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PACINV-F66-001" : overrides.provider_invoice_id,
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status || "",
    xml_downloaded: overrides.xml_downloaded === undefined ? false : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? false : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-12T10:00:00.000Z",
    human_xml_path: overrides.human_xml_path,
    provider_raw_snapshot_ref: overrides.provider_raw_snapshot_ref,
  };
}

function deliveryRow(overrides = {}) {
  return {
    delivery_id: overrides.delivery_id || "DELIV-F66",
    draft_id: overrides.draft_id || "DRAFT-20260612-5412",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    provider: "factura_com",
    environment: "SANDBOX",
    channel: overrides.channel || "PROVIDER_EMAIL",
    delivery_status: overrides.delivery_status || "SENT",
    delivery_action: overrides.delivery_action || "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    recipient_present: true,
    recipient_redacted: "r***@example.test",
    normalized_errors: overrides.normalized_errors || [],
    normalized_warnings: overrides.normalized_warnings || [],
    sent_at: overrides.sent_at || "2026-06-12T11:00:00.000Z",
    updated_at: overrides.updated_at || "2026-06-12T11:00:00.000Z",
    human_xml_path: "C:/private/path/f66.xml",
  };
}

function recentLinks() {
  return [
    providerLink({ provider_invoice_link_id: "PIL-F66", provider_folio: "F66", provider_uuid: "123e4567-e89b-12d3-a456-426614174000", xml_downloaded: true, pdf_downloaded: true }),
    providerLink({ provider_invoice_link_id: "PIL-F65", draft_id: "DRAFT-20260612-5411", provider_folio: "F65", provider_uuid: "223e4567-e89b-12d3-a456-426614174001", artifact_status: "DOWNLOAD_READY", updated_at: "2026-06-12T09:00:00.000Z" }),
  ];
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99101,
    chat_id: "CHAT-DOCUMENTS",
    telegram_user_id: "USER-DOCUMENTS",
    message_id: "MSG-DOCUMENTS",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    provider_invoice_links: extra.provider_invoice_links === undefined ? recentLinks() : extra.provider_invoice_links,
    document_delivery_ledger: extra.document_delivery_ledger || [],
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
      telegram_chat_id: "CHAT-DOCUMENTS",
      telegram_user_id: "USER-DOCUMENTS",
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

function documentListState(rows, options = {}) {
  return {
    state: options.state || "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: options.kind || "DOCUMENTS_RECENT",
        chat_id: "CHAT-DOCUMENTS",
        telegram_user_id: "USER-DOCUMENTS",
        page: options.page || 1,
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
          display_id: row.provider_folio || row.provider_invoice_uid || row.draft_id,
        })),
      },
    },
  };
}

function invoiceListState(rows) {
  return {
    state: "INVOICES_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "INVOICES_RECENT",
        chat_id: "CHAT-DOCUMENTS",
        telegram_user_id: "USER-DOCUMENTS",
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

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertNoLiteralEscapedLineBreaks(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("\\n"), JSON.stringify(text));
  assert(!text.includes("\\r"), JSON.stringify(text));
}

function assertNoTechnicalDocumentUx(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes(" | "), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174000"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/runtime[\\/]/i.test(text), text);
  assert(!/raw_snapshot|provider_raw|payload/i.test(text), text);
}

function assertNoForbiddenButtons(result) {
  const text = buttonTexts(result).join(",");
  for (const label of ["Editar RFC", "Editar regimen", "Editar CP fiscal", "Editar razon social", "Marcar validado", "Marcar pagada", "Resumen cobranza", "Timbrar", "Cancelar", "Descargar XML/PDF sandbox", "Enviar a canal documentos", "Smoke", "Preflight"]) {
    assert(!text.includes(label), text);
  }
}

function numberedProviderLinks(count) {
  return Array.from({ length: count }, (_item, index) => {
    const n = count - index;
    return providerLink({
      provider_invoice_link_id: `PIL-DOC-${n}`,
      draft_id: `DRAFT-20260612-${String(5400 + n)}`,
      provider_folio: `F${n}`,
      provider_uuid: `${String(n).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
      updated_at: `2026-06-12T${String(23 - (index % 20)).padStart(2, "0")}:00:00.000Z`,
    });
  });
}

const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const loadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("documentos_abre_lista_clara", () => {
  const result = executeCode(handleCode, baseInput("/documentos"));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(result.telegram_message.includes("Documentos recientes"));
  assert(result.telegram_message.includes("Comandos:\nver N"));
  assert(callbackDataList(result).includes("cfdi_nav:menu"));
  assertNoLiteralEscapedLineBreaks(result);
  return result.action;
});

check("documentos_lista_por_folio_f66", () => {
  const result = executeCode(handleCode, baseInput("/documentos"));
  assert(result.telegram_message.includes("F66"), result.telegram_message);
  assert(result.telegram_message.includes("Real Bilbao"), result.telegram_message);
  assertNoTechnicalDocumentUx(result);
});

check("documentos_serie_folio_a_f66", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ provider_serie: "A", provider_folio: "F66" })] }));
  assert(result.telegram_message.includes("A-F66"), result.telegram_message);
  assertNoTechnicalDocumentUx(result);
});

check("documentos_uuid_fallback", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_invoice_uid: "", provider_invoice_id: "" })] }));
  assert(result.telegram_message.includes("UUID-123e4567"), result.telegram_message);
  assert(result.telegram_message.includes("Folio proveedor: no disponible"));
  assertNoTechnicalDocumentUx(result);
});

check("documentos_pac_fallback", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "abcdef1234567890", provider_invoice_id: "" })] }));
  assert(result.telegram_message.includes("PAC-abcdef12"), result.telegram_message);
  assertNoTechnicalDocumentUx(result);
});

check("documentos_fallback_local_seguro_y_advierte", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "", draft_id: "DRAFT-20260612-5412" })] }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
  assert(result.telegram_message.includes("Folio proveedor: no disponible"));
  assertNoTechnicalDocumentUx(result);
});

check("lista_no_muestra_draft", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("/documentos"))));
check("lista_no_muestra_uuid_completo", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("/documentos"))));
check("lista_no_muestra_estado_crudo", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("/documentos"))));
check("lista_no_muestra_pipes", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("/documentos"))));
check("lista_no_muestra_rutas", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ human_xml_path: "C:/private/path/f66.xml" })] }));
  assertNoTechnicalDocumentUx(result);
});
check("lista_no_muestra_raw_snapshot", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ provider_raw_snapshot_ref: "raw_snapshot_secret" })] }));
  assertNoTechnicalDocumentUx(result);
});

check("xml_pdf_descargados", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ xml_downloaded: true, pdf_downloaded: true })] }));
  assert(result.telegram_message.includes("XML/PDF: Descargados"), result.telegram_message);
});

check("xml_pdf_parcial", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ xml_downloaded: true, pdf_downloaded: false })] }));
  assert(result.telegram_message.includes("XML/PDF: Parcial"), result.telegram_message);
});

check("download_ready_listos", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ xml_downloaded: false, pdf_downloaded: false, artifact_status: "DOWNLOAD_READY" })] }));
  assert(result.telegram_message.includes("XML/PDF: Listos para descargar"), result.telegram_message);
});

check("sin_flags_pendientes", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [providerLink({ xml_downloaded: false, pdf_downloaded: false, artifact_status: "" })] }));
  assert(result.telegram_message.includes("XML/PDF: Pendientes"), result.telegram_message);
});

check("delivery_exitoso_enviado", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { document_delivery_ledger: [deliveryRow({ delivery_status: "SENT" })] }));
  assert(result.telegram_message.includes("Envio: Enviado"), result.telegram_message);
});

check("delivery_error", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { document_delivery_ledger: [deliveryRow({ delivery_status: "SEND_ERROR", normalized_errors: ["TELEGRAM_DOCUMENT_SEND_FAILED"] })] }));
  assert(result.telegram_message.includes("Envio: Error"), result.telegram_message);
});

check("ver_1_abre_document_detail", () => {
  const rows = recentLinks();
  const result = executeCode(handleCode, baseInput("ver 1", { chat_state: documentListState(rows), provider_invoice_links: rows }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(result.telegram_message.includes("Documentos"));
  assert(result.telegram_message.includes("F66"));
});

check("document_detail_usa_folio", () => {
  const rows = recentLinks();
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99120, chat_state: documentListState(rows), provider_invoice_links: rows }));
  assert(result.telegram_message.includes("Documentos"), result.telegram_message);
  assert(result.telegram_message.includes("F66"), result.telegram_message);
});

check("document_detail_bor_solo_origen", () => {
  const rows = recentLinks();
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99121, chat_state: documentListState(rows), provider_invoice_links: rows }));
  assert(result.telegram_message.includes("Borrador origen: BOR-5412"), result.telegram_message);
  assert(!/^BOR-5412/m.test(result.telegram_message), result.telegram_message);
});

check("document_detail_no_draft", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("ver 1", { update_id: 99122, chat_state: documentListState(recentLinks()) }))));
check("document_detail_no_uuid_completo", () => assertNoTechnicalDocumentUx(executeCode(handleCode, baseInput("ver 1", { update_id: 99123, chat_state: documentListState(recentLinks()) }))));
check("document_detail_no_rutas", () => {
  const rows = [providerLink({ human_xml_path: "C:/private/path/f66.xml" })];
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99124, chat_state: documentListState(rows), provider_invoice_links: rows, document_delivery_ledger: [deliveryRow()] }));
  assertNoTechnicalDocumentUx(result);
});

check("document_detail_teclado_propio", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99125, chat_state: documentListState(recentLinks()) }));
  assertNoForbiddenButtons(result);
  assert(buttonTexts(result).includes("Volver a Documentos"), buttonTexts(result).join(","));
  assert(buttonTexts(result).includes("Menu principal"), buttonTexts(result).join(","));
});

check("descargar_ya_descargado_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { update_id: 99126, chat_state: documentListState(recentLinks()) }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert(result.telegram_message.includes("Los documentos ya estan descargados"));
  assert(!result.should_execute_sandbox_action);
  assertNoTechnicalDocumentUx(result);
});

check("enviar_abre_confirmacion_segura", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { update_id: 99127, chat_state: documentListState(recentLinks()) }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.telegram_message.includes("Confirmar envio"));
  assert(result.telegram_message.includes("F66"));
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
  assert(!result.should_execute_sandbox_action);
  assertNoTechnicalDocumentUx(result);
});

check("pagar_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { update_id: 99128, chat_state: documentListState(recentLinks()) }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
});

check("paginacion_30_documentos", () => {
  const rows = numberedProviderLinks(30);
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99129, provider_invoice_links: rows }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(result.telegram_message.includes("Mostrando 1-5 de 30"), result.telegram_message);
  assert(buttonTexts(result).some((text) => text.includes("Mas documentos")), buttonTexts(result).join(","));
});

check("facturas_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99130 }));
  assert.strictEqual(result.action, "INVOICES_RECENT_LIST");
});

check("ver_1_desde_facturas_sigue_invoice_detail", () => {
  const rows = recentLinks();
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99131, chat_state: invoiceListState(rows), provider_invoice_links: rows }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(!result.telegram_message.startsWith("Documentos"), result.telegram_message);
});

check("clientes_y_facturas_cliente_siguen", () => {
  const clientList = executeCode(handleCode, baseInput("/clientes", { update_id: 99132 }));
  assert.strictEqual(clientList.action, "COMMAND_CLIENTES");
  const detail = executeCode(handleCode, baseInput("cliente 1", { update_id: 99133, chat_state: {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: { list_context: { kind: "CLIENTS", chat_id: "CHAT-DOCUMENTS", telegram_user_id: "USER-DOCUMENTS", page: 1, page_size: 5, total_items: clients.length, expires_at: "2099-01-01T00:00:00.000Z", items: clients.map((item, index) => ({ visibleIndex: index + 1, entityType: "CLIENT", client_id: item.client_id, entityId: item.client_id })) } },
  } }));
  assert.strictEqual(detail.action, "CLIENT_DETAIL");
  const invoices = executeCode(handleCode, baseInput("facturas 1", { update_id: 99134, chat_state: {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: { list_context: { kind: "CLIENTS", chat_id: "CHAT-DOCUMENTS", telegram_user_id: "USER-DOCUMENTS", page: 1, page_size: 5, total_items: clients.length, expires_at: "2099-01-01T00:00:00.000Z", items: clients.map((item, index) => ({ visibleIndex: index + 1, entityType: "CLIENT", client_id: item.client_id, entityId: item.client_id })) } },
  } }));
  assert.strictEqual(invoices.action, "CLIENT_INVOICES_LIST");
});

check("borradores_pendientes_aprobadas_siguen", () => {
  assert.strictEqual(executeCode(handleCode, baseInput("/borradores", { update_id: 99135 })).action, "DRAFTS_MENU");
  assert.strictEqual(executeCode(handleCode, baseInput("/pendientes", { update_id: 99136 })).action, "COMMAND_PENDIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("/aprobadas", { update_id: 99137 })).action, "COMMAND_APROBADAS");
});

check("cobranza_sigue", () => {
  const result = executeCode(handleCode, baseInput("/cobranza", { update_id: 99138 }));
  assert.strictEqual(result.action, "COLLECTION_CLIENTS");
});

check("sin_html_crudo", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99139 }));
  assert(!/<[a-z][\s\S]*>/i.test(result.telegram_message), result.telegram_message);
});

check("sin_saltos_literal", () => assertNoLiteralEscapedLineBreaks(executeCode(handleCode, baseInput("/documentos", { update_id: 99140 }))));

check("sin_botones_sin_handler", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99141 }));
  const callbacks = callbackDataList(result);
  assert(callbacks.length > 0);
  callbacks.forEach((callbackData) => assert(callbackData === "cfdi_nav:menu" || callbackData.startsWith("cfdi:"), callbackData));
  assert(handleCode.includes("VIEW_DOCUMENT_DETAIL"));
  assert(handleCode.includes("DOCUMENTS_RECENT_PAGE"));
});

check("repo_safety_contract_surface", () => {
  assert(handleCode.includes("DOCUMENTS_RECENT_LIST"));
  assert(loadCode.includes("document_delivery_ledger"));
});

for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
if (failed.length) {
  console.error(`\\n${failed.length}/${checks.length} checks failed`);
  process.exit(1);
}
console.log(`\\n${checks.length}/${checks.length} checks passed`);

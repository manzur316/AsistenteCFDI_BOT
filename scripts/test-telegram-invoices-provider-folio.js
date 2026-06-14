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
  };
}

function recentLinks() {
  return [
    providerLink({ provider_invoice_link_id: "PIL-F66", provider_folio: "F66", provider_uuid: "123e4567-e89b-12d3-a456-426614174000", xml_downloaded: true, pdf_downloaded: true }),
    providerLink({ provider_invoice_link_id: "PIL-F65", provider_folio: "F65", provider_uuid: "223e4567-e89b-12d3-a456-426614174001", updated_at: "2026-06-12T09:00:00.000Z" }),
  ];
}

function baseInput(text, extra = {}) {
  return {
    update_id: extra.update_id || 99001,
    chat_id: "CHAT-INVOICES",
    telegram_user_id: "USER-INVOICES",
    message_id: "MSG-INVOICES",
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    provider_invoice_links: extra.provider_invoice_links === undefined ? recentLinks() : extra.provider_invoice_links,
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
      telegram_chat_id: "CHAT-INVOICES",
      telegram_user_id: "USER-INVOICES",
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

function invoiceListState(kind, rows, options = {}) {
  return {
    state: kind === "CLIENT_INVOICES" ? "CLIENT_INVOICES_LIST" : "INVOICES_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind,
        chat_id: "CHAT-INVOICES",
        telegram_user_id: "USER-INVOICES",
        page: options.page || 1,
        page_size: 5,
        total_items: rows.length,
        client_id: options.client_id || null,
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

function clientListState() {
  return {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "CLIENTS",
        chat_id: "CHAT-INVOICES",
        telegram_user_id: "USER-INVOICES",
        page: 1,
        page_size: 5,
        total_items: clients.length,
        filter: { source: "CLIENTS" },
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

function assertNoTechnicalInvoiceUx(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX-INV-DRAFT"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes(" | "), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174000"), text);
}

function assertNoClientEditOrPaymentButtons(result) {
  const text = buttonTexts(result).join(",");
  for (const label of ["Editar RFC", "Editar regimen", "Editar CP fiscal", "Editar razon social", "Editar uso CFDI", "Editar tipo persona", "Marcar validado", "Resumen cobranza", "Pagadas", "Canceladas", "Marcar pagada", "Timbrar", "Cancelar"]) {
    assert(!text.includes(label), text);
  }
}

function numberedProviderLinks(count) {
  return Array.from({ length: count }, (_item, index) => {
    const n = count - index;
    return providerLink({
      provider_invoice_link_id: `PIL-${n}`,
      draft_id: `DRAFT-20260612-${String(5400 + n)}`,
      provider_folio: `F${n}`,
      provider_uuid: `${String(n).padStart(8, "0")}-e89b-12d3-a456-426614174000`,
      updated_at: `2026-06-12T${String(23 - (index % 20)).padStart(2, "0")}:00:00.000Z`,
    });
  });
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

check("facturas_abre_lista_legible", () => {
  const result = executeCode(handleCode, baseInput("/facturas"));
  assert.strictEqual(result.action, "INVOICES_RECENT_LIST");
  assert(result.telegram_message.includes("Facturas recientes"));
  assert(result.telegram_message.includes("Comandos:\nver N"));
  assert(callbackDataList(result).includes("cfdi_nav:menu"));
  assertNoLiteralEscapedLineBreaks(result);
  return result.action;
});

check("recientes_usa_folio_f66", () => {
  const result = executeCode(handleCode, baseInput("/facturas"));
  assert(result.telegram_message.includes("1. F66 · Real Bilbao · $928.00"), result.telegram_message);
  assertNoTechnicalInvoiceUx(result);
  return "F66";
});

check("serie_folio_muestra_a_f66", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [providerLink({ provider_serie: "A", provider_folio: "F66" })] }));
  assert(result.telegram_message.includes("A-F66 · Real Bilbao"), result.telegram_message);
  assertNoTechnicalInvoiceUx(result);
  return "A-F66";
});

check("sin_folio_con_uuid_muestra_uuid_corto", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_invoice_uid: "", provider_invoice_id: "" })] }));
  assert(result.telegram_message.includes("UUID-123e4567"), result.telegram_message);
  assert(result.telegram_message.includes("Folio proveedor: no disponible"));
  assertNoTechnicalInvoiceUx(result);
  return "UUID fallback";
});

check("sin_folio_ni_uuid_con_uid_muestra_pac_corto", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "abcdef1234567890", provider_invoice_id: "" })] }));
  assert(result.telegram_message.includes("PAC-abcdef12"), result.telegram_message);
  assertNoTechnicalInvoiceUx(result);
  return "PAC fallback";
});

check("sin_identidad_proveedor_usa_fallback_local_seguro_y_advierte", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "", draft_id: "DRAFT-20260612-5412" })] }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
  assert(result.telegram_message.includes("Folio proveedor: no disponible"));
  assertNoTechnicalInvoiceUx(result);
  return "safe local fallback";
});

check("provider_id_tecnico_sandbox_inv_draft_no_se_muestra", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [providerLink({ provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "SANDBOX-INV-DRAFT-20260612-5412", draft_id: "DRAFT-20260612-5412" })] }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assertNoTechnicalInvoiceUx(result);
  return "technical provider id hidden";
});

check("lista_no_muestra_draft_uuid_estado_crudo_ni_pipes", () => {
  const result = executeCode(handleCode, baseInput("/facturas"));
  assertNoTechnicalInvoiceUx(result);
  return "clean";
});

check("facturas_cliente_tiene_teclado_propio", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState() }));
  assert.strictEqual(result.action, "CLIENT_INVOICES_LIST");
  assert(result.telegram_message.includes("Facturas de Real Bilbao"));
  assert(buttonTexts(result).includes("Volver al cliente"));
  assertNoClientEditOrPaymentButtons(result);
  assertNoTechnicalInvoiceUx(result);
  return result.action;
});

check("ver_1_desde_recientes_abre_detalle", () => {
  const rows = recentLinks();
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99011, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(result.telegram_message.includes("Factura F66"));
  assert(result.telegram_message.includes("Borrador origen: BOR-5412"));
  assertNoTechnicalInvoiceUx(result);
  return result.action;
});

check("ver_1_desde_cliente_abre_detalle", () => {
  const rows = [providerLink()];
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99012, chat_state: invoiceListState("CLIENT_INVOICES", rows, { client_id: "CLI-REAL-BILBAO" }) }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(result.telegram_message.includes("Factura F66"));
  assert(buttonTexts(result).includes("Volver al cliente"));
  assertNoTechnicalInvoiceUx(result);
  return result.action;
});

check("detalle_no_muestra_uuid_completo_y_muestra_uuid_corto", () => {
  const rows = [providerLink()];
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99013, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
  assert(result.telegram_message.includes("UUID: disponible (123e4567)"));
  assert(!result.telegram_message.includes("123e4567-e89b-12d3-a456-426614174000"));
  return "uuid corto";
});

check("paginacion_30_facturas_funciona", () => {
  const rows = numberedProviderLinks(30);
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99014, provider_invoice_links: rows }));
  assert.strictEqual(result.action, "INVOICES_RECENT_LIST");
  assert(result.telegram_message.includes("Mostrando 1-5 de 30"));
  assert(buttonTexts(result).some((text) => text.includes("Mas facturas 6-10")));
  assert(result.persistence_sql.includes('"kind":"INVOICES_RECENT"'));
  return "30";
});

check("paginacion_30_clientes_no_se_rompe", () => {
  const manyClients = Array.from({ length: 30 }, (_item, index) => client(`CLI-${index + 1}`, `Cliente ${index + 1}`));
  const result = executeCode(handleCode, baseInput("/clientes", { update_id: 99015, clients: manyClients }));
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  assert(result.telegram_message.includes("Mostrando 1-5 de 30"));
  assert(buttonTexts(result).some((text) => text.includes("Mas clientes 6-10")));
  return "30 clients";
});

for (const verb of ["pagar", "descargar", "enviar"]) {
  check(`${verb}_n_en_facturas_falla_seguro`, () => {
    const rows = recentLinks();
    const result = executeCode(handleCode, baseInput(`${verb} 1`, { update_id: 99020 + verb.length, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
    assert.strictEqual(result.action, "INVOICE_ACTION_BLOCKED");
    assert(result.telegram_message.includes("Esta pantalla es de consulta."));
    assert(!String(result.persistence_sql || "").includes("SET payment_status"));
    assert(!/DOWNLOAD_SANDBOX_ARTIFACTS|DELIVERY_PREPARE|sendDocument/i.test(String(result.persistence_sql || "")));
    return result.action;
  });
}

check("clientes_cliente_n_facturas_n_siguen_funcionando", () => {
  const clientes = executeCode(handleCode, baseInput("/clientes", { update_id: 99031 }));
  assert.strictEqual(clientes.action, "COMMAND_CLIENTES");
  const detalle = executeCode(handleCode, baseInput("cliente 1", { update_id: 99032, chat_state: clientListState() }));
  assert.strictEqual(detalle.action, "CLIENT_DETAIL");
  const facturas = executeCode(handleCode, baseInput("facturas 1", { update_id: 99033, chat_state: clientListState() }));
  assert.strictEqual(facturas.action, "CLIENT_INVOICES_LIST");
  return "clientes ok";
});

check("borradores_pendientes_aprobadas_siguen_funcionando", () => {
  assert.strictEqual(executeCode(handleCode, baseInput("/borradores", { update_id: 99034 })).action, "DRAFTS_MENU");
  assert.strictEqual(executeCode(handleCode, baseInput("/pendientes", { update_id: 99035 })).action, "COMMAND_PENDIENTES");
  assert.strictEqual(executeCode(handleCode, baseInput("/aprobadas", { update_id: 99036 })).action, "COMMAND_APROBADAS");
  return "draft routes";
});

check("cobranza_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/cobranza", { update_id: 99037, client_invoice_ledger: [providerLink({ payment_status: "PENDIENTE" })] }));
  assert.strictEqual(result.action, "COLLECTION_CLIENTS");
  return result.action;
});

check("documentos_abre_lista_segura", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99038 }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assert(result.telegram_message.includes("Documentos recientes"));
  assert(!/DOWNLOAD_SANDBOX_ARTIFACTS|DELIVERY_CONFIRM/.test(String(result.persistence_sql || "")));
  return result.action;
});

check("facturas_no_tiene_html_crudo_ni_newline_literal", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99039 }));
  assert(!/[<>]/.test(result.telegram_message), result.telegram_message);
  assertNoLiteralEscapedLineBreaks(result);
  return "plain text";
});

check("botones_de_facturas_tienen_handler", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99040 }));
  const callbacks = callbackDataList(result);
  assert(callbacks.length > 0);
  for (const callback of callbacks) {
    assert(/^cfdi:[A-Za-z0-9_-]{12,40}$/.test(callback) || /^cfdi_nav:[a-z0-9_:-]+$/.test(callback) || /^cfdi_doc:[a-z0-9_:-]+$/.test(callback), callback);
  }
  assert(result.persistence_sql.includes("'VIEW_INVOICE_DETAIL'"));
  return callbacks.length;
});

check("docs_descargados_se_muestran_humano", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99041, provider_invoice_links: [providerLink({ xml_downloaded: true, pdf_downloaded: true })] }));
  assert(result.telegram_message.includes("Docs: Descargados"));
  return "docs";
});

check("docs_download_ready_se_muestra_listo_para_descargar", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99042, provider_invoice_links: [providerLink({ xml_downloaded: false, pdf_downloaded: false, artifact_status: "DOWNLOAD_READY" })] }));
  assert(result.telegram_message.includes("Docs: Listos para descargar"));
  return "ready";
});

check("pago_pagado_parcial_vencido_se_humaniza", () => {
  const paid = executeCode(handleCode, baseInput("/facturas", { update_id: 99043, provider_invoice_links: [providerLink({ payment_status: "PAGADO" })] }));
  const partial = executeCode(handleCode, baseInput("/facturas", { update_id: 99044, provider_invoice_links: [providerLink({ payment_status: "PARCIAL" })] }));
  const overdue = executeCode(handleCode, baseInput("/facturas", { update_id: 99045, provider_invoice_links: [providerLink({ payment_status: "OVERDUE" })] }));
  assert(paid.telegram_message.includes("Pago: Pagada"));
  assert(partial.telegram_message.includes("Pago: Parcial"));
  assert(overdue.telegram_message.includes("Pago: Vencida"));
  return "payment labels";
});

check("estado_cancelado_y_aprobado_se_humaniza", () => {
  const cancelled = executeCode(handleCode, baseInput("/facturas", { update_id: 99046, provider_invoice_links: [providerLink({ invoice_status: "CANCELADA" })] }));
  const approved = executeCode(handleCode, baseInput("/facturas", { update_id: 99047, provider_invoice_links: [providerLink({ invoice_status: "APROBADO", provider_folio: "F70" })] }));
  assert(cancelled.telegram_message.includes("Fiscal: Cancelada"));
  assert(approved.telegram_message.includes("Fiscal: Aprobada para timbrar"));
  return "fiscal labels";
});

check("lista_cliente_no_muestra_boton_ver_documentos", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { update_id: 99048, chat_state: clientListState() }));
  assert(!buttonTexts(result).includes("Ver documentos"));
  assertNoClientEditOrPaymentButtons(result);
  return "list buttons";
});

check("detalle_muestra_boton_documentos_sin_descargar", () => {
  const rows = [providerLink()];
  const result = executeCode(handleCode, baseInput("ver 1", { update_id: 99049, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
  assert(buttonTexts(result).includes("Documentos"));
  assert(callbackDataList(result).includes("cfdi_nav:docs"));
  assert(!/DOWNLOAD_SANDBOX_ARTIFACTS|sendDocument/i.test(String(result.persistence_sql || "")));
  return "docs placeholder";
});

check("slash_ver_1_desde_facturas_abre_detalle", () => {
  const rows = [providerLink()];
  const result = executeCode(handleCode, baseInput("/ver 1", { update_id: 99050, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(result.telegram_message.includes("Factura F66"));
  return result.action;
});

check("slash_pagar_1_desde_facturas_falla_seguro", () => {
  const rows = [providerLink()];
  const result = executeCode(handleCode, baseInput("/pagar 1", { update_id: 99051, chat_state: invoiceListState("INVOICES_RECENT", rows) }));
  assert.strictEqual(result.action, "INVOICE_ACTION_BLOCKED");
  assert(!String(result.persistence_sql || "").includes("SET payment_status"));
  return result.action;
});

check("folio_desde_sandbox_pac_summary_folio", () => {
  const result = executeCode(handleCode, baseInput("/facturas", {
    update_id: 99052,
    provider_invoice_links: [providerLink({ provider_folio: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "", sandbox_pac_summary: { Folio: "F88", Serie: "B" } })],
  }));
  assert(result.telegram_message.includes("B-F88"), result.telegram_message);
  return "summary folio";
});

check("fallback_client_invoice_ledger_sin_provider_links", () => {
  const ledgerRow = providerLink({ provider_invoice_link_id: "", provider_folio: "", provider_serie: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "", sandbox_pac_summary: { folio: "F90", uuid: "abcdef12-e89b-12d3-a456-426614174000" } });
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99053, provider_invoice_links: [], client_invoice_ledger: [ledgerRow] }));
  assert(result.telegram_message.includes("F90 · Real Bilbao"), result.telegram_message);
  assertNoTechnicalInvoiceUx(result);
  return "ledger fallback";
});

check("load_context_lee_provider_invoice_links", () => {
  const loadCode = getNode(workflow, "Build Load Context SQL").parameters.jsCode;
  const loadResult = executeCode(loadCode, { chat_id: "CHAT-INVOICES", update_id: 99054 });
  assert(loadResult.load_context_sql.includes("provider_invoice_links"));
  assert(loadResult.load_context_sql.includes("AS provider_invoice_links"));
  return "load context";
});

console.log("Telegram Invoices Provider Folio Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) {
  console.log(`FAIL total: ${failed.length}`);
  process.exit(1);
}

const assert = require("assert");

const {
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
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
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOAD_READY" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? false : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? false : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-12T10:00:00.000Z",
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
  };
}

function recentLinks() {
  return [
    providerLink(),
    providerLink({
      provider_invoice_link_id: "PIL-F65",
      draft_id: "DRAFT-20260612-5411",
      provider_folio: "F65",
      provider_uuid: "223e4567-e89b-12d3-a456-426614174001",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      updated_at: "2026-06-12T09:00:00.000Z",
    }),
  ];
}

function clientListState() {
  return {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "CLIENTS",
        chat_id: "CHAT-QA-FIX",
        telegram_user_id: "USER-QA-FIX",
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

function documentListState(rows, options = {}) {
  return {
    state: options.state || "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: options.kind || "DOCUMENTS_RECENT",
        chat_id: "CHAT-QA-FIX",
        telegram_user_id: "USER-QA-FIX",
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
          display_id: row.provider_folio || row.provider_invoice_uid || "BOR-5412",
        })),
      },
    },
  };
}

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? recentLinks() : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 99601,
    chat_id: "CHAT-QA-FIX",
    telegram_user_id: "USER-QA-FIX",
    message_id: "MSG-QA-FIX",
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || clients,
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: extra.client_invoice_ledger || [],
    provider_invoice_links: rows,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-QA-FIX",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-QA-FIX",
      telegram_user_id: "USER-QA-FIX",
    },
    security_user_id: "OWNER-QA-FIX",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: [],
    ...extra,
  };
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertNoForbiddenDocumentButtons(result) {
  const labels = buttonTexts(result).join(",");
  for (const label of [
    "Aprobar borrador",
    "Timbrar",
    "Cancelar CFDI",
    "Cancelar sandbox",
    "Descartar",
    "Marcar pagada",
    "Marcar parcial",
    "Marcar vencida",
    "Editar RFC",
    "Editar regimen",
    "Marcar validado",
    "Resumen cobranza",
    "Smoke",
    "Preflight",
    "Ver factura",
  ]) {
    assert(!labels.includes(label), labels);
  }
}

function assertNoForbiddenInvoiceButtons(result) {
  const labels = buttonTexts(result).join(",");
  for (const label of ["Editar RFC", "Editar regimen", "Editar CP fiscal", "Editar razon social", "Marcar validado", "Resumen cobranza", "Marcar pagada", "Timbrar", "Cancelar"]) {
    assert(!labels.includes(label), labels);
  }
}

function assertNoTechnicalUx(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes(" | "), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174000"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/raw_|payload/i.test(text), text);
}

function assertNoLiteralEscapedLineBreaks(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("\\n"), JSON.stringify(text));
  assert(!text.includes("\\r"), JSON.stringify(text));
}

function assertNoButtonsWithoutHandler(result) {
  for (const callback of callbackDataList(result)) {
    assert(/^(cfdi:|cfdi_nav:|cfdi_sbx:|cfdi_doc:)/.test(callback), callback);
  }
}

function draftForLink(link, downloaded = false) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-QA-FIX";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: downloaded ? "DOWNLOADED" : "DOWNLOAD_READY",
    uuid: link.provider_uuid || "",
    cfdi_uid: link.provider_invoice_uid || "",
    pac_invoice_id: link.provider_invoice_id || "",
    xml_downloaded: downloaded,
    pdf_downloaded: downloaded,
    xml_content_valid: downloaded,
    pdf_content_valid: downloaded,
  };
  return draft;
}

function documentCallbackInput(token, action, link, options = {}) {
  const normalizedAction = String(action || "").toUpperCase();
  const defaultState = normalizedAction === "DOWNLOAD_SANDBOX_ARTIFACTS"
    ? "DOCUMENT_DOWNLOAD_CONFIRM"
    : normalizedAction.includes("DELIVERY_CONFIRM") || normalizedAction.includes("DELIVERY_FORCE")
      ? "DOCUMENT_DELIVERY_CONFIRM"
      : "DOCUMENT_DETAIL";
  const payload = {
    state: options.state || defaultState,
    screen_id: options.screen_id || options.state || defaultState,
    action,
    draft_id: link.draft_id,
    provider_invoice_link_id: link.provider_invoice_link_id,
    display_id: link.provider_folio || "F66",
    source_module: "DOCUMENTS",
    source_list_kind: "DOCUMENTS_RECENT",
    return_to: "DOCUMENT_DETAIL",
    page: 1,
    channel: options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    confirmation_required: true,
    ...(options.payload || {}),
  };
  return callbackInput(token, action, {
    draft: options.draft || draftForLink(link, options.downloaded === true),
    chat_id: "CHAT-QA-FIX",
    telegram_user_id: "USER-QA-FIX",
    update_id: options.update_id || 99650,
    recent_drafts: [options.draft || draftForLink(link, options.downloaded === true)],
    provider_invoice_links: [link],
    chat_state: documentListState([link]),
    action_token: {
      token,
      chat_id: "CHAT-QA-FIX",
      action,
      used_at: options.used_at ?? null,
      expires_at: options.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload,
    },
  });
}

function clientLedgerCallbackInput(token = "clientledger01") {
  return callbackInput(token, "CLIENT_LEDGER", {
    chat_id: "CHAT-QA-FIX",
    telegram_user_id: "USER-QA-FIX",
    update_id: 99620,
    provider_invoice_links: recentLinks(),
    clients,
    action_token: {
      token,
      chat_id: "CHAT-QA-FIX",
      action: "CLIENT_LEDGER",
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
      draft_id: null,
      payload: { state: "CLIENT_DETAIL", client_id: "CLI-REAL-BILBAO" },
    },
  });
}

function summaryFromSource(source, stdout) {
  return executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context" || nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
}

const downloadable = providerLink();
const downloaded = providerLink({
  provider_invoice_link_id: "PIL-F67",
  draft_id: "DRAFT-20260612-5413",
  provider_folio: "F67",
  artifact_status: "DOWNLOADED",
  xml_downloaded: true,
  pdf_downloaded: true,
});

check("cliente_detail_facturas_button_abre_client_invoices_list", () => {
  const detail = executeCode(handleCode, baseInput("cliente 1", { chat_state: clientListState(), update_id: 99602 }));
  assert.strictEqual(detail.action, "CLIENT_DETAIL");
  assert(buttonTexts(detail).includes("Facturas del cliente"), buttonTexts(detail).join(","));
  assert(detail.persistence_sql.includes("'CLIENT_LEDGER'"), "CLIENT_LEDGER token missing");
  const result = executeCode(handleCode, clientLedgerCallbackInput());
  assert.strictEqual(result.action, "CLIENT_INVOICES_LIST");
  assert(result.telegram_message.includes("Facturas de Real Bilbao"), result.telegram_message);
  assertNoTechnicalUx(result);
});

check("facturas_1_desde_clients_abre_client_invoices_list", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99603 }));
  assert.strictEqual(result.action, "CLIENT_INVOICES_LIST");
  assert(result.telegram_message.includes("F66"), result.telegram_message);
  assertNoTechnicalUx(result);
});

check("rutas_normales_no_abren_client_invoice_ledger", () => {
  for (const route of ["cfdi_nav:client_ledger", "cfdi_nav:pay_paid", "cfdi_nav:pay_cancel"]) {
    const result = executeCode(handleCode, baseInput(route, { update_id: 99604 + route.length }));
    assert.notStrictEqual(result.action, "CLIENT_INVOICE_LEDGER", route);
    assert(!String(result.telegram_message || "").includes("SANDBOX_TIMBRADO |"), result.telegram_message);
  }
});

check("client_invoices_list_no_muestra_draft", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99607 }));
  assert.strictEqual(result.action, "CLIENT_INVOICES_LIST");
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
});

check("client_invoices_list_no_muestra_estado_crudo", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99608 }));
  assert(!result.telegram_message.includes("SANDBOX_TIMBRADO"), result.telegram_message);
});

check("client_invoices_list_no_muestra_pipes", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99609 }));
  assert(!result.telegram_message.includes(" | "), result.telegram_message);
});

check("client_invoices_list_no_contiene_edicion_fiscal", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99610 }));
  assertNoForbiddenInvoiceButtons(result);
});

check("client_invoices_list_no_contiene_cobranza_pago", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99611 }));
  const labels = buttonTexts(result).join(",");
  assert(!/Cobranza|Marcar|Pagadas|Canceladas/.test(labels), labels);
});

check("documents_recent_list_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99612 }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
  assertNoForbiddenDocumentButtons(result);
});

check("document_detail_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { chat_state: documentListState([downloadable]), provider_invoice_links: [downloadable], update_id: 99613 }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assertNoForbiddenDocumentButtons(result);
  assertNoTechnicalUx(result);
});

check("document_download_confirm_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { chat_state: documentListState([downloadable]), provider_invoice_links: [downloadable], update_id: 99614 }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assertNoForbiddenDocumentButtons(result);
  assertNoTechnicalUx(result);
});

check("document_download_result_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99615 }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assertNoForbiddenDocumentButtons(result);
  assertNoTechnicalUx(result);
});

check("document_delivery_confirm_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99616 }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assertNoForbiddenDocumentButtons(result);
  assertNoTechnicalUx(result);
});

check("document_delivery_result_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", {
    chat_state: documentListState([downloaded]),
    provider_invoice_links: [downloaded],
    document_delivery_ledger: [{ draft_id: downloaded.draft_id, channel: "PROVIDER_EMAIL", delivery_status: "SENT", delivery_action: "DELIVERY_CONFIRM_PROVIDER_EMAIL" }],
    update_id: 99617,
  }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assertNoForbiddenDocumentButtons(result);
  assert(result.telegram_message.includes("Ya enviado / protegido"), result.telegram_message);
});

check("document_action_blocked_no_contiene_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99618 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assertNoForbiddenDocumentButtons(result);
});

check("pagar_1_desde_documentos_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99619 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Documentos es para XML/PDF y envios. Para pagos usa Cobranza."), result.telegram_message);
  assert(!result.persistence_sql.includes("MARK_PAYMENT_PAID"), result.persistence_sql);
});

check("pagar_1_desde_documentos_no_muta_pagos", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99621 }));
  assert(!/UPDATE\s+cfdi_drafts\s+SET\s+payment_status/i.test(result.persistence_sql), result.persistence_sql);
});

check("payment_callback_documentos_falla_seguro", () => {
  const result = executeCode(handleCode, documentCallbackInput("docpaytoken01", "MARK_PAYMENT_PAID", downloaded, { downloaded: true, update_id: 99642 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Para pagos usa Cobranza"), result.telegram_message);
  assert(!/UPDATE\s+cfdi_drafts\s+SET\s+payment_status/i.test(result.persistence_sql), result.persistence_sql);
});

check("marcar_pagada_no_aparece_en_documentos", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99622 }));
  assert(!buttonTexts(result).join(",").includes("Marcar pagada"));
});

check("descargar_1_abre_confirmacion_con_payload_completo", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { chat_state: documentListState([downloadable]), provider_invoice_links: [downloadable], update_id: 99623 }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert(result.persistence_sql.includes('"draft_id":"DRAFT-20260612-5412"'), result.persistence_sql);
  assert(result.persistence_sql.includes('"provider_invoice_link_id":"PIL-F66"'), result.persistence_sql);
  assert(result.persistence_sql.includes('"display_id":"F66"'), result.persistence_sql);
});

check("descarga_confirmacion_no_muestra_draft", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { chat_state: documentListState([downloadable]), provider_invoice_links: [downloadable], update_id: 99624 }));
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
});

check("resultado_download_error_no_muestra_rutas", () => {
  const source = executeCode(handleCode, documentCallbackInput("docerrtoken01", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable));
  const result = summaryFromSource(source, JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: "ERROR",
    ok: false,
    artifacts: [],
    warnings: ["ruta C:/private/runtime/f66.xml oculta"],
    errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID", "C:/private/runtime/f66.xml"],
    sensitive_findings: [],
    output: {
      draft_id: downloadable.draft_id,
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      artifact_status: "DOWNLOAD_ERROR",
      xml_downloaded: false,
      pdf_downloaded: false,
      xml_content_valid: false,
      pdf_content_valid: false,
      storage_updated: false,
      persistence_status: "FAILED",
    },
  }));
  assert(!/[A-Z]:[\\/]/i.test(result.telegram_message), result.telegram_message);
});

check("resultado_download_error_no_muestra_payload_crudo", () => {
  const source = executeCode(handleCode, documentCallbackInput("docerrtoken02", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable));
  const result = summaryFromSource(source, JSON.stringify({
    action: "sandbox.draft.download-artifacts",
    status: "ERROR",
    ok: false,
    artifacts: [],
    warnings: [],
    errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID"],
    sensitive_findings: [],
    output: { draft_id: downloadable.draft_id, artifact_status: "DOWNLOAD_ERROR", xml_content_valid: false, pdf_content_valid: false },
  }));
  assert(!/payload|raw_|provider_raw/i.test(result.telegram_message), result.telegram_message);
});

check("resultado_download_error_muestra_motivo_humano_seguro", () => {
  const source = executeCode(handleCode, documentCallbackInput("docerrtoken03", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable));
  const result = summaryFromSource(source, JSON.stringify({
    action: "sandbox.draft.download-artifacts",
    status: "ERROR",
    ok: false,
    artifacts: [],
    warnings: [],
    errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID"],
    sensitive_findings: [],
    output: { draft_id: downloadable.draft_id, artifact_status: "DOWNLOAD_ERROR", xml_content_valid: false, pdf_content_valid: false },
  }));
  assert(result.telegram_message.includes("No se pudo descargar XML/PDF"), result.telegram_message);
  assert(result.telegram_message.includes("Motivo seguro:"), result.telegram_message);
  assert(!result.telegram_message.includes("Detalle tecnico:"), result.telegram_message);
});

check("enviar_1_descargado_abre_confirmacion", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99625 }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.telegram_message.includes("F67"), result.telegram_message);
});

check("confirmacion_envio_no_hereda_botones_draft", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99626 }));
  assertNoForbiddenDocumentButtons(result);
});

check("envio_ya_registrado_responde_protegido", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", {
    chat_state: documentListState([downloaded]),
    provider_invoice_links: [downloaded],
    document_delivery_ledger: [{ draft_id: downloaded.draft_id, channel: "PROVIDER_EMAIL", delivery_status: "SENT", delivery_action: "DELIVERY_CONFIRM_PROVIDER_EMAIL" }],
    update_id: 99627,
  }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert(result.telegram_message.includes("Ya enviado / protegido"), result.telegram_message);
});

check("descargar_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("descargar 99", { chat_state: documentListState([downloadable]), provider_invoice_links: [downloadable], update_id: 99643 }));
  assert.strictEqual(result.action, "DOCUMENT_INDEX_NOT_FOUND");
  assert(!result.should_execute_sandbox_action);
});

check("enviar_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("enviar 99", { chat_state: documentListState([downloaded]), provider_invoice_links: [downloaded], update_id: 99644 }));
  assert.strictEqual(result.action, "DOCUMENT_INDEX_NOT_FOUND");
  assert(!result.should_execute_sandbox_action);
});

check("token_usado_recupera_documentos_sin_duplicar", () => {
  const result = executeCode(handleCode, documentCallbackInput("docusedqa001", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable, { used_at: "2026-01-01T00:00:00.000Z", update_id: 99628 }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(!result.should_execute_sandbox_action);
  assertNoForbiddenDocumentButtons(result);
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
});

check("token_vencido_recupera_documentos_sin_duplicar", () => {
  const result = executeCode(handleCode, documentCallbackInput("docexpired001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true, expires_at: "2000-01-01T00:00:00.000Z", update_id: 99629 }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(!result.should_execute_sandbox_action);
  assertNoForbiddenDocumentButtons(result);
  assert(buttonTexts(result).includes("Volver a Documentos"), buttonTexts(result).join(","));
});

check("facturas_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { update_id: 99630 }));
  assert.strictEqual(result.action, "INVOICES_RECENT_LIST");
  assert(result.telegram_message.includes("F66"), result.telegram_message);
});

check("documentos_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99631 }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
});

check("clientes_cliente_facturas_siguen_funcionando", () => {
  const clientsResult = executeCode(handleCode, baseInput("/clientes", { update_id: 99632 }));
  assert.strictEqual(clientsResult.action, "COMMAND_CLIENTES");
  const detail = executeCode(handleCode, baseInput("cliente 1", { chat_state: clientListState(), update_id: 99633 }));
  assert.strictEqual(detail.action, "CLIENT_DETAIL");
  const invoices = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState(), update_id: 99634 }));
  assert.strictEqual(invoices.action, "CLIENT_INVOICES_LIST");
});

check("cobranza_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/cobranza", { update_id: 99635 }));
  assert.strictEqual(result.action, "COLLECTION_CLIENTS");
});

check("borradores_pendientes_aprobadas_siguen_funcionando", () => {
  const borradores = executeCode(handleCode, baseInput("/borradores", { update_id: 99636 }));
  const pendientes = executeCode(handleCode, baseInput("/pendientes", { update_id: 99637 }));
  const aprobadas = executeCode(handleCode, baseInput("/aprobadas", { update_id: 99638 }));
  assert.strictEqual(borradores.action, "DRAFTS_MENU");
  assert.strictEqual(pendientes.action, "COMMAND_PENDIENTES");
  assert.strictEqual(aprobadas.action, "COMMAND_APROBADAS");
});

check("no_hay_html_crudo", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99639 }));
  assert(!/<[^>]+>/.test(result.telegram_message), result.telegram_message);
});

check("no_hay_newline_literal_visible", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99640 }));
  assertNoLiteralEscapedLineBreaks(result);
});

check("no_hay_botones_sin_handler", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { update_id: 99641 }));
  assertNoButtonsWithoutHandler(result);
});

console.log("Telegram Runtime QA Fix Document Isolation Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

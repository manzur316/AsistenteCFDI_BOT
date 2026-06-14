const assert = require("assert");

const {
  executeCode,
  getNodeCode,
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

const chatId = "CHAT-ENTITY-STATE";
const userId = "USER-ENTITY-STATE";

function client(id = "CLI-REAL-BILBAO", name = "Real Bilbao") {
  return {
    client_id: id,
    display_name: name,
    razon_social: name,
    enabled: true,
    validated_by_human: true,
    aliases: [{ alias: name, normalized_alias: name.toLowerCase(), weight: 100 }],
  };
}

function providerLink(overrides = {}) {
  return {
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F67",
    draft_id: overrides.draft_id || "DRAFT-20260612-5678",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F67" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174000" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-F67-001" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PACINV-F67-001" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 5220 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-12T10:00:00.000Z",
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
  };
}

function draftForLink(link, overrides = {}) {
  return {
    draft_id: link.draft_id,
    chat_id: chatId,
    status: overrides.status || "APROBADO",
    invoice_status: overrides.invoice_status || link.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || link.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status || link.artifact_status || "",
    client_id: link.client_id,
    client_snapshot: { client_id: link.client_id, display_name: link.client_display },
    total: link.total,
    sandbox_pac_summary: {
      folio: link.provider_folio || "",
      uuid: link.provider_uuid || "",
      cfdi_uid: link.provider_invoice_uid || "",
      pac_invoice_id: link.provider_invoice_id || "",
      artifact_status: link.artifact_status || "",
      xml_downloaded: link.xml_downloaded === true,
      pdf_downloaded: link.pdf_downloaded === true,
      xml_content_valid: link.xml_downloaded === true,
      pdf_content_valid: link.pdf_downloaded === true,
      ...(overrides.sandbox_pac_summary || {}),
    },
    ...(overrides || {}),
  };
}

const downloadedLink = providerLink();
const downloadedDraft = draftForLink(downloadedLink);
const downloadableLink = providerLink({
  provider_invoice_link_id: "PIL-F68",
  draft_id: "DRAFT-20260612-5680",
  provider_folio: "F68",
  artifact_status: "DOWNLOAD_READY",
  xml_downloaded: false,
  pdf_downloaded: false,
});
const downloadableDraft = draftForLink(downloadableLink);
const noIdentityLink = providerLink({
  provider_invoice_link_id: "PIL-NOIDENTITY",
  draft_id: "DRAFT-20260612-5681",
  provider_folio: "",
  provider_uuid: "",
  provider_invoice_uid: "",
  provider_invoice_id: "",
  artifact_status: "DOWNLOAD_READY",
  xml_downloaded: false,
  pdf_downloaded: false,
});
const noIdentityDraft = draftForLink(noIdentityLink, {
  sandbox_pac_summary: { folio: "", uuid: "", cfdi_uid: "", pac_invoice_id: "" },
});

function baseInput(text, extra = {}) {
  const links = extra.provider_invoice_links === undefined ? [downloadedLink, downloadableLink] : extra.provider_invoice_links;
  const drafts = extra.recent_drafts === undefined ? [downloadedDraft, downloadableDraft] : extra.recent_drafts;
  return {
    update_id: extra.update_id || 99801,
    max_seen_update_id: extra.update_id || 99801,
    chat_id: chatId,
    telegram_user_id: userId,
    message_id: "MSG-ENTITY-STATE",
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: extra.clients || [client()],
    tax_rules: [],
    recent_drafts: drafts,
    client_invoice_ledger: extra.client_invoice_ledger || [],
    provider_invoice_links: links,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: drafts.length, descartados: 0, bloqueados: 0 },
    source_kind: extra.source_kind || "MESSAGE",
    callback_query_id: extra.callback_query_id || "",
    callback_message_id: extra.callback_message_id || "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-ENTITY-STATE",
      telegram_chat_id: chatId,
      telegram_user_id: userId,
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-ENTITY-STATE",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? null,
    action_token: extra.action_token ?? null,
    recent_callback_events: extra.recent_callback_events || [],
    ...extra,
  };
}

function tokenInput(action, payload = {}, extra = {}) {
  const token = extra.token || `tok${Math.random().toString(36).slice(2, 14)}`;
  const link = extra.link || downloadedLink;
  const draft = extra.draft || draftForLink(link);
  return baseInput(`cfdi:${token}`, {
    update_id: extra.update_id || 99850,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CB-${token}`,
    callback_message_id: "MSG-CB",
    recent_drafts: extra.recent_drafts || [draft],
    provider_invoice_links: extra.provider_invoice_links || [link],
    action_token: {
      token,
      chat_id: chatId,
      action,
      expires_at: extra.expires_at || "2099-01-01T00:00:00.000Z",
      used_at: extra.used_at ?? null,
      draft_id: extra.token_draft_id === undefined ? draft.draft_id : extra.token_draft_id,
      payload: {
        draft_id: draft.draft_id,
        action,
        ...payload,
      },
    },
    ...extra,
  });
}

function documentTokenInput(action, link, options = {}) {
  const isDownload = action === "DOWNLOAD_SANDBOX_ARTIFACTS";
  const isDelivery = String(action).includes("DELIVERY");
  const screen = options.screen_id || (isDownload ? "DOCUMENT_DOWNLOAD_CONFIRM" : isDelivery ? "DOCUMENT_DELIVERY_CONFIRM" : "DOCUMENT_DETAIL");
  return tokenInput(action, {
    source_module: options.source_module || "DOCUMENTS",
    screen_id: screen,
    state: screen,
    draft_id: options.omit_draft_id ? undefined : link.draft_id,
    provider_invoice_link_id: options.provider_invoice_link_id === undefined ? link.provider_invoice_link_id : options.provider_invoice_link_id,
    display_id: options.display_id || link.provider_folio || "FAC-SBX-test",
    return_to: "DOCUMENT_DETAIL",
    channel: options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    confirmation_required: options.confirmation_required === undefined ? true : options.confirmation_required,
  }, {
    link,
    draft: options.draft || draftForLink(link),
    recent_drafts: [options.draft || draftForLink(link)],
    provider_invoice_links: [link],
    token_draft_id: options.omit_draft_id ? null : link.draft_id,
    used_at: options.used_at,
    expires_at: options.expires_at,
    token: options.token,
  });
}

function clientListState() {
  return {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "CLIENTS",
        items: [{ visibleIndex: 1, entityType: "CLIENT", client_id: "CLI-REAL-BILBAO", displayLabel: "Real Bilbao" }],
        page: 1,
        page_size: 5,
        total_items: 1,
        expires_at: "2099-01-01T00:00:00.000Z",
      },
    },
  };
}

function buttonTexts(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text || "").filter(Boolean);
}

function callbackDataList(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => String(button.callback_data || ""));
}

function assertNoForbiddenLabels(result, forbidden) {
  const labels = buttonTexts(result).join(",");
  for (const label of forbidden) assert(!labels.includes(label), labels);
}

function assertNoNormalUxLeaks(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes("SANDBOX-INV-DRAFT"), text);
  assert(!text.includes(" | "), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174000"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/raw_|payload|provider_raw/i.test(text), text);
}

function runSummaryFromSource(source, stdout) {
  return executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context" || nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
}

const invoiceFromViewDraft = () => executeCode(handleCode, tokenInput("VIEW_DRAFT", { draft_id: downloadedDraft.draft_id }, { token: "viewdraftstate1", link: downloadedLink, draft: downloadedDraft }));

check("view_draft_stamped_no_muestra_borrador_aprobado", () => {
  const result = invoiceFromViewDraft();
  assert.strictEqual(result.action, "INVOICE_DETAIL");
  assert(!result.telegram_message.includes("Borrador aprobado"), result.telegram_message);
});

check("view_draft_stamped_muestra_factura_folio", () => {
  const result = invoiceFromViewDraft();
  assert(result.telegram_message.includes("Factura F67"), result.telegram_message);
});

check("factura_timbrada_muestra_borrador_origen_bor", () => {
  const result = invoiceFromViewDraft();
  assert(result.telegram_message.includes("Borrador origen: BOR-5678"), result.telegram_message);
});

check("factura_timbrada_no_muestra_draft", () => assert(!invoiceFromViewDraft().telegram_message.includes("DRAFT-")));
check("factura_timbrada_no_muestra_estado_crudo", () => assert(!invoiceFromViewDraft().telegram_message.includes("SANDBOX_TIMBRADO")));
check("factura_timbrada_no_muestra_pipes", () => assert(!invoiceFromViewDraft().telegram_message.includes(" | ")));
check("factura_timbrada_no_muestra_botones_pago", () => assertNoForbiddenLabels(invoiceFromViewDraft(), ["Marcar pagada", "Marcar parcial", "Marcar vencida"]));
check("factura_timbrada_no_muestra_cancelar_cfdi", () => assertNoForbiddenLabels(invoiceFromViewDraft(), ["Cancelar CFDI sandbox", "Cancelar"]));
check("factura_timbrada_no_muestra_ledger_cliente", () => assertNoForbiddenLabels(invoiceFromViewDraft(), ["Ver ledger cliente", "Resumen cobranza"]));
check("factura_timbrada_descargada_muestra_envio_con_confirmacion", () => {
  const result = invoiceFromViewDraft();
  const labels = buttonTexts(result);
  assert(labels.includes("Enviar por correo"), labels.join(","));
  assert(labels.includes("Enviar a canal"), labels.join(","));
  assert(String(result.persistence_sql || "").includes("DOCUMENT_DELIVERY_PREPARE_PROVIDER_EMAIL"));
  assert(String(result.persistence_sql || "").includes("DOCUMENT_DELIVERY_PREPARE_TELEGRAM_CHANNEL"));
  assert(!String(result.persistence_sql || "").includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"), "invoice detail must prepare, not send directly");
  assert(!String(result.persistence_sql || "").includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"), "invoice detail must prepare, not send directly");
});

check("sandbox_inv_draft_no_aparece_como_display_id", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [noIdentityLink], recent_drafts: [noIdentityDraft] }));
  assert(!result.telegram_message.includes("SANDBOX-INV-DRAFT"), result.telegram_message);
});

check("fallback_sin_folio_usa_fac_sbx_no_draft", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [noIdentityLink], recent_drafts: [noIdentityDraft] }));
  assert(result.telegram_message.includes("FAC-SBX-"), result.telegram_message);
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
});

check("start_siempre_abre_main_menu", () => {
  const result = executeCode(handleCode, baseInput("/start"));
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
});

check("start_ignora_chat_state_documentos", () => {
  const result = executeCode(handleCode, baseInput("/start", { chat_state: { state: "DOCUMENT_DETAIL", context: { draft_id: downloadedDraft.draft_id } } }));
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
});

check("start_ignora_token_pago_anterior", () => {
  const result = executeCode(handleCode, baseInput("/start", { action_token: { token: "payold", chat_id: chatId, action: "MARK_PAYMENT_PAID", payload: { draft_id: downloadedDraft.draft_id }, expires_at: "2099-01-01T00:00:00.000Z", used_at: null } }));
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
});

check("start_no_muestra_resultado_pago_previo", () => {
  const result = executeCode(handleCode, baseInput("/start", { chat_state: { state: "COLLECTION_INVOICES" } }));
  assert(!/marcada como pendiente|marcada como pagada|Pago:/i.test(result.telegram_message), result.telegram_message);
});

check("menu_siempre_abre_main_menu", () => {
  const result = executeCode(handleCode, baseInput("/menu", { chat_state: { state: "DOCUMENT_DETAIL" } }));
  assert.strictEqual(result.action, "PRODUCT_MENU_MAIN");
});

check("delivery_permitido_desde_invoice_detail_capability_surface", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { source_module: "INVOICE_DETAIL", screen_id: "INVOICE_DETAIL", token: "delbadsource1" }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.send");
});

check("delivery_bloqueado_si_token_viene_de_draft_detail", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { source_module: "DRAFT_DETAIL", screen_id: "DRAFT_DETAIL", token: "delbaddraft1" }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
});

check("delivery_bloqueado_si_token_usado", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { token: "delusedstate1", used_at: "2026-01-01T00:00:00.000Z" }));
  assert(!result.should_execute_sandbox_action);
});

check("delivery_bloqueado_si_token_expirado", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { token: "delexpstate1", expires_at: "2000-01-01T00:00:00.000Z" }));
  assert(!result.should_execute_sandbox_action);
});

check("delivery_bloqueado_si_xml_pdf_no_descargados", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadableLink, { token: "delnotdown001" }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(!result.should_execute_sandbox_action);
});

check("delivery_permitido_solo_desde_confirmacion_documents_valida", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { token: "delvalidstate1" }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.send");
});

check("delivery_confirm_desde_invoice_detail_ejecuta_con_token_vigente", () => {
  const result = executeCode(handleCode, documentTokenInput("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloadedLink, { source_module: "INVOICE_DETAIL", screen_id: "INVOICE_DETAIL", token: "delinvoice001" }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
});

check("download_bloqueado_si_source_module_no_documents", () => {
  const result = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { source_module: "INVOICE_DETAIL", screen_id: "INVOICE_DETAIL", token: "downbadsource1" }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
});

check("download_bloqueado_si_falta_draft_id", () => {
  const result = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { omit_draft_id: true, token: "downnodraft1" }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
});

check("download_bloqueado_si_falta_provider_reference", () => {
  const result = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", noIdentityLink, { token: "downnoident1", draft: noIdentityDraft }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(!result.should_execute_sandbox_action);
});

check("download_bloqueado_si_ya_descargado", () => {
  const result = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadedLink, { token: "downalready1" }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert(!result.should_execute_sandbox_action);
  assert(result.telegram_message.includes("ya estan descargados"), result.telegram_message);
});

check("download_permitido_solo_desde_confirmacion_documents_valida", () => {
  const result = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { token: "downvalid001" }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.download-artifacts");
});

check("download_error_clasificado_con_motivo_humano", () => {
  const source = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { token: "downerrstate1" }));
  const result = runSummaryFromSource(source, JSON.stringify({
    action: "sandbox.draft.download-artifacts",
    status: "ERROR",
    ok: false,
    artifacts: [],
    warnings: ["C:/private/runtime/f68.xml"],
    errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID"],
    sensitive_findings: [],
    output: { draft_id: downloadableLink.draft_id, artifact_status: "DOWNLOAD_ERROR", xml_content_valid: false, pdf_content_valid: false },
  }));
  assert(result.telegram_message.includes("No se pudo descargar XML/PDF"), result.telegram_message);
  assert(result.telegram_message.includes("Motivo seguro:"), result.telegram_message);
});

check("download_error_no_muestra_rutas", () => {
  const source = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { token: "downerrroute1" }));
  const result = runSummaryFromSource(source, JSON.stringify({ action: "sandbox.draft.download-artifacts", status: "ERROR", ok: false, artifacts: [], warnings: ["C:/private/runtime/f68.xml"], errors: ["C:/private/runtime/f68.xml"], sensitive_findings: [], output: { draft_id: downloadableLink.draft_id, artifact_status: "DOWNLOAD_ERROR" } }));
  assert(!/[A-Z]:[\\/]/i.test(result.telegram_message), result.telegram_message);
});

check("download_error_no_muestra_raw_payload", () => {
  const source = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { token: "downerrpayload1" }));
  const result = runSummaryFromSource(source, JSON.stringify({ action: "sandbox.draft.download-artifacts", status: "ERROR", ok: false, artifacts: [], warnings: [], errors: ["provider_raw_payload_hidden"], sensitive_findings: [], output: { draft_id: downloadableLink.draft_id, artifact_status: "DOWNLOAD_ERROR" } }));
  assert(!/payload|raw_|provider_raw/i.test(result.telegram_message), result.telegram_message);
});

check("download_error_no_muestra_uuid_completo", () => {
  const source = executeCode(handleCode, documentTokenInput("DOWNLOAD_SANDBOX_ARTIFACTS", downloadableLink, { token: "downerruuid1" }));
  const result = runSummaryFromSource(source, JSON.stringify({ action: "sandbox.draft.download-artifacts", status: "ERROR", ok: false, artifacts: [], warnings: [], errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID"], sensitive_findings: [], output: { draft_id: downloadableLink.draft_id, artifact_status: "DOWNLOAD_ERROR", uuid: downloadableLink.provider_uuid } }));
  assert(!result.telegram_message.includes(downloadableLink.provider_uuid), result.telegram_message);
});

check("document_screens_no_contienen_botones_draft", () => {
  const docs = executeCode(handleCode, baseInput("/documentos"));
  const detail = executeCode(handleCode, baseInput("ver 1", { chat_state: { state: "DOCUMENTS_RECENT_LIST", expires_at: "2099-01-01T00:00:00.000Z", context: { list_context: { kind: "DOCUMENTS_RECENT", items: [{ visibleIndex: 1, entityType: "DOCUMENT", draft_id: downloadedLink.draft_id, provider_invoice_link_id: downloadedLink.provider_invoice_link_id, display_id: "F67" }], expires_at: "2099-01-01T00:00:00.000Z" } } } }));
  for (const result of [docs, detail]) assertNoForbiddenLabels(result, ["Aprobar", "Timbrar", "Descartar", "Regresar a borrador"]);
});

check("document_screens_no_contienen_payment_cancel_ledger", () => {
  const result = executeCode(handleCode, baseInput("/documentos"));
  assertNoForbiddenLabels(result, ["Marcar pagada", "Cancelar CFDI", "Ver ledger cliente", "Resumen cobranza"]);
});

check("invoice_screens_no_contienen_payment_cancel_ledger", () => {
  const list = executeCode(handleCode, baseInput("/facturas"));
  const detail = executeCode(handleCode, baseInput("ver 1", { chat_state: { state: "INVOICES_RECENT_LIST", expires_at: "2099-01-01T00:00:00.000Z", context: { list_context: { kind: "INVOICES_RECENT", items: [{ visibleIndex: 1, entityType: "INVOICE", draft_id: downloadedLink.draft_id, provider_invoice_link_id: downloadedLink.provider_invoice_link_id, client_id: downloadedLink.client_id }], expires_at: "2099-01-01T00:00:00.000Z" } } } }));
  for (const result of [list, detail]) assertNoForbiddenLabels(result, ["Marcar pagada", "Cancelar CFDI", "Ver ledger cliente", "Resumen cobranza"]);
});

check("client_invoices_list_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState() }));
  assert.strictEqual(result.action, "CLIENT_INVOICES_LIST");
});

check("facturas_sigue_funcionando", () => assert.strictEqual(executeCode(handleCode, baseInput("/facturas")).action, "INVOICES_RECENT_LIST"));
check("documentos_sigue_funcionando", () => assert.strictEqual(executeCode(handleCode, baseInput("/documentos")).action, "DOCUMENTS_RECENT_LIST"));

check("clientes_cliente_facturas_siguen_funcionando", () => {
  const clients = executeCode(handleCode, baseInput("/clientes"));
  assert(["CLIENTS_LIST", "COMMAND_CLIENTES"].includes(clients.action), clients.action);
  assert(clients.telegram_message.includes("Clientes"), clients.telegram_message);
  assert.strictEqual(executeCode(handleCode, baseInput("cliente 1", { chat_state: clientListState() })).action, "CLIENT_DETAIL");
  assert.strictEqual(executeCode(handleCode, baseInput("facturas 1", { chat_state: clientListState() })).action, "CLIENT_INVOICES_LIST");
});

check("borradores_pendientes_aprobadas_siguen_funcionando", () => {
  assert(executeCode(handleCode, baseInput("/borradores")).action);
  assert(executeCode(handleCode, baseInput("/pendientes")).action);
  assert(executeCode(handleCode, baseInput("/aprobadas")).action);
});

check("cobranza_sigue_funcionando", () => assert.strictEqual(executeCode(handleCode, baseInput("/cobranza")).action, "COLLECTION_CLIENTS"));

check("no_hay_html_crudo_en_rutas_operativas", () => {
  for (const result of [executeCode(handleCode, baseInput("/facturas")), executeCode(handleCode, baseInput("/documentos")), invoiceFromViewDraft()]) {
    assert(!/<script|<pre|<\/?[a-z]+[^>]*>/i.test(String(result.telegram_message || "")), result.telegram_message);
  }
});

check("no_hay_newline_literal_visible", () => {
  for (const result of [executeCode(handleCode, baseInput("/facturas")), executeCode(handleCode, baseInput("/documentos")), invoiceFromViewDraft()]) {
    assert(!String(result.telegram_message || "").includes("\\n"), result.telegram_message);
  }
});

check("no_hay_botones_sin_handler", () => {
  for (const result of [executeCode(handleCode, baseInput("/facturas")), executeCode(handleCode, baseInput("/documentos")), invoiceFromViewDraft()]) {
    assert(callbackDataList(result).every(Boolean), JSON.stringify(result.reply_markup));
  }
});

check("repo_safety_pass_se_valida_en_suite_externa", () => {
  assert(handleCode.includes("DOCUMENT_ACTION_BLOCKED"));
  assert(summaryCode.includes("No se pudo descargar XML/PDF"));
});

console.log("Telegram Entity State Routing And Delivery Guard Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

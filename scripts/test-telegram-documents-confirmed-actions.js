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
    recipient_redacted: overrides.recipient_redacted || "r***@example.test",
    normalized_errors: overrides.normalized_errors || [],
    normalized_warnings: overrides.normalized_warnings || [],
    sent_at: overrides.sent_at || "2026-06-12T11:00:00.000Z",
    updated_at: overrides.updated_at || "2026-06-12T11:00:00.000Z",
  };
}

function documentListState(rows, options = {}) {
  return {
    state: options.state || "DOCUMENTS_RECENT_LIST",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: options.kind || "DOCUMENTS_RECENT",
        chat_id: "CHAT-DOC-ACTIONS",
        telegram_user_id: "USER-DOC-ACTIONS",
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

function baseInput(text, extra = {}) {
  const rows = extra.provider_invoice_links === undefined ? [providerLink()] : extra.provider_invoice_links;
  return {
    update_id: extra.update_id || 99201,
    chat_id: "CHAT-DOC-ACTIONS",
    telegram_user_id: "USER-DOC-ACTIONS",
    message_id: "MSG-DOC-ACTIONS",
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    recent_drafts: extra.recent_drafts || [],
    client_invoice_ledger: [],
    provider_invoice_links: rows,
    document_delivery_ledger: extra.document_delivery_ledger || [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "MESSAGE",
    callback_query_id: "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-DOC-ACTIONS",
      role: "OWNER",
      enabled: true,
      telegram_chat_id: "CHAT-DOC-ACTIONS",
      telegram_user_id: "USER-DOC-ACTIONS",
    },
    security_user_id: "OWNER-DOC-ACTIONS",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: extra.chat_state ?? documentListState(rows),
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

function assertNoTechnicalUx(result) {
  const text = String(result.telegram_message || "");
  assert(!text.includes("DRAFT-"), text);
  assert(!text.includes("SANDBOX_TIMBRADO"), text);
  assert(!text.includes(" | "), text);
  assert(!text.includes("123e4567-e89b-12d3-a456-426614174000"), text);
  assert(!/[A-Z]:[\\/]/i.test(text), text);
  assert(!/raw_|payload|provider_raw/i.test(text), text);
}

function assertNoForbiddenDocumentButtons(result) {
  const labels = buttonTexts(result).join(",");
  for (const label of ["Editar RFC", "Editar regimen", "Marcar validado", "Marcar pagada", "Resumen cobranza", "Timbrar", "Smoke", "Preflight"]) {
    assert(!labels.includes(label), labels);
  }
}

function draftForLink(link, options = {}) {
  return {
    draft_id: link.draft_id,
    chat_id: "CHAT-DOC-ACTIONS",
    status: "APROBADO",
    invoice_status: link.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    client_id: link.client_id,
    client_snapshot: { client_id: link.client_id, display_name: link.client_display },
    total: link.total || 928,
    sandbox_pac_summary: {
      artifact_status: options.downloaded ? "DOWNLOADED" : "DOWNLOAD_READY",
      uuid: link.provider_uuid || "",
      cfdi_uid: link.provider_invoice_uid || "",
      pac_invoice_id: link.provider_invoice_id || "",
      xml_downloaded: options.downloaded === true,
      pdf_downloaded: options.downloaded === true,
      xml_content_valid: options.downloaded === true,
      pdf_content_valid: options.downloaded === true,
      ...(options.sandbox_pac_summary || {}),
    },
    document_delivery_ledger: options.delivery_ledger || [],
  };
}

function documentCallbackInput(token, action, link, options = {}) {
  const draft = options.draft || draftForLink(link, { downloaded: options.downloaded });
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
    return_to: "DOCUMENT_DETAIL",
    channel: options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL"),
    confirmation_required: true,
    ...(options.payload || {}),
  };
  return callbackInput(token, action, {
    draft,
    chat_id: "CHAT-DOC-ACTIONS",
    telegram_user_id: "USER-DOC-ACTIONS",
    update_id: options.update_id || 99301,
    action_token: {
      token,
      chat_id: "CHAT-DOC-ACTIONS",
      action,
      used_at: options.used_at ?? null,
      expires_at: options.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload,
    },
  });
}

function runSummaryFromSource(source, stdout) {
  return executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context" || nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
}

const downloadable = providerLink({ provider_invoice_link_id: "PIL-F66", draft_id: "DRAFT-20260612-5412", provider_folio: "F66", artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const downloaded = providerLink({ provider_invoice_link_id: "PIL-F67", draft_id: "DRAFT-20260612-5413", provider_folio: "F67", artifact_status: "DOWNLOADED", xml_downloaded: true, pdf_downloaded: true, updated_at: "2026-06-12T09:00:00.000Z" });

check("descargar_1_abre_confirmacion_no_descarga_directo", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { provider_invoice_links: [downloadable] }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert(result.telegram_message.includes("Confirmar descarga"));
  assert(result.telegram_message.includes("F66"));
  assert(!result.should_execute_sandbox_action);
  assert(result.persistence_sql.includes("DOWNLOAD_SANDBOX_ARTIFACTS"));
  assertNoTechnicalUx(result);
});

check("confirmacion_descarga_contiene_token", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { provider_invoice_links: [downloadable], update_id: 99202 }));
  assert(callbackDataList(result).some((item) => item.startsWith("cfdi:")));
  assert(buttonTexts(result).includes("Confirmar descarga"));
});

check("slash_descargar_abre_confirmacion", () => {
  const result = executeCode(handleCode, baseInput("/descargar 1", { provider_invoice_links: [downloadable], update_id: 99223 }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert(result.telegram_message.includes("F66"));
});

check("boton_descargar_desde_detalle_abre_confirmacion", () => {
  const result = executeCode(handleCode, documentCallbackInput("docprepdown01", "DOCUMENT_DOWNLOAD_PREPARE", downloadable, {
    state: "DOCUMENT_DETAIL",
    payload: { source_list_kind: "DOCUMENTS_RECENT", page: 1 },
  }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_CONFIRM");
  assert(result.persistence_sql.includes("DOWNLOAD_SANDBOX_ARTIFACTS"));
  assert(!result.should_execute_sandbox_action);
});

check("confirmar_descarga_planea_action_existente", () => {
  const result = executeCode(handleCode, documentCallbackInput("docdown000001", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.download-artifacts");
  assert(String(result.sandbox_execute_command || "").includes("sandbox.draft.download-artifacts"));
});

check("token_descarga_usado_no_duplica", () => {
  const result = executeCode(handleCode, documentCallbackInput("docdownused01", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable, { used_at: "2026-01-01T00:00:00.000Z" }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(!result.should_execute_sandbox_action);
});

check("token_descarga_expirado_falla_seguro", () => {
  const result = executeCode(handleCode, documentCallbackInput("docdownexp001", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable, { expires_at: "2000-01-01T00:00:00.000Z" }));
  assert(!result.should_execute_sandbox_action);
  assert(/vencio|invalido|expir/i.test(result.telegram_message));
});

check("descarga_bloqueada_sin_identidad_proveedor", () => {
  const noIdentity = providerLink({ provider_folio: "", provider_uuid: "", provider_invoice_uid: "", provider_invoice_id: "", artifact_status: "DOWNLOAD_READY" });
  const result = executeCode(handleCode, baseInput("descargar 1", { provider_invoice_links: [noIdentity], update_id: 99203 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("No hay referencia de proveedor suficiente"));
  assert(!result.should_execute_sandbox_action);
});

check("descarga_bloqueada_si_ya_descargado", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { provider_invoice_links: [downloaded], update_id: 99204 }));
  assert.strictEqual(result.action, "DOCUMENT_DOWNLOAD_RESULT");
  assert(result.telegram_message.includes("Los documentos ya estan descargados"));
  assert(!result.should_execute_sandbox_action);
});

check("resultado_descarga_muestra_completada_y_folio", () => {
  const source = executeCode(handleCode, documentCallbackInput("docdownsum001", "DOWNLOAD_SANDBOX_ARTIFACTS", downloadable));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.download-artifacts",
    status: "OK",
    ok: true,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: downloadable.draft_id,
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      artifact_status: "DOWNLOADED",
      xml_downloaded: true,
      pdf_downloaded: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      storage_updated: true,
      persistence_status: "UPDATED",
    },
  });
  const result = runSummaryFromSource(source, stdout);
  assert(result.telegram_message.includes("XML/PDF descargados"));
  assert(result.telegram_message.includes("Factura: F66"));
  assert(result.telegram_message.includes("Elige como entregar los documentos"));
  assert(!/[A-Z]:[\\/]/i.test(result.telegram_message), result.telegram_message);
});

check("enviar_sin_xml_pdf_pide_descargar_primero", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { provider_invoice_links: [downloadable], update_id: 99205 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Primero descarga XML/PDF"));
  assert(!result.should_execute_sandbox_action);
});

check("correo_sin_xml_pdf_pide_descargar_primero", () => {
  const result = executeCode(handleCode, baseInput("correo 1", { provider_invoice_links: [downloadable], update_id: 99206 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Primero descarga XML/PDF"));
});

check("canal_sin_xml_pdf_pide_descargar_primero", () => {
  const result = executeCode(handleCode, baseInput("canal 1", { provider_invoice_links: [downloadable], update_id: 99207 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Primero descarga XML/PDF"));
});

check("enviar_con_xml_pdf_abre_confirmacion_no_envia_directo", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { provider_invoice_links: [downloaded], update_id: 99208 }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.telegram_message.includes("Confirmar envio"));
  assert(result.telegram_message.includes("F67"));
  assert(!result.should_execute_sandbox_action);
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
  assertNoTechnicalUx(result);
});

check("canal_con_xml_pdf_abre_confirmacion_canal", () => {
  const result = executeCode(handleCode, baseInput("canal 1", { provider_invoice_links: [downloaded], update_id: 99224 }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.telegram_message.includes("Destino: canal"));
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"));
  assert(!result.should_execute_sandbox_action);
});

check("boton_enviar_desde_detalle_abre_confirmacion", () => {
  const result = executeCode(handleCode, documentCallbackInput("docprepemail1", "DOCUMENT_DELIVERY_PREPARE_PROVIDER_EMAIL", downloaded, {
    downloaded: true,
    state: "DOCUMENT_DETAIL",
    payload: { source_list_kind: "DOCUMENTS_RECENT", page: 1, channel: "PROVIDER_EMAIL" },
  }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_CONFIRM");
  assert(result.persistence_sql.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
  assert(!result.should_execute_sandbox_action);
});

check("confirmacion_envio_no_expone_email_completo", () => {
  const result = executeCode(handleCode, baseInput("correo 1", { provider_invoice_links: [downloaded], update_id: 99209 }));
  assert(!result.telegram_message.includes("real@example.com"));
});

check("confirmar_envio_usa_action_token", () => {
  const result = executeCode(handleCode, documentCallbackInput("docsend000001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.send");
  assert(String(result.sandbox_execute_command || "").includes("--send-real --confirmed"));
});

check("confirmar_envio_canal_usa_action_token", () => {
  const result = executeCode(handleCode, documentCallbackInput("docsendchan01", "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", downloaded, { downloaded: true, channel: "TELEGRAM_DOCUMENT_CHANNEL" }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(result.requested_sandbox_action, "sandbox.documents.delivery.send");
  assert(String(result.sandbox_execute_command || "").includes("--send-real --confirmed"));
  assert(String(result.sandbox_execute_command || "").includes("TELEGRAM_DOCUMENT_CHANNEL"));
});

check("token_envio_usado_no_duplica", () => {
  const result = executeCode(handleCode, documentCallbackInput("docsendused01", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true, used_at: "2026-01-01T00:00:00.000Z" }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(!result.should_execute_sandbox_action);
});

check("token_envio_expirado_falla_seguro", () => {
  const result = executeCode(handleCode, documentCallbackInput("docsendexp001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true, expires_at: "2000-01-01T00:00:00.000Z" }));
  assert(!result.should_execute_sandbox_action);
  assert(/vencio|invalido|expir/i.test(result.telegram_message));
});

check("envio_duplicado_responde_protegido", () => {
  const result = executeCode(handleCode, baseInput("enviar 1", { provider_invoice_links: [downloaded], document_delivery_ledger: [deliveryRow({ draft_id: downloaded.draft_id })], update_id: 99210 }));
  assert.strictEqual(result.action, "DOCUMENT_DELIVERY_RESULT");
  assert(result.telegram_message.includes("Ya enviado / protegido"));
  assert(!result.should_execute_sandbox_action);
});

check("resultado_envio_muestra_completado", () => {
  const source = executeCode(handleCode, documentCallbackInput("docsendres001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true }));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.documents.delivery.send",
    status: "OK",
    ok: true,
    artifacts: [],
    warnings: [],
    errors: [],
    sensitive_findings: [],
    output: {
      draft_id: downloaded.draft_id,
      channel: "PROVIDER_EMAIL",
      delivery_ledger: { delivery_status: "SENT", channel: "PROVIDER_EMAIL", recipient_redacted: "r***@example.test" },
    },
  });
  const result = runSummaryFromSource(source, stdout);
  assert(result.telegram_message.includes("Envio completado"));
  assert(result.telegram_message.includes("Factura: F67"));
});

check("error_envio_muestra_mensaje_humano_seguro", () => {
  const source = executeCode(handleCode, documentCallbackInput("docsenderr001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { downloaded: true }));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.documents.delivery.send",
    status: "ERROR",
    ok: false,
    artifacts: [],
    warnings: [],
    errors: ["DOCUMENT_DELIVERY_SEND_FAILED"],
    sensitive_findings: [],
    output: { draft_id: downloaded.draft_id, channel: "PROVIDER_EMAIL" },
  });
  const result = runSummaryFromSource(source, stdout);
  assert(result.telegram_message.includes("No se pudo enviar"));
  assert(result.telegram_message.includes("Factura: F67"));
  assert(!/real@example.com|token|secret/i.test(result.telegram_message), result.telegram_message);
});

check("pagar_desde_documentos_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("pagar 1", { provider_invoice_links: [downloaded], update_id: 99211 }));
  assert.strictEqual(result.action, "DOCUMENT_ACTION_BLOCKED");
  assert(result.telegram_message.includes("Para pagos usa Cobranza"));
  assert(!result.should_execute_sandbox_action);
});

check("descargar_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("descargar 99", { provider_invoice_links: [downloadable], update_id: 99212 }));
  assert.strictEqual(result.action, "DOCUMENT_INDEX_NOT_FOUND");
});

check("enviar_99_falla_seguro", () => {
  const result = executeCode(handleCode, baseInput("enviar 99", { provider_invoice_links: [downloaded], update_id: 99213 }));
  assert.strictEqual(result.action, "DOCUMENT_INDEX_NOT_FOUND");
});

check("document_detail_muestra_descargar_si_estado_permite", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloadable], update_id: 99214 }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(buttonTexts(result).includes("Descargar XML/PDF"), buttonTexts(result).join(","));
  assert(!buttonTexts(result).includes("Enviar por correo"), buttonTexts(result).join(","));
});

check("document_detail_muestra_enviar_si_descargado", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloaded], update_id: 99215 }));
  assert.strictEqual(result.action, "DOCUMENT_DETAIL");
  assert(buttonTexts(result).includes("Enviar por correo"), buttonTexts(result).join(","));
  assert(buttonTexts(result).includes("Enviar a canal"), buttonTexts(result).join(","));
});

check("document_detail_no_hereda_botones_prohibidos", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloaded], update_id: 99216 }));
  assertNoForbiddenDocumentButtons(result);
});

check("sin_draft_uuid_estado_crudo_pipes_rutas_raw", () => {
  const result = executeCode(handleCode, baseInput("descargar 1", { provider_invoice_links: [downloadable], update_id: 99217 }));
  assertNoTechnicalUx(result);
});

check("documentos_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/documentos", { provider_invoice_links: [downloadable], update_id: 99218, chat_state: null }));
  assert.strictEqual(result.action, "DOCUMENTS_RECENT_LIST");
});

check("facturas_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/facturas", { provider_invoice_links: [downloadable], update_id: 99219, chat_state: null }));
  assert.strictEqual(result.action, "INVOICES_RECENT_LIST");
});

check("clientes_y_facturas_cliente_siguen", () => {
  const clients = [{ client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao", enabled: true, validated_by_human: true, aliases: [] }];
  const result = executeCode(handleCode, baseInput("/clientes", { clients, provider_invoice_links: [downloadable], update_id: 99220, chat_state: null }));
  assert.strictEqual(result.action, "COMMAND_CLIENTES");
  const clientState = {
    state: "CLIENT_LIST_SELECTION",
    expires_at: "2099-01-01T00:00:00.000Z",
    context: {
      list_context: {
        kind: "CLIENTS",
        chat_id: "CHAT-DOC-ACTIONS",
        telegram_user_id: "USER-DOC-ACTIONS",
        page: 1,
        page_size: 5,
        total_items: clients.length,
        expires_at: "2099-01-01T00:00:00.000Z",
        items: [{ visibleIndex: 1, entityType: "CLIENT", client_id: "CLI-REAL-BILBAO", entityId: "CLI-REAL-BILBAO" }],
      },
    },
  };
  const invoices = executeCode(handleCode, baseInput("facturas 1", { clients, provider_invoice_links: [downloadable], update_id: 99225, chat_state: clientState }));
  assert.strictEqual(invoices.action, "CLIENT_INVOICES_LIST");
});

check("cobranza_sigue_funcionando", () => {
  const result = executeCode(handleCode, baseInput("/cobranza", { provider_invoice_links: [downloaded], update_id: 99221, chat_state: null }));
  assert.strictEqual(result.action, "COLLECTION_CLIENTS");
});

check("sin_botones_sin_handler", () => {
  const result = executeCode(handleCode, baseInput("ver 1", { provider_invoice_links: [downloaded], update_id: 99222 }));
  callbackDataList(result).forEach((callbackData) => assert(callbackData === "cfdi_nav:menu" || callbackData.startsWith("cfdi:"), callbackData));
  assert(handleCode.includes("DOCUMENT_DOWNLOAD_PREPARE"));
  assert(handleCode.includes("DOCUMENT_DELIVERY_PREPARE_PROVIDER_EMAIL"));
  assert(handleCode.includes("DELIVERY_CONFIRM_PROVIDER_EMAIL"));
});

check("repo_safety_surface", () => {
  assert(handleCode.includes("DOCUMENT_DOWNLOAD_CONFIRM"));
  assert(handleCode.includes("DOWNLOAD_SANDBOX_ARTIFACTS"));
  assert(handleCode.includes("DELIVERY_CONFIRM_TELEGRAM_CHANNEL"));
});

for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

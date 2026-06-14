const assert = require("assert");
const { spawnSync } = require("child_process");

const {
  allCallbackData,
  callbackInput,
  executeCode,
  getNodeCode,
  prepareStdout,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");
const {
  classifyExecution,
  detectStateButtonFailures,
} = require("./qa/telegram-ui-session-watch");

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");
const checks = [];
const plannedSandboxActions = [];

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
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F72",
    draft_id: overrides.draft_id || "DRAFT-20260614-DELIVERY-CONFIRM",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider: "factura_com",
    provider_environment: "SANDBOX",
    provider_folio: overrides.provider_folio === undefined ? "F-72" : overrides.provider_folio,
    provider_serie: overrides.provider_serie || "",
    provider_uuid: overrides.provider_uuid === undefined ? "123e4567-e89b-12d3-a456-426614174072" : overrides.provider_uuid,
    provider_invoice_uid: overrides.provider_invoice_uid === undefined ? "UID-F72-001" : overrides.provider_invoice_uid,
    provider_invoice_id: overrides.provider_invoice_id === undefined ? "PACINV-F72-001" : overrides.provider_invoice_id,
    invoice_status: overrides.invoice_status || "SANDBOX_TIMBRADO",
    payment_status: overrides.payment_status || "PENDIENTE",
    artifact_status: overrides.artifact_status === undefined ? "DOWNLOADED" : overrides.artifact_status,
    xml_downloaded: overrides.xml_downloaded === undefined ? true : overrides.xml_downloaded,
    pdf_downloaded: overrides.pdf_downloaded === undefined ? true : overrides.pdf_downloaded,
    total: overrides.total === undefined ? 928 : overrides.total,
    updated_at: overrides.updated_at || "2026-06-14T10:00:00.000Z",
    sandbox_pac_summary: overrides.sandbox_pac_summary || {},
  };
}

const downloaded = providerLink();
const notDownloaded = providerLink({ artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false });
const sandboxError = providerLink({ invoice_status: "SANDBOX_ERROR", artifact_status: "N/A", xml_downloaded: false, pdf_downloaded: false });

function draftForLink(link, overrides = {}) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DELIVERY-CONFIRM";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.invoice_status = overrides.invoice_status || link.invoice_status;
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: link.artifact_status,
    uuid: link.provider_uuid || "",
    cfdi_uid: link.provider_invoice_uid || "",
    pac_invoice_id: link.provider_invoice_id || "",
    folio: link.provider_folio || "",
    xml_downloaded: link.xml_downloaded === true,
    pdf_downloaded: link.pdf_downloaded === true,
    xml_content_valid: link.xml_downloaded === true,
    pdf_content_valid: link.pdf_downloaded === true,
  };
  return draft;
}

function callbackFor(action, link, options = {}) {
  const channel = options.channel || (String(action).includes("TELEGRAM") ? "TELEGRAM_DOCUMENT_CHANNEL" : "PROVIDER_EMAIL");
  const token = options.token || `${String(action).replace(/[^A-Z0-9]/g, "").slice(0, 14)}${String(options.update_id || 121000)}`.slice(0, 22);
  const payload = {
    action,
    draft_id: link.draft_id,
    provider_invoice_link_id: options.provider_invoice_link_id === undefined ? link.provider_invoice_link_id : options.provider_invoice_link_id,
    display_id: options.display_id || link.provider_folio || "F-72",
    source_module: options.source_module || "DOCUMENTS",
    source_capability: options.source_capability === undefined ? "DOCUMENT_DELIVERY" : options.source_capability,
    state: options.state || options.screen_id || "DOCUMENT_DELIVERY_CONFIRM",
    screen_id: options.screen_id || options.state || "DOCUMENT_DELIVERY_CONFIRM",
    return_to: options.return_to || "DOCUMENT_DETAIL",
    channel,
    requested_channel: options.requested_channel || channel,
    confirmation_required: options.confirmation_required === undefined ? true : options.confirmation_required,
    ...(options.payload || {}),
  };
  return callbackInput(token, action, {
    draft: options.draft || draftForLink(link),
    chat_id: "CHAT-DELIVERY-CONFIRM",
    telegram_user_id: "USER-DELIVERY-CONFIRM",
    update_id: options.update_id || 121000,
    recent_drafts: [options.draft || draftForLink(link)],
    provider_invoice_links: [link],
    document_delivery_ledger: options.document_delivery_ledger || [],
    action_token: {
      token,
      chat_id: "CHAT-DELIVERY-CONFIRM",
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

function extractConfirmToken(result, action) {
  const button = (result.reply_markup?.inline_keyboard || [])
    .flat()
    .find((item) => String(item.callback_data || "").startsWith("cfdi:"));
  assert(button, "missing confirm callback");
  const token = String(button.callback_data).slice("cfdi:".length);
  const sql = String(result.persistence_sql || "");
  const marker = `'${action}', now() + interval '30 minutes', NULL, '`;
  const start = sql.indexOf(marker);
  assert(start >= 0, "confirm action missing from persistence SQL");
  const jsonStart = start + marker.length;
  const jsonEnd = sql.indexOf("'::jsonb", jsonStart);
  assert(jsonEnd > jsonStart, "confirm payload missing from persistence SQL");
  return {
    token,
    payload: JSON.parse(sql.slice(jsonStart, jsonEnd).replace(/''/g, "'")),
  };
}

function prepareFlow(channel, returnTo = "POST_DOWNLOAD_DELIVERY_READY") {
  const prepareAction = channel === "PROVIDER_EMAIL" ? "DELIVERY_PREPARE_PROVIDER_EMAIL" : "DELIVERY_PREPARE_TELEGRAM_CHANNEL";
  const confirmAction = channel === "PROVIDER_EMAIL" ? "DELIVERY_CONFIRM_PROVIDER_EMAIL" : "DELIVERY_CONFIRM_TELEGRAM_CHANNEL";
  const source = executeCode(handleCode, callbackFor(prepareAction, downloaded, {
    state: returnTo,
    screen_id: returnTo,
    return_to: returnTo,
    channel,
    requested_channel: channel,
    token: `${prepareAction.slice(0, 8)}${returnTo.slice(0, 8)}${channel.slice(0, 4)}`.replace(/[^A-Z0-9]/g, "").slice(0, 22),
  }));
  assert.strictEqual(source.action, "DOCUMENT_DELIVERY_ACTION_REQUESTED");
  assert.strictEqual(source.requested_sandbox_action, "sandbox.documents.delivery.prepare");
  const result = runSummaryFromSource(source, prepareStdout(channel, {
    draft_id: downloaded.draft_id,
    output: { provider_invoice_link_id: downloaded.provider_invoice_link_id },
  }));
  const confirm = extractConfirmToken(result, confirmAction);
  return { source, result, confirm, confirmAction, channel, returnTo };
}

function confirmPrepared(flow, overrides = {}) {
  const link = overrides.link || downloaded;
  const payload = { ...flow.confirm.payload, ...(overrides.payload || {}) };
  const input = callbackInput(flow.confirm.token, flow.confirmAction, {
    draft: overrides.draft || draftForLink(link),
    chat_id: "CHAT-DELIVERY-CONFIRM",
    telegram_user_id: "USER-DELIVERY-CONFIRM",
    update_id: overrides.update_id || 121500,
    recent_drafts: [overrides.draft || draftForLink(link)],
    provider_invoice_links: [link],
    action_token: {
      token: flow.confirm.token,
      chat_id: "CHAT-DELIVERY-CONFIRM",
      action: flow.confirmAction,
      used_at: overrides.used_at ?? null,
      expires_at: overrides.expires_at || payload.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload,
    },
  });
  const result = executeCode(handleCode, input);
  if (result.should_execute_sandbox_action === true) plannedSandboxActions.push(result.requested_sandbox_action);
  return result;
}

function confirmDirect(action, link, options = {}) {
  const result = executeCode(handleCode, callbackFor(action, link, options));
  if (result.should_execute_sandbox_action === true) plannedSandboxActions.push(result.requested_sandbox_action);
  return result;
}

function messageText(value) {
  return String(value?.telegram_message || value?.send_text || "");
}

function assertNoLiteralNewline(value) {
  assert(!messageText(value).includes("\\n"), messageText(value));
}

function assertNoUnsafeUx(value) {
  const text = messageText(value);
  assert(!text.includes("DRAFT-"), text);
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), text);
  assert(!/<[a-z][\s\S]*>/i.test(text), text);
  assert(!text.includes("\\n"), text);
}

function assertNoButtonsWithoutHandler(value) {
  for (const callbackData of allCallbackData(value.reply_markup)) {
    assert(/^cfdi:|^cfdi_nav:|^cfdi_sbx:/.test(callbackData), callbackData);
  }
}

function baseNavInput(text) {
  return {
    update_id: 121900,
    max_seen_update_id: 121900,
    chat_id: "CHAT-DELIVERY-CONFIRM",
    telegram_user_id: "USER-DELIVERY-CONFIRM",
    message_id: "121900",
    text,
    catalog_path: "data/concepts.normalized.json",
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    recent_drafts: [draftForLink(downloaded)],
    provider_invoice_links: [downloaded],
    document_delivery_ledger: [],
    client_invoice_ledger: [],
    client_invoice_summary: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CB-${text}`,
    callback_message_id: "1",
    source_message_id: "",
    authorized_user: { user_id: "OWNER-DELIVERY-CONFIRM", role: "OWNER", enabled: true, telegram_chat_id: "CHAT-DELIVERY-CONFIRM", telegram_user_id: "USER-DELIVERY-CONFIRM" },
    security_user_id: "OWNER-DELIVERY-CONFIRM",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
  };
}

function nodeRun(json) {
  return [{ data: { main: [[{ json }]] } }];
}

function execution({ id = "exec-delivery-confirm", handle = {}, plan = {}, summary = {}, startedAt = "2026-06-14T12:00:00.000Z", stoppedAt = "2026-06-14T12:00:02.000Z" } = {}) {
  const runData = {
    "Handle Commands And Scoring": nodeRun(handle),
    "Build Telegram Dispatch Plan": nodeRun(plan),
  };
  if (Object.keys(summary).length) runData["Build PAC Sandbox Action Summary"] = nodeRun(summary);
  return {
    id,
    workflowId: "workflow-test",
    finished: true,
    status: "success",
    startedAt,
    stoppedAt,
    data: { resultData: { runData } },
  };
}

function dbMock({ draftRow = draftForLink(downloaded), tokens = [] } = {}) {
  return {
    getDraftFull() { return draftRow; },
    getTokensForDraft() { return tokens; },
    getLedgerFull() { return []; },
    getSendLogs() { return []; },
  };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

const emailFlow = prepareFlow("PROVIDER_EMAIL", "POST_DOWNLOAD_DELIVERY_READY");
const channelFlow = prepareFlow("TELEGRAM_DOCUMENT_CHANNEL", "POST_DOWNLOAD_DELIVERY_READY");

check("1_email_prepare_generates_email_confirmation", () => assert(messageText(emailFlow.result).includes("Confirmar envio por correo"), messageText(emailFlow.result)));
check("2_email_confirmation_does_not_mention_channel", () => assert(!/canal de Telegram|Confirmar envio a canal/i.test(messageText(emailFlow.result)), messageText(emailFlow.result)));
check("3_email_confirm_token_action", () => assert.strictEqual(emailFlow.confirm.payload.action, "DELIVERY_CONFIRM_PROVIDER_EMAIL"));
check("4_email_confirm_token_source_capability", () => assert.strictEqual(emailFlow.confirm.payload.source_capability, "DOCUMENT_DELIVERY"));
check("5_email_confirm_token_screen_id", () => assert.strictEqual(emailFlow.confirm.payload.screen_id, "DOCUMENT_DELIVERY_CONFIRM"));
check("6_email_confirm_token_requested_channel", () => assert.strictEqual(emailFlow.confirm.payload.requested_channel, "PROVIDER_EMAIL"));
check("7_email_fresh_confirm_passes_guard", () => assert.strictEqual(confirmPrepared(emailFlow).should_execute_sandbox_action, true));
check("8_email_confirm_routes_send", () => assert.strictEqual(confirmPrepared(emailFlow).requested_sandbox_action, "sandbox.documents.delivery.send"));
check("9_email_confirm_does_not_update_provider", () => assert(!/provider_invoice_links\s+SET|provider_status|pac_sync/i.test(String(confirmPrepared(emailFlow).callback_processing_sql || ""))));
check("10_email_confirm_does_not_send_in_test", () => assert(!String(confirmPrepared(emailFlow).telegram_dispatch_method || "").includes("sendDocument")));

check("11_channel_prepare_generates_channel_confirmation", () => assert(messageText(channelFlow.result).includes("Confirmar envio a canal"), messageText(channelFlow.result)));
check("12_channel_confirmation_does_not_mention_email", () => assert(!/correo del cliente|Confirmar envio por correo/i.test(messageText(channelFlow.result)), messageText(channelFlow.result)));
check("13_channel_confirm_token_action", () => assert.strictEqual(channelFlow.confirm.payload.action, "DELIVERY_CONFIRM_TELEGRAM_CHANNEL"));
check("14_channel_confirm_token_source_capability", () => assert.strictEqual(channelFlow.confirm.payload.source_capability, "DOCUMENT_DELIVERY"));
check("15_channel_confirm_token_screen_id", () => assert.strictEqual(channelFlow.confirm.payload.screen_id, "DOCUMENT_DELIVERY_CONFIRM"));
check("16_channel_confirm_token_requested_channel", () => assert.strictEqual(channelFlow.confirm.payload.requested_channel, "TELEGRAM_DOCUMENT_CHANNEL"));
check("17_channel_fresh_confirm_passes_guard", () => assert.strictEqual(confirmPrepared(channelFlow).should_execute_sandbox_action, true));
check("18_channel_confirm_routes_send", () => assert.strictEqual(confirmPrepared(channelFlow).requested_sandbox_action, "sandbox.documents.delivery.send"));
check("19_channel_confirm_does_not_send_in_test", () => assert(!String(confirmPrepared(channelFlow).telegram_dispatch_method || "").includes("sendDocument")));

check("20_confirm_from_post_download_valid", () => assert.strictEqual(confirmPrepared(prepareFlow("PROVIDER_EMAIL", "POST_DOWNLOAD_DELIVERY_READY")).should_execute_sandbox_action, true));
check("21_confirm_from_invoice_detail_valid", () => assert.strictEqual(confirmPrepared(prepareFlow("PROVIDER_EMAIL", "INVOICE_DETAIL")).should_execute_sandbox_action, true));
check("22_confirm_from_document_detail_valid", () => assert.strictEqual(confirmPrepared(prepareFlow("PROVIDER_EMAIL", "DOCUMENT_DETAIL")).should_execute_sandbox_action, true));
check("23_confirm_without_downloaded_documents_blocks", () => assert.notStrictEqual(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", notDownloaded, { token: "confirmnodocs24" }).should_execute_sandbox_action, true));
check("24_confirm_sandbox_error_blocks", () => assert.notStrictEqual(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", sandboxError, { token: "confirmsbxerr24", draft: draftForLink(sandboxError) }).should_execute_sandbox_action, true));
check("25_used_confirm_token_blocks", () => assert.notStrictEqual(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { token: "confirmused25", used_at: "2026-06-14T10:00:00.000Z" }).should_execute_sandbox_action, true));
check("26_expired_confirm_token_blocks", () => assert.notStrictEqual(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { token: "confirmexpired26", expires_at: "2000-01-01T00:00:00.000Z" }).should_execute_sandbox_action, true));
check("27_prepare_does_not_say_no_se_pudo_enviar", () => assert(!/No se pudo enviar/i.test(messageText(emailFlow.result))));
check("28_prepare_does_not_show_ready_reason", () => assert(!/Motivo:\s*READY/i.test(messageText(emailFlow.result))));
check("29_prepare_does_not_show_technical_states", () => assert(!/TOKEN_VALID|GUARD_OK|Motivo:\s*PENDING/i.test(messageText(emailFlow.result))));
check("30_blocked_error_has_no_literal_newline", () => assertNoLiteralNewline(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { token: "confirmbadguard30", source_capability: "", screen_id: "DOCUMENT_DELIVERY_CONFIRM" })));
check("31_document_recovery_has_no_literal_newline", () => assertNoLiteralNewline(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { token: "confirmused31", used_at: "2026-06-14T10:00:00.000Z" })));
check("32_invalid_confirmation_has_no_literal_newline", () => assertNoLiteralNewline(confirmDirect("DELIVERY_CONFIRM_PROVIDER_EMAIL", downloaded, { token: "confirminvalid32", screen_id: "INVOICE_DETAIL" })));
check("33_fresh_documents_button_valid", () => assert.strictEqual(executeCode(handleCode, baseNavInput("cfdi_nav:docs")).action, "DOCUMENTS_RECENT_LIST"));
check("34_fresh_invoices_button_valid", () => assert.strictEqual(executeCode(handleCode, baseNavInput("cfdi_nav:invoices")).action, "INVOICES_RECENT_LIST"));
check("35_fresh_main_menu_button_valid", () => assert.strictEqual(executeCode(handleCode, baseNavInput("cfdi_nav:menu")).action, "PRODUCT_MENU_MAIN"));
check("36_watcher_no_mismatch_on_both_buttons", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [
      { action: "DELIVERY_PREPARE_PROVIDER_EMAIL", text: "Enviar por correo" },
      { action: "DELIVERY_PREPARE_TELEGRAM_CHANNEL", text: "Enviar a canal" },
      { action: "DELIVERY_STATUS", text: "Ver estado documental" },
    ],
    context: { action: "DOCUMENT_DOWNLOAD_RESULT", telegram_message: "XML/PDF descargados\nEnviar por correo\nEnviar a canal" },
  }).map((item) => item.code);
  assert(!codes.includes("DELIVERY_CHANNEL_MISMATCH"), codes.join(","));
});
check("37_watcher_mismatch_channel_shows_email", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", text: "Confirmar envio a canal" }],
    context: { action: "DOCUMENT_DELIVERY_CONFIRM", telegram_message: "Confirmar envio por correo\nDestino: correo configurado" },
  }).map((item) => item.code);
  assert(codes.includes("DELIVERY_CHANNEL_MISMATCH"), codes.join(","));
});
check("38_watcher_mismatch_email_shows_channel", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_CONFIRM_PROVIDER_EMAIL", text: "Confirmar envio por correo" }],
    context: { action: "DOCUMENT_DELIVERY_CONFIRM", telegram_message: "Confirmar envio a canal\nDestino: canal de Telegram" },
  }).map((item) => item.code);
  assert(codes.includes("DELIVERY_CHANNEL_MISMATCH"), codes.join(","));
});
check("39_watcher_prepare_error_no_se_pudo_enviar", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_CONFIRM_PROVIDER_EMAIL", text: "Confirmar envio por correo" }],
    context: { route: "sandbox.documents.delivery.prepare", action: "DELIVERY_PREPARE_PROVIDER_EMAIL", telegram_message: "No se pudo enviar\nMotivo: humano" },
  }).map((item) => item.code);
  assert(codes.includes("DELIVERY_PREPARE_SHOWS_RESULT_ERROR"), codes.join(","));
});
check("40_watcher_prepare_error_ready_reason", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: downloaded.draft_id, invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_CONFIRM_PROVIDER_EMAIL", text: "Confirmar envio por correo" }],
    context: { route: "sandbox.documents.delivery.prepare", action: "DELIVERY_PREPARE_PROVIDER_EMAIL", telegram_message: "Confirmar envio por correo\nMotivo: READY" },
  }).map((item) => item.code);
  assert(codes.includes("DELIVERY_PREPARE_SHOWS_RESULT_ERROR"), codes.join(","));
});
check("41_watcher_detects_fresh_confirm_token_blocked_after_prepare", () => {
  const counters = {};
  const token = "freshconfirmwatch41";
  const draftId = downloaded.draft_id;
  const tokenRow = {
    token,
    action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    draft_id: draftId,
    chat_id: "CHAT-DELIVERY-CONFIRM",
    used_at: null,
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: "2026-06-14T12:00:01.000Z",
    payload: {
      action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
      draft_id: draftId,
      screen_id: "DOCUMENT_DELIVERY_CONFIRM",
      source_capability: "DOCUMENT_DELIVERY",
      requested_channel: "PROVIDER_EMAIL",
    },
  };
  classifyExecution(execution({
    id: "exec-watch-prepare",
    summary: {
      action: "PAC_SANDBOX_ACTION_RESULT",
      sandbox_draft_id: draftId,
      requested_sandbox_action: "sandbox.documents.delivery.prepare",
      telegram_message: "Confirmar envio por correo",
    },
  }), {
    db: dbMock({ draftRow: draftForLink(downloaded), tokens: [tokenRow] }),
    args: {},
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters,
  });
  const blocked = classifyExecution(execution({
    id: "exec-watch-blocked",
    startedAt: "2026-06-14T12:00:03.000Z",
    stoppedAt: "2026-06-14T12:00:04.000Z",
    handle: {
      action: "DOCUMENT_ACTION_BLOCKED",
      json_debug: { callback_action: "DELIVERY_CONFIRM_PROVIDER_EMAIL" },
      action_token: { token, action: "DELIVERY_CONFIRM_PROVIDER_EMAIL", draft_id: draftId, payload: tokenRow.payload, used_at: null, expires_at: "2099-01-01T00:00:00.000Z" },
      telegram_message: "No se pudo enviar documentos.\nConfirmacion documental invalida o vencida.",
    },
  }), {
    db: dbMock({ draftRow: draftForLink(downloaded), tokens: [tokenRow] }),
    args: {},
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters,
  });
  assert(failureCodes(blocked).includes("DELIVERY_CONFIRM_TOKEN_INVALID_AFTER_PREPARE"), failureCodes(blocked).join(","));
});
check("42_no_real_delivery", () => assert(plannedSandboxActions.every((item) => item === "sandbox.documents.delivery.send")));
check("43_no_real_email", () => assert(process.env.SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED !== "true"));
check("44_no_real_channel", () => assert(process.env.SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED !== "true"));
check("45_no_real_xml_pdf", () => assert(!/runtime[\\/].*\\.(xml|pdf)|sandbox-document-download/i.test([messageText(emailFlow.result), messageText(channelFlow.result)].join("\n"))));
check("46_no_real_payments", () => assert(!/MARK_PAYMENT|Marcar pagada|Cobranza/i.test(JSON.stringify([emailFlow.result.reply_markup, channelFlow.result.reply_markup]))));
check("47_no_full_uuid_visible", () => [emailFlow.result, channelFlow.result, confirmPrepared(emailFlow)].forEach(assertNoUnsafeUx));
check("48_no_draft_visible_normal_ux", () => [emailFlow.result, channelFlow.result, confirmPrepared(emailFlow)].forEach(assertNoUnsafeUx));
check("49_no_raw_html", () => [emailFlow.result, channelFlow.result, confirmPrepared(emailFlow)].forEach(assertNoUnsafeUx));
check("50_no_literal_newline", () => [emailFlow.result, channelFlow.result, confirmPrepared(emailFlow)].forEach(assertNoLiteralNewline));
check("51_no_buttons_without_handler", () => [emailFlow.result, channelFlow.result].forEach(assertNoButtonsWithoutHandler));
check("52_repo_safety_pass", () => {
  const result = spawnSync(process.execPath, ["scripts/test-repo-safety.js"], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stdout + result.stderr);
});

console.log("Telegram Delivery Confirm Token Validity And Error Render Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

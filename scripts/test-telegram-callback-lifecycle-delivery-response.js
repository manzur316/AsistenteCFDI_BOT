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
    provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-F67",
    draft_id: overrides.draft_id || "DRAFT-20260612-5413",
    client_id: overrides.client_id || "CLI-REAL-BILBAO",
    client_display: overrides.client_display || "Real Bilbao",
    provider_folio: overrides.provider_folio || "F67",
    provider_uuid: "123e4567-e89b-12d3-a456-426614174000",
    provider_invoice_uid: "UID-F67-001",
    provider_invoice_id: "PACINV-F67-001",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    artifact_status: "DOWNLOADED",
    xml_downloaded: true,
    pdf_downloaded: true,
    total: 928,
    updated_at: "2026-06-12T09:00:00.000Z",
  };
}

function draftForLink(link) {
  const draft = sandboxStampedDraft(link.draft_id);
  draft.chat_id = "CHAT-DELIVERY-LIFECYCLE";
  draft.client_id = link.client_id;
  draft.client_snapshot = { client_id: link.client_id, display_name: link.client_display };
  draft.total = link.total;
  draft.sandbox_pac_summary = {
    artifact_status: "DOWNLOADED",
    uuid: link.provider_uuid,
    cfdi_uid: link.provider_invoice_uid,
    pac_invoice_id: link.provider_invoice_id,
    xml_downloaded: true,
    pdf_downloaded: true,
    xml_content_valid: true,
    pdf_content_valid: true,
  };
  return draft;
}

function documentCallbackInput(token, action, link, options = {}) {
  const payload = {
    state: "DOCUMENT_DELIVERY_CONFIRM",
    screen_id: "DOCUMENT_DELIVERY_CONFIRM",
    action,
    draft_id: link.draft_id,
    provider_invoice_link_id: link.provider_invoice_link_id,
    display_id: link.provider_folio,
    source_module: "DOCUMENTS",
    source_list_kind: "DOCUMENTS_RECENT",
    return_to: "DOCUMENT_DETAIL",
    page: 1,
    channel: options.channel || "PROVIDER_EMAIL",
    confirmation_required: true,
  };
  return callbackInput(token, action, {
    draft: draftForLink(link),
    chat_id: "CHAT-DELIVERY-LIFECYCLE",
    telegram_user_id: "USER-DELIVERY-LIFECYCLE",
    update_id: options.update_id || 99701,
    recent_drafts: [draftForLink(link)],
    provider_invoice_links: [link],
    action_token: {
      token,
      chat_id: "CHAT-DELIVERY-LIFECYCLE",
      action,
      used_at: options.used_at ?? null,
      expires_at: options.expires_at || "2099-01-01T00:00:00.000Z",
      draft_id: link.draft_id,
      payload,
    },
  });
}

function buttonTexts(markup) {
  return (markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function runSummaryFromSource(source, stdout) {
  return executeCode(summaryCode, { stdout }, (nodeName) => {
    if (nodeName === "Restore Processing Lock Context" || nodeName === "Handle Commands And Scoring") return [{ json: source }];
    return [];
  });
}

const link = providerLink();

check("delivery_callback_request_marks_token_used_and_executes_action", () => {
  const source = executeCode(handleCode, documentCallbackInput("delcycle0001", "DELIVERY_CONFIRM_PROVIDER_EMAIL", link));
  assert.strictEqual(source.action, "DOCUMENT_DELIVERY_RESULT");
  assert.strictEqual(source.should_execute_sandbox_action, true);
  assert.strictEqual(source.requested_sandbox_action, "sandbox.documents.delivery.send");
  assert(source.callback_processing_sql.includes("UPDATE cfdi_action_tokens SET used_at"), "delivery token must be marked used");
  assert(source.callback_processing_sql.includes("DOCUMENT_DELIVERY_ACTION_IN_PROGRESS"), "delivery in-progress event missing");
  assert(!source.telegram_message.includes("DRAFT-"), source.telegram_message);
  return source.requested_sandbox_action;
});

check("delivery_action_summary_builds_document_result", () => {
  const source = executeCode(handleCode, documentCallbackInput("delcycle0002", "DELIVERY_CONFIRM_PROVIDER_EMAIL", link));
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
      draft_id: link.draft_id,
      channel: "PROVIDER_EMAIL",
      delivery_ledger: { delivery_status: "SENT", channel: "PROVIDER_EMAIL", recipient_redacted: "r***@example.test" },
    },
  });
  const result = runSummaryFromSource(source, stdout);
  assert(result.telegram_message.includes("Envio completado"), result.telegram_message);
  assert(result.telegram_message.includes("Factura: F67"), result.telegram_message);
  assert(!result.telegram_message.includes("DRAFT-"), result.telegram_message);
  assert(!/[A-Z]:[\\/]/i.test(result.telegram_message), result.telegram_message);
  return result.sandbox_action_status;
});

check("delivery_token_used_recovers_with_document_keyboard", () => {
  const result = executeCode(handleCode, documentCallbackInput("delcycleused", "DELIVERY_CONFIRM_PROVIDER_EMAIL", link, { used_at: "2026-01-01T00:00:00.000Z" }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(!result.should_execute_sandbox_action);
  const labels = buttonTexts(result.reply_markup).join(",");
  assert(labels.includes("Documentos"), labels);
  assert(labels.includes("Facturas"), labels);
  assert(labels.includes("Menu principal"), labels);
  assert(labels.includes("Ayuda"), labels);
  assert(!labels.includes("Marcar pagada"), labels);
  assert(!labels.includes("Ver factura"), labels);
  assert(!labels.includes("Crear nuevo borrador"), labels);
  return "blocked";
});

console.log("Telegram Callback Lifecycle Delivery Response Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

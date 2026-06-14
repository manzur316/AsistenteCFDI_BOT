const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

function loadWorkflow() {
  return JSON.parse(fs.readFileSync(workflowPath, "utf8"));
}

function getNodeCode(name) {
  const workflow = loadWorkflow();
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node?.parameters?.jsCode) throw new Error(`No encontre nodo ${name}.`);
  return node.parameters.jsCode;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function runSummary(stdout, source = {}) {
  const code = getNodeCode("Build PAC Sandbox Action Summary");
  return executeCode(code, { stdout }, () => [{ json: source }]);
}

function tokenRecord(token, action, overrides = {}) {
  return {
    token,
    chat_id: overrides.chat_id || "6573879494",
    action,
    used_at: overrides.used_at ?? null,
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    payload: overrides.payload || {},
    draft_id: overrides.draft_id || null,
  };
}

function sandboxStampedDraft(draftId = "DRAFT-20260608-204158-173694529") {
  return {
    draft_id: draftId,
    chat_id: "6573879494",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    client_id: "CLI-REAL-BILBAO",
    client_snapshot: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao" },
    total: 1136.8,
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      xml_content_valid: true,
      pdf_content_valid: true,
      xml_downloaded: true,
      pdf_downloaded: true,
      pdf_source: "PROVIDER",
    },
  };
}

function baseSource(overrides = {}) {
  const draftId = overrides.draft_id || "DRAFT-20260608-204158-173694529";
  return {
    chat_id: "6573879494",
    update_id: 7171701,
    max_seen_update_id: 7171701,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: draftId,
    sandbox_draft_context: {
      draft_id: draftId,
      client_display_name: "Real Bilbao",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      total: 1136.8,
    },
    ...overrides,
  };
}

function prepareStdout(channel, overrides = {}) {
  return JSON.stringify({
    ok: true,
    status: overrides.status || "READY",
    action: "sandbox.documents.delivery.prepare",
    duration_ms: 80,
    artifacts: [],
    warnings: overrides.warnings || [],
    errors: overrides.errors || [],
    sensitive_findings: [],
    output: {
      draft_id: overrides.draft_id || "DRAFT-20260608-204158-173694529",
      client_id: "CLI-REAL-BILBAO",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      channel,
      idempotency_key: "document_delivery:SANDBOX:DRAFT-20260608-204158-173694529:" + channel + ":dest:xml:pdf",
      confirmation_required: true,
      documents_valid: true,
      xml_content_valid: true,
      pdf_content_valid: true,
      confirmation_summary: {
        client_display_name: "Real Bilbao",
        folio: "F-TEST",
        total: 1136.8,
        channel,
        recipient_redacted: channel === "PROVIDER_EMAIL" ? "r***@example.com" : "canal documental",
        documents: ["XML", "PDF"],
        provider: "Factura.com Sandbox",
      },
      ...(overrides.output || {}),
    },
  });
}

function callbackInput(token, action, overrides = {}) {
  const draft = overrides.draft || sandboxStampedDraft(overrides.draft_id);
  const draftId = draft.draft_id;
  const normalizedAction = String(action || "").toUpperCase();
  const isDeliveryConfirm = normalizedAction.startsWith("DELIVERY_CONFIRM_");
  const isDeliveryForce = normalizedAction.startsWith("DELIVERY_FORCE_");
  const isDeliveryAction = isDeliveryConfirm || isDeliveryForce;
  const isDownloadAction = normalizedAction === "DOWNLOAD_SANDBOX_ARTIFACTS";
  const channel = overrides.channel || (String(action).includes("PROVIDER_EMAIL") ? "PROVIDER_EMAIL" : "TELEGRAM_DOCUMENT_CHANNEL");
  const defaultState = isDeliveryAction
    ? "DOCUMENT_DELIVERY_CONFIRM"
    : isDownloadAction
      ? "DOCUMENT_DOWNLOAD_CONFIRM"
      : undefined;
  const payload = {
    ...(defaultState ? { state: defaultState, screen_id: defaultState } : {}),
    action,
    draft_id: draftId,
    ...(isDeliveryAction || isDownloadAction ? {
      channel,
      requested_channel: channel,
      source_module: "DOCUMENTS",
      source_capability: isDeliveryAction ? "DOCUMENT_DELIVERY" : "DOCUMENT_DOWNLOAD",
      display_id: overrides.display_id || "F-TEST",
      provider_invoice_link_id: overrides.provider_invoice_link_id || "PIL-TEST",
    } : {}),
    confirmation_required: true,
    force: String(action).includes("FORCE"),
  };
  return {
    update_id: overrides.update_id || 7171702,
    max_seen_update_id: overrides.update_id || 7171702,
    chat_id: "6573879494",
    telegram_user_id: "6573879494",
    message_id: "99",
    text: `cfdi:${token}`,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: tokenRecord(token, action, {
      draft_id: draftId,
      payload,
      expires_at: overrides.expires_at,
      used_at: overrides.used_at,
    }),
    recent_callback_events: [],
    recent_drafts: [draft],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-717-${token}`,
    callback_message_id: "98",
    source_message_id: "",
    authorized_user: {
      user_id: "OWNER-TEST",
      telegram_chat_id: "6573879494",
      telegram_user_id: "6573879494",
      role: "OWNER",
      enabled: true,
    },
    security_user_id: "OWNER-TEST",
    security_role: "OWNER",
    security_allowed: true,
    security_enforcement: true,
    ...overrides,
  };
}

function allCallbackData(replyMarkup) {
  return (replyMarkup?.inline_keyboard || [])
    .flat()
    .map((button) => button.callback_data)
    .filter(Boolean);
}

module.exports = {
  allCallbackData,
  baseSource,
  callbackInput,
  executeCode,
  getNodeCode,
  loadWorkflow,
  prepareStdout,
  runSummary,
  sandboxStampedDraft,
  workflowPath,
};

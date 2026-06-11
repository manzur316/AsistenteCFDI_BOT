const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node) throw new Error(`No encontre nodo ${name}.`);
  return node;
}

function executeCode(code, input, itemsProvider = () => []) {
  const fn = new Function("require", "$json", "$node", "$items", "$itemIndex", code);
  return fn(require, input, {}, itemsProvider, 0)[0].json;
}

function runSummary(stdout, source = {}) {
  return executeCode(summaryCode, { stdout }, () => [{ json: source }]);
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

function sandboxStampedDraft(draftId = "DRAFT-20260607-153936-173694386") {
  return {
    draft_id: draftId,
    chat_id: "6573879494",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    client_id: "CLIENT-TEST",
    client_snapshot: { client_id: "CLIENT-TEST", display_name: "Cliente Demo" },
    total: 1136.8,
    sandbox_pac_summary: {
      mode: "mock",
      artifact_status: "NOT_REQUESTED",
      xml_provider_available: false,
      pdf_provider_available: false,
      xml_downloaded: false,
      pdf_downloaded: false,
    },
  };
}

function callbackInput(token, overrides = {}) {
  const draft = overrides.draft || sandboxStampedDraft(overrides.draft_id);
  const draftId = draft.draft_id;
  return {
    update_id: overrides.update_id || 7163001,
    max_seen_update_id: overrides.update_id || 7163001,
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
    action_token: tokenRecord(token, overrides.action || "DOWNLOAD_SANDBOX_ARTIFACTS", {
      chat_id: overrides.token_chat_id,
      draft_id: draftId,
      payload: { state: "DRAFT_DETAIL", action: overrides.action || "DOWNLOAD_SANDBOX_ARTIFACTS", draft_id: draftId },
      expires_at: overrides.expires_at,
      used_at: overrides.used_at,
    }),
    recent_callback_events: [],
    recent_drafts: [draft],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 1, descartados: 0, bloqueados: 0 },
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-7163-${token}`,
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
  };
}

function assertNotInvalidButton(result) {
  const text = String(result.telegram_message || result.send_text || "");
  assert(!/Boton invalido o vencido/i.test(text), "valid download token was treated as invalid/expired");
  assert.notStrictEqual(result.action, "CALLBACK_TOKEN_INVALID", "valid download token returned CALLBACK_TOKEN_INVALID");
}

function buttonLabels(result) {
  return (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.text);
}

function assertContextRecovered(result, reason) {
  assert.strictEqual(result.action, "CALLBACK_TOKEN_CONTEXT_RECOVERED");
  assert.strictEqual(result.json_debug?.callback_reason, reason);
  assert.strictEqual(result.json_debug?.action_executed, false);
  assert(!result.should_execute_sandbox_action, "recovered token must not execute sandbox action");
  assert(!String(result.sandbox_execute_command || "").includes("sandbox.draft.download-artifacts"), "recovered token must not build download command");
  assert(!String(result.callback_processing_sql || "").includes("UPDATE cfdi_action_tokens SET used_at"), "recovered token must not consume old token");
  assert(buttonLabels(result).includes("Descargar XML/PDF sandbox"), "fresh download button missing");
}

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("workflow_allows_download_sandbox_artifacts_token", () => {
  assert(handleCode.includes("'DOWNLOAD_SANDBOX_ARTIFACTS'"), "download action missing from inline allowed actions");
  assert(/DOWNLOAD_SANDBOX_ARTIFACTS['"]?: 'PAC_SANDBOX'/.test(handleCode), "download action missing PAC_SANDBOX category");
  assert(/DOWNLOAD_SANDBOX_ARTIFACTS['"]?: true/.test(handleCode), "download action must be one-time");
  return "allowed";
});

check("valid_download_token_routes_to_sandbox_download_action", () => {
  const token = "mq3y7dt1ahn7ikqt5aofbb";
  const result = executeCode(handleCode, callbackInput(token));
  assertNotInvalidButton(result);
  assert.strictEqual(result.action, "DRAFT_SANDBOX_DOWNLOAD_REQUESTED");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.download-artifacts");
  assert(String(result.sandbox_execute_command || "").includes("sandbox.draft.download-artifacts"), "missing action layer command");
  assert(String(result.callback_processing_sql || "").includes("sandbox.draft.download-artifacts"), "missing download event payload");
  assert(String(result.callback_processing_sql || "").includes("UPDATE cfdi_action_tokens SET used_at"), "one-time token not marked used");
  assert(!/Boton invalido o vencido/i.test(result.telegram_message));
  return result.requested_sandbox_action;
});

check("mock_download_needs_runtime_is_reported_safely_not_invalid", () => {
  const stdout = JSON.stringify({
    ok: false,
    status: "NEEDS_RUNTIME",
    action: "sandbox.draft.download-artifacts",
    duration_ms: 50,
    artifacts: [],
    warnings: ["No se encontro identidad sandbox descargable."],
    errors: ["SANDBOX_PAC_IDENTITY_MISSING"],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-20260607-153936-173694386",
      client_display_name: "Cliente Demo",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      provider: "Factura.com Sandbox",
      artifact_status: "NEEDS_RUNTIME",
      xml_provider_available: false,
      pdf_provider_available: false,
      xml_downloaded: false,
      pdf_downloaded: false,
      storage_updated: false,
    },
  });
  const result = runSummary(stdout, {
    chat_id: "6573879494",
    update_id: 7163002,
    max_seen_update_id: 7163002,
    workflowVersion: "CFDI_LOCAL_INGEST_V1",
    sandbox_draft_id: "DRAFT-20260607-153936-173694386",
    sandbox_draft_context: {
      draft_id: "DRAFT-20260607-153936-173694386",
      client_display_name: "Cliente Demo",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
    },
  });
  assertNotInvalidButton(result);
  assert.strictEqual(result.sandbox_action_status, "NEEDS_RUNTIME");
  assert(/Descarga sandbox no disponible/.test(result.telegram_message));
  assert(/mock sandbox/.test(result.telegram_message));
  assert(/timbrado sandbox live/i.test(result.telegram_message));
  assert(/XML descargado: no/.test(result.telegram_message));
  assert(/PDF descargado: no/.test(result.telegram_message));
  assert(!/sendDocument|<\?xml|%PDF|[A-Za-z]:[\\/]/i.test(result.telegram_message), "unsafe document/path leak");
  return result.sandbox_action_status;
});

check("expired_download_token_recovers_draft_context", () => {
  const result = executeCode(handleCode, callbackInput("expiredtokendownload", {
    expires_at: "2000-01-01T00:00:00.000Z",
    update_id: 7163003,
  }));
  assertContextRecovered(result, "token_expirado");
  assert(/El boton anterior vencio/.test(result.telegram_message));
  return result.action;
});

check("used_download_token_recovers_download_state", () => {
  const draft = sandboxStampedDraft("DRAFT-20260607-153936-173694386");
  draft.sandbox_pac_summary = {
    artifact_status: "DOWNLOADED",
    xml_downloaded: true,
    pdf_downloaded: true,
    xml_content_valid: true,
    pdf_content_valid: true,
    pdf_source: "PROVIDER",
  };
  const result = executeCode(handleCode, callbackInput("usedtokendownload01", {
    used_at: "2026-06-07T15:00:00.000Z",
    update_id: 7163004,
    draft,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(/Esta descarga ya fue procesada/.test(result.telegram_message));
  assert(/XML\/PDF ya estan disponibles/.test(result.telegram_message));
  assert(!/Boton invalido|token_usado/.test(result.telegram_message), "raw token_usado recovery leaked");
  const callbacks = (result.reply_markup?.inline_keyboard || []).flat().map((button) => button.callback_data).filter(Boolean);
  assert(callbacks.length > 0, "used download token must include recovery buttons");
  return result.action;
});

check("wrong_chat_download_token_is_rejected", () => {
  const result = executeCode(handleCode, callbackInput("wrongchattokendown", {
    token_chat_id: "999999",
    update_id: 7163005,
  }));
  assert.strictEqual(result.action, "CALLBACK_TOKEN_INVALID");
  assert(/Este boton no pertenece a este chat/.test(result.telegram_message));
  return result.action;
});

check("unknown_action_token_with_draft_recovers_context", () => {
  const result = executeCode(handleCode, callbackInput("unknownactiondown", {
    action: "DOWNLOAD_SANDBOX_UNKNOWN",
    update_id: 7163006,
  }));
  assertContextRecovered(result, "accion_invalida");
  assert(/accion vigente/.test(result.telegram_message));
  return result.action;
});

console.log("Telegram Sandbox Download Token Routing Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);





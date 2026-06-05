const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxAction, ACTIONS } = require("./lib/sandbox-action-runner");
const {
  extractSandboxInvoiceRef,
  hasSandboxCancellation,
  hasSandboxCancellationInProgress,
  validateDraftForSandboxCancel,
} = require("./lib/sandbox-draft-cancel-action");
const { parseCallbackData } = require("./lib/telegram-action-token-utils");
const { ROLES } = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");
const tempRoot = path.join(root, "runtime", "test-sandbox-cfdi-lifecycle-cancellation");
const catalogPath = "C:/Users/Juandi Gamer/Documents/Flujo N8N CFDI/data/concepts.normalized.json";

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function cleanTemp() {
  if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
  fs.mkdirSync(tempRoot, { recursive: true });
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

function authorizedUser(role = ROLES.OWNER) {
  return {
    user_id: `USER-7-7-${role}`,
    telegram_chat_id: "CHAT-7-7",
    telegram_user_id: "TGUSER-7-7",
    display_name: "Usuario Demo",
    role,
    enabled: true,
  };
}

function baseInput(text, role = ROLES.OWNER, extra = {}) {
  const user = extra.authorized_user || authorizedUser(role);
  return {
    update_id: extra.update_id || 7701,
    max_seen_update_id: extra.max_seen_update_id || extra.update_id || 7701,
    chat_id: "CHAT-7-7",
    telegram_user_id: "TGUSER-7-7",
    message_id: String((extra.update_id || 7701) + 100),
    text,
    catalog_path: catalogPath,
    workflow_version: "CFDI_LOCAL_INGEST_V1",
    clients: [],
    tax_rules: [],
    chat_state: null,
    action_token: null,
    recent_callback_events: [],
    recent_drafts: [],
    bot_state: {},
    today_summary: { pendientes: 0, aprobados: 0, descartados: 0, bloqueados: 0 },
    source_kind: "MESSAGE",
    callback_query_id: "",
    callback_message_id: "",
    source_message_id: "",
    authorized_user: user,
    security_user_id: user.user_id,
    security_role: user.role,
    security_allowed: true,
    security_enforcement: true,
    ...extra,
  };
}

function callbackInput(token, action, draft, extra = {}) {
  return baseInput(`cfdi:${token}`, extra.role || ROLES.OWNER, {
    update_id: extra.update_id || 7710,
    source_kind: "CALLBACK_QUERY",
    callback_query_id: `CALLBACK-7-7-${extra.update_id || 1}`,
    callback_message_id: "177",
    source_message_id: "177",
    action_token: {
      token,
      chat_id: "CHAT-7-7",
      draft_id: draft?.draft_id,
      action,
      payload: { draft_id: draft?.draft_id, action },
      used_at: null,
      expires_at: "2099-01-01T00:00:00.000Z",
    },
    recent_drafts: draft ? [draft] : [],
    ...extra,
  });
}

function callbacks(result) {
  return (result.reply_markup?.inline_keyboard || [])
    .flat()
    .map((button) => ({ text: String(button.text || ""), callback_data: String(button.callback_data || "") }));
}

function callbackForText(result, text) {
  const item = callbacks(result).find((button) => button.text === text || button.text.includes(text));
  return item?.callback_data || "";
}

function safeCallbacks(result) {
  for (const button of callbacks(result)) {
    assert(button.callback_data.length <= 32, `${button.text}: ${button.callback_data}`);
    assert(/^[a-zA-Z0-9_:.-]+$/.test(button.callback_data), button.callback_data);
    assert(!/[A-Z&]{3,4}\d{6}[A-Z0-9]{3}/i.test(button.callback_data), "RFC in callback");
    assert(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(button.callback_data), "UUID in callback");
    assert(!/\d+\.\d{2}/.test(button.callback_data), "amount in callback");
    assert(!/[\\/]/.test(button.callback_data), "path in callback");
    if (button.callback_data.startsWith("cfdi:")) assert(parseCallbackData(button.callback_data), button.callback_data);
  }
  return true;
}

function validStampedDraft(overrides = {}) {
  return {
    draft_id: "DRAFT-77-STAMPED",
    status: "SANDBOX_TIMBRADO",
    emitter_id: "EMITTER-DEMO",
    update_id: 7700,
    message_original: "venta de camara CCTV",
    ready_to_copy: true,
    action: "SUGERIR",
    amount: 1000,
    subtotal: 1000,
    tax_mode: "ADD_IVA",
    iva_amount: 160,
    iva_retention_amount: 0,
    isr_retention_amount: 0,
    total: 1160,
    blockers: [],
    pac_invoice_id: "FACTURA-COM-MOCK-CFDI-77",
    uuid: "00000000-0000-4000-8000-000000000777",
    cfdi_uid: "FACTURA-COM-MOCK-CFDI-77",
    sandbox_identity: {
      pac_invoice_id: "FACTURA-COM-MOCK-CFDI-77",
      uuid: "00000000-0000-4000-8000-000000000777",
    },
    client_snapshot: {
      client_id: "CLIENT-DEMO",
      display_name: "Cliente Demo",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
      objeto_imp: "02",
    },
    ...overrides,
  };
}

function sandboxCancelStdout(status = "OK", output = {}) {
  return JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.cancel",
    status,
    ok: status === "OK",
    duration_ms: 83,
    artifacts: output.artifacts || [{ key: "output.manifest_path", path: "runtime/storage-sandbox/draft-cancellations/demo/sandbox-cancel-response.json" }],
    warnings: output.warnings || [],
    errors: output.errors || [],
    sensitive_findings: [],
    output: {
      draft_id: "DRAFT-77-STAMPED",
      provider: "Factura.com Sandbox",
      invoice_status: status === "OK" ? "SANDBOX_CANCELADO" : "SANDBOX_CANCEL_ERROR",
      artifacts_count: 1,
      original_artifacts_deleted: false,
      ...output,
    },
  });
}

function assertNoSensitive(value) {
  const text = JSON.stringify(value);
  assert(!/https:\/\/api\.factura\.com/i.test(text), "production URL");
  assert(!/F-Api-Key|F-Secret-Key|F-PLUGIN/i.test(text), "PAC credentials");
  assert(!/<\?xml|<cfdi:Comprobante|%PDF-|sendDocument|sendMediaGroup|sendPhoto|sendDocument/i.test(text), "document leak/send");
}

cleanTemp();

const workflowText = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(workflowText);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("cancel_action_allowlisted", () => {
  assert(ACTIONS.includes("sandbox.draft.cancel"));
  assert(handleCode.includes("REQUEST_CANCEL_SANDBOX"));
  assert(handleCode.includes("CONFIRM_CANCEL_SANDBOX"));
  assert(handleCode.includes("sandbox.draft.cancel"));
  return "sandbox.draft.cancel";
});

check("no_cancel_button_unless_sandbox_timbrado", () => {
  for (const status of ["PENDIENTE", "APROBADO", "SANDBOX_ERROR", "SANDBOX_CANCELADO", "PRODUCTION_STAMPED"]) {
    const draft = validStampedDraft({ status, draft_id: `DRAFT-${status}` });
    const result = executeCode(handleCode, baseInput(`/detalle ${draft.draft_id}`, ROLES.OWNER, { update_id: 7720, recent_drafts: [draft] }));
    assert(!callbacks(result).some((button) => button.text.includes("Cancelar CFDI sandbox")), status);
  }
  return "hidden";
});

check("cancel_button_for_sandbox_timbrado_uses_safe_token", () => {
  const draft = validStampedDraft();
  const result = executeCode(handleCode, baseInput(`/detalle ${draft.draft_id}`, ROLES.OWNER, { update_id: 7721, recent_drafts: [draft] }));
  const callbackData = callbackForText(result, "Cancelar CFDI sandbox");
  assert(callbackData.startsWith("cfdi:"), callbackData);
  assert(callbackData.length <= 32, callbackData);
  safeCallbacks(result);
  return callbackData;
});

check("first_click_only_shows_confirmation", () => {
  const draft = validStampedDraft();
  const result = executeCode(handleCode, callbackInput("CANCEL77REQ1", "REQUEST_CANCEL_SANDBOX", draft, { update_id: 7722 }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_CANCEL_CONFIRMATION_SHOWN");
  assert.strictEqual(result.should_execute_sandbox_action, undefined);
  assert(String(result.telegram_message || "").includes("Confirmas cancelar este CFDI sandbox"));
  assert(callbacks(result).some((button) => button.text.includes("cancelar sandbox")));
  assert(callbacks(result).some((button) => button.text.includes("No, volver")));
  assert(String(result.persistence_sql || "").includes("DRAFT_SANDBOX_CANCEL_REQUESTED"));
  assert(String(result.persistence_sql || "").includes("DRAFT_SANDBOX_CANCEL_CONFIRMATION_SHOWN"));
  assert(!String(result.persistence_sql || "").includes("SANDBOX_CANCELANDO"));
  safeCallbacks(result);
  return "confirmation";
});

check("second_click_executes_cancellation", () => {
  const draft = validStampedDraft();
  const result = executeCode(handleCode, callbackInput("CANCEL77OK01", "CONFIRM_CANCEL_SANDBOX", draft, { update_id: 7723 }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_CANCEL_IN_PROGRESS");
  assert.strictEqual(result.should_execute_sandbox_action, true);
  assert.strictEqual(result.requested_sandbox_action, "sandbox.draft.cancel");
  assert(result.sandbox_execute_command.startsWith("node scripts/run-sandbox-action.js sandbox.draft.cancel"));
  assert(result.sandbox_execute_command.includes("--draft-id DRAFT-77-STAMPED"));
  assert(result.sandbox_execute_command.includes("--draft-json-b64 "));
  assert(result.callback_processing_sql.includes("SANDBOX_CANCELANDO"));
  assert(result.callback_processing_sql.includes("DRAFT_SANDBOX_CANCEL_IN_PROGRESS"));
  assert(!/[;&|`$<>]/.test(result.sandbox_execute_command), result.sandbox_execute_command);
  assertNoSensitive(result);
  return "execute";
});

check("normal_user_cannot_cancel", () => {
  const draft = validStampedDraft();
  const result = executeCode(handleCode, callbackInput("CANCEL77NOPE", "CONFIRM_CANCEL_SANDBOX", draft, {
    update_id: 7724,
    role: ROLES.ASSISTANT_OPERATOR,
    authorized_user: authorizedUser(ROLES.ASSISTANT_OPERATOR),
    security_role: ROLES.ASSISTANT_OPERATOR,
  }));
  assert.strictEqual(result.action, "ACCESS_DENIED");
  assert.strictEqual(result.should_execute_sandbox_action, undefined);
  return "denied";
});

check("blocks_missing_sandbox_identity_before_execute", () => {
  const draft = validStampedDraft({
    pac_invoice_id: null,
    uuid: null,
    cfdi_uid: null,
    sandbox_identity: {},
  });
  const result = executeCode(handleCode, callbackInput("CANCEL77MISS", "CONFIRM_CANCEL_SANDBOX", draft, { update_id: 7725 }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_CANCEL_BLOCKED");
  assert(String(result.telegram_message || "").includes("falta identidad sandbox"));
  assert(!result.should_execute_sandbox_action);
  assert(String(result.persistence_sql || "").includes("DRAFT_SANDBOX_CANCEL_BLOCKED"));
  return "blocked";
});

check("idempotency_avoids_double_cancellation", () => {
  const draft = validStampedDraft();
  const result = executeCode(handleCode, callbackInput("CANCEL77DUP1", "CONFIRM_CANCEL_SANDBOX", draft, {
    update_id: 7726,
    recent_callback_events: [{
      event_type: "DRAFT_SANDBOX_CANCEL_IN_PROGRESS",
      created_at: new Date().toISOString(),
      idempotency_key: "draft_sandbox_cancel:DRAFT-77-STAMPED",
      idempotency_status: "IN_PROGRESS",
      draft_id: "DRAFT-77-STAMPED",
      sandbox_action: "sandbox.draft.cancel",
    }],
  }));
  assert.strictEqual(result.action, "CALLBACK_DUPLICATE_BLOCKED");
  assert.strictEqual(result.callback_ack_text, "Accion ya en proceso.");
  return "blocked";
});

check("summary_success_updates_sandbox_cancelado", () => {
  const source = executeCode(handleCode, callbackInput("CANCEL77SUM1", "CONFIRM_CANCEL_SANDBOX", validStampedDraft(), { update_id: 7727 }));
  const result = executeCode(summaryCode, { stdout: sandboxCancelStdout("OK") }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_CANCELADO");
  assert(result.telegram_message.includes("Cancelacion sandbox OK"));
  assert(result.telegram_message.includes("Factura.com Sandbox"));
  assert(result.telegram_message.includes("No se envian documentos por Telegram"));
  assert(result.persistence_sql.includes("DRAFT_SANDBOX_CANCEL_RESULT"));
  assert(result.persistence_sql.includes("SANDBOX_CANCELADO"));
  assertNoSensitive(result);
  return result.sandbox_draft_status;
});

check("summary_error_updates_sandbox_cancel_error", () => {
  const source = executeCode(handleCode, callbackInput("CANCEL77SUM2", "CONFIRM_CANCEL_SANDBOX", validStampedDraft(), { update_id: 7728 }));
  const result = executeCode(summaryCode, { stdout: sandboxCancelStdout("ERROR", { errors: ["PAC_CANCEL_ERROR"] }) }, () => [{ json: source }]);
  assert.strictEqual(result.sandbox_draft_status, "SANDBOX_CANCEL_ERROR");
  assert(result.telegram_message.includes("Cancelacion sandbox no realizada"));
  assert(result.persistence_sql.includes("SANDBOX_CANCEL_ERROR"));
  return result.sandbox_draft_status;
});

check("action_layer_blocks_missing_draft", async () => {
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    actionResultsRoot: path.join(tempRoot, "missing", "results"),
    actionAuditRoot: path.join(tempRoot, "missing", "audit"),
    storageRoot: path.join(tempRoot, "missing", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_NOT_FOUND"));
  return result.status;
});

check("action_layer_blocks_not_stamped", async () => {
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validStampedDraft({ status: "APROBADO" }),
    actionResultsRoot: path.join(tempRoot, "not-stamped", "results"),
    actionAuditRoot: path.join(tempRoot, "not-stamped", "audit"),
    storageRoot: path.join(tempRoot, "not-stamped", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_NOT_SANDBOX_STAMPED"));
  return result.status;
});

check("action_layer_blocks_already_cancelled", async () => {
  const draft = validStampedDraft({ status: "SANDBOX_CANCELADO", sandbox_status: "SANDBOX_TIMBRADO", sandbox_cancel_result: { ok: true } });
  assert(hasSandboxCancellation(draft));
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft,
    actionResultsRoot: path.join(tempRoot, "already", "results"),
    actionAuditRoot: path.join(tempRoot, "already", "audit"),
    storageRoot: path.join(tempRoot, "already", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_ALREADY_SANDBOX_CANCELLED"));
  return result.status;
});

check("action_layer_blocks_missing_identity", async () => {
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validStampedDraft({ pac_invoice_id: null, uuid: null, cfdi_uid: null, sandbox_identity: {} }),
    actionResultsRoot: path.join(tempRoot, "missing-identity", "results"),
    actionAuditRoot: path.join(tempRoot, "missing-identity", "audit"),
    storageRoot: path.join(tempRoot, "missing-identity", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("sandbox_identity_required"));
  return result.status;
});

check("action_layer_blocks_missing_live_config", async () => {
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "0" },
    draft: validStampedDraft(),
    actionResultsRoot: path.join(tempRoot, "missing-live", "results"),
    actionAuditRoot: path.join(tempRoot, "missing-live", "audit"),
    storageRoot: path.join(tempRoot, "missing-live", "storage"),
  });
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(result.errors.includes("FACTURACOM_SANDBOX_LIVE_REQUIRED"));
  return result.status;
});

check("action_layer_success_updates_cancelled_and_stores_response", async () => {
  const p = path.join(tempRoot, "success", "storage");
  const originalArtifact = path.join(p, "draft-stamps", "DRAFT-77-STAMPED", "original", "sandbox-stamp-manifest.json");
  fs.mkdirSync(path.dirname(originalArtifact), { recursive: true });
  fs.writeFileSync(originalArtifact, "{}\n", "utf8");
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validStampedDraft(),
    actionResultsRoot: path.join(tempRoot, "success", "results"),
    actionAuditRoot: path.join(tempRoot, "success", "audit"),
    storageRoot: p,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_CANCELADO");
  assert(result.output.artifacts_count >= 1);
  assert(JSON.stringify(result.artifacts).includes("draft-cancellations"));
  assert(fs.existsSync(originalArtifact), "original artifacts not deleted");
  assert.strictEqual(result.output.original_artifacts_deleted, false);
  assert.strictEqual(result.sensitive_findings.length, 0);
  return result.output.invoice_status;
});

check("action_layer_error_updates_cancel_error", async () => {
  const adapter = {
    cancelInvoice() {
      return {
        ok: false,
        status: "PAC_CANCEL_ERROR",
        normalized_errors: [{ code: "PAC_CANCEL_ERROR", message: "cancel failed" }],
        normalized_warnings: [],
      };
    },
  };
  const result = await runSandboxAction("sandbox.draft.cancel", {
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    draft: validStampedDraft(),
    adapter,
    actionResultsRoot: path.join(tempRoot, "adapter-error", "results"),
    actionAuditRoot: path.join(tempRoot, "adapter-error", "audit"),
    storageRoot: path.join(tempRoot, "adapter-error", "storage"),
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("PAC_CANCEL_ERROR"));
  return result.status;
});

check("validation_helpers_detect_states_and_identity", () => {
  const draft = validStampedDraft();
  const validation = validateDraftForSandboxCancel(draft, { FACTURACOM_SANDBOX_LIVE: "1" });
  assert.strictEqual(validation.ok, true);
  assert(extractSandboxInvoiceRef(draft).pac_invoice_id);
  assert.strictEqual(hasSandboxCancellationInProgress(validStampedDraft({ status: "SANDBOX_CANCELANDO" })), true);
  return "helpers ok";
});

check("workflow_json_valid_no_file_send_or_production", () => {
  JSON.parse(workflowText);
  assert(!/https:\/\/api\.factura\.com|F-Api-Key|F-Secret-Key|F-PLUGIN|stampProduction|sendDocument|sendMediaGroup|sendPhoto|<\?xml|%PDF-/i.test(workflowText));
  assert(workflowText.includes("sandbox.draft.cancel"));
  return "safe";
});

check("runtime_not_versioned", () => {
  const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
  assert(gitignore.includes("runtime/**"));
  return "runtime ignored";
});

(async () => {
  const results = await Promise.all(checks);
  console.log("Sandbox CFDI Lifecycle Cancellation Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();

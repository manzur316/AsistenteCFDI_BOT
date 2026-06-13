const assert = require("assert");

const {
  allCallbackData,
  callbackInput,
  executeCode,
  getNodeCode,
  sandboxStampedDraft,
} = require("./lib/test-telegram-delivery-workflow-harness");

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

function assertRecovery(result) {
  assert.strictEqual(result.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert.strictEqual(result.json_debug.callback_reason, "token_usado");
  assert.strictEqual(result.json_debug.response_built, true);
  assert.strictEqual(result.json_debug.token_used, true);
  assert(!/Boton invalido|Motivo: token_usado/.test(result.telegram_message), "dead token message leaked");
  assert(allCallbackData(result.reply_markup).length > 0, "recovery buttons missing");
}

const handleCode = getNodeCode("Handle Commands And Scoring");

check("used_stamp_token_recovers_to_invoice_detail_document_route", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-STAMP-001");
  const result = executeCode(handleCode, callbackInput("usedstampcycle01", "STAMP_DRAFT_SANDBOX", {
    draft,
    used_at: "2026-06-08T12:00:00.000Z",
    update_id: 7173201,
  }));
  assertRecovery(result);
  assert(/La factura ya esta timbrada/.test(result.telegram_message));
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Ver documentos"), "documents route missing");
  assert(!labels.includes("Descargar XML/PDF sandbox"), "legacy download button must not be exposed");
  assert(!labels.includes("Ver estado documental"), "legacy status button must not be exposed");
  return labels.length;
});

check("used_download_token_recovers_to_delivery_buttons", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-DOWNLOAD-001");
  const result = executeCode(handleCode, callbackInput("useddowncycle001", "DOWNLOAD_SANDBOX_ARTIFACTS", {
    draft,
    used_at: "2026-06-08T12:01:00.000Z",
    update_id: 7173202,
  }));
  assertRecovery(result);
  assert(/Esta descarga ya fue procesada/.test(result.telegram_message));
  assert(/XML\/PDF ya estan disponibles/.test(result.telegram_message));
  const labels = (result.reply_markup.inline_keyboard || []).flat().map((button) => button.text);
  assert(labels.includes("Documentos"), "documents recovery missing");
  assert(labels.includes("Menu principal"), "menu recovery missing");
  assert(!labels.includes("Enviar por correo"), "send action must be prepared from Documents");
  assert(!labels.includes("Enviar a canal documentos"), "channel action must be prepared from Documents");
  return labels.length;
});

check("used_delivery_confirm_token_with_sent_ledger_reports_already_sent", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-CONFIRM-SENT");
  draft.document_delivery_ledger = [{ channel: "PROVIDER_EMAIL", delivery_status: "SENT" }];
  const result = executeCode(handleCode, callbackInput("usedconfirmcycle1", "DELIVERY_CONFIRM_PROVIDER_EMAIL", {
    draft,
    channel: "PROVIDER_EMAIL",
    used_at: "2026-06-08T12:02:00.000Z",
    update_id: 7173203,
  }));
  assertRecovery(result);
  assert(/ya figuran como enviados/.test(result.telegram_message));
  assert(/Estado actual: SENT/.test(result.telegram_message));
  return result.action;
});

check("used_delivery_confirm_token_without_sent_ledger_prepares_again", () => {
  const draft = sandboxStampedDraft("DRAFT-USED-CONFIRM-NOSENT");
  draft.document_delivery_ledger = [{ channel: "PROVIDER_EMAIL", delivery_status: "READY" }];
  const result = executeCode(handleCode, callbackInput("usedconfirmcycle2", "DELIVERY_CONFIRM_PROVIDER_EMAIL", {
    draft,
    channel: "PROVIDER_EMAIL",
    used_at: "2026-06-08T12:03:00.000Z",
    update_id: 7173204,
  }));
  assertRecovery(result);
  assert(/No hay evidencia local de envio SENT/.test(result.telegram_message));
  assert(/Prepara de nuevo/.test(result.telegram_message));
  return result.action;
});

console.log("Telegram Callback Token Used Recovery Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

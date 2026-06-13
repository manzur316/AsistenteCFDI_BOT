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

function buttonTexts(markup) {
  return (markup?.inline_keyboard || []).flat().map((button) => button.text).filter(Boolean);
}

function assertNoUnsafeButtons(labels) {
  for (const forbidden of [
    "Descargar XML/PDF sandbox",
    "Ver estado documental",
    "Enviar por correo",
    "Enviar a canal documentos",
    "Marcar pagada",
    "Marcar parcial",
    "Marcar vencida",
    "Cancelar CFDI sandbox",
    "Ver ledger cliente",
  ]) {
    assert(!labels.includes(forbidden), `${forbidden} must be hidden: ${labels.join(", ")}`);
  }
}

function approvedDraft(extra = {}) {
  return {
    ...sandboxStampedDraft("DRAFT-STAMP-ERR-3656"),
    status: "APROBADO",
    invoice_status: "APROBADO",
    artifact_status: "N/A",
    payment_status: "NO_APLICA",
    sandbox_stamped: false,
    sandbox_pac_summary: {},
    ...extra,
  };
}

const handleCode = getNodeCode("Handle Commands And Scoring");
const summaryCode = getNodeCode("Build PAC Sandbox Action Summary");

check("sandbox_error_request_does_not_show_document_download", () => {
  const source = executeCode(handleCode, callbackInput("stamperror001", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7174001,
  }));
  assert.strictEqual(source.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  const labels = buttonTexts(source.sandbox_reply_markup || source.reply_markup);
  assertNoUnsafeButtons(labels);
  assert(labels.includes("Ver ultimo resultado sandbox"), labels.join(", "));
  assert(labels.includes("Volver a listos para facturar"), labels.join(", "));
  assert(labels.includes("Menu principal"), labels.join(", "));
  return labels.join(", ");
});

check("sandbox_error_summary_blocks_document_actions", () => {
  const source = executeCode(handleCode, callbackInput("stamperror002", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7174002,
  }));
  const stdout = JSON.stringify({
    schema_version: "sandbox_action_result.v1",
    action: "sandbox.draft.stamp",
    status: "ERROR",
    ok: false,
    duration_ms: 81,
    artifacts: [],
    warnings: [],
    errors: ["DRAFT_NOT_APPROVED"],
    output: {
      draft_id: "DRAFT-STAMP-ERR-3656",
      client_display_name: "Privada Riviera",
      total: 928,
      invoice_status: "SANDBOX_ERROR",
      payment_status: "NO_APLICA",
      artifact_status: "N/A",
      sandbox_pac_summary: { artifact_status: "N/A" },
    },
  });
  const result = executeCode(summaryCode, { stdout }, () => [{ json: source }]);
  assert(/No se pudo timbrar sandbox/.test(result.telegram_message), result.telegram_message);
  assert(/Borrador: BOR-3656/.test(result.telegram_message), result.telegram_message);
  assert(/Estado: error de timbrado/.test(result.telegram_message), result.telegram_message);
  assert(/No se habilitaron acciones documentales/.test(result.telegram_message), result.telegram_message);
  const labels = buttonTexts(result.reply_markup);
  assertNoUnsafeButtons(labels);
  assert(labels.includes("Ver ultimo resultado sandbox"), labels.join(", "));
  assert(labels.includes("Volver a listos para facturar"), labels.join(", "));
  assert(labels.includes("Menu principal"), labels.join(", "));
  return labels.join(", ");
});

check("stamp_requested_without_final_ok_has_no_document_actions", () => {
  const result = executeCode(handleCode, callbackInput("stamperror003", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7174003,
  }));
  assert.strictEqual(result.action, "DRAFT_SANDBOX_STAMP_REQUESTED");
  const labels = buttonTexts(result.reply_markup);
  assertNoUnsafeButtons(labels);
  return result.action;
});

check("download_ready_stamped_invoice_can_route_to_documents", () => {
  const source = executeCode(handleCode, callbackInput("stamperror004", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft({
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOAD_READY",
      sandbox_pac_summary: {
        invoice_status: "SANDBOX_TIMBRADO",
        artifact_status: "DOWNLOAD_READY",
        folio: "F68",
        uuid: "12345678-1234-4000-8000-1234567890ab",
      },
      uuid: "12345678-1234-4000-8000-1234567890ab",
    }),
    used_at: "2026-06-13T08:00:00.000Z",
    update_id: 7174004,
  }));
  assert.strictEqual(source.action, "CALLBACK_TOKEN_USED_RECOVERY");
  assert(/Factura: F68/.test(source.telegram_message), source.telegram_message);
  const labels = buttonTexts(source.reply_markup);
  assert(labels.includes("Ver documentos"), labels.join(", "));
  return labels.join(", ");
});

check("downloaded_invoice_does_not_show_duplicate_primary_download", () => {
  const source = executeCode(handleCode, callbackInput("stamperror005", "STAMP_DRAFT_SANDBOX", {
    draft: {
      ...sandboxStampedDraft("DRAFT-STAMP-DOWNLOADED-3656"),
      sandbox_pac_summary: {
        invoice_status: "SANDBOX_TIMBRADO",
        artifact_status: "DOWNLOADED",
        folio: "F69",
        uuid: "12345678-1234-4000-8000-1234567890ab",
        xml_downloaded: true,
        pdf_downloaded: true,
      },
    },
    used_at: "2026-06-13T08:00:00.000Z",
    update_id: 7174005,
  }));
  const labels = buttonTexts(source.reply_markup);
  assert(!labels.includes("Descargar XML/PDF sandbox"), labels.join(", "));
  assert(labels.includes("Ver documentos"), labels.join(", "));
  return labels.join(", ");
});

check("download_error_summary_is_human_safe", () => {
  const stdout = JSON.stringify({
    action: "sandbox.draft.download-artifacts",
    status: "ERROR",
    ok: false,
    output: {
      draft_id: "DRAFT-DOWNLOAD-ERR-3656",
      client_display_name: "Real Bilbao",
      artifact_status: "DOWNLOAD_ERROR",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
    },
    errors: ["FACTURACOM_SANDBOX_XML_CONTENT_INVALID"],
    warnings: [],
    sensitive_findings: [],
  });
  const result = executeCode(summaryCode, { stdout }, () => [{
    json: {
      source_module: "DOCUMENTS",
      display_id: "F70",
      sandbox_draft_id: "DRAFT-DOWNLOAD-ERR-3656",
      sandbox_draft_context: { draft_id: "DRAFT-DOWNLOAD-ERR-3656", client_display_name: "Real Bilbao" },
    },
  }]);
  assert(/No se pudo descargar XML\/PDF/.test(result.telegram_message), result.telegram_message);
  assert(/Motivo seguro/.test(result.telegram_message), result.telegram_message);
  assert(!/C:\\\\|runtime[\\/]|<\\?xml|%PDF|12345678-1234-4000-8000-1234567890ab/.test(result.telegram_message), result.telegram_message);
  return "safe";
});

check("residual_draft_texts_removed", () => {
  assert(!handleCode.includes("Borrador regresado a borrador"));
  assert(!handleCode.includes("Volver a aprobadas"));
  assert(handleCode.includes("Borrador devuelto a revision"));
  assert(handleCode.includes("Volver a listos para facturar"));
  return "texts";
});

check("basic_routes_still_present", () => {
  for (const callback of ["cfdi_nav:approved", "cfdi_nav:drafts", "cfdi_nav:invoices", "cfdi_nav:docs", "cfdi_nav:clients", "cfdi_nav:pay_pending"]) {
    assert(handleCode.includes(callback), callback);
  }
  return "routes";
});

check("no_html_raw_or_literal_newline_contract_regression", () => {
  const source = executeCode(handleCode, callbackInput("stamperror006", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7174006,
  }));
  assert(!/<script|<\/html>|\\n/.test(source.telegram_message), source.telegram_message);
  return "clean";
});

check("result_buttons_have_handlers", () => {
  const source = executeCode(handleCode, callbackInput("stamperror007", "STAMP_DRAFT_SANDBOX", {
    draft: approvedDraft(),
    update_id: 7174007,
  }));
  const callbacks = allCallbackData(source.reply_markup);
  assert(callbacks.length >= 3, callbacks.join(","));
  callbacks.forEach((item) => assert(/^cfdi(:|_nav:|_sbx:)/.test(item), item));
  return callbacks.length;
});

console.log("Telegram Stamp Error Document Action Guard Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const {
  readDraftFromOptions,
} = require("./sandbox-draft-stamp-action");
const {
  diagnoseDocumentDeliveryConfig,
  sendSandboxInvoiceDocumentsToTelegram,
} = require("./telegram-document-delivery-channel");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function draftFiles(draft = {}) {
  const summary = draft.sandbox_pac_summary || {};
  return {
    xml: text(summary.client_storage_xml_path || draft.client_storage_xml_path || summary.xml_storage_path),
    pdf: text(summary.client_storage_pdf_path || draft.client_storage_pdf_path || summary.pdf_storage_path),
  };
}

function safeClientName(draft = {}) {
  const client = draft.current_client || draft.client || draft.client_snapshot || {};
  return text(client.display_name || client.razon_social || draft.client_id) || "Cliente";
}

function runSandboxDocumentDeliveryDiagnose(options = {}) {
  const config = diagnoseDocumentDeliveryConfig(options.env || process.env);
  return {
    status: config.status,
    output: config,
    warnings: config.warnings || [],
    errors: config.ready ? [] : ["TELEGRAM_DOCUMENT_DELIVERY_NEEDS_CONFIG"],
  };
}

async function runSandboxDocumentDeliverySend(options = {}) {
  let draft = null;
  try {
    draft = await readDraftFromOptions(options);
  } catch (_error) {
    return {
      status: "NEEDS_RUNTIME",
      output: { error_class: "DRAFT_DB_LOAD_FAILED", draft_id: text(options.draftId) },
      warnings: [],
      errors: ["DRAFT_DB_LOAD_FAILED"],
    };
  }
  if (!draft || typeof draft !== "object") {
    return {
      status: "NEEDS_RUNTIME",
      output: { error_class: "DRAFT_CONTEXT_MISSING", draft_id: text(options.draftId) },
      warnings: [],
      errors: ["DRAFT_CONTEXT_MISSING"],
    };
  }
  const summary = draft.sandbox_pac_summary || {};
  if (String(summary.artifact_status || draft.artifact_status || "").toUpperCase() !== "DOWNLOADED") {
    return {
      status: "NEEDS_RUNTIME",
      output: {
        error_class: "DOCUMENT_ARTIFACTS_NOT_DOWNLOADED",
        draft_id: text(draft.draft_id || options.draftId),
        artifact_status: summary.artifact_status || draft.artifact_status || null,
        xml_content_valid: summary.xml_content_valid === true,
        pdf_content_valid: summary.pdf_content_valid === true,
      },
      warnings: ["XML/PDF aun no estan descargados y validados."],
      errors: ["DOCUMENT_ARTIFACTS_NOT_DOWNLOADED"],
    };
  }
  const files = options.files || draftFiles(draft);
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files,
    env: options.env || process.env,
    dryRun: options.dryRun !== false,
    requestFn: options.requestFn,
    caption: [
      `Factura sandbox - ${safeClientName(draft)}`,
      `Fecha: ${new Date().toISOString().slice(0, 10)}`,
      draft.total ? `Total: ${draft.total}` : null,
      "XML/PDF de prueba Factura.com Sandbox",
      "Borrador sujeto a revision humana.",
    ].filter(Boolean).join("\n"),
  });
  return {
    status: result.status === "OK" || result.status === "DRY_RUN" ? "OK" : result.status,
    output: {
      draft_id: text(draft.draft_id || options.draftId),
      delivery: result,
    },
    warnings: result.warnings || [],
    errors: result.errors || [],
  };
}

module.exports = {
  runSandboxDocumentDeliveryDiagnose,
  runSandboxDocumentDeliverySend,
};

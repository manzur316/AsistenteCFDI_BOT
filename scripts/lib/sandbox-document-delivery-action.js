const {
  readDraftFromOptions,
} = require("./sandbox-draft-stamp-action");
const { FacturaComSandboxAdapter } = require("./factura-com-sandbox-adapter");
const { collectIdentity } = require("./sandbox-draft-download-artifacts-action");
const {
  DOCUMENT_DELIVERY_CHANNELS,
  DOCUMENT_DELIVERY_STATUSES,
  buildCanonicalDocumentDeliveryRequest,
  buildCanonicalDocumentDeliveryResult,
  normalizeChannel,
  redactEmail,
  validateCanonicalDocumentDeliveryRequest,
} = require("./document-delivery/canonical-document-delivery-contract");
const {
  diagnoseDocumentDeliveryConfig,
  sendSandboxInvoiceDocumentsToTelegram,
  validateDeliveryFiles,
} = require("./telegram-document-delivery-channel");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function draftFiles(draft = {}) {
  const summary = draft.sandbox_pac_summary || {};
  return {
    xml: text(summary.human_xml_path || draft.human_xml_path || summary.client_storage_xml_path || draft.client_storage_xml_path || summary.xml_storage_path),
    pdf: text(summary.human_pdf_path || draft.human_pdf_path || summary.client_storage_pdf_path || draft.client_storage_pdf_path || summary.pdf_storage_path),
  };
}

function clientFromDraft(draft = {}) {
  return draft.current_client || draft.client || draft.client_snapshot || {};
}

function primaryEmailFromDraft(draft = {}) {
  const client = clientFromDraft(draft);
  return text(client.email || client.correo || draft.client_email);
}

function emailConfirmedFromDraft(draft = {}) {
  const client = clientFromDraft(draft);
  return client.email_confirmed === true || client.emailConfirmed === true || draft.email_confirmed === true;
}

function safeClientName(draft = {}) {
  const client = draft.current_client || draft.client || draft.client_snapshot || {};
  return text(client.display_name || client.razon_social || draft.client_id) || "Cliente";
}

function runSandboxDocumentDeliveryDiagnose(options = {}) {
  const config = diagnoseDocumentDeliveryConfig(options.env || process.env);
  const channel = normalizeChannel(options.channel || options.deliveryChannel);
  if (options.draft && typeof options.draft === "object") {
    const files = draftFiles(options.draft);
    const validation = validateDeliveryFiles(files);
    const email = primaryEmailFromDraft(options.draft);
    const emailConfirmed = emailConfirmedFromDraft(options.draft);
    const providerReady = Boolean(email);
    return {
      status: validation.ok && (channel !== DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL || providerReady) ? "OK" : validation.ok ? "NEEDS_RECIPIENT" : "BLOCKED_INVALID_DOCUMENTS",
      output: {
        draft_id: text(options.draft.draft_id),
        client_id: text(options.draft.client_id || clientFromDraft(options.draft).client_id),
        channel,
        documents_valid: validation.ok,
        xml_content_valid: validation.xml.ok === true,
        pdf_content_valid: validation.pdf.ok === true,
        pdf_visual_content_present: validation.pdf.pdf_visual_content_present === true,
        telegram_delivery_ready: config.ready === true,
        provider_email_ready: providerReady,
        client_email_present: Boolean(email),
        client_email_confirmed: emailConfirmed,
        client_email_redacted: redactEmail(email),
        provider_email_delivery_supported: true,
        dry_run: options.dryRun !== false,
      },
      warnings: [
        ...(config.warnings || []),
        ...(email && !emailConfirmed ? ["CLIENT_EMAIL_NOT_CONFIRMED"] : []),
      ],
      errors: validation.ok ? [] : ["BLOCKED_INVALID_DOCUMENTS"],
    };
  }
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
  const channel = normalizeChannel(options.channel || options.deliveryChannel);
  const files = options.files || draftFiles(draft);
  const validation = validateDeliveryFiles(files);
  if (!validation.ok) {
    return {
      status: DOCUMENT_DELIVERY_STATUSES.BLOCKED_INVALID_DOCUMENTS,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        documents_valid: false,
        xml_content_valid: validation.xml.ok === true,
        pdf_content_valid: validation.pdf.ok === true,
        xml_validation_status: validation.xml.status,
        pdf_validation_status: validation.pdf.status,
      },
      warnings: [],
      errors: ["BLOCKED_INVALID_DOCUMENTS"],
    };
  }

  const canonicalRequest = buildCanonicalDocumentDeliveryRequest({
    provider: "factura_com",
    environment: "SANDBOX",
    draft_id: draft.draft_id || options.draftId,
    client_id: draft.client_id || clientFromDraft(draft).client_id,
    invoice_ref: collectIdentity(draft),
    channel,
    recipient: {
      email: primaryEmailFromDraft(draft),
      source: "cfdi_clients.email",
      confirmed: emailConfirmedFromDraft(draft),
    },
    documents: {
      xml_path: files.xml,
      pdf_path: files.pdf,
      xml_content_valid: validation.xml.ok === true,
      pdf_content_valid: validation.pdf.ok === true,
      xml_sha256: validation.xml.sha256,
      pdf_sha256: validation.pdf.sha256,
      xml_size_bytes: validation.xml.size_bytes,
      pdf_size_bytes: validation.pdf.size_bytes,
    },
    delivery_policy: {
      dry_run: options.dryRun !== false,
      require_valid_documents: true,
      allow_sandbox: true,
      allow_production: false,
    },
  });
  const canonicalValidation = validateCanonicalDocumentDeliveryRequest(canonicalRequest);
  if (channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL) {
    return runProviderEmailDelivery({
      ...options,
      draft,
      canonicalRequest,
      canonicalValidation,
    });
  }
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
      channel,
      canonical_delivery_request: {
        schema_version: canonicalRequest.schema_version,
        channel: canonicalRequest.channel,
        recipient_present: Boolean(canonicalRequest.recipient.email),
        documents_valid: validation.ok,
        dry_run: canonicalRequest.delivery_policy.dry_run,
      },
      delivery: result,
    },
    warnings: result.warnings || [],
    errors: result.errors || [],
  };
}

async function runProviderEmailDelivery(options = {}) {
  const draft = options.draft || {};
  const request = options.canonicalRequest;
  const validation = options.canonicalValidation || validateCanonicalDocumentDeliveryRequest(request);
  const dryRun = options.dryRun !== false;
  const email = primaryEmailFromDraft(draft);
  const emailConfirmed = emailConfirmedFromDraft(draft);
  if (!email) {
    return {
      status: DOCUMENT_DELIVERY_STATUSES.NEEDS_RECIPIENT,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
        client_email_present: false,
        documents_valid: request ? true : false,
      },
      warnings: ["Falta email principal del cliente."],
      errors: ["CLIENT_PRIMARY_EMAIL_REQUIRED"],
    };
  }
  if (!emailConfirmed && dryRun !== true && options.confirmRecipient !== true) {
    return {
      status: DOCUMENT_DELIVERY_STATUSES.NEEDS_RECIPIENT,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
        client_email_present: true,
        client_email_redacted: redactEmail(email),
        client_email_confirmed: false,
      },
      warnings: ["Email principal no confirmado para envio real."],
      errors: ["CLIENT_PRIMARY_EMAIL_NOT_CONFIRMED"],
    };
  }
  if (!validation.ok && !validation.errors.every((error) => error === "RECIPIENT_EMAIL_REQUIRED")) {
    return {
      status: validation.errors.includes("DOCUMENTS_NOT_VALID")
        ? DOCUMENT_DELIVERY_STATUSES.BLOCKED_INVALID_DOCUMENTS
        : DOCUMENT_DELIVERY_STATUSES.ERROR,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
        validation_errors: validation.errors,
      },
      warnings: validation.warnings,
      errors: validation.errors,
    };
  }
  if (dryRun) {
    return {
      status: "OK",
      output: {
        ...buildCanonicalDocumentDeliveryResult({
          ok: true,
          channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
          status: DOCUMENT_DELIVERY_STATUSES.DRY_RUN,
          draft_id: draft.draft_id || options.draftId,
          client_id: draft.client_id || clientFromDraft(draft).client_id,
          recipient_present: true,
          recipient_email: email,
          documents_valid: true,
          normalized_warnings: emailConfirmed ? [] : ["CLIENT_EMAIL_NOT_CONFIRMED_DRY_RUN_ONLY"],
        }),
        provider_email_delivery_supported: true,
        endpoint: "/v4/cfdi40/{cfdi_uid}/email",
      },
      warnings: emailConfirmed ? [] : ["CLIENT_EMAIL_NOT_CONFIRMED_DRY_RUN_ONLY"],
      errors: [],
    };
  }
  const adapter = options.adapter || new FacturaComSandboxAdapter({ env: options.env || process.env });
  const providerResult = await adapter.sendInvoiceEmail(collectIdentity(draft), {
    env: options.env || process.env,
    requestFn: options.requestFn,
    recipient: { email },
  });
  return {
    status: providerResult.ok === true ? "OK" : (providerResult.status || DOCUMENT_DELIVERY_STATUSES.PROVIDER_ERROR),
    output: buildCanonicalDocumentDeliveryResult({
      ok: providerResult.ok === true,
      channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
      status: providerResult.ok === true ? DOCUMENT_DELIVERY_STATUSES.SENT : (providerResult.status || DOCUMENT_DELIVERY_STATUSES.PROVIDER_ERROR),
      draft_id: draft.draft_id || options.draftId,
      client_id: draft.client_id || clientFromDraft(draft).client_id,
      recipient_present: true,
      recipient_email: email,
      documents_valid: true,
      sent_at: providerResult.ok === true ? new Date().toISOString() : null,
      provider_message: providerResult.provider_message,
      evidence: {
        provider: providerResult.provider,
        operation: providerResult.operation,
        delivery_channel: providerResult.delivery_channel,
      },
      normalized_errors: (providerResult.normalized_errors || []).map((item) => item.code || item.message || String(item)),
      normalized_warnings: providerResult.normalized_warnings || [],
    }),
    warnings: providerResult.normalized_warnings || [],
    errors: (providerResult.normalized_errors || []).map((item) => item.code || item.message || String(item)),
  };
}

module.exports = {
  runSandboxDocumentDeliveryDiagnose,
  runSandboxDocumentDeliverySend,
};

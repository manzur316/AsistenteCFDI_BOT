const fs = require("fs");
const path = require("path");

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
const { loadDraftFromPostgres } = require("./sandbox-draft-db-loader");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");
const defaultStorageRoot = path.join(runtimeRoot, "storage-sandbox");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeId(value, fallback = "draft") {
  return String(value || fallback)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || fallback;
}

function latestDownloadManifest(draftId, storageRoot = defaultStorageRoot) {
  const safeDraftId = text(draftId);
  if (!safeDraftId) return null;
  const root = path.resolve(storageRoot, "draft-stamps", safeId(safeDraftId));
  if (!isInside(runtimeRoot, root) || !fs.existsSync(root)) return null;
  const manifestPaths = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name, "sandbox-download-manifest.json"))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
  const latest = manifestPaths[manifestPaths.length - 1];
  if (!latest) return null;
  try {
    return JSON.parse(fs.readFileSync(latest, "utf8"));
  } catch (_error) {
    return null;
  }
}

function draftFiles(draft = {}, options = {}) {
  const summary = draft.sandbox_pac_summary || {};
  const direct = {
    xml: text(summary.human_xml_path || draft.human_xml_path || summary.client_storage_xml_path || draft.client_storage_xml_path || summary.xml_storage_path),
    pdf: text(summary.human_pdf_path || draft.human_pdf_path || summary.client_storage_pdf_path || draft.client_storage_pdf_path || summary.pdf_storage_path),
  };
  const manifest = latestDownloadManifest(draft.draft_id || options.draftId, options.storageRoot || defaultStorageRoot) || {};
  const manifestFiles = {
    xml: text(manifest.human_xml_path || manifest.client_storage_xml_path || manifest.xml_storage_path),
    pdf: text(manifest.human_pdf_path || manifest.client_storage_pdf_path || manifest.pdf_storage_path),
  };
  return {
    xml: manifestFiles.xml || direct.xml,
    pdf: manifestFiles.pdf || direct.pdf,
  };
}

function draftDocumentMetadata(draft = {}, options = {}) {
  const summary = draft.sandbox_pac_summary || {};
  const manifest = latestDownloadManifest(draft.draft_id || options.draftId, options.storageRoot || defaultStorageRoot) || {};
  const source = { ...summary, ...manifest };
  return {
    pdf_source: text(source.pdf_source) || (source.pdf_content_valid === true ? "PROVIDER" : null),
    provider_pdf_content_valid: source.provider_pdf_content_valid === true,
    provider_pdf_validation_status: text(source.provider_pdf_validation_status),
    local_rendered_pdf_path: text(source.local_rendered_pdf_path),
    human_pdf_path: text(source.human_pdf_path),
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

function requestedChannel(value) {
  const raw = String(value || "").trim().toUpperCase();
  const known = Object.values(DOCUMENT_DELIVERY_CHANNELS).includes(raw);
  return {
    raw,
    known,
    channel: known ? raw : null,
  };
}

function providerEmailSyncStatusFromDraft(draft = {}) {
  const client = clientFromDraft(draft);
  const link = draft.provider_client_link && typeof draft.provider_client_link === "object" ? draft.provider_client_link : {};
  const linkSummary = link.provider_response_sanitized && typeof link.provider_response_sanitized === "object"
    ? link.provider_response_sanitized
    : {};
  const raw = text(client.provider_email_sync_status || draft.provider_email_sync_status || linkSummary.provider_email_sync_status || link.sync_status);
  if (!raw) return "UNKNOWN";
  const normalized = raw.toUpperCase();
  if (normalized === "SYNCED" || normalized === "CREATED" || normalized === "LINKED") return "SYNCED";
  if (normalized === "NEEDS_SYNC" || normalized === "PENDING" || normalized === "STALE") return "NEEDS_SYNC";
  if (normalized === "NOT_PROVIDED") return "UNKNOWN";
  if (normalized === "MANUAL_LINKED") return "UNKNOWN";
  return normalized;
}

function loadDraftForDiagnose(options = {}) {
  if (options.draft && typeof options.draft === "object") return options.draft;
  const draftId = text(options.draftId);
  if (!draftId) return null;
  if (typeof options.draftLoader === "function") {
    const loaded = options.draftLoader(draftId, options);
    if (loaded && typeof loaded.then === "function") {
      throw new Error("ASYNC_DRAFT_LOADER_NOT_SUPPORTED_FOR_DIAGNOSE");
    }
    return loaded;
  }
  return loadDraftFromPostgres(draftId, {
    ...(options.dbConfig || {}),
    env: options.env || process.env,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    execFileSync: options.execFileSync,
  });
}

function runSandboxDocumentDeliveryDiagnose(options = {}) {
  const requested = requestedChannel(options.channel || options.deliveryChannel || DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL);
  if (!requested.known) {
    return {
      status: DOCUMENT_DELIVERY_STATUSES.ERROR,
      output: {
        channel: requested.raw || null,
        error_class: "DOCUMENT_DELIVERY_CHANNEL_UNKNOWN",
        ready: false,
      },
      warnings: [],
      errors: ["DOCUMENT_DELIVERY_CHANNEL_UNKNOWN"],
    };
  }
  const channel = normalizeChannel(requested.channel);
  const config = channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL
    ? diagnoseDocumentDeliveryConfig(options.env || process.env)
    : { ready: true, warnings: [] };
  let draft = options.draft && typeof options.draft === "object" ? options.draft : null;
  if (!draft && text(options.draftId)) {
    try {
      draft = loadDraftForDiagnose(options);
    } catch (error) {
      return {
        status: "NEEDS_RUNTIME",
        output: {
          draft_id: text(options.draftId),
          channel,
          error_class: "DRAFT_DB_LOAD_FAILED",
          ready: false,
        },
        warnings: [],
        errors: ["DRAFT_DB_LOAD_FAILED"],
      };
    }
  }
  if (draft && typeof draft === "object") {
    const files = draftFiles(draft, options);
    const documentMetadata = draftDocumentMetadata(draft, options);
    const validation = validateDeliveryFiles(files);
    const email = primaryEmailFromDraft(draft);
    const emailConfirmed = emailConfirmedFromDraft(draft);
    const providerEmailSyncStatus = providerEmailSyncStatusFromDraft(draft);
    const providerReady = Boolean(email);
    const telegramConfigBlocked = channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL && config.ready !== true;
    const providerBlockedBySync = channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL && providerEmailSyncStatus === "NEEDS_SYNC";
    const providerBlockedByProviderPdf = channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL
      && documentMetadata.pdf_source === "LOCAL_RENDERED_FROM_XML"
      && documentMetadata.provider_pdf_content_valid !== true
      && String(options.env?.PROVIDER_EMAIL_ALLOW_WITH_PROVIDER_PDF_INVALID || process.env.PROVIDER_EMAIL_ALLOW_WITH_PROVIDER_PDF_INVALID || "0") !== "1";
    const providerReadyToSend = channel !== DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL
      || (providerReady && emailConfirmed && !providerBlockedBySync && !providerBlockedByProviderPdf);
    const status = validation.ok && providerReadyToSend
      ? (telegramConfigBlocked ? DOCUMENT_DELIVERY_STATUSES.NEEDS_CONFIG : "OK")
      : !validation.ok
        ? "BLOCKED_INVALID_DOCUMENTS"
        : channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL && !providerReady
          ? "NEEDS_RECIPIENT"
          : providerBlockedBySync
            ? "NEEDS_PROVIDER_EMAIL_SYNC"
            : providerBlockedByProviderPdf
              ? "PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID"
            : "NEEDS_RECIPIENT";
    return {
      status,
      output: {
        draft_id: text(draft.draft_id),
        client_id: text(draft.client_id || clientFromDraft(draft).client_id),
        channel,
        ready: status === "OK",
        documents_valid: validation.ok,
        xml_content_valid: validation.xml.ok === true,
        pdf_content_valid: validation.pdf.ok === true,
        pdf_visual_content_present: validation.pdf.pdf_visual_content_present === true,
        pdf_source: documentMetadata.pdf_source,
        provider_pdf_content_valid: documentMetadata.provider_pdf_content_valid,
        provider_pdf_validation_status: documentMetadata.provider_pdf_validation_status,
        telegram_can_send_local_rendered_pdf: channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL
          ? documentMetadata.pdf_source === "LOCAL_RENDERED_FROM_XML" && validation.pdf.ok === true
          : null,
        blocker: providerBlockedByProviderPdf ? "PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID" : null,
        telegram_delivery_ready: channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL ? config.ready === true : null,
        provider_email_ready: providerReady,
        client_email_present: Boolean(email),
        client_email_confirmed: emailConfirmed,
        client_email_redacted: redactEmail(email),
        provider_email_delivery_supported: true,
        provider_email_sync_status: providerEmailSyncStatus,
        dry_run: options.dryRun !== false,
      },
      warnings: [
        ...(channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL ? (config.warnings || []) : []),
        ...(email && !emailConfirmed ? ["CLIENT_EMAIL_NOT_CONFIRMED"] : []),
        ...(providerBlockedBySync ? ["PROVIDER_EMAIL_SYNC_REQUIRED"] : []),
        ...(providerBlockedByProviderPdf ? ["PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID"] : []),
      ],
      errors: validation.ok
        ? (providerBlockedByProviderPdf
          ? ["PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID"]
          : telegramConfigBlocked ? ["TELEGRAM_DOCUMENT_DELIVERY_NEEDS_CONFIG"] : [])
        : ["BLOCKED_INVALID_DOCUMENTS"],
    };
  }
  if (channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL) {
    return {
      status: "NEEDS_RUNTIME",
      output: {
        draft_id: text(options.draftId),
        channel,
        provider_email_delivery_supported: true,
        ready: false,
      },
      warnings: ["Provider email diagnose requiere draft_id o draft context."],
      errors: ["DRAFT_CONTEXT_MISSING"],
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
  const files = options.files || draftFiles(draft, options);
  const documentMetadata = draftDocumentMetadata(draft, options);
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
    if (documentMetadata.pdf_source === "LOCAL_RENDERED_FROM_XML"
      && documentMetadata.provider_pdf_content_valid !== true
      && String(options.env?.PROVIDER_EMAIL_ALLOW_WITH_PROVIDER_PDF_INVALID || process.env.PROVIDER_EMAIL_ALLOW_WITH_PROVIDER_PDF_INVALID || "0") !== "1") {
      return {
        status: "PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID",
        output: {
          draft_id: text(draft.draft_id || options.draftId),
          channel,
          documents_valid: true,
          pdf_source: documentMetadata.pdf_source,
          provider_pdf_content_valid: false,
          blocker: "PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID",
        },
        warnings: ["Provider email queda bloqueado porque el PDF del proveedor no fue validado visualmente."],
        errors: ["PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID"],
      };
    }
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
      documentMetadata.pdf_source === "LOCAL_RENDERED_FROM_XML"
        ? "PDF visual generado localmente desde XML validado porque el PDF sandbox del proveedor no renderizo correctamente."
        : null,
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
  const providerEmailSyncStatus = providerEmailSyncStatusFromDraft(draft);
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
  if (providerEmailSyncStatus === "NEEDS_SYNC" && dryRun !== true) {
    return {
      status: "NEEDS_PROVIDER_EMAIL_SYNC",
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL,
        client_email_present: true,
        client_email_redacted: redactEmail(email),
        client_email_confirmed: emailConfirmed,
        provider_email_sync_status: providerEmailSyncStatus,
      },
      warnings: ["Email principal local pendiente de sincronizar con proveedor."],
      errors: ["PROVIDER_EMAIL_SYNC_REQUIRED"],
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
        provider_email_sync_status: providerEmailSyncStatus,
        endpoint: "/v4/cfdi40/{cfdi_uid}/email",
      },
      warnings: [
        ...(emailConfirmed ? [] : ["CLIENT_EMAIL_NOT_CONFIRMED_DRY_RUN_ONLY"]),
        ...(providerEmailSyncStatus === "NEEDS_SYNC" ? ["PROVIDER_EMAIL_SYNC_REQUIRED_DRY_RUN_ONLY"] : []),
      ],
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

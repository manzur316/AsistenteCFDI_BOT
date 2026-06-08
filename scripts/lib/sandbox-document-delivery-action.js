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
const {
  LEDGER_STATUSES,
  buildDeliveryIdempotencyKey,
  findExistingDelivery,
  ledgerSummaryForDraft,
  recordDeliveryAttempt,
} = require("./document-delivery/document-delivery-ledger-store");

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

function dbOptions(options = {}) {
  return {
    env: options.env || process.env,
    dbConfig: options.dbConfig,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    execFileSync: options.execFileSync,
  };
}

function shouldUseDeliveryLedger(options = {}) {
  const env = options.env || process.env || {};
  return Boolean(
    options.execFileSync
      || options.dbExecMode
      || options.execMode
      || options.pgDockerContainer
      || options.dbConfig
      || env.CFDI_DB_EXEC_MODE
      || env.CFDI_PG_DOCKER_CONTAINER
      || env.CFDI_PGPASSWORD
      || env.PGPASSWORD
  );
}

function invoiceStatusFromDraft(draft = {}) {
  return text(draft.invoice_status || draft.sandbox_pac_summary?.invoice_status || draft.status);
}

function paymentStatusFromDraft(draft = {}) {
  return text(draft.payment_status || draft.sandbox_pac_summary?.payment_status) || "NO_APLICA";
}

function folioFromDraft(draft = {}) {
  const summary = draft.sandbox_pac_summary || {};
  return text(summary.folio || draft.folio || summary.pac_result?.folio) || "N/A";
}

function isSandboxStamped(draft = {}) {
  return invoiceStatusFromDraft(draft) === "SANDBOX_TIMBRADO";
}

function deliveryRowsByChannel(rows = [], channel) {
  return rows.filter((row) => String(row.channel || "").toUpperCase() === channel);
}

function latestStatus(rows = []) {
  return rows[0]?.delivery_status || null;
}

function sentAt(rows = []) {
  return rows.find((row) => row.delivery_status === "SENT")?.sent_at || null;
}

function deliveryChannelReady(channel, diagnose = {}) {
  return diagnose.status === "OK" || diagnose.status === DOCUMENT_DELIVERY_STATUSES.READY;
}

function ledgerBaseFromDraft(draft, channel, validation, documentMetadata, options = {}) {
  const email = primaryEmailFromDraft(draft);
  const telegramConfig = diagnoseDocumentDeliveryConfig(options.env || process.env);
  const source = draft.sandbox_pac_summary || {};
  return {
    draft_id: text(draft.draft_id || options.draftId),
    client_id: text(draft.client_id || clientFromDraft(draft).client_id),
    provider: "factura_com",
    environment: "SANDBOX",
    channel,
    recipient_present: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL ? Boolean(email) : telegramConfig.delivery_chat_id_present === true,
    recipient_email: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL ? email : null,
    recipient_redacted: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL ? redactEmail(email) : telegramConfig.delivery_chat_id_redacted,
    email_confirmed: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL ? emailConfirmedFromDraft(draft) : null,
    provider_email_sync_status: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL ? providerEmailSyncStatusFromDraft(draft) : null,
    telegram_chat_id_present: channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL ? telegramConfig.delivery_chat_id_present === true : null,
    documents_valid: validation.ok === true,
    xml_content_valid: validation.xml.ok === true,
    pdf_content_valid: validation.pdf.ok === true,
    pdf_source: documentMetadata.pdf_source,
    xml_sha256: validation.xml.sha256,
    pdf_sha256: validation.pdf.sha256,
    xml_size_bytes: validation.xml.size_bytes,
    pdf_size_bytes: validation.pdf.size_bytes,
    human_xml_path: validation.xml_path_safe,
    human_pdf_path: validation.pdf_path_safe,
    evidence_sanitized: {
      invoice_status: invoiceStatusFromDraft(draft),
      payment_status: paymentStatusFromDraft(draft),
      folio: folioFromDraft(draft),
      provider_email_sync_status: providerEmailSyncStatusFromDraft(draft),
      pdf_source: documentMetadata.pdf_source,
      provider_pdf_content_valid: documentMetadata.provider_pdf_content_valid,
      artifact_status: source.artifact_status || null,
    },
  };
}

function canonicalLedgerKey(base = {}) {
  return buildDeliveryIdempotencyKey(base);
}

function attemptLedgerKey(base = {}, status) {
  const canonical = canonicalLedgerKey(base);
  if (status === LEDGER_STATUSES.SENT) return canonical;
  return `${canonical}:${status}:${Date.now()}`;
}

function safeRecordDeliveryAttempt(input = {}, options = {}) {
  if (!shouldUseDeliveryLedger(options)) {
    return null;
  }
  try {
    return recordDeliveryAttempt(input, dbOptions(options));
  } catch (error) {
    return {
      delivery_record_failed: true,
      error: error.code || "DELIVERY_LEDGER_WRITE_FAILED",
    };
  }
}

function safeFindExistingSent(base = {}, options = {}) {
  if (!shouldUseDeliveryLedger(options)) {
    return null;
  }
  try {
    return findExistingDelivery({
      ...base,
      idempotency_key: canonicalLedgerKey(base),
      onlySent: true,
    }, dbOptions(options));
  } catch (_error) {
    return null;
  }
}

function deliveryStatusFromSendResult(channel, result = {}, dryRun = true) {
  if (dryRun) return LEDGER_STATUSES.DRY_RUN;
  if (result.status === "OK" && channel === DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL) return LEDGER_STATUSES.SENT;
  if (result.output?.status === DOCUMENT_DELIVERY_STATUSES.SENT) return LEDGER_STATUSES.SENT;
  if (channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL) return LEDGER_STATUSES.PROVIDER_ERROR;
  return LEDGER_STATUSES.TELEGRAM_ERROR;
}

function appendLedgerOutput(result = {}, ledgerRecord, idempotencyKey) {
  return {
    ...result,
    output: {
      ...(result.output || {}),
      idempotency_key: idempotencyKey,
      delivery_ledger: ledgerRecord ? {
        delivery_id: ledgerRecord.delivery_id || null,
        delivery_status: ledgerRecord.delivery_status || null,
        channel: ledgerRecord.channel || null,
        recipient_redacted: ledgerRecord.recipient_redacted || null,
        sent_at: ledgerRecord.sent_at || null,
      } : null,
    },
  };
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

function runSandboxDocumentDeliveryStatus(options = {}) {
  let draft = null;
  try {
    draft = loadDraftForDiagnose(options);
  } catch (_error) {
    return {
      status: "NEEDS_RUNTIME",
      output: { draft_id: text(options.draftId), error_class: "DRAFT_DB_LOAD_FAILED" },
      warnings: [],
      errors: ["DRAFT_DB_LOAD_FAILED"],
    };
  }
  if (!draft) {
    return {
      status: "NEEDS_RUNTIME",
      output: { draft_id: text(options.draftId), error_class: "DRAFT_CONTEXT_MISSING" },
      warnings: [],
      errors: ["DRAFT_CONTEXT_MISSING"],
    };
  }
  const files = draftFiles(draft, options);
  const documentMetadata = draftDocumentMetadata(draft, options);
  const validation = validateDeliveryFiles(files);
  const ledgerRows = ledgerSummaryForDraft(draft.draft_id || options.draftId, dbOptions(options));
  const providerRows = deliveryRowsByChannel(ledgerRows, DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL);
  const telegramRows = deliveryRowsByChannel(ledgerRows, DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL);
  const providerDiagnose = runSandboxDocumentDeliveryDiagnose({ ...options, draft, channel: DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL });
  const telegramDiagnose = runSandboxDocumentDeliveryDiagnose({ ...options, draft, channel: DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL });
  return {
    status: "OK",
    output: {
      draft_id: text(draft.draft_id),
      client_id: text(draft.client_id || clientFromDraft(draft).client_id),
      invoice_status: invoiceStatusFromDraft(draft),
      payment_status: paymentStatusFromDraft(draft),
      artifact_status: text(draft.sandbox_pac_summary?.artifact_status),
      documents_valid: validation.ok === true,
      xml_content_valid: validation.xml.ok === true,
      pdf_content_valid: validation.pdf.ok === true,
      pdf_source: documentMetadata.pdf_source,
      human_xml_path_present: Boolean(validation.xml_path_safe),
      human_pdf_path_present: Boolean(validation.pdf_path_safe),
      provider_email: {
        ready: deliveryChannelReady(DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL, providerDiagnose),
        sent: Boolean(sentAt(providerRows)),
        last_status: latestStatus(providerRows),
        last_sent_at: sentAt(providerRows),
      },
      telegram_document_channel: {
        ready: deliveryChannelReady(DOCUMENT_DELIVERY_CHANNELS.TELEGRAM_DOCUMENT_CHANNEL, telegramDiagnose),
        sent: Boolean(sentAt(telegramRows)),
        last_status: latestStatus(telegramRows),
        last_sent_at: sentAt(telegramRows),
      },
      ledger_summary: {
        total: ledgerRows.length,
        provider_email_count: providerRows.length,
        telegram_document_channel_count: telegramRows.length,
      },
    },
    warnings: [],
    errors: [],
  };
}

function runSandboxDocumentDeliveryLedger(options = {}) {
  const draftId = text(options.draftId || options.draft_id);
  if (!draftId) {
    return {
      status: "NEEDS_RUNTIME",
      output: { draft_id: null, ledger_rows: [], ledger_summary: { total: 0 } },
      warnings: [],
      errors: ["DRAFT_ID_REQUIRED"],
    };
  }
  const rows = ledgerSummaryForDraft(draftId, dbOptions(options));
  const byChannel = rows.reduce((acc, row) => {
    const channel = text(row.channel) || "UNKNOWN";
    acc[channel] = (acc[channel] || 0) + 1;
    return acc;
  }, {});
  const byStatus = rows.reduce((acc, row) => {
    const status = text(row.delivery_status) || "UNKNOWN";
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  return {
    status: "OK",
    output: {
      draft_id: draftId,
      ledger_rows: rows,
      ledger_summary: {
        total: rows.length,
        by_channel: byChannel,
        by_status: byStatus,
        latest_status: rows[0]?.delivery_status || null,
        latest_channel: rows[0]?.channel || null,
        latest_sent_at: rows.find((row) => row.delivery_status === "SENT")?.sent_at || null,
      },
    },
    warnings: [],
    errors: [],
  };
}

function runSandboxDocumentDeliveryPrepare(options = {}) {
  let draft = null;
  try {
    draft = loadDraftForDiagnose(options);
  } catch (_error) {
    return {
      status: "NEEDS_RUNTIME",
      output: { draft_id: text(options.draftId), error_class: "DRAFT_DB_LOAD_FAILED", confirmation_required: false },
      warnings: [],
      errors: ["DRAFT_DB_LOAD_FAILED"],
    };
  }
  if (!draft) {
    return {
      status: "NEEDS_RUNTIME",
      output: { draft_id: text(options.draftId), error_class: "DRAFT_CONTEXT_MISSING", confirmation_required: false },
      warnings: [],
      errors: ["DRAFT_CONTEXT_MISSING"],
    };
  }
  const channel = normalizeChannel(options.channel || options.deliveryChannel);
  if (!isSandboxStamped(draft)) {
    return {
      status: "NEEDS_DOCUMENTS",
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        invoice_status: invoiceStatusFromDraft(draft),
        confirmation_required: false,
      },
      warnings: ["La factura sandbox aun no esta timbrada."],
      errors: ["SANDBOX_INVOICE_NOT_STAMPED"],
    };
  }
  const diagnose = runSandboxDocumentDeliveryDiagnose({ ...options, draft, channel });
  const files = draftFiles(draft, options);
  const documentMetadata = draftDocumentMetadata(draft, options);
  const validation = validateDeliveryFiles(files);
  const base = ledgerBaseFromDraft(draft, channel, validation, documentMetadata, options);
  const idempotencyKey = canonicalLedgerKey(base);
  const duplicate = safeFindExistingSent(base, options);
  if (duplicate) {
    safeRecordDeliveryAttempt({
      ...base,
      delivery_status: LEDGER_STATUSES.BLOCKED_DUPLICATE,
      delivery_action: "PREPARE",
      idempotency_key: attemptLedgerKey(base, LEDGER_STATUSES.BLOCKED_DUPLICATE),
      normalized_warnings: ["DELIVERY_ALREADY_SENT"],
      evidence_sanitized: { duplicate_delivery_id: duplicate.delivery_id, duplicate_sent_at: duplicate.sent_at },
    }, options);
    return {
      status: LEDGER_STATUSES.BLOCKED_DUPLICATE,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        confirmation_required: true,
        duplicate_sent: true,
        idempotency_key: idempotencyKey,
        duplicate_delivery: {
          delivery_id: duplicate.delivery_id,
          sent_at: duplicate.sent_at,
          recipient_redacted: duplicate.recipient_redacted,
        },
      },
      warnings: ["DELIVERY_ALREADY_SENT"],
      errors: [],
    };
  }
  if (diagnose.status !== "OK") {
    safeRecordDeliveryAttempt({
      ...base,
      delivery_status: diagnose.status,
      delivery_action: "PREPARE",
      idempotency_key: attemptLedgerKey(base, diagnose.status),
      normalized_errors: diagnose.errors || [],
      normalized_warnings: diagnose.warnings || [],
      evidence_sanitized: diagnose.output || {},
    }, options);
    return {
      status: diagnose.status,
      output: {
        ...(diagnose.output || {}),
        confirmation_required: false,
        idempotency_key: idempotencyKey,
      },
      warnings: diagnose.warnings || [],
      errors: diagnose.errors || [],
    };
  }
  safeRecordDeliveryAttempt({
    ...base,
    delivery_status: LEDGER_STATUSES.READY,
    delivery_action: "PREPARE",
    idempotency_key: attemptLedgerKey(base, LEDGER_STATUSES.READY),
    normalized_warnings: diagnose.warnings || [],
    evidence_sanitized: diagnose.output || {},
  }, options);
  return {
    status: LEDGER_STATUSES.READY,
    output: {
      draft_id: text(draft.draft_id || options.draftId),
      client_id: base.client_id,
      invoice_status: invoiceStatusFromDraft(draft),
      payment_status: paymentStatusFromDraft(draft),
      channel,
      idempotency_key: idempotencyKey,
      confirmation_required: true,
      documents_valid: validation.ok === true,
      xml_content_valid: validation.xml.ok === true,
      pdf_content_valid: validation.pdf.ok === true,
      pdf_source: documentMetadata.pdf_source,
      confirmation_summary: {
        client_display_name: safeClientName(draft),
        folio: folioFromDraft(draft),
        total: draft.total ?? null,
        channel,
        recipient_redacted: base.recipient_redacted,
        documents: ["XML", "PDF"],
        provider: "Factura.com Sandbox",
      },
      confirmation_token_payload: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        action: channel === DOCUMENT_DELIVERY_CHANNELS.PROVIDER_EMAIL
          ? "DELIVERY_CONFIRM_PROVIDER_EMAIL"
          : "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
        confirmation_required: true,
        idempotency_key: idempotencyKey,
      },
    },
    warnings: diagnose.warnings || [],
    errors: [],
  };
}

function runSandboxDocumentDeliveryConfirm(options = {}) {
  const prepared = runSandboxDocumentDeliveryPrepare(options);
  return {
    ...prepared,
    output: {
      ...(prepared.output || {}),
      confirmed: prepared.status === LEDGER_STATUSES.READY,
      send_action: prepared.status === LEDGER_STATUSES.READY ? "sandbox.documents.delivery.send" : null,
    },
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
  const dryRun = options.dryRun !== false;
  const sourceKind = String(options.auditContext?.source_kind || options.auditContext?.sourceKind || "").toUpperCase();
  const fromTelegramCallback = sourceKind === "CALLBACK_QUERY";
  const baseLedger = ledgerBaseFromDraft(draft, channel, validation, documentMetadata, options);
  const idempotencyKey = canonicalLedgerKey(baseLedger);
  if (!dryRun && fromTelegramCallback && options.confirmed !== true) {
    const ledgerRecord = safeRecordDeliveryAttempt({
      ...baseLedger,
      delivery_status: LEDGER_STATUSES.ERROR,
      delivery_action: "SEND",
      idempotency_key: attemptLedgerKey(baseLedger, LEDGER_STATUSES.ERROR),
      normalized_errors: ["DELIVERY_CONFIRMATION_REQUIRED"],
      evidence_sanitized: { source_kind: sourceKind, confirmation_required: true },
    }, options);
    return appendLedgerOutput({
      status: LEDGER_STATUSES.ERROR,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        confirmation_required: true,
        error_class: "DELIVERY_CONFIRMATION_REQUIRED",
      },
      warnings: ["Se requiere confirmacion humana antes de enviar documentos desde Telegram."],
      errors: ["DELIVERY_CONFIRMATION_REQUIRED"],
    }, ledgerRecord, idempotencyKey);
  }
  const existingSent = safeFindExistingSent(baseLedger, options);
  if (existingSent && options.force !== true) {
    const ledgerRecord = safeRecordDeliveryAttempt({
      ...baseLedger,
      delivery_status: LEDGER_STATUSES.BLOCKED_DUPLICATE,
      delivery_action: "SEND",
      idempotency_key: attemptLedgerKey(baseLedger, LEDGER_STATUSES.BLOCKED_DUPLICATE),
      normalized_warnings: ["DELIVERY_ALREADY_SENT"],
      evidence_sanitized: {
        duplicate_delivery_id: existingSent.delivery_id,
        duplicate_sent_at: existingSent.sent_at,
      },
    }, options);
    return appendLedgerOutput({
      status: LEDGER_STATUSES.BLOCKED_DUPLICATE,
      output: {
        draft_id: text(draft.draft_id || options.draftId),
        channel,
        documents_valid: true,
        duplicate_sent: true,
        duplicate_delivery: {
          delivery_id: existingSent.delivery_id,
          sent_at: existingSent.sent_at,
          recipient_redacted: existingSent.recipient_redacted,
        },
      },
      warnings: ["DELIVERY_ALREADY_SENT"],
      errors: [],
    }, ledgerRecord, idempotencyKey);
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
      const ledgerRecord = safeRecordDeliveryAttempt({
        ...baseLedger,
        delivery_status: LEDGER_STATUSES.BLOCKED_PROVIDER_PDF_INVALID,
        delivery_action: dryRun ? "DRY_RUN" : "SEND",
        idempotency_key: attemptLedgerKey(baseLedger, LEDGER_STATUSES.BLOCKED_PROVIDER_PDF_INVALID),
        normalized_errors: ["PROVIDER_EMAIL_BLOCKED_PROVIDER_PDF_INVALID"],
        normalized_warnings: ["Provider email queda bloqueado porque el PDF del proveedor no fue validado visualmente."],
      }, options);
      return appendLedgerOutput({
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
      }, ledgerRecord, idempotencyKey);
    }
    const providerResult = await runProviderEmailDelivery({
      ...options,
      draft,
      canonicalRequest,
      canonicalValidation,
    });
    const ledgerStatus = deliveryStatusFromSendResult(channel, providerResult, dryRun);
    const ledgerRecord = safeRecordDeliveryAttempt({
      ...baseLedger,
      delivery_status: ledgerStatus,
      delivery_action: dryRun ? "DRY_RUN" : "SEND",
      idempotency_key: dryRun ? attemptLedgerKey(baseLedger, LEDGER_STATUSES.DRY_RUN) : idempotencyKey,
      sent_at: ledgerStatus === LEDGER_STATUSES.SENT ? providerResult.output?.sent_at || new Date().toISOString() : null,
      provider_message: providerResult.output?.provider_message,
      normalized_errors: providerResult.errors || [],
      normalized_warnings: providerResult.warnings || [],
      evidence_sanitized: providerResult.output || {},
    }, options);
    return appendLedgerOutput(providerResult, ledgerRecord, idempotencyKey);
  }
  const result = await sendSandboxInvoiceDocumentsToTelegram({
    files,
    env: options.env || process.env,
    dryRun,
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
  const telegramStatus = deliveryStatusFromSendResult(channel, result, dryRun);
  const ledgerRecord = safeRecordDeliveryAttempt({
    ...baseLedger,
    delivery_status: telegramStatus,
    delivery_action: dryRun ? "DRY_RUN" : "SEND",
    idempotency_key: dryRun ? attemptLedgerKey(baseLedger, LEDGER_STATUSES.DRY_RUN) : idempotencyKey,
    sent_at: telegramStatus === LEDGER_STATUSES.SENT ? new Date().toISOString() : null,
    normalized_errors: result.errors || [],
    normalized_warnings: result.warnings || [],
    evidence_sanitized: result,
  }, options);
  return appendLedgerOutput({
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
  }, ledgerRecord, idempotencyKey);
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
  runSandboxDocumentDeliveryConfirm,
  runSandboxDocumentDeliveryLedger,
  runSandboxDocumentDeliveryPrepare,
  runSandboxDocumentDeliverySend,
  runSandboxDocumentDeliveryStatus,
};

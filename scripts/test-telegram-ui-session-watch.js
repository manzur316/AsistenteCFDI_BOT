const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  classifyExecution,
  detectStateButtonFailures,
  isProviderEmailAllowed,
  latencyMetricsForContext,
  markHumanTimeout,
  writeSessionReport,
} = require("./qa/telegram-ui-session-watch");

const checks = [];
const root = path.resolve(__dirname, "..");

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function nodeRun(json) {
  return [{ data: { main: [[{ json }]] } }];
}

function execution({ id = "exec-1", handle = {}, plan = {}, summary = {}, extraRuns = {}, startedAt, stoppedAt } = {}) {
  const runData = {
    "Handle Commands And Scoring": nodeRun(handle),
    "Build Telegram Dispatch Plan": nodeRun(plan),
    ...extraRuns,
  };
  if (Object.keys(summary).length) runData["Build PAC Sandbox Action Summary"] = nodeRun(summary);
  return {
    id,
    workflowId: "workflow-test",
    finished: true,
    status: "success",
    startedAt,
    stoppedAt,
    data: { resultData: { runData } },
  };
}

function tokenRow(token, action, draftId, overrides = {}) {
  return {
    token,
    action,
    draft_id: draftId,
    chat_id: overrides.chat_id === undefined ? "6573879494" : overrides.chat_id,
    used_at: overrides.used_at || null,
    expires_at: overrides.expires_at || "2099-01-01T00:00:00.000Z",
    created_at: overrides.created_at || "2026-06-11T12:00:00.000Z",
    payload: { action, draft_id: draftId, channel: overrides.channel || null },
  };
}

function draft(draftId, invoiceStatus, artifactStatus, extra = {}) {
  return {
    draft_id: draftId,
    chat_id: "6573879494",
    invoice_status: invoiceStatus,
    payment_status: "PENDIENTE",
    status: invoiceStatus,
    client_snapshot: extra.client_snapshot || {},
    sandbox_pac_summary: {
      artifact_status: artifactStatus,
      xml_content_valid: artifactStatus === "DOWNLOADED",
      pdf_content_valid: artifactStatus === "DOWNLOADED",
      documents_valid: artifactStatus === "DOWNLOADED",
      ...(extra.sandbox_pac_summary || {}),
    },
    ...extra,
  };
}

function markup(tokens, labels = {}) {
  return {
    inline_keyboard: tokens.map((row) => [{
      text: labels[row.action] || row.action,
      callback_data: `cfdi:${row.token}`,
    }]),
  };
}

function dbMock({ draftRow = null, tokens = [], ledgerRows = [], sendLogs = [] } = {}) {
  return {
    getDraftFull() {
      return draftRow;
    },
    getTokensForDraft() {
      return tokens;
    },
    getLedgerFull() {
      return ledgerRows;
    },
    getSendLogs() {
      return sendLogs;
    },
  };
}

function failureCodes(result) {
  return (result.event.failures || []).map((item) => item.code);
}

function classify(sample, db, args = {}) {
  return classifyExecution(sample, {
    db,
    args,
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
}

function classifyWithCounters(sample, counters, db = null, args = {}) {
  return classifyExecution(sample, {
    db,
    args,
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters,
  });
}

check("classifies CALLBACK_TOKEN_INVALID", () => {
  const sample = execution({
    id: "exec-invalid",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-invalid",
      action: "CALLBACK_TOKEN_INVALID",
      json_debug: { callback_reason: "token_invalido" },
    },
  });
  const result = classify(sample, null);
  assert.strictEqual(result.event.action, "CALLBACK_TOKEN_INVALID");
  assert.strictEqual(result.event.token_expired_or_invalid_reason, "token_invalido");
  return result.event.action;
});

check("classifies CALLBACK_TOKEN_CONTEXT_RECOVERED", () => {
  const sample = execution({
    id: "exec-recovered",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-recovered",
      callback_message_id: "701",
      chat_id: "6573879494",
      action: "CALLBACK_TOKEN_CONTEXT_RECOVERED",
      action_token: { draft_id: "DRAFT-WATCH-RECOVERED", chat_id: "6573879494" },
      json_debug: { callback_reason: "token_expirado" },
    },
  });
  const result = classify(sample, null);
  assert.strictEqual(result.event.action, "CALLBACK_TOKEN_CONTEXT_RECOVERED");
  assert.strictEqual(result.event.draft_id, "DRAFT-WATCH-RECOVERED");
  return result.event.draft_id;
});

check("detects DOWNLOAD_READY without DOWNLOAD_SANDBOX_ARTIFACTS", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-001", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOAD_READY" },
    buttons: [],
  }).map((item) => item.code);
  assert(codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"));
  return codes.join(",");
});

check("detects DOWNLOAD_READY with STAMP_DRAFT_SANDBOX visible", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-002", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOAD_READY" },
    buttons: [{ action: "DOWNLOAD_SANDBOX_ARTIFACTS" }, { action: "STAMP_DRAFT_SANDBOX" }],
  }).map((item) => item.code);
  assert(codes.includes("DOWNLOAD_READY_SHOWS_STAMP"));
  return codes.join(",");
});

check("allows DOWNLOAD_READY ledger surface with download action", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-LEDGER-DOWNLOAD", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOAD_READY" },
    buttons: [
      { action: "DOWNLOAD_SANDBOX_ARTIFACTS" },
      { action: "VIEW_DRAFT" },
      { action: "MARK_PAYMENT_PAID" },
    ],
    context: { action: "CLIENT_INVOICE_LEDGER" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"));
  assert(!codes.includes("DOWNLOAD_READY_SHOWS_STAMP"));
  return "ledger download action accepted";
});

check("allows DOWNLOADED ledger surface with delivery actions", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-LEDGER-DOWNLOADED", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [
      { action: "DELIVERY_STATUS" },
      { action: "DELIVERY_PREPARE_TELEGRAM_CHANNEL" },
      { action: "DELIVERY_PREPARE_PROVIDER_EMAIL" },
      { action: "VIEW_DRAFT" },
      { action: "MARK_PAYMENT_PAID" },
    ],
    context: { action: "CLIENT_INVOICE_LEDGER" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
  return "ledger delivery actions accepted";
});

check("allows stamp button for approved draft with BORRADOR invoice status", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-APPROVED", status: "APROBADO", invoice_status: "BORRADOR", artifact_status: "" },
    buttons: [{ action: "STAMP_DRAFT_SANDBOX" }],
  }).map((item) => item.code);
  assert(!codes.includes("DRAFT_BEFORE_APPROVAL_SHOWS_STAMP"));
  return "approved stamp allowed";
});

check("does not compare old render UI against newer DB snapshot", () => {
  const draftId = "DRAFT-WATCH-STALE-DB";
  const token = tokenRow("STAMPSTALE0001", "STAMP_DRAFT_SANDBOX", draftId, { created_at: "2026-06-11T12:00:01.000Z" });
  const sample = execution({
    id: "exec-stale-render",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:02.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_DETALLE", draft_id: draftId },
    plan: { chat_id: "6573879494", reply_markup: markup([token], { STAMP_DRAFT_SANDBOX: "Timbrar sandbox" }) },
  });
  const currentDraft = draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOAD_READY", {
    status: "APROBADO",
    updated_at: "2026-06-11T12:00:10.000Z",
  });
  const result = classify(sample, dbMock({ draftRow: currentDraft, tokens: [token] }));
  const codes = failureCodes(result);
  assert.strictEqual(result.event.db_snapshot_newer_than_execution, true);
  assert(!codes.includes("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON"));
  assert(!codes.includes("DOWNLOAD_READY_SHOWS_STAMP"));
  return "stale DB ignored";
});

check("does not enforce downloaded draft buttons on global menus", () => {
  const draftId = "DRAFT-WATCH-GLOBAL-MENU";
  const sample = execution({
    id: "exec-global-menu",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:02.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "PRODUCT_MENU_MAIN", draft_id: draftId },
    plan: {
      chat_id: "6573879494",
      reply_markup: {
        inline_keyboard: [
          [{ text: "Nueva factura", callback_data: "cfdi_nav:new" }],
          [{ text: "Pendientes", callback_data: "cfdi_nav:pending" }],
        ],
      },
    },
  });
  const result = classify(sample, dbMock({ draftRow: draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED") }));
  const codes = failureCodes(result);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
  return "global menu ignored";
});

check("does not enforce downloaded draft buttons on missing draft detail response", () => {
  const draftId = "DRAFT-WATCH-MISSING-DETAIL";
  const sample = execution({
    id: "exec-missing-detail",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:02.000Z",
    handle: {
      source_kind: "MESSAGE",
      chat_id: "6573879494",
      action: "COMMAND_DETALLE",
      draft_id: "10",
      telegram_message: "No encontre ese borrador.\n\nVersion: CFDI_LOCAL_INGEST_V1",
    },
    plan: { chat_id: "6573879494", telegram_message: "No encontre ese borrador.\n\nVersion: CFDI_LOCAL_INGEST_V1" },
  });
  const result = classify(sample, dbMock({ draftRow: draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED") }));
  const codes = failureCodes(result);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
  return "missing detail ignored";
});

check("detects DOWNLOADED missing delivery buttons", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-003", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_STATUS" }],
  }).map((item) => item.code);
  assert(codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
  assert.strictEqual(codes.filter((code) => code === "DOWNLOADED_MISSING_DELIVERY_BUTTON").length, 2);
  return codes.length;
});

check("allows delivery confirmation surface without full delivery menu", () => {
  const codes = detectStateButtonFailures({
    state: { draft_id: "DRAFT-WATCH-DELIVERY", invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
    buttons: [{ action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL" }, { action: "DELIVERY_STATUS" }, { action: "VIEW_DRAFT" }],
    context: { route: "sandbox.documents.delivery.prepare", action: "DOCUMENT_DELIVERY_ACTION_REQUESTED" },
  }).map((item) => item.code);
  assert(!codes.includes("DOWNLOADED_MISSING_DELIVERY_BUTTON"));
  return "delivery surface allowed";
});

check("detects failed Telegram dispatch", () => {
  const sample = execution({
    id: "exec-dispatch-fail",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-dispatch",
      callback_message_id: "702",
      chat_id: "6573879494",
      action: "VIEW_DRAFT",
      json_debug: { callback_lifecycle: { action_executed: true } },
    },
    plan: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-dispatch",
      callback_message_id: "702",
      chat_id: "6573879494",
      telegram_message: "Detalle",
      should_send_telegram: true,
      telegram_dispatch_method: "editMessageText",
      telegram_dispatch_payload_built: true,
    },
    extraRuns: {
      "Telegram editMessageText": nodeRun({ ok: false, error: "Bad Request: message is not modified" }),
    },
  });
  const result = classify(sample, null);
  const codes = failureCodes(result);
  assert(codes.includes("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED"));
  return codes.join(",");
});

check("ignores inbound old reply_markup when auditing generated UI", () => {
  const draftId = "DRAFT-WATCH-INBOUND";
  const usedToken = tokenRow("USEDTOKEN00001", "VIEW_DRAFT", draftId, { used_at: "2026-06-11T12:00:00.000Z" });
  const sample = execution({
    id: "exec-inbound-old-markup",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-inbound",
      callback_message_id: "704",
      chat_id: "6573879494",
      action: "VIEW_DRAFT",
      action_token: { draft_id: draftId, action: "VIEW_DRAFT" },
      callback_query: {
        message: {
          reply_markup: {
            inline_keyboard: [[{ text: "Ver factura", callback_data: "cfdi:USEDTOKEN00001" }]],
          },
        },
      },
    },
    plan: { chat_id: "6573879494", telegram_dispatch_blocked_reason: "synthetic no-op" },
  });
  const result = classify(sample, dbMock({
    draftRow: draft(draftId, "APROBADO", ""),
    tokens: [usedToken],
  }));
  assert.strictEqual(failureCodes(result).includes("REPLY_MARKUP_REUSES_OLD_CALLBACK_DATA"), false);
  return "ignored inbound markup";
});

check("does not report old empty-chat tokens as fresh", () => {
  const draftId = "DRAFT-WATCH-OLD-EMPTY-CHAT";
  const oldToken = tokenRow("EMPTYCHATOLD01", "DELIVERY_PREPARE_PROVIDER_EMAIL", draftId, {
    chat_id: "",
    created_at: "2026-06-10T12:00:00.000Z",
  });
  const sample = execution({
    id: "exec-old-empty-chat-token",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:02.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_APROBADAS", draft_id: draftId },
    plan: { chat_id: "6573879494", reply_markup: markup([]) },
  });
  const result = classify(sample, dbMock({
    draftRow: draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED"),
    tokens: [oldToken],
  }));
  assert(!failureCodes(result).includes("FRESH_TOKEN_EMPTY_CHAT_ID"));
  return "old token ignored";
});

check("detects DOWNLOADED DB state without physical XML/PDF", () => {
  const draftId = "DRAFT-WATCH-004";
  const tokens = [
    tokenRow("STATUS00000001", "DELIVERY_STATUS", draftId),
    tokenRow("TELEGRAM000001", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", draftId),
    tokenRow("EMAIL000000001", "DELIVERY_PREPARE_PROVIDER_EMAIL", draftId),
  ];
  const sample = execution({
    id: "exec-downloaded-missing-files",
    handle: { source_kind: "CALLBACK_QUERY", chat_id: "6573879494", action_token: { draft_id: draftId }, action: "VIEW_DRAFT" },
    plan: { chat_id: "6573879494", reply_markup: markup(tokens) },
  });
  const result = classify(sample, dbMock({ draftRow: draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED"), tokens }));
  const codes = failureCodes(result);
  assert(codes.includes("DOWNLOADED_FILES_MISSING"));
  return codes.join(",");
});

check("detects provider email outside allowlist", () => {
  const draftId = "DRAFT-WATCH-005";
  const tokens = [
    tokenRow("STATUS00000002", "DELIVERY_STATUS", draftId),
    tokenRow("TELEGRAM000002", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", draftId),
    tokenRow("EMAIL000000002", "DELIVERY_PREPARE_PROVIDER_EMAIL", draftId),
  ];
  const sample = execution({
    id: "exec-provider-email",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-email",
      callback_message_id: "703",
      chat_id: "6573879494",
      action: "DELIVERY_PREPARE_PROVIDER_EMAIL",
      requested_sandbox_action: "sandbox.documents.delivery.prepare",
      action_token: { draft_id: draftId, action: "DELIVERY_PREPARE_PROVIDER_EMAIL" },
    },
    plan: { chat_id: "6573879494", reply_markup: markup(tokens) },
  });
  const oldAllowlist = process.env.SATBOT_PROVIDER_EMAIL_ALLOWLIST;
  process.env.SATBOT_PROVIDER_EMAIL_ALLOWLIST = "allowed@example.test";
  try {
    assert.strictEqual(isProviderEmailAllowed("blocked@example.test"), false);
    const result = classify(sample, dbMock({
      draftRow: draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED", { client_snapshot: { email: "blocked@example.test" } }),
      tokens,
    }));
    assert(failureCodes(result).includes("PROVIDER_EMAIL_OUTSIDE_ALLOWLIST"));
  } finally {
    if (oldAllowlist === undefined) delete process.env.SATBOT_PROVIDER_EMAIL_ALLOWLIST;
    else process.env.SATBOT_PROVIDER_EMAIL_ALLOWLIST = oldAllowlist;
  }
  return "outside allowlist";
});

check("deduplicates provider email ledger rows for max send limit", () => {
  const draftId = "DRAFT-WATCH-EMAIL-LIMIT";
  const tokens = [
    tokenRow("STATUS00000003", "DELIVERY_STATUS", draftId),
    tokenRow("TELEGRAM000003", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", draftId),
    tokenRow("EMAIL000000003", "DELIVERY_PREPARE_PROVIDER_EMAIL", draftId),
  ];
  const sample = execution({
    id: "exec-provider-email-sent",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-email-sent",
      callback_message_id: "705",
      chat_id: "6573879494",
      action: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
      requested_sandbox_action: "sandbox.documents.delivery.send",
      action_token: { draft_id: draftId, action: "DELIVERY_CONFIRM_PROVIDER_EMAIL" },
    },
    summary: {
      requested_sandbox_action: "sandbox.documents.delivery.send",
      sandbox_action_status: "OK",
      sandbox_action_summary: { ok: true },
      telegram_message: "Factura enviada por correo.",
    },
    plan: { chat_id: "6573879494", reply_markup: markup(tokens) },
  });
  const sentOne = {
    delivery_id: "DELIV-WATCH-EMAIL-LIMIT-1",
    draft_id: draftId,
    channel: "PROVIDER_EMAIL",
    delivery_status: "SENT",
    sent_at: "2026-06-11T12:00:00.000Z",
  };
  const sentTwo = {
    delivery_id: "DELIV-WATCH-EMAIL-LIMIT-2",
    draft_id: draftId,
    channel: "PROVIDER_EMAIL",
    delivery_status: "SENT",
    sent_at: "2026-06-11T12:05:00.000Z",
  };
  const counters = {};
  const options = {
    args: { maxProviderEmailSend: 1 },
    counters,
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
  };
  const draftRow = draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOADED");
  const first = classifyExecution(sample, { ...options, db: dbMock({ draftRow, tokens, ledgerRows: [sentOne] }) });
  const repeated = classifyExecution(sample, { ...options, db: dbMock({ draftRow, tokens, ledgerRows: [sentOne] }) });
  assert(!failureCodes(first).includes("PROVIDER_EMAIL_REAL_SEND_LIMIT_EXCEEDED"));
  assert(!failureCodes(repeated).includes("PROVIDER_EMAIL_REAL_SEND_LIMIT_EXCEEDED"));
  const second = classifyExecution(sample, { ...options, db: dbMock({ draftRow, tokens, ledgerRows: [sentOne, sentTwo] }) });
  assert(failureCodes(second).includes("PROVIDER_EMAIL_REAL_SEND_LIMIT_EXCEEDED"));
  return counters.providerEmailSendCount;
});

check("delivery_send_uses_recent_sent_ledger_as_db_change_evidence", () => {
  const draftId = "DRAFT-WATCH-LEDGER-EVIDENCE";
  const draftRow = draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOAD_READY", {
    updated_at: "2026-06-11T11:59:00.000Z",
  });
  const sample = execution({
    id: "exec-send-ledger-evidence",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:04.000Z",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-send-ledger",
      callback_message_id: "706",
      chat_id: "6573879494",
      action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
      requested_sandbox_action: "sandbox.documents.delivery.send",
      action_token: { draft_id: draftId, action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL" },
    },
    summary: {
      requested_sandbox_action: "sandbox.documents.delivery.send",
      sandbox_action_status: "OK",
      telegram_message: "Factura enviada por Telegram.",
      json_debug: { callback_lifecycle: { action_executed: true } },
    },
    extraRuns: {
      "Telegram sendMessage": nodeRun({ ok: true, result: { message_id: 88 } }),
    },
  });
  const sentLedger = {
    delivery_id: "DELIV-WATCH-LEDGER-EVIDENCE",
    draft_id: draftId,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    delivery_status: "SENT",
    sent_at: "2026-06-11T12:00:03.000Z",
    created_at: "2026-06-11T12:00:02.000Z",
    updated_at: "2026-06-11T12:00:03.000Z",
  };
  const result = classifyExecution(sample, {
    db: dbMock({ draftRow, ledgerRows: [sentLedger] }),
    args: { allowTelegramChannelSend: true },
    previousDraftSnapshots: new Map([[draftId, draftRow]]),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
  const codes = failureCodes(result);
  assert(!codes.includes("DB_UNCHANGED_AFTER_ACTION"));
  assert(!codes.includes("DOCUMENT_LEDGER_ABSENT_AFTER_SEND"));
  return "ledger evidence accepted";
});

check("delivery_send_warns_db_unchanged_when_sent_ledger_is_stale", () => {
  const draftId = "DRAFT-WATCH-LEDGER-STALE";
  const draftRow = draft(draftId, "SANDBOX_TIMBRADO", "DOWNLOAD_READY", {
    updated_at: "2026-06-11T11:59:00.000Z",
  });
  const sample = execution({
    id: "exec-send-ledger-stale",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:04.000Z",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-send-ledger-stale",
      callback_message_id: "707",
      chat_id: "6573879494",
      action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
      requested_sandbox_action: "sandbox.documents.delivery.send",
      action_token: { draft_id: draftId, action: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL" },
    },
    summary: {
      requested_sandbox_action: "sandbox.documents.delivery.send",
      sandbox_action_status: "OK",
      telegram_message: "Factura enviada por Telegram.",
      json_debug: { callback_lifecycle: { action_executed: true } },
    },
    extraRuns: {
      "Telegram sendMessage": nodeRun({ ok: true, result: { message_id: 89 } }),
    },
  });
  const staleLedger = {
    delivery_id: "DELIV-WATCH-LEDGER-STALE",
    draft_id: draftId,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    delivery_status: "SENT",
    sent_at: "2026-06-11T11:00:00.000Z",
    created_at: "2026-06-11T11:00:00.000Z",
    updated_at: "2026-06-11T11:00:00.000Z",
  };
  const result = classifyExecution(sample, {
    db: dbMock({ draftRow, ledgerRows: [staleLedger] }),
    args: { allowTelegramChannelSend: true },
    previousDraftSnapshots: new Map([[draftId, draftRow]]),
    previousTokenSnapshots: new Map(),
    counters: {},
  });
  const item = result.event.failures.find((failure) => failure.code === "DB_UNCHANGED_AFTER_ACTION");
  assert(item);
  assert.strictEqual(item.details.ledger_evidence, "sent_ledger_row_outside_execution_window");
  return item.code;
});

check("classifies fast execution latency as OK", () => {
  const metrics = latencyMetricsForContext({
    execution_id: "exec-latency-ok",
    started_at_ms: Date.parse("2026-06-11T12:00:00.000Z"),
    generated_at_ms: Date.parse("2026-06-11T12:00:02.000Z"),
  });
  assert.strictEqual(metrics.status, "LATENCY_OK");
  assert.strictEqual(metrics.measured_ms, 2000);
  return metrics.status;
});

check("classifies 4-8s execution latency as WARN", () => {
  const sample = execution({
    id: "exec-latency-warn",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:05.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_APROBADAS" },
  });
  const result = classify(sample, null);
  assert.strictEqual(result.event.latency.status, "LATENCY_WARN");
  assert(failureCodes(result).includes("LATENCY_WARN"));
  return result.event.latency.measured_ms;
});

check("classifies execution above 8s latency as FAIL", () => {
  const sample = execution({
    id: "exec-latency-fail",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:09.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_PENDIENTES" },
  });
  const result = classify(sample, null);
  assert.strictEqual(result.event.latency.status, "LATENCY_FAIL");
  assert(failureCodes(result).includes("LATENCY_FAIL"));
  return result.event.latency.measured_ms;
});

check("detects repeated non-sensitive callback in short window", () => {
  const counters = {};
  const baseHandle = {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-view-1",
    callback_message_id: "800",
    chat_id: "6573879494",
    action: "VIEW_DRAFT",
    action_token: { token: "DUPVIEWTOKEN001", draft_id: "DRAFT-WATCH-DUP", action: "VIEW_DRAFT" },
  };
  classifyWithCounters(execution({
    id: "exec-dup-view-1",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:01.000Z",
    handle: baseHandle,
  }), counters);
  const second = classifyWithCounters(execution({
    id: "exec-dup-view-2",
    startedAt: "2026-06-11T12:00:03.000Z",
    stoppedAt: "2026-06-11T12:00:04.000Z",
    handle: { ...baseHandle, callback_query_id: "cb-view-2" },
  }), counters);
  assert.strictEqual(second.event.duplicate_interaction.status, "DUPLICATE_INTERACTION_WARN");
  assert.strictEqual(second.event.duplicate_interaction.effect, "DUPLICATE_NAVIGATION");
  assert(failureCodes(second).includes("DUPLICATE_INTERACTION_WARN"));
  assert(!failureCodes(second).includes("SENSITIVE_ACTION_DUPLICATE_FAIL"));
  return second.event.duplicate_interaction.status;
});

check("fails repeated sensitive callback without confirmed protection", () => {
  const counters = {};
  const baseHandle = {
    source_kind: "CALLBACK_QUERY",
    callback_query_id: "cb-stamp-1",
    callback_message_id: "801",
    chat_id: "6573879494",
    action: "STAMP_DRAFT_SANDBOX",
    requested_sandbox_action: "sandbox.draft.stamp",
    action_token: { token: "DUPSTAMPTOKEN01", draft_id: "DRAFT-WATCH-STAMP-DUP", action: "STAMP_DRAFT_SANDBOX" },
  };
  classifyWithCounters(execution({
    id: "exec-dup-stamp-1",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:01.000Z",
    handle: baseHandle,
  }), counters);
  const second = classifyWithCounters(execution({
    id: "exec-dup-stamp-2",
    startedAt: "2026-06-11T12:00:02.000Z",
    stoppedAt: "2026-06-11T12:00:03.000Z",
    handle: { ...baseHandle, callback_query_id: "cb-stamp-2" },
  }), counters);
  const codes = failureCodes(second);
  assert(codes.includes("DUPLICATE_INTERACTION_WARN"));
  assert(codes.includes("SENSITIVE_ACTION_DUPLICATE_FAIL"));
  assert.strictEqual(second.event.duplicate_interaction.effect, "SENSITIVE_ACTION_DUPLICATE_RISK");
  return codes.join(",");
});

check("recognizes token-used recovery as duplicate protection", () => {
  const counters = {};
  const actionToken = { token: "USEDSTAMPTOKEN01", draft_id: "DRAFT-WATCH-STAMP-USED", action: "STAMP_DRAFT_SANDBOX" };
  classifyWithCounters(execution({
    id: "exec-used-token-1",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:01.000Z",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-used-token-1",
      callback_message_id: "802",
      chat_id: "6573879494",
      action: "STAMP_DRAFT_SANDBOX",
      requested_sandbox_action: "sandbox.draft.stamp",
      action_token: actionToken,
    },
  }), counters);
  const second = classifyWithCounters(execution({
    id: "exec-used-token-2",
    startedAt: "2026-06-11T12:00:02.000Z",
    stoppedAt: "2026-06-11T12:00:03.000Z",
    handle: {
      source_kind: "CALLBACK_QUERY",
      callback_query_id: "cb-used-token-2",
      callback_message_id: "802",
      chat_id: "6573879494",
      action: "CALLBACK_TOKEN_USED_RECOVERY",
      requested_action: "STAMP_DRAFT_SANDBOX",
      action_token: actionToken,
      json_debug: { callback_reason: "token_usado" },
    },
  }), counters);
  const codes = failureCodes(second);
  assert(codes.includes("DUPLICATE_INTERACTION_WARN"));
  assert(!codes.includes("SENSITIVE_ACTION_DUPLICATE_FAIL"));
  assert.strictEqual(second.event.duplicate_interaction.protection_effective, true);
  return second.event.duplicate_interaction.effect;
});

check("detects response ordering inversion when timestamps allow it", () => {
  const counters = {};
  classifyWithCounters(execution({
    id: "exec-order-slow",
    startedAt: "2026-06-11T12:00:00.000Z",
    stoppedAt: "2026-06-11T12:00:06.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_APROBADAS" },
  }), counters);
  const second = classifyWithCounters(execution({
    id: "exec-order-fast",
    startedAt: "2026-06-11T12:00:01.000Z",
    stoppedAt: "2026-06-11T12:00:02.000Z",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_DETALLE", draft_id: "DRAFT-WATCH-ORDER" },
  }), counters);
  assert.strictEqual(second.event.interaction_ordering.status, "OUT_OF_ORDER_RESPONSE_WARN");
  assert(failureCodes(second).includes("OUT_OF_ORDER_RESPONSE_WARN"));
  return second.event.interaction_ordering.relation;
});

check("reports UNKNOWN latency when timestamps are unavailable", () => {
  const sample = execution({
    id: "exec-latency-unknown",
    handle: { source_kind: "MESSAGE", chat_id: "6573879494", action: "COMMAND_APROBADAS" },
  });
  const result = classify(sample, null);
  const codes = failureCodes(result);
  assert.strictEqual(result.event.latency.status, "LATENCY_UNKNOWN");
  assert(!codes.includes("LATENCY_WARN"));
  assert(!codes.includes("LATENCY_FAIL"));
  return result.event.latency.status;
});

check("summary report includes latency and duplicate metrics", () => {
  const reportDir = path.join(root, "runtime", "test-telegram-ui-session-watch", "latency-report");
  fs.rmSync(reportDir, { recursive: true, force: true });
  const state = {
    label: "latency-summary",
    started_at: "2026-06-11T12:00:00.000Z",
    finished_at: "2026-06-11T12:01:00.000Z",
    workflow_status: { workflow_active: true },
    workflow_sync: { workflow_in_sync: true },
    env: [],
    timeline: [],
    events: [{
      execution_id: "exec-real-2822",
      latency: { status: "LATENCY_WARN", measured_ms: 4200 },
      duplicate_interaction: { duplicate_detected: true },
      tokens_created: [],
      tokens_used: [],
      visible_actions: [],
      dispatch: { methods: [] },
      document_delivery_ledger: [],
    }],
    failures: [],
    dbSnapshots: [],
    tokenSnapshots: [],
    n8nExecutions: [],
    latestState: {},
    draftIds: new Set(),
    executionIds: new Set(["exec-real-2822"]),
    human_steps: [],
  };
  const written = writeSessionReport(state, reportDir);
  assert(written.summary.includes("Total executions: 1"));
  assert(written.summary.includes("Slow executions: 1"));
  assert(written.summary.includes("Max duration ms: 4200"));
  assert(written.summary.includes("Duplicate callbacks/interactions: 1"));
  fs.rmSync(path.join(root, "runtime", "test-telegram-ui-session-watch"), { recursive: true, force: true });
  return "metrics present";
});

check("watcher report without executions marks WATCHER_NO_EXECUTIONS_CAPTURED", () => {
  const reportDir = path.join(root, "runtime", "test-telegram-ui-session-watch", "no-executions-report");
  fs.rmSync(reportDir, { recursive: true, force: true });
  const state = {
    label: "no-executions",
    started_at: "2026-06-11T12:00:00.000Z",
    finished_at: "2026-06-11T12:01:00.000Z",
    workflow_status: { workflow_active: true },
    workflow_sync: { workflow_in_sync: true },
    env: [],
    timeline: [],
    events: [],
    failures: [],
    dbSnapshots: [],
    tokenSnapshots: [],
    n8nExecutions: [],
    latestState: {},
    draftIds: new Set(),
    executionIds: new Set(),
    human_steps: [],
  };
  const written = writeSessionReport(state, reportDir);
  const codes = written.state.failures.map((item) => item.code);
  assert(codes.includes("WATCHER_NO_EXECUTIONS_CAPTURED"));
  assert(written.summary.includes("Execution IDs: N/A"));
  fs.rmSync(path.join(root, "runtime", "test-telegram-ui-session-watch"), { recursive: true, force: true });
  return codes.join(",");
});

check("generates summary.md without secrets", () => {
  const reportDir = path.join(root, "runtime", "test-telegram-ui-session-watch", "report");
  fs.rmSync(reportDir, { recursive: true, force: true });
  const state = {
    label: "summary-no-secrets",
    started_at: "2026-06-11T12:00:00.000Z",
    finished_at: "2026-06-11T12:01:00.000Z",
    workflow_status: { workflow_active: true },
    workflow_sync: { workflow_in_sync: true },
    env: [{ key: "TELEGRAM_BOT_TOKEN", status: "PRESENT", value: "123456789:SECRETSECRETSECRETSECRETSECRET" }],
    timeline: [],
    events: [{
      execution_id: "exec-summary",
      draft_id: "DRAFT-WATCH-SUMMARY",
      route: "sandbox.draft.download-artifacts",
      tokens_created: [{ token: "cfdi:SHOULDNOTLEAK123456" }],
      tokens_used: [],
      visible_actions: [{ text: "Descargar XML/PDF sandbox", action: "DOWNLOAD_SANDBOX_ARTIFACTS" }],
      dispatch: { methods: [{ node: "Telegram editMessageText" }] },
      document_delivery_ledger: [{ channel: "PROVIDER_EMAIL", delivery_status: "SENT", recipient: "blocked@example.test" }],
    }],
    failures: [{ code: "PROVIDER_EMAIL_OUTSIDE_ALLOWLIST", severity: "FAIL", message: "blocked@example.test" }],
    dbSnapshots: [],
    tokenSnapshots: [],
    n8nExecutions: [],
    latestState: {
      "DRAFT-WATCH-SUMMARY": {
        draft: { invoice_status: "SANDBOX_TIMBRADO", artifact_status: "DOWNLOADED" },
        runtime_artifacts: { xml_exists: true, pdf_exists: true },
      },
    },
    draftIds: new Set(["DRAFT-WATCH-SUMMARY"]),
    executionIds: new Set(["exec-summary"]),
    human_steps: [],
  };
  const written = writeSessionReport(state, reportDir);
  const summary = fs.readFileSync(path.join(reportDir, "summary.md"), "utf8");
  assert.strictEqual(written.summary.includes("123456789:SECRET"), false);
  assert.strictEqual(summary.includes("blocked@example.test"), false);
  assert.strictEqual(summary.includes("SHOULDNOTLEAK123456"), false);
  const relative = path.relative(root, reportDir).replace(/\\/g, "/");
  fs.rmSync(path.join(root, "runtime", "test-telegram-ui-session-watch"), { recursive: true, force: true });
  return relative;
});

check("marks TIMEOUT_WAITING_FOR_HUMAN_CLICK", () => {
  const state = { failures: [], human_steps: [] };
  const item = markHumanTimeout(state, { flow: "download-ready", draft_id: "DRAFT-WATCH-TIMEOUT" });
  assert.strictEqual(item.code, "TIMEOUT_WAITING_FOR_HUMAN_CLICK");
  assert.strictEqual(item.severity, "WARN");
  assert.strictEqual(state.human_steps[0].type, "timeout");
  return item.code;
});

(async () => {
  const results = await Promise.all(checks);
  console.log("Telegram UI session watch tests:");
  for (const item of results) {
    console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
  }
  const failures = results.filter((item) => !item.pass);
  if (failures.length) process.exitCode = 1;
})();

#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { createN8nApiClient } = require("./n8n-api-client");
const { createPostgresQaClient, sqlQuote } = require("./postgres-qa-client");
const {
  analyzeExecution,
  dispatchNodesExecuted,
  getNodeJsonItems,
  latestNodeJson,
  nodeExecuted,
} = require("./qa-assertions");
const { writeQaReport } = require("./report-builder");
const { sanitizeReport } = require("./sanitize-report");
const { buildCallbackData, parseCallbackData } = require("../lib/telegram-action-token-utils");
const { runPsqlJson } = require("../lib/local-db-psql-runner");
const { simulateTelegramMessage, uniqueUpdateId } = require("./telegram-webhook-simulator");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_RENDER_TIMEOUT_MS = 45000;
const DEFAULT_POLL_MS = 2000;
const EXPECTED_WORKFLOW_NAME = "cfdi_telegram_local_ingest";
const DISPATCH_NODE_NAMES = ["Telegram editMessageText", "Telegram sendMessage", "Telegram fallback sendMessage"];

const CASES = Object.freeze({
  "download-ready": {
    caseName: "download-ready",
    renderMode: "draft-detail",
    expectedInvoiceStatus: "SANDBOX_TIMBRADO",
    expectedArtifactStatus: "DOWNLOAD_READY",
    expectedVisibleActions: ["DOWNLOAD_SANDBOX_ARTIFACTS"],
    forbiddenVisibleActions: ["STAMP_DRAFT_SANDBOX"],
    clickAction: "DOWNLOAD_SANDBOX_ARTIFACTS",
    buttonText: "Descargar XML/PDF sandbox",
    expectedRoute: "sandbox.draft.download-artifacts",
    postValidation: "download",
  },
  "downloaded-delivery": {
    caseName: "downloaded-delivery",
    renderMode: "draft-detail",
    expectedInvoiceStatus: "SANDBOX_TIMBRADO",
    expectedArtifactStatus: "DOWNLOADED",
    expectedDocumentsValid: true,
    expectedVisibleActions: [
      "DELIVERY_STATUS",
      "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
      "DELIVERY_PREPARE_PROVIDER_EMAIL",
    ],
    forbiddenVisibleActions: [],
    clickAction: "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
    buttonText: "Enviar a canal documentos",
    expectedRoute: "sandbox.documents.delivery.prepare",
    expectedConfirmAction: "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
    postValidation: "delivery-prepare",
  },
  "expired-token-recovery": {
    caseName: "expired-token-recovery",
    renderMode: "stale-token",
    expectedInvoiceStatus: "SANDBOX_TIMBRADO",
    expectedVisibleActions: ["DOWNLOAD_SANDBOX_ARTIFACTS"],
    forbiddenVisibleActions: [],
    clickAction: "DOWNLOAD_SANDBOX_ARTIFACTS",
    buttonText: "QA token expirado: refrescar draft",
    expectedRoute: "CALLBACK_TOKEN_CONTEXT_RECOVERED",
    postValidation: "expired-token-recovery",
    staleTokenKind: "expired",
  },
});

function parseBool(value) {
  return value === true || value === "1" || value === 1 || String(value || "").toLowerCase() === "true";
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseArgs(argv) {
  const args = {
    case: "",
    draftId: "",
    timeoutMs: undefined,
    renderTimeoutMs: DEFAULT_RENDER_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    checkOnly: false,
    dryRun: false,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    staleTokenKind: "",
    unsafeContext: false,
    dbExecMode: "",
    allowRemoteN8n: false,
    reportRoot: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }
    if (arg === "--check" || arg === "--check-only" || arg === "--dry-run" || arg === "--no-click") {
      args.checkOnly = true;
      if (arg === "--dry-run") args.dryRun = true;
      continue;
    }
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = ["checkOnly", "dryRun", "unsafeContext", "allowRemoteN8n"].includes(key)
        ? parseBool(next)
        : next;
      index += 1;
    }
  }
  args.timeoutMs = parseNumber(
    args.timeoutMs || process.env.SATBOT_TELEGRAM_UI_ACCEPTANCE_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
  );
  args.renderTimeoutMs = parseNumber(args.renderTimeoutMs, DEFAULT_RENDER_TIMEOUT_MS);
  args.pollMs = parseNumber(args.pollMs, DEFAULT_POLL_MS);
  args.case = String(args.case || args.scenario || "").trim();
  args.draftId = String(args.draftId || "").trim();
  args.channel = normalizeChannel(args.channel);
  return args;
}

function printHelp() {
  console.log([
    "SATBOT Telegram UI Button Acceptance",
    "",
    "Usage:",
    "  node scripts/qa/telegram-ui-button-acceptance.js --case download-ready --draft-id <DRAFT_ID>",
    "  node scripts/qa/telegram-ui-button-acceptance.js --case downloaded-delivery --draft-id <DRAFT_ID>",
    "  node scripts/qa/telegram-ui-button-acceptance.js --case expired-token-recovery --draft-id <DRAFT_ID>",
    "  node scripts/qa/telegram-ui-button-acceptance.js --case download-ready --draft-id <DRAFT_ID> --check-only",
    "",
    "Options:",
    "  --channel TELEGRAM_DOCUMENT_CHANNEL|PROVIDER_EMAIL  Target prepare button for downloaded-delivery.",
    "  --stale-token-kind expired|used                     Token shape for expired-token-recovery.",
    "  --unsafe-context                                   Expect CALLBACK_TOKEN_INVALID instead of recovery.",
    "  --timeout-ms 120000                                Human click timeout.",
    "  --check-only                                       Render/inspect UI and exit before human click.",
    "",
    "Safety:",
    "  Real human-click mode requires SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED=1.",
    "  The script does not edit env files, reset DB, call PAC production, SMTP, push or commit.",
  ].join("\n"));
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    if (!match) continue;
    const key = match[1].trim();
    const value = match[2].trim().replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadLocalEnv() {
  loadEnvFile(path.join(ROOT, ".env.local"));
  loadEnvFile(path.join(ROOT, ".env.pac.sandbox.local"));
}

function normalizeChannel(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/-/g, "_");
  if (raw === "PROVIDER_EMAIL" || raw === "EMAIL") return "PROVIDER_EMAIL";
  return "TELEGRAM_DOCUMENT_CHANNEL";
}

function applyChannelToCase(config, channel) {
  if (config.caseName !== "downloaded-delivery") return config;
  const normalizedChannel = normalizeChannel(channel);
  if (normalizedChannel === "PROVIDER_EMAIL") {
    return {
      ...config,
      clickAction: "DELIVERY_PREPARE_PROVIDER_EMAIL",
      buttonText: "Enviar por correo",
      expectedConfirmAction: "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    };
  }
  return config;
}

function maskToken(token) {
  const value = String(token || "").trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}...${value.slice(-2)}`;
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskChatId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length <= 6) return `${text.slice(0, 1)}...${text.slice(-1)}`;
  return `${text.slice(0, 3)}...${text.slice(-3)}`;
}

function safeTokenRecord(row) {
  if (!row) return null;
  return {
    token: maskToken(row.token),
    action: row.action || null,
    draft_id: row.draft_id || row.payload?.draft_id || null,
    used: Boolean(row.used_at),
    used_at_present: Boolean(row.used_at),
    expires_at: row.expires_at || null,
    created_at: row.created_at || null,
    channel: row.payload?.channel || null,
  };
}

function draftState(draft) {
  const summary = draft?.sandbox_pac_summary || {};
  return {
    draft_id: draft?.draft_id || summary.draft_id || null,
    status: draft?.status || null,
    invoice_status: draft?.invoice_status || summary.invoice_status || null,
    payment_status: draft?.payment_status || summary.payment_status || null,
    artifact_status: summary.artifact_status || draft?.artifact_status || null,
    documents_valid: summary.documents_valid === true || (summary.xml_content_valid === true && summary.pdf_content_valid === true),
    xml_content_valid: summary.xml_content_valid === true,
    pdf_content_valid: summary.pdf_content_valid === true,
    xml_downloaded: summary.xml_downloaded === true,
    pdf_downloaded: summary.pdf_downloaded === true,
  };
}

function sqlJson(value) {
  return `${sqlQuote(JSON.stringify(value === undefined ? null : value))}::jsonb`;
}

function createDbAccess(args = {}) {
  const dbOptions = {
    env: process.env,
    dbExecMode: args.dbExecMode || process.env.CFDI_DB_EXEC_MODE || "docker",
  };
  const qa = createPostgresQaClient(dbOptions);
  function queryJson(sql) {
    return runPsqlJson(sql, dbOptions);
  }
  return {
    ...qa,
    queryJson,
    findDraftByState({ chatId, invoiceStatus, artifactStatus }) {
      return queryJson([
        "SELECT to_jsonb(d) FROM cfdi_drafts d",
        `WHERE d.chat_id = ${sqlQuote(chatId)}`,
        invoiceStatus ? `AND d.invoice_status = ${sqlQuote(invoiceStatus)}` : "",
        artifactStatus ? `AND COALESCE(d.sandbox_pac_summary->>'artifact_status', '') = ${sqlQuote(artifactStatus)}` : "",
        "ORDER BY d.updated_at DESC LIMIT 1;",
      ].filter(Boolean).join(" "));
    },
    getDeliveryLedgerRowsFull(draftId, limit = 60) {
      return queryJson([
        "SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY created_at DESC), '[]'::jsonb)",
        "FROM (",
        "SELECT * FROM document_delivery_ledger",
        `WHERE draft_id = ${sqlQuote(draftId)}`,
        `ORDER BY created_at DESC LIMIT ${Math.max(1, Number(limit) || 60)}`,
        ") d;",
      ].join(" ")) || [];
    },
    insertActionToken({ token, chatId, draftId, action, expiresAt, usedAt, payload }) {
      return queryJson([
        "INSERT INTO cfdi_action_tokens (token, chat_id, draft_id, action, expires_at, used_at, payload, created_at)",
        "VALUES (",
        [
          sqlQuote(token),
          sqlQuote(chatId),
          sqlQuote(draftId || null),
          sqlQuote(action),
          sqlQuote(expiresAt),
          usedAt ? sqlQuote(usedAt) : "NULL",
          sqlJson(payload || {}),
          "now()",
        ].join(", "),
        ")",
        "ON CONFLICT (token) DO UPDATE SET",
        "chat_id = EXCLUDED.chat_id,",
        "draft_id = EXCLUDED.draft_id,",
        "action = EXCLUDED.action,",
        "expires_at = EXCLUDED.expires_at,",
        "used_at = EXCLUDED.used_at,",
        "payload = EXCLUDED.payload,",
        "created_at = EXCLUDED.created_at",
        "RETURNING to_jsonb(cfdi_action_tokens);",
      ].join(" "));
    },
  };
}

function getChatConfig(args = {}, db) {
  const argChatId = String(args.chatId || "").trim();
  if (argChatId) return { chatId: argChatId, source: "--chat-id" };
  const uiChatId = String(process.env.SATBOT_TELEGRAM_UI_TEST_CHAT_ID || "").trim();
  if (uiChatId) return { chatId: uiChatId, source: "SATBOT_TELEGRAM_UI_TEST_CHAT_ID" };
  const defaultChatId = String(process.env.QA_DEFAULT_CHAT_ID || "").trim();
  if (defaultChatId) return { chatId: defaultChatId, source: "QA_DEFAULT_CHAT_ID" };
  const authorized = db?.getAuthorizedChat ? db.getAuthorizedChat() : null;
  const fromDb = String(authorized?.telegram_chat_id || "").trim();
  if (fromDb) return { chatId: fromDb, source: "authorized_chat_db" };
  throw new Error("NEEDS_CONFIG: SATBOT_TELEGRAM_UI_TEST_CHAT_ID no configurado y no encontre chat autorizado.");
}

function getChatId(args = {}, db) {
  return getChatConfig(args, db).chatId;
}

function getCaseConfig(args) {
  const base = CASES[String(args.case || "").trim()];
  if (!base) throw new Error("NEEDS_INPUT: --case invalido o faltante.");
  const channelConfig = applyChannelToCase(base, args.channel);
  if (channelConfig.caseName !== "expired-token-recovery") return channelConfig;
  return {
    ...channelConfig,
    staleTokenKind: String(args.staleTokenKind || channelConfig.staleTokenKind || "expired").trim().toLowerCase() === "used" ? "used" : "expired",
    expectedRoute: args.unsafeContext ? "CALLBACK_TOKEN_INVALID" : "CALLBACK_TOKEN_CONTEXT_RECOVERED",
  };
}

async function prepareOrLocateDraft({ config, args, db, chatId }) {
  if (args.draftId) {
    const draft = await Promise.resolve(db.getDraft(args.draftId));
    if (!draft) throw new Error(`NOT_FOUND: draft_id no encontrado: ${args.draftId}`);
    return draft;
  }
  const draft = await Promise.resolve(db.findDraftByState({
    chatId,
    invoiceStatus: config.expectedInvoiceStatus,
    artifactStatus: config.expectedArtifactStatus,
  }));
  if (!draft) {
    throw new Error(`NOT_FOUND: no encontre draft ${config.expectedInvoiceStatus || "ANY"} + ${config.expectedArtifactStatus || "ANY"} para este chat.`);
  }
  return draft;
}

function validateDraftPreState(config, draft) {
  const state = draftState(draft);
  const failures = [];
  if (config.expectedInvoiceStatus && state.invoice_status !== config.expectedInvoiceStatus) {
    failures.push(`invoice_status expected ${config.expectedInvoiceStatus} got ${state.invoice_status || "NULL"}`);
  }
  if (config.expectedArtifactStatus && state.artifact_status !== config.expectedArtifactStatus) {
    failures.push(`artifact_status expected ${config.expectedArtifactStatus} got ${state.artifact_status || "NULL"}`);
  }
  if (config.expectedDocumentsValid === true && state.documents_valid !== true) {
    failures.push("documents_valid expected true");
  }
  return { pass: failures.length === 0, failures, state };
}

function searchJson(value, predicate, seen = new Set()) {
  if (predicate(value)) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => searchJson(item, predicate, seen));
  return Object.values(value).some((child) => searchJson(child, predicate, seen));
}

function collectReplyMarkups(value, out = [], seen = new Set()) {
  if (!value || typeof value !== "object") return out;
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value.inline_keyboard)) out.push(value);
  if (value.reply_markup && typeof value.reply_markup === "object" && Array.isArray(value.reply_markup.inline_keyboard)) {
    out.push(value.reply_markup);
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReplyMarkups(item, out, seen);
  } else {
    for (const child of Object.values(value)) collectReplyMarkups(child, out, seen);
  }
  return out;
}

function flattenButtons(replyMarkup) {
  const rows = Array.isArray(replyMarkup?.inline_keyboard) ? replyMarkup.inline_keyboard : [];
  return rows.flatMap((row) => Array.isArray(row) ? row : []).filter((button) => button && typeof button === "object");
}

function extractVisibleButtons(executionOrMarkup, tokenRows = []) {
  const tokenMap = new Map((tokenRows || []).map((row) => [String(row.token || ""), row]));
  const markups = Array.isArray(executionOrMarkup?.inline_keyboard)
    ? [executionOrMarkup]
    : collectReplyMarkups(executionOrMarkup);
  const seen = new Set();
  const output = [];
  for (const markup of markups) {
    for (const button of flattenButtons(markup)) {
      const text = String(button.text || "").trim();
      const callbackData = String(button.callback_data || "").trim();
      const token = parseCallbackData(callbackData);
      const tokenRecord = token ? tokenMap.get(token) : null;
      const key = `${text}\u0000${callbackData}`;
      if (seen.has(key)) continue;
      seen.add(key);
      output.push({
        text,
        callback_data: callbackData,
        callback_data_present: Boolean(callbackData),
        token,
        token_masked: token ? maskToken(token) : "",
        action: tokenRecord?.action || null,
        draft_id: tokenRecord?.draft_id || tokenRecord?.payload?.draft_id || null,
        token_record: tokenRecord || null,
      });
    }
  }
  return output;
}

function safeVisibleButton(button) {
  return {
    text: button.text,
    action: button.action || null,
    token: button.token_masked || "",
    draft_id: button.draft_id || null,
    callback_data_present: button.callback_data_present === true,
  };
}

function isFreshUsableToken(row, sinceMs, now = Date.now()) {
  if (!row) return false;
  if (row.used_at) return false;
  const expiresAt = new Date(row.expires_at).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  if (!sinceMs) return true;
  const createdAt = new Date(row.created_at).getTime();
  if (!Number.isFinite(createdAt)) return true;
  return createdAt >= sinceMs - 10000;
}

function validateUiRender({ config, draft, tokens, visibleButtons, renderExecution, renderStartedMs }) {
  const state = draftState(draft);
  const visibleActions = visibleButtons.map((button) => button.action).filter(Boolean);
  const failures = [];
  const missingActions = [];
  const dispatch = renderExecution ? telegramDispatchSummary(renderExecution) : null;
  if (config.renderMode !== "stale-token" && dispatch) {
    if (!dispatch.attempted) failures.push("telegram dispatch missing for rendered UI");
    if (dispatch.attempted && dispatch.ok !== true) {
      const failedMethods = dispatch.methods.filter((method) => method.failed).map((method) => method.node).join(", ") || "unknown";
      failures.push(`telegram dispatch failed for rendered UI: ${failedMethods}`);
    }
  }
  for (const action of config.expectedVisibleActions || []) {
    if (!visibleActions.includes(action)) {
      missingActions.push(action);
      failures.push(`missing visible action ${action}`);
    }
  }
  for (const action of config.forbiddenVisibleActions || []) {
    if (visibleActions.includes(action)) failures.push(`forbidden visible action ${action}`);
  }
  const expectedButtonText = config.buttonText;
  const targetButton = visibleButtons.find((button) => button.action === config.clickAction)
    || visibleButtons.find((button) => expectedButtonText && button.text === expectedButtonText);
  if (!targetButton) {
    failures.push(`missing target button ${expectedButtonText || config.clickAction}`);
  } else if (expectedButtonText && targetButton.text !== expectedButtonText) {
    failures.push(`target button text expected ${expectedButtonText} got ${targetButton.text}`);
  }
  for (const action of config.expectedVisibleActions || []) {
    const button = visibleButtons.find((item) => item.action === action);
    if (!button?.token_record) {
      failures.push(`missing DB token for visible action ${action}`);
    } else if (config.renderMode !== "stale-token" && !isFreshUsableToken(button.token_record, renderStartedMs)) {
      failures.push(`token not fresh/usable for action ${action}`);
    }
  }
  if (failures.length) {
    return buildUiRenderFail({
      config,
      draft,
      state,
      tokens,
      visibleButtons,
      renderExecution,
      failures,
      missingActions,
    });
  }
  return {
    pass: true,
    fail_code: null,
    target_button: targetButton,
    visible_actions: visibleButtons.map(safeVisibleButton),
    draft_state: state,
    failures: [],
  };
}

function buildUiRenderFail({ config, draft, state, tokens, visibleButtons, renderExecution, failures, missingActions }) {
  return {
    pass: false,
    fail_code: "UI_RENDER_FAIL",
    scenario: config.caseName,
    draft_id: draft?.draft_id || state?.draft_id || null,
    draft_state: state || draftState(draft),
    tokens_generated: (tokens || []).map(safeTokenRecord),
    visible_actions_found: (visibleButtons || []).map(safeVisibleButton),
    render_execution_id: renderExecution?.id || renderExecution?.executionId || null,
    n8n_execution_associated: renderExecution?.id || renderExecution?.executionId || null,
    missing_actions: missingActions || [],
    failures: ["UI_RENDER_FAIL", ...(failures || [])],
  };
}

function executionContainsText(execution, text) {
  const expected = String(text || "");
  if (!expected) return false;
  return searchJson(execution, (value) => {
    if (typeof value === "string") return value.includes(expected);
    if (typeof value === "number") return String(value) === expected;
    return false;
  });
}

function executionContainsUpdateId(execution, updateId) {
  const expected = String(updateId || "");
  return searchJson(execution, (value) => {
    if (value && typeof value === "object" && String(value.update_id || "") === expected) return true;
    if (typeof value === "number" && String(value) === expected) return true;
    if (typeof value === "string" && value === expected) return true;
    return false;
  });
}

function latestExecutionItem(list) {
  if (Array.isArray(list?.data)) return list.data[0] || null;
  if (Array.isArray(list?.results)) return list.results[0] || null;
  if (Array.isArray(list)) return list[0] || null;
  return null;
}

function executionListItems(list) {
  if (Array.isArray(list?.data)) return list.data;
  if (Array.isArray(list?.results)) return list.results;
  if (Array.isArray(list)) return list;
  return [];
}

async function waitForExecutionMatching({ n8nClient, predicate, timeoutMs, pollMs = DEFAULT_POLL_MS, limit = 10 }) {
  const deadline = Date.now() + timeoutMs;
  const inspected = new Map();
  let latestSeen = null;
  while (Date.now() <= deadline) {
    const list = await n8nClient.listExecutions({ limit });
    const items = executionListItems(list);
    latestSeen = items[0] || latestSeen;
    for (const item of items) {
      const executionId = item?.id || item?.executionId;
      if (!executionId) continue;
      const key = String(executionId);
      const prior = inspected.get(key);
      if (prior && prior.finished === true) continue;
      const execution = await n8nClient.getExecution({ executionId, includeData: true });
      inspected.set(key, { finished: execution?.finished === true || execution?.status === "success" || execution?.status === "finished" });
      if (predicate(execution)) return execution;
    }
    await sleep(pollMs);
  }
  const error = new Error("TIMEOUT: no se encontro ejecucion n8n asociada.");
  error.latestSeen = latestSeen;
  throw error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExecutionSignals(execution) {
  const handle = latestNodeJson(execution, "Handle Commands And Scoring") || {};
  const summary = latestNodeJson(execution, "Build PAC Sandbox Action Summary") || {};
  const plan = latestNodeJson(execution, "Build Telegram Dispatch Plan") || {};
  const analysis = analyzeExecution(execution);
  const requestedRoute = firstNonEmpty(
    handle.requested_sandbox_action,
    handle.sandbox_action,
    summary.requested_sandbox_action,
    summary.sandbox_action_summary?.action,
    summary.json_debug?.requested_action,
    plan.requested_sandbox_action,
    plan.sandbox_action_summary?.action,
  );
  const route = requestedRoute || firstRouteFromCommand(handle.sandbox_execute_command || summary.sandbox_execute_command);
  const action = firstNonEmpty(
    handle.callback_action,
    handle.action,
    handle.action_token?.action,
    summary.callback_action,
    summary.json_debug?.callback_lifecycle?.action,
    plan.callback_action,
  );
  return {
    execution_id: execution?.id || execution?.executionId || null,
    action,
    route,
    handle_action: handle.action || null,
    requested_sandbox_action: requestedRoute || null,
    router_status: handle.router_status || summary.router_status || null,
    webhook_status: handle.webhook_status || summary.webhook_status || null,
    callback_reason: handle.json_debug?.callback_reason || summary.json_debug?.callback_reason || null,
    action_executed: handle.json_debug?.action_executed === true || summary.json_debug?.callback_lifecycle?.action_executed === true || analysis.action_executed === true,
    should_execute_sandbox_action: handle.should_execute_sandbox_action === true,
    telegram_dispatch: telegramDispatchSummary(execution),
    analysis,
    handle,
    summary,
    plan,
  };
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function firstRouteFromCommand(command) {
  const match = String(command || "").match(/\bsandbox\.[A-Za-z0-9_.-]+\b/);
  return match ? match[0] : "";
}

function telegramDispatchSummary(execution) {
  const executed = dispatchNodesExecuted(execution);
  const methods = [];
  for (const nodeName of DISPATCH_NODE_NAMES) {
    if (!nodeExecuted(execution, nodeName)) continue;
    const items = getNodeJsonItems(execution, nodeName);
    const ok = items.some((item) => item?.ok === true || item?.body?.ok === true || item?.result || item?.message_id);
    const failed = items.some((item) => item?.ok === false || item?.error || item?.body?.ok === false);
    methods.push({ node: nodeName, ok: ok || !failed, failed });
  }
  return {
    attempted: executed.length > 0,
    methods,
    ok: methods.some((item) => item.ok === true),
    executed_nodes: executed,
  };
}

function relativeIfInsideRoot(filePath) {
  const absolute = path.isAbsolute(filePath) ? path.normalize(filePath) : path.normalize(path.join(ROOT, filePath));
  const relative = path.relative(ROOT, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return relative.replace(/\\/g, "/");
}

function extractArtifactPaths(draft, ledgerRows = []) {
  const summary = draft?.sandbox_pac_summary || {};
  const manifestPath = relativeIfInsideRoot(summary.client_storage_manifest_path || summary.manifest_path || "");
  const manifest = readManifestPaths(manifestPath);
  const candidates = {
    xml: [
      summary.human_xml_path,
      summary.client_storage_xml_path,
      summary.xml_storage_path,
      manifest.human_xml_path,
      manifest.client_storage_xml_path,
      manifest.xml_storage_path,
      ...ledgerRows.map((row) => row.human_xml_path),
    ],
    pdf: [
      summary.human_pdf_path,
      summary.client_storage_pdf_path,
      summary.pdf_storage_path,
      manifest.human_pdf_path,
      manifest.client_storage_pdf_path,
      manifest.pdf_storage_path,
      ...ledgerRows.map((row) => row.human_pdf_path),
    ],
  };
  const pick = (values) => values.map((item) => String(item || "").trim()).find((item) => item && !/^\[[a-z_-]*hidden\]$/i.test(item)) || "";
  const xml = pick(candidates.xml);
  const pdf = pick(candidates.pdf);
  return {
    xml: xml ? relativeIfInsideRoot(xml) : null,
    pdf: pdf ? relativeIfInsideRoot(pdf) : null,
    manifest: manifestPath || null,
  };
}

function readManifestPaths(relativeManifestPath) {
  if (!relativeManifestPath) return {};
  const absolute = path.join(ROOT, relativeManifestPath);
  if (!fs.existsSync(absolute)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(absolute, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function fileExistsRelative(relativePath) {
  if (!relativePath) return false;
  const absolute = path.join(ROOT, relativePath);
  return fs.existsSync(absolute);
}

function findTokenByAction(tokens, action, { afterMs = 0, channel = "" } = {}) {
  const normalizedAction = String(action || "").toUpperCase();
  const normalizedChannel = String(channel || "").toUpperCase();
  return (tokens || []).find((row) => {
    if (String(row?.action || "").toUpperCase() !== normalizedAction) return false;
    if (row?.used_at) return false;
    if (normalizedChannel && String(row?.payload?.channel || "").toUpperCase() !== normalizedChannel) return false;
    return isFreshUsableToken(row, afterMs);
  }) || null;
}

function validatePostClick({ config, draftBefore, draftAfter, tokensAfter, ledgerRowsAfter, execution, targetButton, clickStartedMs, staleTokenBefore, staleTokenAfter }) {
  const state = draftState(draftAfter);
  const signals = getExecutionSignals(execution);
  const visibleButtons = extractVisibleButtons(execution, tokensAfter);
  const failures = [];
  const routeMatches = config.expectedRoute
    ? (signals.route === config.expectedRoute || signals.handle_action === config.expectedRoute || signals.action === config.expectedRoute)
    : true;
  if (!routeMatches) {
    failures.push(`route expected ${config.expectedRoute} got ${signals.route || signals.handle_action || signals.action || "NULL"}`);
  }
  if (!signals.telegram_dispatch.ok && !signals.telegram_dispatch.attempted) {
    failures.push("telegram dispatch not attempted after click");
  }
  if (config.postValidation === "download") {
    if (signals.route !== config.expectedRoute) failures.push(`expected action layer route ${config.expectedRoute}`);
    if (state.artifact_status !== "DOWNLOADED") failures.push(`artifact_status expected DOWNLOADED got ${state.artifact_status || "NULL"}`);
    if (state.xml_content_valid !== true) failures.push("xml_content_valid expected true");
    if (state.pdf_content_valid !== true) failures.push("pdf_content_valid expected true");
    const artifactPaths = extractArtifactPaths(draftAfter, ledgerRowsAfter);
    if (!fileExistsRelative(artifactPaths.xml)) failures.push("XML artifact file missing");
    if (!fileExistsRelative(artifactPaths.pdf)) failures.push("PDF artifact file missing");
  }
  if (config.postValidation === "delivery-prepare") {
    const channel = config.expectedConfirmAction === "DELIVERY_CONFIRM_PROVIDER_EMAIL" ? "PROVIDER_EMAIL" : "TELEGRAM_DOCUMENT_CHANNEL";
    const confirmToken = findTokenByAction(tokensAfter, config.expectedConfirmAction, { afterMs: clickStartedMs, channel });
    if (!confirmToken) failures.push(`missing fresh confirm token ${config.expectedConfirmAction}`);
    const confirmVisible = visibleButtons.some((button) => button.token === confirmToken?.token);
    if (confirmToken && !confirmVisible) failures.push("confirm token created but reply_markup does not reference it");
    const ledgerForChannel = ledgerRowsAfter.find((row) => String(row.channel || "").toUpperCase() === channel);
    if (!ledgerForChannel) failures.push(`document_delivery_ledger missing for ${channel}`);
    if (ledgerForChannel && !["READY", "BLOCKED_DUPLICATE"].includes(String(ledgerForChannel.delivery_status || "").toUpperCase())) {
      failures.push(`ledger status expected READY/BLOCKED_DUPLICATE got ${ledgerForChannel.delivery_status}`);
    }
  }
  if (config.postValidation === "expired-token-recovery") {
    const expectedInvalid = config.expectedRoute === "CALLBACK_TOKEN_INVALID";
    if (expectedInvalid) {
      if (signals.handle_action !== "CALLBACK_TOKEN_INVALID" && signals.action !== "CALLBACK_TOKEN_INVALID") {
        failures.push(`expected CALLBACK_TOKEN_INVALID got ${signals.handle_action || signals.action || "NULL"}`);
      }
    } else {
      if (!["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_USED_RECOVERY"].includes(signals.handle_action || signals.action)) {
        failures.push(`expected callback recovery got ${signals.handle_action || signals.action || "NULL"}`);
      }
      const freshRecoveryToken = visibleButtons.some((button) => button.action === config.clickAction && button.token !== targetButton?.token);
      if (!freshRecoveryToken) failures.push(`fresh recovery button missing for ${config.clickAction}`);
    }
    if (signals.should_execute_sandbox_action === true || signals.route === "sandbox.draft.download-artifacts" || nodeExecuted(execution, "Execute PAC Sandbox Action")) {
      failures.push("sensitive action executed for stale token");
    }
    if (!staleTokenBefore?.used_at && staleTokenAfter?.used_at) failures.push("expired token was consumed");
  }
  const artifactPaths = extractArtifactPaths(draftAfter, ledgerRowsAfter);
  const telegramChannelSent = ledgerRowsAfter.some((row) => String(row.channel || "").toUpperCase() === "TELEGRAM_DOCUMENT_CHANNEL" && String(row.delivery_status || "").toUpperCase() === "SENT");
  const providerEmailSent = ledgerRowsAfter.some((row) => String(row.channel || "").toUpperCase() === "PROVIDER_EMAIL" && String(row.delivery_status || "").toUpperCase() === "SENT");
  return {
    pass: failures.length === 0,
    failures,
    execution_id: signals.execution_id,
    route: signals.route || signals.handle_action || signals.action || null,
    action: targetButton?.action || signals.action || null,
    n8n_execution_id: signals.execution_id,
    telegram_dispatch: signals.telegram_dispatch,
    draft_state_before: draftState(draftBefore),
    draft_state_after: state,
    artifact_paths: artifactPaths,
    runtime_artifacts: {
      xml_exists: fileExistsRelative(artifactPaths.xml),
      pdf_exists: fileExistsRelative(artifactPaths.pdf),
    },
    document_delivery_ledger: ledgerRowsAfter.map((row) => ({
      channel: row.channel,
      delivery_status: row.delivery_status,
      delivery_action: row.delivery_action,
      sent_at_present: Boolean(row.sent_at),
      documents_valid: row.documents_valid === true,
      xml_content_valid: row.xml_content_valid === true,
      pdf_content_valid: row.pdf_content_valid === true,
    })),
    telegram_channel_send: telegramChannelSent,
    provider_email_send: providerEmailSent,
    analysis: signals.analysis,
    visible_actions_after_click: visibleButtons.map(safeVisibleButton),
  };
}

async function readTelegramResponse(response) {
  const bodyText = typeof response?.text === "function" ? await response.text() : "";
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    body = { raw: bodyText.slice(0, 200) };
  }
  return {
    status: response?.status || 0,
    ok: response?.ok === true && body?.ok !== false,
    body,
  };
}

async function telegramApiRequest(method, payload, { botToken, fetchImpl }) {
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  return readTelegramResponse(response);
}

function telegramDescription(body) {
  return String(body?.description || body?.error_description || body?.message || "").trim();
}

function telegramStatusSuffix(result) {
  const description = telegramDescription(result?.body);
  const status = result?.status || 0;
  return `HTTP ${status || "unknown"}${description ? `: ${description}` : ""}`;
}

function validationError(code, message, details = {}) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  error.body = sanitizeReport(details);
  return error;
}

function chatSourceLabel(source) {
  if (source === "--chat-id") return "--chat-id";
  if (source === "QA_DEFAULT_CHAT_ID") return "QA_DEFAULT_CHAT_ID";
  if (source === "authorized_chat_db") return "chat autorizado en DB";
  return "SATBOT_TELEGRAM_UI_TEST_CHAT_ID";
}

function validateChatIdShape(chatId, source = "SATBOT_TELEGRAM_UI_TEST_CHAT_ID") {
  const value = String(chatId || "").trim();
  const sourceLabel = chatSourceLabel(source);
  if (!value || /REEMPLAZAR|CAMBIAR/i.test(value)) {
    throw validationError(
      "NEEDS_CONFIG",
      `${sourceLabel} no configurado con un chat real.`,
      { source, chat_id_present: Boolean(value) },
    );
  }
  if (!/^-?\d{5,}$/.test(value) && !/^@[A-Za-z0-9_]{5,32}$/.test(value)) {
    throw validationError(
      "INVALID_SATBOT_TELEGRAM_UI_TEST_CHAT_ID",
      `${sourceLabel} debe ser un chat_id numerico de Telegram o un @username de canal/grupo.`,
      { source, chat_id_masked: maskChatId(value), chat_id_length: value.length },
    );
  }
}

async function validateTelegramUiTestChat({ chatId, source = "SATBOT_TELEGRAM_UI_TEST_CHAT_ID", fetchImpl = globalThis.fetch, env = process.env } = {}) {
  const botToken = String(env.TELEGRAM_BOT_TOKEN || "").trim();
  const sourceLabel = chatSourceLabel(source);
  validateChatIdShape(chatId, source);
  if (!botToken || /REEMPLAZAR|CAMBIAR/i.test(botToken)) {
    throw validationError(
      "NEEDS_CONFIG",
      "TELEGRAM_BOT_TOKEN no configurado con un token real.",
      { source, chat_id_masked: maskChatId(chatId), telegram_bot_token_present: Boolean(botToken) },
    );
  }
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible.");

  const botResult = await telegramApiRequest("getMe", {}, { botToken, fetchImpl });
  if (!botResult.ok) {
    throw validationError(
      "TELEGRAM_BOT_TOKEN_INVALID",
      `TELEGRAM_BOT_TOKEN no corresponde a un bot accesible (${telegramStatusSuffix(botResult)}).`,
      {
        source,
        telegram_method: "getMe",
        http_status: botResult.status,
        telegram_description: telegramDescription(botResult.body),
      },
    );
  }

  const bot = botResult.body?.result || {};
  const chatResult = await telegramApiRequest("getChat", { chat_id: chatId }, { botToken, fetchImpl });
  if (!chatResult.ok) {
    const description = telegramDescription(chatResult.body);
    const lower = description.toLowerCase();
    const reason = lower.includes("blocked")
      ? "bot_blocked"
      : lower.includes("chat not found")
        ? "chat_not_found"
        : chatResult.status === 403
          ? "forbidden"
          : "telegram_rejected_chat";
    const code = reason === "bot_blocked"
      ? "TELEGRAM_UI_TEST_CHAT_BLOCKED"
      : "INVALID_SATBOT_TELEGRAM_UI_TEST_CHAT_ID";
    const botName = bot.username ? `@${bot.username}` : "el bot configurado";
    throw validationError(
      code,
      `${sourceLabel} no es accesible para ${botName} (${telegramStatusSuffix(chatResult)}). Revisa que apunte al mismo chat donde este bot esta iniciado o agregado.`,
      {
        source,
        reason,
        telegram_method: "getChat",
        http_status: chatResult.status,
        telegram_description: description,
        chat_id_masked: maskChatId(chatId),
        bot_username: bot.username || null,
      },
    );
  }

  const chat = chatResult.body?.result || {};
  return sanitizeReport({
    ok: true,
    source,
    chat_id: chatId,
    chat_id_masked: maskChatId(chatId),
    chat_type: chat.type || null,
    bot_username: bot.username || null,
  });
}

async function sendTelegramText({ chatId, text, fetchImpl = globalThis.fetch }) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) throw new Error("NEEDS_CONFIG: TELEGRAM_BOT_TOKEN no configurado.");
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible.");
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_notification: true,
    }),
  });
  const bodyText = await response.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    body = { raw: bodyText.slice(0, 200) };
  }
  if (!response.ok || body?.ok === false) {
    const error = new Error(`TELEGRAM_SEND_ANCHOR_FAILED:${response.status}`);
    error.body = sanitizeReport(body);
    throw error;
  }
  return {
    ok: true,
    message_id: body?.result?.message_id || null,
    body: sanitizeReport(body),
  };
}

async function renderDraftDetail({ draftId, chatId, n8nClient, args, fetchImpl }) {
  const renderStartedMs = Date.now();
  const updateId = uniqueUpdateId(1937100000);
  const anchor = await sendTelegramText({
    chatId,
    text: `SATBOT QA render anchor ${draftId}`,
    fetchImpl,
  });
  const messageId = anchor.message_id || Math.floor(Date.now() % 1000000);
  const webhook = await simulateTelegramMessage({
    env: process.env,
    chatId,
    userId: chatId,
    text: `/detalle ${draftId}`,
    updateId,
    messageId,
  });
  if (!webhook.response.ok) {
    const error = new Error(`WEBHOOK_RENDER_FAILED:${webhook.response.status}`);
    error.webhook = webhook.response;
    throw error;
  }
  const execution = await waitForExecutionMatching({
    n8nClient,
    timeoutMs: args.renderTimeoutMs,
    pollMs: args.pollMs,
    predicate: (candidate) => executionContainsUpdateId(candidate, updateId),
  });
  return {
    renderStartedMs,
    updateId,
    webhook_response: webhook.response,
    execution,
    render_message_id: messageId,
    anchor_message_id: anchor.message_id || null,
  };
}

async function sendTelegramButton({ chatId, text, buttonText, token, fetchImpl = globalThis.fetch }) {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  if (!botToken) throw new Error("NEEDS_CONFIG: TELEGRAM_BOT_TOKEN no configurado.");
  if (typeof fetchImpl !== "function") throw new Error("fetch no disponible.");
  const callbackData = buildCallbackData(token);
  const response = await fetchImpl(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]] },
    }),
  });
  const bodyText = await response.text();
  let body = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch (_error) {
    body = { raw: bodyText.slice(0, 200) };
  }
  if (!response.ok || body?.ok === false) {
    const error = new Error(`TELEGRAM_SEND_MESSAGE_FAILED:${response.status}`);
    error.body = sanitizeReport(body);
    throw error;
  }
  return {
    ok: true,
    message_id: body?.result?.message_id || null,
    reply_markup: body?.result?.reply_markup || { inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]] },
  };
}

async function renderStaleTokenButton({ config, draft, chatId, db, args, fetchImpl }) {
  const token = `qa${crypto.randomBytes(12).toString("base64url")}`.slice(0, 22);
  const now = Date.now();
  const staleKind = String(config.staleTokenKind || "expired").toLowerCase();
  const expiresAt = staleKind === "expired"
    ? new Date(now - 60000).toISOString()
    : new Date(now + 30 * 60000).toISOString();
  const usedAt = staleKind === "used" ? new Date(now - 30000).toISOString() : null;
  const tokenChatId = args.unsafeContext ? `qa-other-${chatId}` : chatId;
  const tokenDraftId = args.unsafeContext ? null : draft.draft_id;
  const tokenRecord = await Promise.resolve(db.insertActionToken({
    token,
    chatId: tokenChatId,
    draftId: tokenDraftId,
    action: config.clickAction,
    expiresAt,
    usedAt,
    payload: {
      state: "DRAFT_DETAIL",
      action: config.clickAction,
      draft_id: tokenDraftId,
      qa_acceptance: true,
      stale_kind: staleKind,
    },
  }));
  const sent = await sendTelegramButton({
    chatId,
    text: `QA stale token para ${draft.draft_id}. No ejecuta accion sensible; debe refrescar contexto.`,
    buttonText: config.buttonText,
    token,
    fetchImpl,
  });
  const visibleButtons = extractVisibleButtons(sent.reply_markup, [tokenRecord]);
  return {
    renderStartedMs: now,
    stale_token: tokenRecord,
    target_token: token,
    render_message_id: sent.message_id,
    execution: null,
    visibleButtons,
    telegram_send_result: {
      ok: true,
      message_id: sent.message_id,
    },
  };
}

async function latestExecutionId(n8nClient) {
  const list = await n8nClient.listExecutions({ limit: 1 });
  const latest = latestExecutionItem(list);
  return latest?.id || latest?.executionId || null;
}

async function waitForHumanClick({ n8nClient, targetToken, timeoutMs, pollMs }) {
  const callbackData = buildCallbackData(targetToken);
  return waitForExecutionMatching({
    n8nClient,
    timeoutMs,
    pollMs,
    limit: 12,
    predicate: (candidate) => executionContainsText(candidate, callbackData) && executionHasCallbackQuery(candidate),
  });
}

function executionHasCallbackQuery(execution) {
  return searchJson(execution, (value) => {
    if (!value || typeof value !== "object") return false;
    if (String(value.source_kind || "").toUpperCase() === "CALLBACK_QUERY") return true;
    if (String(value.SOURCE_KIND || "").toUpperCase() === "CALLBACK_QUERY") return true;
    return Boolean(value.callback_query_id || value.CALLBACK_QUERY_ID || value.callback_query);
  });
}

async function buildPostDbSnapshot({ db, draftId }) {
  const draft = await Promise.resolve(db.getDraft(draftId));
  const tokens = await Promise.resolve(db.getActionTokensByDraft(draftId));
  const ledgerRows = await Promise.resolve(
    db.getDeliveryLedgerRowsFull ? db.getDeliveryLedgerRowsFull(draftId) : db.getDeliveryLedgerRows(draftId, { limit: 60 }),
  );
  return { draft, tokens, ledgerRows: Array.isArray(ledgerRows) ? ledgerRows : [] };
}

function requireManualEnabled(args) {
  if (args.checkOnly || args.dryRun) return;
  if (parseBool(process.env.SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED) !== true) {
    throw new Error("REAL_UI_ACCEPTANCE_BLOCKED: configura SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED=1 o usa --check-only.");
  }
}

async function runAcceptance(args = {}, injected = {}) {
  const config = getCaseConfig(args);
  const db = injected.db || createDbAccess(args);
  const n8nClient = injected.n8nClient || createN8nApiClient({
    env: process.env,
    allowRemote: args.allowRemoteN8n === true,
    fetchImpl: injected.fetchImpl,
  });
  const chatConfig = getChatConfig(args, db);
  const chatId = chatConfig.chatId;
  requireManualEnabled(args);
  const renderUsesTelegram = config.renderMode === "stale-token"
    ? (injected.renderStaleTokenButton || renderStaleTokenButton) === renderStaleTokenButton
    : (injected.renderDraftDetail || renderDraftDetail) === renderDraftDetail;
  const telegramChatValidation = renderUsesTelegram
    ? await validateTelegramUiTestChat({
      chatId,
      source: chatConfig.source,
      fetchImpl: injected.fetchImpl,
      env: process.env,
    })
    : {
      ok: true,
      source: chatConfig.source,
      skipped: true,
      reason: "injected_renderer",
    };
  const draft = await prepareOrLocateDraft({ config, args, db, chatId });
  const preState = validateDraftPreState(config, draft);
  if (!preState.pass) {
    return {
      pass: false,
      scenario: config.caseName,
      fail_code: "DRAFT_STATE_FAIL",
      draft_id: draft?.draft_id || args.draftId || null,
      telegram_chat_validation: telegramChatValidation,
      draft_state: preState.state,
      failures: preState.failures,
      human_click_requested: false,
    };
  }

  let render = null;
  let visibleButtons = [];
  let tokensAfterRender = [];
  if (config.renderMode === "stale-token") {
    const renderStaleTokenButtonFn = injected.renderStaleTokenButton || renderStaleTokenButton;
    render = await renderStaleTokenButtonFn({ config, draft, chatId, db, args, fetchImpl: injected.fetchImpl });
    tokensAfterRender = await Promise.resolve(db.getActionTokensByDraft(draft.draft_id));
    visibleButtons = render.visibleButtons;
  } else {
    const renderDraftDetailFn = injected.renderDraftDetail || renderDraftDetail;
    render = await renderDraftDetailFn({ draftId: draft.draft_id, chatId, n8nClient, args, fetchImpl: injected.fetchImpl });
    tokensAfterRender = await Promise.resolve(db.getActionTokensByDraft(draft.draft_id));
    visibleButtons = extractVisibleButtons(render.execution, tokensAfterRender);
  }

  const ui = validateUiRender({
    config,
    draft,
    tokens: tokensAfterRender,
    visibleButtons,
    renderExecution: render.execution,
    renderStartedMs: render.renderStartedMs,
  });
  if (!ui.pass) {
    return {
      ...ui,
      safe_mode: true,
      real_mode: args.checkOnly !== true,
      human_click_requested: false,
      render_message_id: render.render_message_id || null,
      telegram_chat_validation: telegramChatValidation,
      db_snapshot: {
        draft_id: draft.draft_id,
        summary: `invoice_status=${preState.state.invoice_status || "N/A"} artifact_status=${preState.state.artifact_status || "N/A"}`,
      },
    };
  }

  const targetButton = ui.target_button;
  const renderAnalysis = render.execution ? analyzeExecution(render.execution) : null;
  const baseResult = {
    pass: true,
    scenario: config.caseName,
    safe_mode: true,
    real_mode: args.checkOnly !== true,
    draft_id: draft.draft_id,
    expected_button: targetButton.text,
    expected_action: config.clickAction,
    expected_route: config.expectedRoute,
    visible_actions_found: ui.visible_actions,
    render_execution_id: render.execution?.id || render.execution?.executionId || null,
    render_message_id: render.render_message_id || null,
    telegram_chat_validation: telegramChatValidation,
    execution_id: render.execution?.id || render.execution?.executionId || null,
    n8n_execution_id: render.execution?.id || render.execution?.executionId || null,
    analysis: renderAnalysis || undefined,
    execution: render.execution || undefined,
    human_click_requested: false,
    send_real_allowed: false,
    send_real_executed: false,
    failures: [],
  };
  if (args.checkOnly || args.dryRun) {
    return {
      ...baseResult,
      check_only: true,
      manual_instruction: `Presiona ahora el botón: ${targetButton.text} en el draft ${draft.draft_id}`,
      db_snapshot: {
        draft_id: draft.draft_id,
        pre_state: preState.state,
        tokens_after_render: tokensAfterRender.map(safeTokenRecord),
        summary: `render_ok invoice_status=${preState.state.invoice_status || "N/A"} artifact_status=${preState.state.artifact_status || "N/A"}`,
      },
    };
  }

  const latestBeforeClick = await latestExecutionId(n8nClient);
  const staleTokenBefore = render.stale_token || null;
  console.log(`Presiona ahora el botón: ${targetButton.text} en el draft ${draft.draft_id}`);
  const clickStartedMs = Date.now();
  let clickExecution = null;
  try {
    clickExecution = await waitForHumanClick({
      n8nClient,
      targetToken: targetButton.token,
      timeoutMs: args.timeoutMs,
      pollMs: args.pollMs,
    });
  } catch (error) {
    const post = await buildPostDbSnapshot({ db, draftId: draft.draft_id });
    const stateAfterTimeout = draftState(post.draft);
    return {
      ...baseResult,
      pass: false,
      fail_code: "HUMAN_CLICK_TIMEOUT",
      human_click_requested: true,
      human_click_observed: false,
      latest_execution_before_click: latestBeforeClick,
      failures: [error?.message || "TIMEOUT: no se encontro ejecucion n8n asociada."],
      db_result: stateAfterTimeout,
      db_snapshot: {
        draft_id: draft.draft_id,
        pre_state: preState.state,
        post_state: stateAfterTimeout,
        tokens_after_render: tokensAfterRender.map(safeTokenRecord),
        tokens_after_timeout: post.tokens.map(safeTokenRecord),
        ledger_rows: (post.ledgerRows || []).map((row) => ({
          channel: row.channel,
          delivery_status: row.delivery_status,
          delivery_action: row.delivery_action,
          sent_at_present: Boolean(row.sent_at),
        })),
        summary: `timeout invoice_status=${stateAfterTimeout.invoice_status || "N/A"} artifact_status=${stateAfterTimeout.artifact_status || "N/A"}`,
        ledger_state: (post.ledgerRows || []).map((row) => `${row.channel}:${row.delivery_status}`).join(", ") || "empty",
      },
    };
  }
  const post = await buildPostDbSnapshot({ db, draftId: draft.draft_id });
  const staleTokenAfter = staleTokenBefore?.token ? await Promise.resolve(db.getActionToken(staleTokenBefore.token)) : null;
  const postValidation = validatePostClick({
    config,
    draftBefore: draft,
    draftAfter: post.draft,
    tokensAfter: post.tokens,
    ledgerRowsAfter: post.ledgerRows,
    execution: clickExecution,
    targetButton,
    clickStartedMs,
    staleTokenBefore,
    staleTokenAfter,
  });
  return {
    ...baseResult,
    pass: postValidation.pass,
    human_click_requested: true,
    human_click_observed: true,
    latest_execution_before_click: latestBeforeClick,
    execution_id: postValidation.execution_id,
    n8n_execution_id: postValidation.n8n_execution_id,
    route: postValidation.route,
    action: postValidation.action,
    telegram_dispatch: postValidation.telegram_dispatch,
    telegram_dispatch_status: postValidation.telegram_dispatch.ok,
    artifact_paths: postValidation.artifact_paths,
    runtime_artifacts: postValidation.runtime_artifacts,
    telegram_channel_send: postValidation.telegram_channel_send,
    provider_email_send: postValidation.provider_email_send,
    document_delivery_ledger: postValidation.document_delivery_ledger,
    db_result: postValidation.draft_state_after,
    analysis: postValidation.analysis,
    failures: postValidation.failures,
    db_snapshot: {
      draft_id: draft.draft_id,
      pre_state: postValidation.draft_state_before,
      post_state: postValidation.draft_state_after,
      tokens_after_render: tokensAfterRender.map(safeTokenRecord),
      tokens_after_click: post.tokens.map(safeTokenRecord),
      ledger_rows: postValidation.document_delivery_ledger,
      summary: `invoice_status=${postValidation.draft_state_after.invoice_status || "N/A"} artifact_status=${postValidation.draft_state_after.artifact_status || "N/A"} xml_valid=${postValidation.draft_state_after.xml_content_valid} pdf_valid=${postValidation.draft_state_after.pdf_content_valid}`,
      ledger_state: postValidation.document_delivery_ledger.map((row) => `${row.channel}:${row.delivery_status}`).join(", ") || "empty",
    },
    execution: clickExecution,
  };
}

function reportRootFromEnv(args) {
  return args.reportRoot || process.env.QA_REPORT_ROOT || "runtime/qa-reports";
}

async function main() {
  loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  const result = await runAcceptance(args);
  const written = writeQaReport({
    reportRoot: reportRootFromEnv(args),
    scenario: `telegram-ui-button-${result.scenario || args.case || "acceptance"}`,
    report: result,
    execution: result.execution || null,
    dbSnapshot: result.db_snapshot || null,
  });
  console.log(written.summary);
  console.log(`Report dir: ${written.dir}`);
  if (result.pass !== true) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    const safeError = sanitizeReport({
      message: error?.message || String(error),
      code: error?.code || null,
      status: error?.status || null,
      body: error?.body || null,
    });
    console.error(safeError.message || String(error));
    if (safeError.body) console.error(`body=${JSON.stringify(safeError.body)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  CASES,
  applyChannelToCase,
  buildUiRenderFail,
  draftState,
  executionHasCallbackQuery,
  extractArtifactPaths,
  extractVisibleButtons,
  getCaseConfig,
  getChatConfig,
  getChatId,
  getExecutionSignals,
  parseArgs,
  runAcceptance,
  safeTokenRecord,
  safeVisibleButton,
  validateTelegramUiTestChat,
  validateDraftPreState,
  validatePostClick,
  validateUiRender,
};

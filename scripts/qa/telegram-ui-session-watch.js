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
  listExecutedNodes,
  nodeExecuted,
} = require("./qa-assertions");
const { sanitizeReport } = require("./sanitize-report");
const { runScenario } = require("./satbot-e2e-harness");
const { runPsqlJson } = require("../lib/local-db-psql-runner");
const {
  draftState,
  extractArtifactPaths,
  extractVisibleButtons,
  getExecutionSignals,
  runAcceptance,
} = require("./telegram-ui-button-acceptance");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_TIMEOUT_MS = 120000;
const DEFAULT_POLL_MS = 2500;
const WATCH_LIMIT = 20;
const DEFAULT_LATENCY_OK_MS = 3000;
const DEFAULT_LATENCY_FAIL_MS = 8000;
const DEFAULT_DUPLICATE_WINDOW_MS = 5000;

const REQUIRED_ENV_KEYS = [
  "N8N_API_KEY",
  "N8N_BASE_URL",
  "N8N_WEBHOOK_URL",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID",
  "SATBOT_TELEGRAM_UI_TEST_CHAT_ID",
  "FACTURACOM_API_KEY",
  "FACTURACOM_SECRET_KEY",
];

const SECRET_LENGTH_KEYS = new Set([
  "N8N_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "FACTURACOM_API_KEY",
  "FACTURACOM_SECRET_KEY",
]);

const ROUTE_EXPECTATIONS = Object.freeze({
  DOWNLOAD_SANDBOX_ARTIFACTS: "sandbox.draft.download-artifacts",
  STAMP_DRAFT_SANDBOX: "sandbox.draft.stamp",
  DELIVERY_PREPARE_TELEGRAM_CHANNEL: "sandbox.documents.delivery.prepare",
  DELIVERY_PREPARE_PROVIDER_EMAIL: "sandbox.documents.delivery.prepare",
  DELIVERY_CONFIRM_TELEGRAM_CHANNEL: "sandbox.documents.delivery.send",
  DELIVERY_CONFIRM_PROVIDER_EMAIL: "sandbox.documents.delivery.send",
  DELIVERY_FORCE_TELEGRAM_CHANNEL: "sandbox.documents.delivery.send",
  DELIVERY_FORCE_PROVIDER_EMAIL: "sandbox.documents.delivery.send",
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
    watch: false,
    guided: false,
    last: false,
    report: "",
    label: "session",
    flow: "",
    draftId: "",
    executionId: "",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pollMs: DEFAULT_POLL_MS,
    sinceExecutionId: "",
    sinceNow: false,
    failFast: false,
    json: false,
    markdown: false,
    allowTelegramChannelSend: false,
    allowProviderEmailSend: false,
    maxProviderEmailSend: 1,
    latencyOkMs: DEFAULT_LATENCY_OK_MS,
    latencyFailMs: DEFAULT_LATENCY_FAIL_MS,
    duplicateWindowMs: DEFAULT_DUPLICATE_WINDOW_MS,
    dbExecMode: "",
    allowRemoteN8n: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--watch") args.watch = true;
    else if (arg === "--guided") args.guided = true;
    else if (arg === "--last") args.last = true;
    else if (arg === "--since-now") args.sinceNow = true;
    else if (arg === "--fail-fast") args.failFast = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--markdown") args.markdown = true;
    else if (arg === "--allow-telegram-channel-send") args.allowTelegramChannelSend = true;
    else if (arg === "--allow-provider-email-send") args.allowProviderEmailSend = true;
    else if (arg.startsWith("--")) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        index += 1;
      }
    }
  }
  args.timeoutMs = parseNumber(args.timeoutMs, DEFAULT_TIMEOUT_MS);
  args.pollMs = parseNumber(args.pollMs, DEFAULT_POLL_MS);
  args.maxProviderEmailSend = parseNumber(args.maxProviderEmailSend || process.env.SATBOT_PROVIDER_EMAIL_MAX_PER_RUN, 1);
  args.latencyOkMs = parseNumber(args.latencyOkMs, DEFAULT_LATENCY_OK_MS);
  args.latencyFailMs = parseNumber(args.latencyFailMs, DEFAULT_LATENCY_FAIL_MS);
  args.duplicateWindowMs = parseNumber(args.duplicateWindowMs, DEFAULT_DUPLICATE_WINDOW_MS);
  args.label = String(args.label || "session").trim() || "session";
  args.flow = String(args.flow || "").trim();
  args.draftId = String(args.draftId || "").trim();
  args.executionId = String(args.executionId || "").trim();
  args.sinceExecutionId = String(args.sinceExecutionId || "").trim();
  return args;
}

function printHelp() {
  console.log([
    "SATBOT Telegram UI Session Watch",
    "",
    "Usage:",
    "  node scripts/qa/telegram-ui-session-watch.js --watch --label <label>",
    "  node scripts/qa/telegram-ui-session-watch.js --guided --flow full-sandbox --label <label>",
    "  node scripts/qa/telegram-ui-session-watch.js --watch --draft-id <DRAFT_ID> --label <label>",
    "  node scripts/qa/telegram-ui-session-watch.js --last --execution-id <ID>",
    "  node scripts/qa/telegram-ui-session-watch.js --report <REPORT_DIR>",
    "",
    "Options:",
    "  --timeout-ms <ms>",
    "  --poll-ms <ms>",
    "  --since-execution-id <id>",
    "  --since-now",
    "  --fail-fast",
    "  --json",
    "  --markdown",
    "  --allow-telegram-channel-send",
    "  --allow-provider-email-send",
    "  --max-provider-email-send 1",
    "  --latency-ok-ms 3000",
    "  --latency-fail-ms 8000",
    "  --duplicate-window-ms 5000",
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

function envAudit(env = process.env) {
  const keys = [
    "N8N_API_KEY",
    "N8N_BASE_URL",
    "N8N_WEBHOOK_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID",
    "SATBOT_TELEGRAM_UI_TEST_CHAT_ID",
    "SATBOT_TELEGRAM_UI_ACCEPTANCE_ENABLED",
    "SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED",
    "SATBOT_PROVIDER_EMAIL_ALLOWLIST",
    "SATBOT_PROVIDER_EMAIL_MAX_PER_RUN",
    "FACTURACOM_API_KEY",
    "FACTURACOM_SECRET_KEY",
    "RUNNER_SECRET",
    "CFDI_RUNNER_SECRET",
    "N8N_RUNNER_SECRET",
    "N8N_BLOCK_ENV_ACCESS_IN_NODE",
  ];
  return keys.map((key) => {
    const value = String(env[key] || "");
    return {
      key,
      status: value ? "PRESENT" : "MISSING",
      length: SECRET_LENGTH_KEYS.has(key) && value ? value.length : undefined,
    };
  });
}

function envFailures(audit) {
  const failures = [];
  const present = new Map((audit || []).map((item) => [item.key, item.status === "PRESENT"]));
  for (const key of REQUIRED_ENV_KEYS) {
    if (!present.get(key)) failures.push(failure("ENV_REQUIRED_MISSING", `${key} missing`, { key }));
  }
  if (!present.get("RUNNER_SECRET") && !present.get("CFDI_RUNNER_SECRET") && !present.get("N8N_RUNNER_SECRET")) {
    failures.push(failure("RUNNER_SECRET_MISSING", "runner secret missing"));
  }
  return failures;
}

function hashText(value) {
  const text = String(value || "");
  if (!text) return "";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 10);
}

function redactId(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return `redacted:${text.length}:${hashText(text)}`;
}

function redactEmail(value) {
  const text = String(value || "").trim();
  if (!text || !text.includes("@")) return text ? "[email-redacted]" : "";
  const [local, domain] = text.split("@");
  const safeLocal = local ? `${local.slice(0, 1)}***` : "***";
  return `${safeLocal}@${domain}`;
}

function maskToken(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > 8 ? `${text.slice(0, 4)}...${text.slice(-4)}` : `${text.slice(0, 2)}...`;
}

function slug(value) {
  return String(value || "session").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "session";
}

function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
}

function reportDirFor(label, now = new Date()) {
  return path.join("runtime", "qa-reports", `${timestampSlug(now)}-telegram-ui-session-${slug(label)}`);
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function firstValidTimeMs(...values) {
  for (const value of values) {
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseObjectValue(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  if (typeof value !== "string") return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function firstObjectValue(...values) {
  for (const value of values) {
    const parsed = parseObjectValue(value);
    if (Object.keys(parsed).length) return parsed;
  }
  return {};
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function failure(code, message, details = {}, severity = "FAIL") {
  return {
    code,
    severity,
    message,
    details,
    created_at: new Date().toISOString(),
  };
}

function warning(code, message, details = {}) {
  return failure(code, message, details, "WARN");
}

function latencyThresholds(args = {}) {
  return {
    okMs: parseNumber(args.latencyOkMs, DEFAULT_LATENCY_OK_MS),
    failMs: parseNumber(args.latencyFailMs, DEFAULT_LATENCY_FAIL_MS),
  };
}

function durationFromTimes(startMs, endMs) {
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
    ? Math.round(endMs - startMs)
    : null;
}

function latencyMetricsForContext(context = {}, args = {}) {
  const trace = parseObjectValue(context.latency_trace);
  const executionDurationMs = durationFromTimes(context.started_at_ms, context.generated_at_ms);
  const traceStartMs = firstFiniteNumber(trace.update_received_ms, trace.workflow_start_ms, trace.extract_start_ms);
  const traceEndMs = firstFiniteNumber(
    trace.telegram_dispatch_end_ms,
    trace.workflow_end_ms,
    trace.handle_end_ms,
    trace.sandbox_summary_end_ms,
    trace.processing_lock_end_ms,
    trace.build_load_context_end_ms,
  );
  const traceLatencyMs = durationFromTimes(traceStartMs, traceEndMs);
  const explicitLatencyMs = firstFiniteNumber(
    trace.response_latency_ms,
    trace.telegram_response_ms,
    trace.telegram_send_ms,
    trace.send_message_ms,
  );
  const approximateResponseLatencyMs = firstFiniteNumber(explicitLatencyMs, traceLatencyMs, executionDurationMs);
  const measuredMs = firstFiniteNumber(approximateResponseLatencyMs, executionDurationMs);
  const thresholds = latencyThresholds(args);
  let status = "LATENCY_UNKNOWN";
  if (Number.isFinite(measuredMs)) {
    if (measuredMs <= thresholds.okMs) status = "LATENCY_OK";
    else if (measuredMs <= thresholds.failMs) status = "LATENCY_WARN";
    else status = "LATENCY_FAIL";
  }
  return {
    status,
    execution_duration_ms: executionDurationMs,
    approximate_response_latency_ms: Number.isFinite(approximateResponseLatencyMs) ? Math.round(approximateResponseLatencyMs) : null,
    measured_ms: Number.isFinite(measuredMs) ? Math.round(measuredMs) : null,
    measurement_source: Number.isFinite(explicitLatencyMs)
      ? "latency_trace_explicit"
      : Number.isFinite(traceLatencyMs)
        ? "latency_trace_bounds"
        : Number.isFinite(executionDurationMs)
          ? "execution_started_stopped"
          : "UNKNOWN",
    thresholds,
  };
}

function latencyFailures(metrics = {}, context = {}) {
  if (metrics.status === "LATENCY_WARN") {
    return [warning("LATENCY_WARN", "Execution latency above warning threshold", {
      execution_id: context.execution_id,
      measured_ms: metrics.measured_ms,
      threshold_ms: metrics.thresholds?.okMs || DEFAULT_LATENCY_OK_MS,
    })];
  }
  if (metrics.status === "LATENCY_FAIL") {
    return [failure("LATENCY_FAIL", "Execution latency above failure threshold", {
      execution_id: context.execution_id,
      measured_ms: metrics.measured_ms,
      threshold_ms: metrics.thresholds?.failMs || DEFAULT_LATENCY_FAIL_MS,
    })];
  }
  return [];
}

const SENSITIVE_ACTION_PATTERNS = [
  "APROBAR",
  "APPROVE",
  "DESCARTAR",
  "DISCARD",
  "STAMP_DRAFT_SANDBOX",
  "DRAFT_SANDBOX_STAMP",
  "REQUEST_CANCEL_SANDBOX",
  "CONFIRM_CANCEL_SANDBOX",
  "CANCEL_SANDBOX",
  "DOWNLOAD_SANDBOX_ARTIFACTS",
  "DRAFT_SANDBOX_DOWNLOAD",
  "DELIVERY_CONFIRM",
  "DELIVERY_FORCE",
  "DOCUMENT_DELIVERY_SEND",
  "PAGAR",
  "PAY",
  "MARCAR_PAGADA",
  "MARK_PAID",
  "MARCAR_PARCIAL",
  "MARK_PARTIAL",
  "MARCAR_VENCIDA",
  "MARK_OVERDUE",
  "CANCEL_CFDI",
  "CANCELAR_CFDI",
];

function isSensitiveInteraction(context = {}) {
  const text = [context.action, context.requested_action, context.requested_sandbox_action, context.route]
    .map((value) => String(value || "").toUpperCase())
    .join(" ");
  return SENSITIVE_ACTION_PATTERNS.some((pattern) => text.includes(pattern));
}

function extractCallbackToken(context = {}) {
  const candidates = [
    context.handle?.action_token?.token,
    context.handle?.token,
    context.summary?.action_token?.token,
    context.plan?.action_token?.token,
  ];
  for (const value of candidates) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  const rawText = String(context.handle?.text || context.summary?.text || context.plan?.text || "").trim();
  const match = rawText.match(/^cfdi:([A-Za-z0-9_-]{8,80})$/);
  return match ? match[1] : "";
}

function interactionKey(context = {}) {
  const token = extractCallbackToken(context);
  if (token) return { key: `token:${hashText(token)}`, type: "TOKEN", token_masked: maskToken(token) };
  if (context.callback_query_id_present || String(context.source_kind || "").toUpperCase() === "CALLBACK_QUERY") {
    const parts = [
      context.chat_id_raw || "",
      context.callback_message_id || "",
      context.action || "",
      context.draft_id || "",
      context.requested_sandbox_action || "",
    ].map((value) => String(value || ""));
    return { key: `callback:${hashText(parts.join("|"))}`, type: "CALLBACK", token_masked: "" };
  }
  return { key: "", type: "UNKNOWN", token_masked: "" };
}

function duplicateProtectionEffective(context = {}) {
  const action = String(context.action || "").toUpperCase();
  const reason = String(context.callback_reason || "").toLowerCase();
  return action === "CALLBACK_TOKEN_USED_RECOVERY"
    || action === "CALLBACK_TOKEN_CONTEXT_RECOVERED"
    || action === "CALLBACK_TOKEN_INVALID"
    || reason === "token_usado"
    || reason === "token_expirado"
    || reason === "token_invalido";
}

function detectInteractionRisks(context = {}, args = {}, counters = {}) {
  counters.interactions = counters.interactions || [];
  const duplicateWindowMs = parseNumber(args.duplicateWindowMs, DEFAULT_DUPLICATE_WINDOW_MS);
  const startedAtMs = Number.isFinite(context.started_at_ms) ? context.started_at_ms : null;
  const generatedAtMs = Number.isFinite(context.generated_at_ms) ? context.generated_at_ms : null;
  const key = interactionKey(context);
  const sensitive = isSensitiveInteraction(context);
  const failures = [];
  const duplicate = {
    status: "UNKNOWN",
    duplicate_detected: false,
    key_type: key.type,
    token: key.token_masked || "",
    window_ms: duplicateWindowMs,
    previous_execution_id: null,
    protection_effective: false,
    effect: "UNKNOWN",
  };
  const ordering = {
    status: "UNKNOWN",
    out_of_order_detected: false,
    previous_execution_id: null,
    relation: "UNKNOWN",
  };

  if (key.key && Number.isFinite(startedAtMs)) {
    const previous = counters.interactions.find((item) => (
      item.key === key.key
      && Number.isFinite(item.started_at_ms)
      && Math.abs(startedAtMs - item.started_at_ms) <= duplicateWindowMs
    ));
    if (previous) {
      duplicate.status = "DUPLICATE_INTERACTION_WARN";
      duplicate.duplicate_detected = true;
      duplicate.previous_execution_id = previous.execution_id || null;
      duplicate.protection_effective = duplicateProtectionEffective(context);
      duplicate.effect = duplicate.protection_effective
        ? "PROTECTION_EFFECTIVE"
        : sensitive
          ? "SENSITIVE_ACTION_DUPLICATE_RISK"
          : "DUPLICATE_NAVIGATION";
      failures.push(warning("DUPLICATE_INTERACTION_WARN", "Repeated callback or interaction in short window", {
        execution_id: context.execution_id,
        previous_execution_id: previous.execution_id || null,
        key_type: key.type,
        sensitive,
        protection_effective: duplicate.protection_effective,
      }));
      if (sensitive && !duplicate.protection_effective) {
        failures.push(failure("SENSITIVE_ACTION_DUPLICATE_FAIL", "Sensitive action repeated without confirmed duplicate protection", {
          execution_id: context.execution_id,
          previous_execution_id: previous.execution_id || null,
          action: context.action || null,
          route: context.route || null,
        }));
      } else if (sensitive && duplicate.effect === "UNKNOWN") {
        failures.push(warning("UNKNOWN_DUPLICATE_EFFECT", "Duplicate sensitive action effect could not be confirmed", {
          execution_id: context.execution_id,
          previous_execution_id: previous.execution_id || null,
        }));
      }
    } else {
      duplicate.status = "NO_DUPLICATE";
    }
  }

  if (Number.isFinite(startedAtMs) && Number.isFinite(generatedAtMs)) {
    const previousOrder = counters.interactions.find((item) => {
      if (!Number.isFinite(item.started_at_ms) || !Number.isFinite(item.generated_at_ms)) return false;
      if (item.chat_id_raw && context.chat_id_raw && String(item.chat_id_raw) !== String(context.chat_id_raw)) return false;
      if (item.started_at_ms < startedAtMs && item.generated_at_ms > generatedAtMs) return true;
      if (item.started_at_ms > startedAtMs && item.generated_at_ms < generatedAtMs) return true;
      return false;
    });
    if (previousOrder) {
      ordering.status = "OUT_OF_ORDER_RESPONSE_WARN";
      ordering.out_of_order_detected = true;
      ordering.previous_execution_id = previousOrder.execution_id || null;
      ordering.relation = previousOrder.started_at_ms < startedAtMs ? "NEWER_RESPONSE_BEFORE_OLDER" : "OLDER_RESPONSE_AFTER_NEWER";
      failures.push(warning("OUT_OF_ORDER_RESPONSE_WARN", "Execution response order differs from interaction start order", {
        execution_id: context.execution_id,
        previous_execution_id: previousOrder.execution_id || null,
        relation: ordering.relation,
      }));
    } else {
      ordering.status = "ORDER_OK";
    }
  }

  counters.interactions.push({
    key: key.key,
    key_type: key.type,
    execution_id: context.execution_id,
    started_at_ms: startedAtMs,
    generated_at_ms: generatedAtMs,
    chat_id_raw: context.chat_id_raw || "",
    action: context.action || "",
    sensitive,
  });
  if (counters.interactions.length > 200) counters.interactions = counters.interactions.slice(-200);

  return { duplicate, ordering, failures };
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
    getDraftFull(draftId) {
      if (!draftId) return null;
      return queryJson(`SELECT to_jsonb(d) FROM cfdi_drafts d WHERE d.draft_id = ${sqlQuote(draftId)} LIMIT 1;`);
    },
    getTokensForDraft(draftId) {
      if (!draftId) return [];
      return queryJson(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC), '[]'::jsonb) FROM (SELECT token, chat_id, draft_id, action, expires_at, used_at, payload, created_at FROM cfdi_action_tokens WHERE draft_id = ${sqlQuote(draftId)} ORDER BY created_at DESC LIMIT 100) t;`) || [];
    },
    getRecentTokens(chatId) {
      if (!chatId) return [];
      return queryJson(`SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY created_at DESC), '[]'::jsonb) FROM (SELECT token, chat_id, draft_id, action, expires_at, used_at, payload, created_at FROM cfdi_action_tokens WHERE chat_id = ${sqlQuote(chatId)} ORDER BY created_at DESC LIMIT 100) t;`) || [];
    },
    getLedgerFull(draftId) {
      if (!draftId) return [];
      return queryJson(`SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY created_at DESC), '[]'::jsonb) FROM (SELECT * FROM document_delivery_ledger WHERE draft_id = ${sqlQuote(draftId)} ORDER BY created_at DESC LIMIT 100) l;`) || [];
    },
    getSendLogs({ chatId, updateId } = {}) {
      const filters = [];
      if (chatId) filters.push(`chat_id = ${sqlQuote(chatId)}`);
      if (updateId) filters.push(`update_id = ${Number(updateId) || 0}`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      return queryJson(`SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY created_at DESC), '[]'::jsonb) FROM (SELECT send_log_id, chat_id, update_id, ok, error, payload, created_at FROM send_logs ${where} ORDER BY created_at DESC LIMIT 30) s;`) || [];
    },
    findDraftByState({ draftId, chatId, invoiceStatus, artifactStatus }) {
      if (draftId) return this.getDraftFull(draftId);
      const filters = [];
      if (chatId) filters.push(`chat_id = ${sqlQuote(chatId)}`);
      if (invoiceStatus) filters.push(`invoice_status = ${sqlQuote(invoiceStatus)}`);
      if (artifactStatus) filters.push(`COALESCE(sandbox_pac_summary->>'artifact_status', '') = ${sqlQuote(artifactStatus)}`);
      const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
      return queryJson(`SELECT to_jsonb(d) FROM cfdi_drafts d ${where} ORDER BY updated_at DESC LIMIT 1;`);
    },
  };
}

function safeToken(row) {
  return {
    token: maskToken(row?.token),
    action: row?.action || null,
    draft_id: row?.draft_id || row?.payload?.draft_id || null,
    chat_id_present: Boolean(row?.chat_id),
    chat_id_redacted: row?.chat_id ? redactId(row.chat_id) : "",
    used: Boolean(row?.used_at),
    expires_at: row?.expires_at || null,
    created_at: row?.created_at || null,
    channel: row?.payload?.channel || null,
  };
}

function safeLedger(row) {
  return {
    channel: row?.channel || null,
    delivery_status: row?.delivery_status || null,
    delivery_action: row?.delivery_action || null,
    sent_at_present: Boolean(row?.sent_at),
    documents_valid: row?.documents_valid === true,
    xml_content_valid: row?.xml_content_valid === true,
    pdf_content_valid: row?.pdf_content_valid === true,
    recipient_present: row?.recipient_present === true,
    recipient_redacted: row?.recipient_redacted || null,
    created_at: row?.created_at || null,
  };
}

function safeSendLog(row) {
  return {
    send_log_id: row?.send_log_id || null,
    chat_id_present: Boolean(row?.chat_id),
    chat_id_redacted: row?.chat_id ? redactId(row.chat_id) : "",
    update_id: row?.update_id || null,
    ok: row?.ok === true,
    error: row?.error ? String(row.error).slice(0, 300) : null,
    created_at: row?.created_at || null,
  };
}

function safeDraftSnapshot(draft) {
  const state = draftState(draft || {});
  return {
    ...state,
    chat_id_present: Boolean(draft?.chat_id),
    chat_id_redacted: draft?.chat_id ? redactId(draft.chat_id) : "",
    updated_at: draft?.updated_at || null,
  };
}

function buttonSummary(button) {
  return {
    text: button?.text || "",
    action: button?.action || null,
    token: button?.token_masked || maskToken(button?.token),
    draft_id: button?.draft_id || null,
    callback_data_present: button?.callback_data_present === true,
  };
}

function extractDraftIdFromExecution(execution, signals = {}) {
  const handle = signals.handle || latestNodeJson(execution, "Handle Commands And Scoring") || {};
  const summary = signals.summary || latestNodeJson(execution, "Build PAC Sandbox Action Summary") || {};
  const plan = signals.plan || latestNodeJson(execution, "Build Telegram Dispatch Plan") || {};
  const direct = firstNonEmpty(
    handle.draft_id,
    handle.sandbox_draft_id,
    handle.action_token?.draft_id,
    handle.action_token?.payload?.draft_id,
    handle.sandbox_draft_context?.draft_id,
    summary.draft_id,
    summary.sandbox_draft_id,
    summary.sandbox_draft_context?.draft_id,
    summary.sandbox_action_summary?.draft_id,
    summary.sandbox_action_summary?.pac_result?.draft_id,
    summary.json_debug?.draft_id,
    plan.draft_id,
    plan.sandbox_draft_id,
    plan.sandbox_draft_context?.draft_id,
  );
  if (direct) return direct;
  const found = findInJson(execution, (value) => {
    if (typeof value !== "string") return "";
    const match = value.match(/\bDRAFT-[A-Za-z0-9_-]+\b/);
    return match ? match[0] : "";
  });
  return found || "";
}

function findInJson(value, predicate, seen = new Set()) {
  const direct = predicate(value);
  if (direct) return direct;
  if (!value || typeof value !== "object") return "";
  if (seen.has(value)) return "";
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findInJson(item, predicate, seen);
      if (found) return found;
    }
    return "";
  }
  for (const child of Object.values(value)) {
    const found = findInJson(child, predicate, seen);
    if (found) return found;
  }
  return "";
}

function deriveExecutionContext(execution) {
  const signals = getExecutionSignals(execution);
  const handle = signals.handle || latestNodeJson(execution, "Handle Commands And Scoring") || {};
  const summary = signals.summary || latestNodeJson(execution, "Build PAC Sandbox Action Summary") || {};
  const plan = signals.plan || latestNodeJson(execution, "Build Telegram Dispatch Plan") || {};
  const load = latestNodeJson(execution, "Postgres Load Context") || latestNodeJson(execution, "Build Load Context SQL") || {};
  const updateId = firstNonEmpty(handle.update_id, summary.update_id, plan.update_id, load.update_id);
  const chatId = firstNonEmpty(handle.chat_id, summary.chat_id, plan.chat_id, load.chat_id, handle.action_token?.chat_id);
  const sourceKind = firstNonEmpty(handle.source_kind, summary.source_kind, plan.source_kind, load.source_kind);
  const action = firstNonEmpty(signals.action, handle.callback_action, handle.action_token?.action, handle.action);
  const route = firstNonEmpty(signals.route, handle.requested_sandbox_action, summary.requested_sandbox_action, summary.sandbox_action_summary?.action);
  const latencyTrace = firstObjectValue(handle.latency_trace, summary.latency_trace, plan.latency_trace, load.latency_trace);
  return {
    execution_id: execution?.id || execution?.executionId || null,
    workflow_id: execution?.workflowId || execution?.workflow_id || execution?.workflowData?.id || null,
    status: execution?.status || (execution?.finished ? "finished" : "unknown"),
    started_at_ms: firstValidTimeMs(execution?.startedAt, execution?.createdAt),
    generated_at_ms: firstValidTimeMs(execution?.stoppedAt, execution?.finishedAt, execution?.updatedAt, execution?.startedAt),
    source_kind: sourceKind || null,
    callback_query_id_present: Boolean(firstNonEmpty(handle.callback_query_id, plan.callback_query_id, load.callback_query_id)),
    callback_message_id_present: Boolean(firstNonEmpty(handle.callback_message_id, plan.callback_message_id, load.callback_message_id)),
    callback_message_id: firstNonEmpty(handle.callback_message_id, plan.callback_message_id, load.callback_message_id) || null,
    chat_id_present: Boolean(chatId),
    chat_id_redacted: chatId ? redactId(chatId) : "",
    chat_id_raw: chatId,
    update_id: updateId || null,
    message_text: firstNonEmpty(handle.text, summary.text, plan.text, load.text) || null,
    draft_id: extractDraftIdFromExecution(execution, signals),
    action: action || null,
    callback_action: firstNonEmpty(handle.callback_action, handle.json_debug?.callback_action, summary.callback_action, summary.json_debug?.callback_action) || null,
    screen_id: firstNonEmpty(handle.screen_id, handle.json_debug?.screen_id, summary.screen_id, summary.json_debug?.screen_id) || null,
    route: route || null,
    requested_action: firstNonEmpty(handle.requested_action, summary.requested_action, plan.requested_action) || null,
    requested_sandbox_action: firstNonEmpty(handle.requested_sandbox_action, summary.requested_sandbox_action, plan.requested_sandbox_action) || null,
    callback_reason: firstNonEmpty(handle.json_debug?.callback_reason, summary.json_debug?.callback_reason) || null,
    latency_trace: latencyTrace,
    should_execute_sandbox_action: handle.should_execute_sandbox_action === true,
    sandbox_status: summary.sandbox_action_status || summary.sandbox_action_summary?.status || null,
    sandbox_errors: summary.sandbox_action_summary?.errors || summary.errors || [],
    sandbox_warnings: summary.sandbox_action_summary?.warnings || summary.warnings || [],
    nodes_executed: listExecutedNodes(execution),
    dispatch_nodes: dispatchNodesExecuted(execution),
    signals,
    handle,
    summary,
    plan,
  };
}

function telegramNodeResult(execution, nodeName) {
  const items = getNodeJsonItems(execution, nodeName);
  if (!items.length) return null;
  const ok = items.some((item) => item?.ok === true || item?.body?.ok === true || item?.result || item?.message_id);
  const failed = items.some((item) => item?.ok === false || item?.body?.ok === false || item?.error);
  return { node: nodeName, ok: ok || !failed, failed, item_count: items.length };
}

function dispatchSummary(execution, context) {
  const methods = ["Telegram editMessageText", "Telegram sendMessage", "Telegram fallback sendMessage", "Telegram sendDocument"]
    .map((nodeName) => telegramNodeResult(execution, nodeName))
    .filter(Boolean);
  const plan = context.plan || {};
  return {
    attempted: methods.length > 0,
    ok: methods.some((item) => item.ok === true),
    methods,
    dispatch_plan: {
      method: plan.telegram_dispatch_method || null,
      payload_built: plan.telegram_dispatch_payload_built === true,
      blocked_reason: plan.telegram_dispatch_blocked_reason || null,
      should_send_telegram: plan.should_send_telegram === true,
    },
  };
}

function extractGeneratedVisibleButtons(execution, tokenRows, context = {}) {
  const sources = [
    context.plan,
    context.summary,
    ...getNodeJsonItems(execution, "Build Telegram Dispatch Plan"),
    ...getNodeJsonItems(execution, "Build PAC Sandbox Action Summary"),
    ...getNodeJsonItems(execution, "Telegram editMessageText"),
    ...getNodeJsonItems(execution, "Telegram sendMessage"),
    ...getNodeJsonItems(execution, "Telegram fallback sendMessage"),
    ...getNodeJsonItems(execution, "Telegram sendDocument"),
  ].filter(Boolean);
  const seen = new Set();
  const buttons = [];
  for (const source of sources) {
    for (const button of extractVisibleButtons(source, tokenRows)) {
      const key = `${button.text}\u0000${button.callback_data}`;
      if (seen.has(key)) continue;
      seen.add(key);
      buttons.push(button);
    }
  }
  return buttons;
}

function tokenDiff(before = [], after = []) {
  const beforeMap = new Map(before.map((row) => [String(row.token || ""), row]));
  const afterMap = new Map(after.map((row) => [String(row.token || ""), row]));
  const created = [];
  const used = [];
  for (const [token, row] of afterMap) {
    if (!beforeMap.has(token)) created.push(row);
    const prior = beforeMap.get(token);
    if (prior && !prior.used_at && row.used_at) used.push(row);
  }
  return { created, used };
}

function tokenChangesFromExecutionWindow(tokens = [], context = {}) {
  const end = Number.isFinite(context.generated_at_ms) ? context.generated_at_ms : null;
  if (!end) return { created: [], used: [] };
  const start = Number.isFinite(context.started_at_ms) ? context.started_at_ms : end - 120000;
  const slackMs = 5000;
  const inWindow = (value) => {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) && parsed >= start - slackMs && parsed <= end + slackMs;
  };
  return {
    created: tokens.filter((row) => inWindow(row?.created_at)),
    used: tokens.filter((row) => inWindow(row?.used_at)),
  };
}

function dbStateChanged(before, after) {
  if (!before || !after) return false;
  const left = JSON.stringify(safeDraftSnapshot(before));
  const right = JSON.stringify(safeDraftSnapshot(after));
  return left !== right;
}

function timeInExecutionWindow(value, context = {}, slackMs = 5000) {
  const parsed = new Date(value || "").getTime();
  if (!Number.isFinite(parsed)) return false;
  const end = Number.isFinite(context.generated_at_ms) ? context.generated_at_ms : null;
  if (!end) return false;
  const start = Number.isFinite(context.started_at_ms) ? context.started_at_ms : end - 120000;
  return parsed >= start - slackMs && parsed <= end + slackMs;
}

function expectedDeliveryChannel(context = {}) {
  const action = String(context.action || "").toUpperCase();
  if (action.includes("PROVIDER_EMAIL")) return "PROVIDER_EMAIL";
  if (action.includes("TELEGRAM_CHANNEL")) return "TELEGRAM_DOCUMENT_CHANNEL";
  return "";
}

function deliverySendLedgerEvidence(ledgerRows = [], context = {}) {
  const expectedChannel = expectedDeliveryChannel(context);
  const sentRows = (ledgerRows || []).filter((row) => {
    if (String(row?.delivery_status || "").toUpperCase() !== "SENT") return false;
    if (context.draft_id && row?.draft_id && String(row.draft_id) !== String(context.draft_id)) return false;
    if (expectedChannel && String(row?.channel || "").toUpperCase() !== expectedChannel) return false;
    return true;
  });
  const recent = sentRows.find((row) => (
    timeInExecutionWindow(row?.sent_at, context)
    || timeInExecutionWindow(row?.updated_at, context)
    || timeInExecutionWindow(row?.created_at, context)
  ));
  if (recent) {
    return {
      changed: true,
      reason: "sent_ledger_row_in_execution_window",
      channel: recent.channel || expectedChannel || null,
      delivery_id_present: Boolean(recent.delivery_id),
      sent_at_present: Boolean(recent.sent_at),
    };
  }
  if (!Number.isFinite(context.generated_at_ms) && sentRows.length) {
    return {
      changed: true,
      reason: "sent_ledger_row_present_without_execution_window",
      channel: sentRows[0].channel || expectedChannel || null,
      delivery_id_present: Boolean(sentRows[0].delivery_id),
      sent_at_present: Boolean(sentRows[0].sent_at),
    };
  }
  return { changed: false, reason: sentRows.length ? "sent_ledger_row_outside_execution_window" : "sent_ledger_row_absent" };
}

function currentExecutionSentLedgerRows(ledgerRows = [], context = {}, channel) {
  if (String(context.route || "") !== "sandbox.documents.delivery.send") return [];
  const expectedChannel = String(channel || "").toUpperCase();
  return (ledgerRows || []).filter((row) => {
    if (String(row?.delivery_status || "").toUpperCase() !== "SENT") return false;
    if (expectedChannel && String(row?.channel || "").toUpperCase() !== expectedChannel) return false;
    if (context.draft_id && row?.draft_id && String(row.draft_id) !== String(context.draft_id)) return false;
    if (!Number.isFinite(context.generated_at_ms)) return true;
    return timeInExecutionWindow(row?.sent_at, context)
      || timeInExecutionWindow(row?.updated_at, context)
      || timeInExecutionWindow(row?.created_at, context);
  });
}

function dbSnapshotNewerThanExecution(draft, context) {
  const updatedAt = new Date(draft?.updated_at || "").getTime();
  const generatedAt = context?.generated_at_ms;
  return Number.isFinite(updatedAt) && Number.isFinite(generatedAt) && updatedAt > generatedAt + 5000;
}

function isExpiredToken(row, now = Date.now()) {
  const expiresAt = new Date(row?.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= now;
}

function isUsedAtGeneration(row, generatedAtMs) {
  if (!row?.used_at) return false;
  if (!Number.isFinite(generatedAtMs)) return true;
  const usedAt = new Date(row.used_at).getTime();
  return !Number.isFinite(usedAt) || usedAt <= generatedAtMs;
}

function isProviderEmailAllowed(email, env = process.env) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return false;
  const allowlist = String(env.SATBOT_PROVIDER_EMAIL_ALLOWLIST || "")
    .split(/[,\s;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(normalized);
}

function isDeliveryActionSurface(context = {}) {
  const route = String(context.route || "").trim();
  const action = String(context.action || "").toUpperCase();
  return route.startsWith("sandbox.documents.delivery.")
    || action === "DOCUMENT_DELIVERY_ACTION_REQUESTED"
    || action === "DELIVERY_STATUS"
    || action.startsWith("DELIVERY_PREPARE_")
    || action.startsWith("DELIVERY_CONFIRM_")
    || action.startsWith("DELIVERY_FORCE_");
}

function contextActionName(context = {}) {
  return String(
    context.action
    || context.screen_id
    || context.handle?.action
    || context.handle?.screen_id
    || context.summary?.action
    || context.summary?.screen_id
    || context.dispatch_plan?.action
    || context.dispatch_plan?.screen_id
    || context.plan?.action
    || context.plan?.screen_id
    || "",
  ).toUpperCase();
}

function isDownloadedDeliveryExpectedSurface(context = {}) {
  const action = contextActionName(context);
  const route = String(context.route || "").trim();
  if (route.startsWith("sandbox.documents.delivery.")) return false;
  return action === "DOCUMENT_DOWNLOAD_RESULT" || action === "DOCUMENT_DETAIL" || action === "INVOICE_DETAIL";
}

function isDeliveryAlreadySentState(state = {}, context = {}) {
  const values = [
    state.delivery_status,
    state.delivery_kind,
    state.document_delivery_status,
    state.last_delivery_status,
    context.delivery_status,
    context.delivery_kind,
    context.handle?.delivery_status,
    context.handle?.delivery_kind,
    context.summary?.delivery_status,
    context.summary?.delivery_kind,
  ].map((value) => String(value || "").toUpperCase());
  return values.some((value) => ["SENT", "PROTECTED", "YA_ENVIADO", "ALREADY_SENT"].includes(value));
}

function shouldAuditDraftStateButtons(context = {}, buttons = []) {
  const route = String(context.route || "").trim();
  const action = String(context.action || "").toUpperCase();
  const responseText = String(context.handle?.telegram_message || context.summary?.telegram_message || context.dispatch_plan?.telegram_message || context.plan?.telegram_message || "");
  if (/No encontre ese borrador/i.test(responseText)) return false;
  if (route.startsWith("sandbox.")) return true;
  if ([
    "COMMAND_DETALLE",
    "COMMAND_APROBAR",
    "COMMAND_REGRESAR_BORRADOR",
    "DRAFT_CONFIRMED",
    "CALLBACK_TOKEN_CONTEXT_RECOVERED",
    "CALLBACK_TOKEN_USED_RECOVERY",
    "DELIVERY_STATUS",
    "DOCUMENT_DELIVERY_ACTION_REQUESTED",
    "PAC_SANDBOX_ACTION_RESULT",
  ].includes(action)) return true;
  if (action.startsWith("DRAFT_")) return true;
  if (action.startsWith("PRODUCT_") || [
    "COMMAND_PENDIENTES",
    "COMMAND_APROBADAS",
    "CALLBACK_DUPLICATE_BLOCKED",
    "CALLBACK_TOKEN_INVALID",
    "NEEDS_CONFIRM_DRAFT",
  ].includes(action)) return false;
  const draftSpecificActions = new Set([
    "APPROVE_DRAFT",
    "DISCARD_DRAFT",
    "RESTORE_DRAFT",
    "VIEW_DRAFT",
    "VIEW_SUMMARY",
    "STAMP_DRAFT_SANDBOX",
    "DOWNLOAD_SANDBOX_ARTIFACTS",
    "DELIVERY_STATUS",
    "DELIVERY_PREPARE_TELEGRAM_CHANNEL",
    "DELIVERY_PREPARE_PROVIDER_EMAIL",
    "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
    "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    "DELIVERY_FORCE_TELEGRAM_CHANNEL",
    "DELIVERY_FORCE_PROVIDER_EMAIL",
    "REQUEST_CANCEL_SANDBOX",
    "CONFIRM_CANCEL_SANDBOX",
    "MARK_PAYMENT_PENDING",
    "MARK_PAYMENT_PAID",
    "MARK_PAYMENT_PARTIAL",
    "MARK_PAYMENT_OVERDUE",
  ]);
  return (buttons || []).some((button) => draftSpecificActions.has(String(button.action || "").toUpperCase()));
}

function detectStateButtonFailures({ state, buttons, context = {} }) {
  const failures = [];
  const has = (action) => buttons.some((button) => buttonMatchesAction(button, action));
  const invoiceStatus = String(state.invoice_status || "").toUpperCase();
  const artifactStatus = String(state.artifact_status || "").toUpperCase();
  const legacyStatus = String(state.status || "").toUpperCase();

  if (invoiceStatus === "SANDBOX_TIMBRADO" && artifactStatus === "DOWNLOAD_READY") {
    if (!has("DOWNLOAD_SANDBOX_ARTIFACTS")) {
      failures.push(failure("DOWNLOAD_READY_WITHOUT_DOWNLOAD_BUTTON", "Draft DOWNLOAD_READY without DOWNLOAD_SANDBOX_ARTIFACTS", { draft_id: state.draft_id }));
    }
    if (has("STAMP_DRAFT_SANDBOX")) {
      failures.push(failure("DOWNLOAD_READY_SHOWS_STAMP", "Draft DOWNLOAD_READY shows STAMP_DRAFT_SANDBOX", { draft_id: state.draft_id }));
    }
  }
  if (
    invoiceStatus === "SANDBOX_TIMBRADO"
    && artifactStatus === "DOWNLOADED"
    && isDownloadedDeliveryExpectedSurface(context)
    && !isDeliveryAlreadySentState(state, context)
  ) {
    const hasDeliveryPrepare = has("DELIVERY_PREPARE_TELEGRAM_CHANNEL") || has("DELIVERY_PREPARE_PROVIDER_EMAIL") || buttons.some((button) => normalizedButtonText(button).includes("enviar documentos"));
    if (!has("DELIVERY_STATUS")) failures.push(failure("DOWNLOADED_MISSING_DELIVERY_BUTTON", "Draft DOWNLOADED missing DELIVERY_STATUS", { draft_id: state.draft_id, action: "DELIVERY_STATUS" }));
    if (!hasDeliveryPrepare) failures.push(failure("DOWNLOADED_MISSING_DELIVERY_BUTTON", "Draft DOWNLOADED missing delivery prepare action", { draft_id: state.draft_id, action: "DELIVERY_PREPARE" }));
  }
  if (invoiceStatus === "APROBADO" || legacyStatus === "APROBADO") {
    if (artifactStatus !== "DOWNLOAD_READY" && artifactStatus !== "DOWNLOADED" && has("DOWNLOAD_SANDBOX_ARTIFACTS")) {
      failures.push(failure("APPROVED_BEFORE_STAMP_SHOWS_DOWNLOAD", "Draft approved before stamp shows download", { draft_id: state.draft_id }));
    }
  }
  if (legacyStatus !== "APROBADO" && (invoiceStatus === "BORRADOR" || legacyStatus === "PENDIENTE") && has("STAMP_DRAFT_SANDBOX")) {
    failures.push(failure("DRAFT_BEFORE_APPROVAL_SHOWS_STAMP", "Draft before approval shows stamp", { draft_id: state.draft_id }));
  }
  failures.push(...detectDeliveryChannelMismatches({ buttons, context }));
  failures.push(...detectDeliveryPrepareResultErrors({ context }));
  failures.push(...detectResendChannelMismatches({ buttons, context }));
  failures.push(...detectResendPrepareResultErrors({ context }));
  failures.push(...detectDocumentNavUsesEphemeralToken({ buttons, context }));
  failures.push(...detectDocumentStatusMissingExpectedActions({ state, buttons, context }));
  failures.push(...detectSentDocumentHidesResend({ state, buttons, context }));
  failures.push(...detectDownloadedDocumentMissingArtifactAccess({ state, buttons, context }));
  return failures;
}

function contextVisibleText(context = {}) {
  return [
    context.telegram_message,
    context.message,
    context.text,
    context.handle?.telegram_message,
    context.summary?.telegram_message,
    context.dispatch_plan?.telegram_message,
    context.plan?.telegram_message,
  ].map((value) => String(value || "")).filter(Boolean).join("\n");
}

function contextDeliveryIntent(context = {}, buttons = []) {
  const confirmationButtons = buttons.filter((button) => {
    const action = String(button.action || button.token_record?.action || "").toUpperCase();
    return action.includes("DELIVERY_CONFIRM") || action.includes("DELIVERY_FORCE");
  });
  const values = [
    context.action,
    context.callback_action,
    context.requested_action,
    context.screen_id,
    context.handle?.screen_id,
    context.summary?.screen_id,
    context.handle?.json_debug?.callback_action,
    context.handle?.action,
    context.summary?.action,
    context.plan?.action,
    context.channel,
    context.requested_channel,
    context.handle?.channel,
    context.handle?.requested_channel,
    context.summary?.channel,
    ...confirmationButtons.flatMap((button) => [button.action, button.token_record?.action, button.text]),
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  const wantsChannel = values.includes("TELEGRAM_CHANNEL") || values.includes("TELEGRAM_DOCUMENT_CHANNEL") || /\bCANAL\b/.test(values);
  const wantsEmail = values.includes("PROVIDER_EMAIL") || /\bCORREO\b|\bEMAIL\b/.test(values);
  return { wantsChannel, wantsEmail };
}

function isDeliveryPrepareOrConfirmContext(context = {}, buttons = []) {
  const actionText = [
    context.action,
    context.callback_action,
    context.requested_action,
    context.screen_id,
    context.route,
    context.handle?.action,
    context.handle?.callback_action,
    context.handle?.screen_id,
    context.handle?.json_debug?.callback_action,
    context.summary?.action,
    context.summary?.screen_id,
    context.plan?.action,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  return actionText.includes("DELIVERY_PREPARE")
    || actionText.includes("DELIVERY_CONFIRM")
    || actionText.includes("DELIVERY_FORCE")
    || actionText.includes("DOCUMENT_DELIVERY_CONFIRM")
    || String(context.route || "").startsWith("sandbox.documents.delivery.prepare");
}

function detectDeliveryChannelMismatches({ buttons = [], context = {} }) {
  if (!isDeliveryPrepareOrConfirmContext(context, buttons)) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  if (!text) return [];
  const intent = contextDeliveryIntent(context, buttons);
  if (intent.wantsChannel && intent.wantsEmail) return [];
  const mentionsCorreo = /\bcorreo\b|\bemail\b/.test(text);
  const mentionsCanal = /\bcanal\b|\btelegram\b/.test(text);
  const failures = [];
  if (intent.wantsChannel && mentionsCorreo && !mentionsCanal) {
    failures.push(failure("DELIVERY_CHANNEL_MISMATCH", "Delivery channel action rendered email confirmation text", { expected: "TELEGRAM_DOCUMENT_CHANNEL" }));
  }
  if (intent.wantsEmail && mentionsCanal && !mentionsCorreo) {
    failures.push(failure("DELIVERY_CHANNEL_MISMATCH", "Delivery email action rendered channel confirmation text", { expected: "PROVIDER_EMAIL" }));
  }
  return failures;
}

function detectDeliveryPrepareResultErrors({ context = {} }) {
  const route = String(context.route || "").trim();
  const action = contextActionName(context);
  const isPrepare = route.startsWith("sandbox.documents.delivery.prepare") || action.includes("DELIVERY_PREPARE") || action === "DOCUMENT_DELIVERY_CONFIRM";
  if (!isPrepare) return [];
  const rawText = contextVisibleText(context);
  const text = normalizedTextBlock(rawText);
  const technicalReason = /motivo:\s*(ready|token_valid|guard_ok|pending)\b/i.test(rawText);
  if (text.includes("no se pudo enviar") || technicalReason) {
    return [failure("DELIVERY_PREPARE_SHOWS_RESULT_ERROR", "Delivery prepare screen rendered result error or technical state", { action, route: route || null })];
  }
  return [];
}

function isResendPrepareOrConfirmContext(context = {}, buttons = []) {
  const actionText = [
    context.action,
    context.callback_action,
    context.requested_action,
    context.screen_id,
    context.route,
    context.delivery_intent,
    context.handle?.action,
    context.handle?.callback_action,
    context.handle?.screen_id,
    context.handle?.delivery_intent,
    context.handle?.resend,
    context.handle?.action_token?.action,
    context.handle?.action_token?.payload?.delivery_intent,
    context.summary?.action,
    context.summary?.screen_id,
    context.plan?.action,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  const text = normalizedTextBlock(contextVisibleText(context));
  const buttonText = buttons.map((button) => normalizedButtonText(button)).join(" ");
  return actionText.includes("DELIVERY_FORCE")
    || actionText.includes("RESEND")
    || actionText.includes("REENVIO")
    || actionText.includes("REENVIO")
    || text.includes("reenvio")
    || text.includes("reenviar")
    || buttonText.includes("reenvio")
    || buttonText.includes("reenviar");
}

function detectResendPrepareResultErrors({ context = {} }) {
  if (!isResendPrepareOrConfirmContext(context)) return [];
  const rawText = contextVisibleText(context);
  const text = normalizedTextBlock(rawText);
  const technicalReason = /motivo:\s*(ready|token_valid|guard_ok|pending)\b/i.test(rawText);
  if (text.includes("no se pudo enviar") || technicalReason) {
    return [failure("RESEND_PREPARE_SHOWS_SEND_ERROR", "Resend prepare screen rendered send error or technical state", { action: contextActionName(context) })];
  }
  return [];
}

function detectResendChannelMismatches({ buttons = [], context = {} }) {
  if (!isResendPrepareOrConfirmContext(context, buttons)) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  if (!text) return [];
  const intent = contextDeliveryIntent(context, buttons);
  if (intent.wantsChannel && intent.wantsEmail) return [];
  const mentionsCorreo = /\bcorreo\b|\bemail\b/.test(text);
  const mentionsCanal = /\bcanal\b|\btelegram\b/.test(text);
  const failures = [];
  if (intent.wantsChannel && mentionsCorreo && !mentionsCanal) {
    failures.push(failure("RESEND_CHANNEL_MISMATCH", "Resend channel action rendered email confirmation text", { expected: "TELEGRAM_DOCUMENT_CHANNEL" }));
  }
  if (intent.wantsEmail && mentionsCanal && !mentionsCorreo) {
    failures.push(failure("RESEND_CHANNEL_MISMATCH", "Resend email action rendered channel confirmation text", { expected: "PROVIDER_EMAIL" }));
  }
  return failures;
}

function isDocumentNavContext(context = {}) {
  const text = [
    context.action,
    context.screen_id,
    context.callback_action,
    context.handle?.action,
    context.handle?.screen_id,
    context.summary?.action,
    context.summary?.screen_id,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  return text.includes("DOCUMENTS_RECENT_LIST")
    || text.includes("DOCUMENTS_PENDING_LIST")
    || text.includes("DOCUMENTS_DOWNLOADED_LIST")
    || text.includes("DOCUMENTS_SENT_LIST")
    || text.includes("DOCUMENTS_ERROR_LIST")
    || text.includes("DOCUMENT_DETAIL");
}

function isDocumentNavigationButton(button = {}) {
  const text = normalizedButtonText(button);
  const callbackData = String(button.callback_data || "").trim();
  if (callbackData.startsWith("cfdi_doc:") || callbackData === "cfdi_nav:docs") return true;
  return /^ver \d{1,3}$/.test(text)
    || text === "recientes"
    || text === "pendientes/listos"
    || text === "descargados"
    || text === "enviados"
    || text === "errores"
    || text.startsWith("mas documentos")
    || text === "volver a documentos"
    || text === "documentos";
}

function detectDocumentNavUsesEphemeralToken({ buttons = [], context = {} }) {
  if (!isDocumentNavContext(context)) return [];
  const failures = [];
  for (const button of buttons || []) {
    const callbackData = String(button.callback_data || "").trim();
    if (!isDocumentNavigationButton(button)) continue;
    if (/^cfdi:[A-Za-z0-9_-]+$/.test(callbackData)) {
      failures.push(failure("DOCUMENT_NAV_USES_EPHEMERAL_TOKEN", "Document navigation button uses ephemeral action token", {
        text: button.text || "",
        action: button.action || button.token_record?.action || null,
      }));
    }
  }
  return failures;
}

function detectDocumentNavCallbackInvalid(context = {}) {
  const action = String(context.action || "").trim().toUpperCase();
  if (!["CALLBACK_TOKEN_INVALID", "CALLBACK_TOKEN_CONTEXT_RECOVERED"].includes(action)) return [];
  const sourceKind = String(context.source_kind || "").trim().toUpperCase();
  if (sourceKind && sourceKind !== "CALLBACK_QUERY") return [];
  const messageText = String(context.message_text || context.handle?.text || "").trim();
  const tokenAction = String(context.handle?.action_token?.action || context.summary?.action_token?.action || "").trim().toUpperCase();
  const payload = context.handle?.action_token?.payload || context.summary?.action_token?.payload || {};
  const payloadModule = String(payload.source_module || payload.sourceModule || "").trim().toUpperCase();
  const payloadState = [payload.state, payload.screen_id, payload.source_list_kind, payload.return_to]
    .map((value) => String(value || "").trim().toUpperCase())
    .join(" ");
  const docNavTokenAction = [
    "VIEW_DOCUMENT_DETAIL",
    "DOCUMENTS_RECENT_PAGE",
    "DOCUMENTS_PENDING_PAGE",
    "DOCUMENTS_DOWNLOADED_PAGE",
    "DOCUMENTS_SENT_PAGE",
    "DOCUMENTS_ERROR_PAGE",
    "DOCUMENTS_LIST_RETURN",
  ].includes(tokenAction);
  const isDocNav = messageText.startsWith("cfdi_doc:")
    || docNavTokenAction
    || (payloadModule === "DOCUMENTS" && (payloadState.includes("DOCUMENTS_") || payloadState.includes("DOCUMENT_DETAIL")));
  if (!isDocNav) return [];
  return [failure("DOC_NAV_CALLBACK_INVALID", "Document navigation callback fell into token recovery", {
    action,
    callback_data_prefix: messageText.startsWith("cfdi_doc:") ? "cfdi_doc" : messageText.startsWith("cfdi:") ? "cfdi_token" : "",
    token_action: tokenAction || null,
  })];
}

function isDocumentStatusIntentContext(context = {}) {
  const values = [
    context.previous_action,
    context.previous_button_text,
    context.button_text,
    context.callback_action,
    context.requested_action,
    context.message_text,
    context.screen_id,
    context.action,
    context.handle?.callback_action,
    context.handle?.text,
    context.handle?.action_token?.action,
    context.handle?.action_token?.payload?.screen_id,
    context.summary?.callback_action,
    context.summary?.screen_id,
  ].map((value) => String(value || "").toUpperCase()).join(" ");
  return values.includes("VER ESTADO DOCUMENTAL")
    || values.includes("ACTUALIZAR ESTADO")
    || values.includes("CFDI_DOC:STATUS")
    || values.includes("DELIVERY_STATUS")
    || values.includes("DOCUMENT_STATUS_DETAIL");
}

function detectDocumentStatusReturnsToList(context = {}) {
  if (!isDocumentStatusIntentContext(context)) return [];
  const action = contextActionName(context);
  const text = normalizedTextBlock(contextVisibleText(context));
  const returnedToList = [
    "DOCUMENTS_RECENT_LIST",
    "DOCUMENTS_DOWNLOADED_LIST",
    "DOCUMENTS_ERROR_LIST",
    "DOCUMENTS_PENDING_LIST",
    "DOCUMENTS_SENT_LIST",
    "DOCUMENT_LIST_ITEM_CHANGED",
  ].includes(action);
  const hasStatusSurface = action === "DOCUMENT_STATUS_DETAIL" || action === "DOCUMENT_DETAIL" || text.includes("estado documental");
  if (returnedToList && !hasStatusSurface) {
    return [failure("DOCUMENT_STATUS_RETURNS_TO_LIST", "Document status action returned to a document list instead of current document", { action })];
  }
  return [];
}

function detectDocumentStatusLostCurrentItem(context = {}) {
  if (!isDocumentStatusIntentContext(context)) return [];
  const expected = String(
    context.expected_draft_id
    || context.previous_draft_id
    || context.status_source_draft_id
    || context.handle?.expected_draft_id
    || context.handle?.previous_draft_id
    || context.handle?.action_token?.payload?.draft_id
    || "",
  ).trim();
  const actual = String(context.draft_id || context.handle?.draft_id || context.summary?.draft_id || "").trim();
  if (expected && actual && expected !== actual) {
    return [failure("DOCUMENT_STATUS_LOST_CURRENT_ITEM", "Document status action changed current draft", { expected_draft_id: expected, actual_draft_id: actual })];
  }
  return [];
}

function isDocumentStatusScreen(context = {}) {
  const action = contextActionName(context);
  return action === "DOCUMENT_STATUS_DETAIL" || String(context.screen_id || context.handle?.screen_id || context.summary?.screen_id || "").toUpperCase() === "DOCUMENT_STATUS_DETAIL";
}

function isDocumentOperationalDetailSurface(context = {}) {
  const action = contextActionName(context);
  const screenId = String(context.screen_id || context.handle?.screen_id || context.summary?.screen_id || "").toUpperCase();
  return ["DOCUMENT_DETAIL", "DOCUMENT_STATUS_DETAIL", "INVOICE_DETAIL"].includes(action)
    || ["DOCUMENT_DETAIL", "DOCUMENT_STATUS_DETAIL", "INVOICE_DETAIL"].includes(screenId);
}

function buttonIsInitialDelivery(button = {}) {
  const text = normalizedButtonText(button);
  const action = String(button.action || button.token_record?.action || "").toUpperCase();
  return action.includes("DELIVERY_PREPARE") || /^enviar\b/.test(text);
}

function buttonIsResendEmail(button = {}) {
  const text = normalizedButtonText(button);
  const action = String(button.action || button.token_record?.action || "").toUpperCase();
  return action === "DELIVERY_FORCE_PROVIDER_EMAIL" || (text.includes("reenviar") && (text.includes("correo") || text.includes("email")));
}

function buttonIsResendChannel(button = {}) {
  const text = normalizedButtonText(button);
  const action = String(button.action || button.token_record?.action || "").toUpperCase();
  return action === "DELIVERY_FORCE_TELEGRAM_CHANNEL" || (text.includes("reenviar") && (text.includes("canal") || text.includes("telegram")));
}

function buttonHasArtifactAccess(button = {}) {
  const text = normalizedButtonText(button);
  const action = String(button.action || button.token_record?.action || "").toUpperCase();
  return action === "DOWNLOAD_SANDBOX_ARTIFACTS"
    || text.includes("descargar xml/pdf")
    || text.includes("re-descargar xml/pdf")
    || text.includes("redescargar xml/pdf")
    || text.includes("ver documentos");
}

function detectDocumentStatusMissingExpectedActions({ state = {}, buttons = [], context = {} }) {
  if (!isDocumentStatusScreen(context)) return [];
  const failures = [];
  const hasDownload = buttons.some((button) => buttonMatchesAction(button, "DOWNLOAD_SANDBOX_ARTIFACTS"));
  const hasEmail = buttons.some((button) => buttonMatchesAction(button, "DELIVERY_PREPARE_PROVIDER_EMAIL"));
  const hasChannel = buttons.some((button) => buttonMatchesAction(button, "DELIVERY_PREPARE_TELEGRAM_CHANNEL"));
  const hasDelivery = hasEmail || hasChannel;
  const labels = buttons.map((button) => normalizedButtonText(button)).join(" ");
  const invoiceStatus = String(state.invoice_status || context.invoice_status || context.handle?.invoice_status || "").toUpperCase();
  const artifactStatus = String(state.artifact_status || context.artifact_status || context.handle?.artifact_status || "").toUpperCase();
  const deliverySent = isDeliveryAlreadySentState(state, context);
  if (invoiceStatus === "SANDBOX_ERROR") {
    if (hasDownload || hasDelivery || /cancel|eliminar|pago|cobranza|ledger/.test(labels)) {
      failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "SANDBOX_ERROR document status exposed forbidden actions", { invoice_status: invoiceStatus }));
    }
    return failures;
  }
  if (invoiceStatus === "SANDBOX_TIMBRADO" && artifactStatus === "DOWNLOAD_READY" && !hasDownload) {
    failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "DOWNLOAD_READY document status missing download action", { artifact_status: artifactStatus }));
  }
  if (invoiceStatus === "SANDBOX_TIMBRADO" && artifactStatus === "DOWNLOADED" && !deliverySent) {
    if (!hasEmail || !hasChannel) failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "DOWNLOADED pending document status missing delivery actions", { artifact_status: artifactStatus }));
  }
  if (invoiceStatus === "SANDBOX_TIMBRADO" && artifactStatus === "DOWNLOADED" && deliverySent && buttons.some(buttonIsInitialDelivery)) {
    failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "Sent/protected document status shows initial delivery actions", { artifact_status: artifactStatus }));
  }
  if (/DOWNLOAD_ERROR|ERROR|FAILED|FAIL/.test(artifactStatus)) {
    if (hasDelivery) failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "DOWNLOAD_ERROR document status shows delivery as ready", { artifact_status: artifactStatus }));
    if (!hasDownload && !labels.includes("ultimo resultado")) failures.push(failure("DOCUMENT_STATUS_MISSING_EXPECTED_ACTIONS", "DOWNLOAD_ERROR document status missing retry or last-result action", { artifact_status: artifactStatus }));
  }
  return failures;
}

function detectSentDocumentHidesResend({ state = {}, buttons = [], context = {} }) {
  if (!isDocumentOperationalDetailSurface(context)) return [];
  const invoiceStatus = String(state.invoice_status || context.invoice_status || context.handle?.invoice_status || "").toUpperCase();
  const artifactStatus = String(state.artifact_status || context.artifact_status || context.handle?.artifact_status || "").toUpperCase();
  if (invoiceStatus !== "SANDBOX_TIMBRADO" || artifactStatus !== "DOWNLOADED" || !isDeliveryAlreadySentState(state, context)) return [];
  if (buttons.some(buttonIsResendEmail) && buttons.some(buttonIsResendChannel)) return [];
  return [failure("SENT_DOCUMENT_HIDES_RESEND", "Sent/protected document detail hides explicit resend actions", { draft_id: state.draft_id || context.draft_id || null })];
}

function detectDownloadedDocumentMissingArtifactAccess({ state = {}, buttons = [], context = {} }) {
  if (!isDocumentOperationalDetailSurface(context)) return [];
  const invoiceStatus = String(state.invoice_status || context.invoice_status || context.handle?.invoice_status || "").toUpperCase();
  const artifactStatus = String(state.artifact_status || context.artifact_status || context.handle?.artifact_status || "").toUpperCase();
  if (invoiceStatus !== "SANDBOX_TIMBRADO" || artifactStatus !== "DOWNLOADED") return [];
  if (buttons.some(buttonHasArtifactAccess)) return [];
  return [failure("DOWNLOADED_DOCUMENT_MISSING_ARTIFACT_ACCESS", "Downloaded document detail missing XML/PDF access action", { draft_id: state.draft_id || context.draft_id || null })];
}

function isCollectionPaymentConfirmContext(context = {}) {
  const action = contextActionName(context);
  const screen = String(context.screen_id || context.handle?.screen_id || context.summary?.screen_id || "").toUpperCase();
  return action === "PAYMENT_ACTION_CONFIRMATION_REQUIRED" || screen === "COLLECTION_PAYMENT_CONFIRM";
}

function detectPaymentConfirmProviderBoundaryMissing(context = {}) {
  if (!isCollectionPaymentConfirmContext(context)) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  const hasLocal = /\blocal\b/.test(text);
  const hasNoProvider = /no actualiza/.test(text) && /\bsat\b/.test(text) && /\bpac\b/.test(text) && /\bproveedor\b/.test(text);
  const hasNoComplement = /no emite/.test(text) && /complemento de pago/.test(text);
  if (hasLocal && hasNoProvider && hasNoComplement) return [];
  return [failure("PAYMENT_CONFIRM_PROVIDER_BOUNDARY_MISSING", "Payment confirmation missing local/no-provider/no-complement boundary", {
    action: contextActionName(context),
    screen_id: context.screen_id || context.handle?.screen_id || null,
  })];
}

function detectCollectionUsesLocalDraftIdWhenProviderAvailable(context = {}, state = {}) {
  const action = contextActionName(context);
  const screen = String(context.screen_id || context.handle?.screen_id || "").toUpperCase();
  if (action !== "COLLECTION_INVOICES" && screen !== "COLLECTION_INVOICES") return [];
  const providerAvailable = Boolean(
    context.provider_identity_available === true
    || context.handle?.provider_identity_available === true
    || context.provider_folio
    || context.handle?.provider_folio
    || context.handle?.provider_serie
    || state.provider_folio
    || state.provider_serie
  );
  if (!providerAvailable) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  if (/\bbor-[a-z0-9-]+\b/.test(text) && !/borrador origen/.test(text)) {
    return [failure("COLLECTION_USES_LOCAL_DRAFT_ID_WHEN_PROVIDER_ID_AVAILABLE", "Collection list uses BOR identity while provider identity is available", {
      action,
    })];
  }
  return [];
}

function isPaymentMarkedPaidContext(context = {}) {
  const action = contextActionName(context);
  const callbackAction = String(context.callback_action || context.handle?.callback_action || context.handle?.action_token?.action || "").toUpperCase();
  return action === "PAYMENT_STATUS_MARKED_PAID" || callbackAction === "MARK_PAYMENT_PAID";
}

function isPaymentAlreadyPaidIdempotent(context = {}) {
  const action = contextActionName(context);
  const text = normalizedTextBlock(contextVisibleText(context));
  return action === "PAYMENT_STATUS_ALREADY_PAGADO" || /ya estaba marcada como pagada/.test(text);
}

function detectPaymentConfirmWithoutStateChange({ context = {}, draftAfter = {} }) {
  if (!isPaymentMarkedPaidContext(context)) return [];
  if (isPaymentAlreadyPaidIdempotent(context)) return [];
  const status = String(draftAfter?.payment_status || context.payment_status || context.handle?.payment_status || "").toUpperCase();
  if (status === "PAGADO" || status === "PAGADA") return [];
  return [failure("PAYMENT_CONFIRM_WITHOUT_STATE_CHANGE", "Payment confirmation completed without local payment_status change", {
    draft_id: context.draft_id || context.handle?.draft_id || null,
    payment_status: status || null,
  })];
}

function rememberConfirmedLocalPayment(counters = {}, context = {}, draftAfter = {}) {
  if (!isPaymentMarkedPaidContext(context)) return;
  if (isPaymentAlreadyPaidIdempotent(context)) return;
  const status = String(draftAfter?.payment_status || context.handle?.payment_status || context.payment_status || "").toUpperCase();
  if (status !== "PAGADO" && status !== "PAGADA") return;
  const draftId = String(context.draft_id || context.handle?.draft_id || draftAfter?.draft_id || "").trim();
  if (!draftId) return;
  counters.localPaidInvoices = counters.localPaidInvoices || new Map();
  counters.localPaidInvoices.set(draftId, {
    draft_id: draftId,
    display_id: String(context.handle?.display_id || context.display_id || "").trim(),
    marked_at_ms: Number(context.generated_at_ms || Date.now()),
  });
}

function detectPaymentConfirmedButStillListedPending({ context = {}, counters = {} }) {
  const action = contextActionName(context);
  const screen = String(context.screen_id || context.handle?.screen_id || "").toUpperCase();
  if (action !== "COLLECTION_INVOICES" && screen !== "COLLECTION_INVOICES") return [];
  const paid = counters.localPaidInvoices instanceof Map ? Array.from(counters.localPaidInvoices.values()) : [];
  if (!paid.length) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  const failures = [];
  for (const item of paid) {
    const display = normalizedTextBlock(item.display_id || "");
    const appears = display ? text.includes(display) : text.includes(normalizedTextBlock(item.draft_id || ""));
    if (appears && /\bpendiente\b/.test(text)) {
      failures.push(failure("PAYMENT_CONFIRMED_BUT_STILL_LISTED_PENDING", "Paid invoice still appears as pending in collection list", {
        draft_id: item.draft_id,
        display_id: item.display_id || null,
      }));
    }
  }
  return failures;
}

function detectPaymentPaidViewDeprecatedOrMissing(context = {}) {
  const action = contextActionName(context);
  const screen = String(context.screen_id || context.handle?.screen_id || "").toUpperCase();
  const callback = String(context.callback_action || context.handle?.callback_action || context.handle?.text || context.text || "").trim();
  const requestedPaidView = callback === "cfdi_nav:pay_paid" || action === "COLLECTION_PAID_INVOICES" || screen === "COLLECTION_PAID_INVOICES";
  if (!requestedPaidView) return [];
  if (action !== "COLLECTION_PAID_INVOICES" && screen !== "COLLECTION_PAID_INVOICES") {
    return [failure("PAYMENT_PAID_VIEW_DEPRECATED_OR_MISSING", "Paid invoices callback did not open the collection paid invoices view", {
      action,
      screen_id: screen || null,
      callback_action: callback || null,
    })];
  }
  const text = normalizedTextBlock(contextVisibleText(context));
  if (!/facturas pagadas/.test(text)) {
    return [failure("PAYMENT_PAID_VIEW_DEPRECATED_OR_MISSING", "Paid invoices view missing visible paid invoices title", {
      action,
      screen_id: screen || null,
    })];
  }
  return [];
}

function normalizedButtonText(button = {}) {
  return String(button.text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedTextBlock(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function buttonMatchesAction(button = {}, action) {
  const expected = String(action || "").toUpperCase();
  const direct = String(button.action || button.token_record?.action || "").toUpperCase();
  if (direct === expected) return true;
  const text = normalizedButtonText(button);
  if (!text) return false;
  if (expected === "DOWNLOAD_SANDBOX_ARTIFACTS") {
    return text.includes("descargar") && text.includes("xml") && text.includes("pdf");
  }
  if (expected === "DELIVERY_STATUS") return text.includes("estado documental");
  if (expected === "DELIVERY_PREPARE_TELEGRAM_CHANNEL") return !text.includes("reenviar") && text.includes("enviar") && (text.includes("canal") || text.includes("documentos"));
  if (expected === "DELIVERY_PREPARE_PROVIDER_EMAIL") return !text.includes("reenviar") && text.includes("enviar") && (text.includes("correo") || text.includes("email") || text.includes("documentos"));
  if (expected === "DELIVERY_FORCE_TELEGRAM_CHANNEL") return text.includes("reenviar") && (text.includes("canal") || text.includes("telegram"));
  if (expected === "DELIVERY_FORCE_PROVIDER_EMAIL") return text.includes("reenviar") && (text.includes("correo") || text.includes("email"));
  return false;
}

function isFreshTokenForExecution(row, context) {
  const generatedAtMs = Number(context?.generated_at_ms);
  if (!Number.isFinite(generatedAtMs)) return true;
  const createdAtMs = new Date(row?.created_at || "").getTime();
  if (!Number.isFinite(createdAtMs)) return true;
  return createdAtMs >= generatedAtMs - 10000 && createdAtMs <= generatedAtMs + 60000;
}

function detectTokenFailures({ context, tokens, buttons }) {
  const failures = [];
  const handle = context.handle || {};
  const actionName = String(context.action || handle.action || "").toUpperCase();
  const tokenRecord = handle.action_token && typeof handle.action_token === "object" ? handle.action_token : null;
  const tokenReason = String(context.callback_reason || "").toLowerCase();
  const recoverable = Boolean(tokenRecord?.draft_id || tokenRecord?.payload?.draft_id) && (!tokenRecord?.chat_id || !context.chat_id_raw || String(tokenRecord.chat_id) === String(context.chat_id_raw));

  if (actionName === "CALLBACK_TOKEN_INVALID" && recoverable) {
    failures.push(failure("CALLBACK_TOKEN_INVALID_RECOVERABLE_CONTEXT", "CALLBACK_TOKEN_INVALID with recoverable draft context", { draft_id: tokenRecord?.draft_id || tokenRecord?.payload?.draft_id || null }));
  }
  if (tokenReason === "token_usado" && !["CALLBACK_TOKEN_USED_RECOVERY", "CALLBACK_TOKEN_CONTEXT_RECOVERED"].includes(actionName)) {
    failures.push(failure("CALLBACK_TOKEN_USED_WITHOUT_RECOVERY", "Used token did not recover safely", { action: actionName }));
  }
  if (tokenReason === "token_expirado" && actionName !== "CALLBACK_TOKEN_CONTEXT_RECOVERED" && recoverable) {
    failures.push(failure("EXPIRED_TOKEN_WITHOUT_RECOVERY", "Expired token did not refresh recoverable container", { draft_id: tokenRecord?.draft_id || tokenRecord?.payload?.draft_id || null }));
  }
  for (const row of tokens || []) {
    if (!row?.chat_id && ["DOWNLOAD_SANDBOX_ARTIFACTS", "DELIVERY_PREPARE_TELEGRAM_CHANNEL", "DELIVERY_PREPARE_PROVIDER_EMAIL", "DELIVERY_CONFIRM_TELEGRAM_CHANNEL", "DELIVERY_CONFIRM_PROVIDER_EMAIL"].includes(String(row?.action || "").toUpperCase())) {
      if (isFreshTokenForExecution(row, context)) failures.push(failure("FRESH_TOKEN_EMPTY_CHAT_ID", "Action token created with empty chat_id", { action: row.action, draft_id: row.draft_id || row.payload?.draft_id || null }));
    }
  }
  for (const button of buttons || []) {
    const row = button.token_record;
    if (!row) continue;
    const generatedAtMs = Number.isFinite(context.generated_at_ms) ? context.generated_at_ms : null;
    const usedAtGeneration = isUsedAtGeneration(row, generatedAtMs);
    const expiredAtGeneration = isExpiredToken(row, generatedAtMs || Date.now());
    if (usedAtGeneration || expiredAtGeneration) {
      failures.push(failure("REPLY_MARKUP_REUSES_OLD_CALLBACK_DATA", "reply_markup references used or expired token", {
        action: row.action,
        draft_id: row.draft_id || row.payload?.draft_id || null,
        used: usedAtGeneration,
        expired: expiredAtGeneration,
      }));
    }
  }
  return failures;
}

function isDeliveryConfirmAction(action = "") {
  const normalized = String(action || "").toUpperCase();
  return normalized === "DELIVERY_CONFIRM_PROVIDER_EMAIL" || normalized === "DELIVERY_CONFIRM_TELEGRAM_CHANNEL";
}

function rememberFreshDeliveryConfirmTokens(counters = {}, tokenChanges = { created: [] }, context = {}) {
  counters.deliveryConfirmTokens = counters.deliveryConfirmTokens || new Map();
  const nowMs = Number(context.generated_at_ms) || Date.now();
  for (const row of tokenChanges.created || []) {
    if (!isDeliveryConfirmAction(row?.action)) continue;
    if (!row?.token) continue;
    if (row.used_at || isExpiredToken(row, nowMs)) continue;
    counters.deliveryConfirmTokens.set(String(row.token), {
      token: row.token,
      action: row.action,
      draft_id: row.draft_id || row.payload?.draft_id || null,
      created_at: row.created_at || null,
      expires_at: row.expires_at || null,
      used_at: row.used_at || null,
    });
  }
  if (counters.deliveryConfirmTokens.size > 200) {
    counters.deliveryConfirmTokens = new Map(Array.from(counters.deliveryConfirmTokens.entries()).slice(-200));
  }
}

function detectDeliveryConfirmTokenInvalidAfterPrepare({ context = {}, counters = {}, handle = {} }) {
  const action = String(context.action || handle.action || "").toUpperCase();
  if (action !== "DOCUMENT_ACTION_BLOCKED") return [];
  const callbackAction = String(context.callback_action || handle.callback_action || handle.json_debug?.callback_action || "").toUpperCase();
  if (!isDeliveryConfirmAction(callbackAction)) return [];
  const token = String(handle.action_token?.token || "").trim();
  if (!token) return [];
  const remembered = counters.deliveryConfirmTokens instanceof Map ? counters.deliveryConfirmTokens.get(token) : null;
  if (!remembered) return [];
  const nowMs = Number(context.started_at_ms || context.generated_at_ms) || Date.now();
  if (remembered.used_at || isExpiredToken(remembered, nowMs)) return [];
  return [failure("DELIVERY_CONFIRM_TOKEN_INVALID_AFTER_PREPARE", "Fresh delivery confirm token was blocked after prepare", {
    action: callbackAction,
    draft_id: remembered.draft_id || context.draft_id || null,
    token: maskToken(token),
  })];
}

function detectDispatchFailures({ execution, context, dispatch }) {
  const failures = [];
  const addedCodes = new Set();
  const addDispatchFailure = (code, message, details) => {
    addedCodes.add(code);
    failures.push(failure(code, message, details));
  };
  const addDispatchWarning = (code, message, details) => {
    addedCodes.add(code);
    failures.push(warning(code, message, details));
  };
  const fallback = telegramNodeResult(execution, "Telegram fallback sendMessage") || telegramNodeResult(execution, "Telegram sendMessage");
  const visibleFallback = Boolean(fallback?.ok && (context.plan?.telegram_message || context.summary?.telegram_message || context.handle?.telegram_message || context.plan?.send_text || context.summary?.send_text || context.handle?.send_text));
  const analysis = analyzeExecution(execution);
  for (const message of analysis.failures || []) {
    if (visibleFallback && /editMessageText/i.test(String(message || ""))) {
      addDispatchWarning("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED", "Telegram editMessageText failed but fallback message was sent", { execution_id: context.execution_id });
      continue;
    }
    addDispatchFailure("TELEGRAM_DISPATCH_ANALYSIS_FAIL", message, { execution_id: context.execution_id });
  }
  for (const method of dispatch.methods || []) {
    if (!method.failed) continue;
    if (method.node === "Telegram editMessageText" && visibleFallback) {
      addDispatchWarning("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED", "Telegram editMessageText failed but fallback message was sent", { execution_id: context.execution_id });
      continue;
    }
    const code = method.node === "Telegram editMessageText"
      ? "TELEGRAM_EDIT_MESSAGE_TEXT_FAILED"
      : method.node === "Telegram sendMessage"
      ? "TELEGRAM_SEND_MESSAGE_FAILED"
      : method.node === "Telegram sendDocument"
        ? "TELEGRAM_SEND_DOCUMENT_FAILED"
        : method.node === "Telegram fallback sendMessage"
          ? "TELEGRAM_FALLBACK_SEND_MESSAGE_FAILED"
          : "TELEGRAM_DISPATCH_METHOD_FAILED";
    addDispatchFailure(code, `${method.node} failed`, { execution_id: context.execution_id });
  }
  const edit = telegramNodeResult(execution, "Telegram editMessageText");
  if (edit?.failed && !addedCodes.has("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED") && !addedCodes.has("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED")) {
    if (visibleFallback) addDispatchWarning("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED_RECOVERED", "Telegram editMessageText failed but fallback message was sent", { execution_id: context.execution_id });
    else addDispatchFailure("TELEGRAM_EDIT_MESSAGE_TEXT_FAILED", "Telegram editMessageText failed", { execution_id: context.execution_id });
  }
  if (!dispatch.attempted && (context.handle?.telegram_message || context.summary?.telegram_message || context.signals?.action_executed)) {
    failures.push(failure("TELEGRAM_DISPATCH_MISSING", "Telegram dispatch did not occur", { execution_id: context.execution_id }));
  }
  if (dispatch.dispatch_plan.method === "editMessageText" && !context.callback_message_id_present) {
    failures.push(failure("CALLBACK_MESSAGE_ID_MISSING_FOR_EDIT", "callback_message_id absent when editMessageText planned", { execution_id: context.execution_id }));
  }
  return failures;
}

function containsPresentationHtmlTags(value) {
  return /<\/?(?:b|strong|i|em|u|s|strike|del|code|pre|a)(?:\s+[^>]*)?>/i.test(String(value || ""));
}

function isHtmlParseMode(value) {
  return String(value || "").trim().toUpperCase() === "HTML";
}

function isContextualMessageCommand(text = "") {
  const normalized = normalizedTextBlock(text);
  if (!normalized) return false;
  if (normalized.startsWith("/")) return true;
  return /^(ver|detalle|resumen|timbrar|descargar|enviar|correo|canal|pagar)\s*\d{1,3}$/.test(normalized)
    || /^(cliente|facturas)\s+\d{1,3}$/.test(normalized)
    || ["facturas", "documentos", "borradores", "pendientes", "aprobadas", "clientes", "cobranza", "menu", "start"].includes(normalized);
}

function isFreeTextMessageContext(context = {}) {
  const sourceKind = String(context.source_kind || "").trim().toUpperCase();
  if (sourceKind !== "MESSAGE") return false;
  const text = String(context.message_text || context.handle?.text || "").trim();
  if (!text || text.startsWith("cfdi:")) return false;
  return !isContextualMessageCommand(text);
}

function detectFreeTextCallbackRecoveryFailures(context = {}) {
  if (!isFreeTextMessageContext(context)) return [];
  const text = normalizedTextBlock(contextVisibleText(context));
  if (!text) return [];
  const action = String(context.action || "").trim().toUpperCase();
  const failures = [];
  const hasButtonRecoveryCopy = /\bel boton de\b|\bboton\b.*\bno corresponde\b|\baccion vigente\b/.test(text);
  const hasCallbackRecoveryAction = ["CALLBACK_TOKEN_CONTEXT_RECOVERED", "CALLBACK_TOKEN_INVALID", "CALLBACK_TOKEN_USED_RECOVERY", "DOCUMENT_ACTION_BLOCKED"].includes(action);
  if (hasCallbackRecoveryAction && (hasButtonRecoveryCopy || /\bpantalla anterior\b/.test(text))) {
    failures.push(failure("FREE_TEXT_HIJACKED_BY_CALLBACK_RECOVERY", "Free text MESSAGE was handled as callback recovery", { action }));
  }
  if (hasButtonRecoveryCopy) {
    failures.push(failure("BUTTON_RECOVERY_COPY_ON_MESSAGE", "Button recovery copy rendered for free text MESSAGE", { action }));
  }
  return failures;
}

function detectPresentationFailures(context = {}) {
  const failures = [];
  const sources = [
    { name: "handle", value: context.handle || {} },
    { name: "summary", value: context.summary || {} },
    { name: "dispatch_plan", value: context.plan || {} },
  ];
  const dispatchParseMode = context.plan?.parse_mode || "";
  for (const source of sources) {
    const text = String(source.value?.telegram_message || source.value?.send_text || "");
    if (!containsPresentationHtmlTags(text)) continue;
    const parseMode = source.value?.parse_mode || dispatchParseMode;
    if (!isHtmlParseMode(parseMode)) {
      failures.push(failure("RAW_HTML_TAGS_VISIBLE", "Telegram message contains HTML tags without parse_mode=HTML", {
        execution_id: context.execution_id,
        source: source.name,
      }));
    }
  }
  return failures;
}

function detectActionFailures({ execution, context, draftBefore, draftAfter, ledgerRows, artifactPaths }) {
  const failures = [];
  const route = String(context.route || "").trim();
  const action = String(context.action || "").toUpperCase();
  const expectedRoute = ROUTE_EXPECTATIONS[action] || "";
  const stateAfter = draftState(draftAfter || {});

  if (expectedRoute && route && route !== expectedRoute) {
    failures.push(failure("CALLBACK_EXECUTED_UNEXPECTED_ROUTE", `Callback expected ${expectedRoute} but routed ${route}`, { execution_id: context.execution_id, action, route }));
  }
  if (context.should_execute_sandbox_action && !nodeExecuted(execution, "Execute PAC Sandbox Action")) {
    failures.push(failure("PAC_ACTION_NOT_EXECUTED", "Expected Execute PAC Sandbox Action but node did not run", { execution_id: context.execution_id, route }));
  }
  if (nodeExecuted(execution, "Execute PAC Sandbox Action") && context.sandbox_status && context.sandbox_status !== "OK") {
    const hasUsefulMessage = Boolean(context.summary?.telegram_message || context.summary?.send_text || (context.sandbox_errors || []).length || (context.sandbox_warnings || []).length);
    if (!hasUsefulMessage) failures.push(failure("PAC_ACTION_FAILED_WITHOUT_USEFUL_MESSAGE", "PAC action failed without useful message", { execution_id: context.execution_id, status: context.sandbox_status }));
  }
  if (route === "sandbox.draft.download-artifacts") {
    if (stateAfter.artifact_status !== "DOWNLOADED" || stateAfter.xml_content_valid !== true || stateAfter.pdf_content_valid !== true) {
      failures.push(failure("DOWNLOAD_ACTION_DB_NOT_DOWNLOADED", "Download action did not leave DB DOWNLOADED with valid XML/PDF", { draft_id: context.draft_id, state: stateAfter }));
    }
  }
  if (route === "sandbox.documents.delivery.send") {
    const sentRows = (ledgerRows || []).filter((row) => String(row.delivery_status || "").toUpperCase() === "SENT");
    if (!sentRows.length) failures.push(failure("DOCUMENT_LEDGER_ABSENT_AFTER_SEND", "document_delivery_ledger missing SENT row after real send", { draft_id: context.draft_id }));
  }
  if (stateAfter.artifact_status === "DOWNLOADED") {
    const xmlExists = artifactPaths?.xml ? fs.existsSync(path.join(ROOT, artifactPaths.xml)) : false;
    const pdfExists = artifactPaths?.pdf ? fs.existsSync(path.join(ROOT, artifactPaths.pdf)) : false;
    if (!xmlExists || !pdfExists) failures.push(failure("DOWNLOADED_FILES_MISSING", "DB says DOWNLOADED but XML/PDF files are missing", { draft_id: context.draft_id, xml_exists: xmlExists, pdf_exists: pdfExists }));
  }
  if (context.signals?.action_executed && draftBefore && draftAfter && route) {
    const draftChanged = dbStateChanged(draftBefore, draftAfter);
    const ledgerEvidence = route === "sandbox.documents.delivery.send"
      ? deliverySendLedgerEvidence(ledgerRows, context)
      : { changed: false };
    if (!draftChanged && !ledgerEvidence.changed) {
      failures.push(warning("DB_UNCHANGED_AFTER_ACTION", "DB snapshot did not change after action", {
        draft_id: context.draft_id,
        route,
        ledger_evidence: ledgerEvidence.reason || null,
      }));
    }
  }
  failures.push(...detectPaymentConfirmWithoutStateChange({ context, draftAfter }));
  return failures;
}

function providerEmailFailures({ context, args, ledgerRows, env = process.env, state }) {
  const failures = [];
  const action = String(context.action || "").toUpperCase();
  const route = String(context.route || "");
  const isProviderAction = action.includes("PROVIDER_EMAIL") || (route === "sandbox.documents.delivery.send" && (ledgerRows || []).some((row) => String(row.channel || "").toUpperCase() === "PROVIDER_EMAIL"));
  if (!isProviderAction) return failures;
  if (args.allowProviderEmailSend && parseBool(env.SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED) !== true) {
    failures.push(failure("PROVIDER_EMAIL_REAL_SEND_ENV_DISABLED", "Provider email real send requested but env guard is disabled"));
  }
  const email = firstNonEmpty(
    state?.provider_email,
    state?.provider_email_address,
    state?.client_email,
    state?.client_snapshot?.provider_email,
    state?.client_snapshot?.email,
  );
  if (email && !isProviderEmailAllowed(email, env)) {
    failures.push(failure("PROVIDER_EMAIL_OUTSIDE_ALLOWLIST", "Provider email outside allowlist", { email: redactEmail(email) }));
  }
  return failures;
}

function classifyExecution(execution, options = {}) {
  const counters = options.counters || {};
  const context = deriveExecutionContext(execution);
  const handle = latestNodeJson(execution, "Handle Commands And Scoring") || {};
  const db = options.db || null;
  const priorDraft = context.draft_id ? options.previousDraftSnapshots?.get(context.draft_id) || null : null;
  const draft = context.draft_id && db ? db.getDraftFull(context.draft_id) : null;
  const state = safeDraftSnapshot(draft || {});
  const tokens = context.draft_id && db ? db.getTokensForDraft(context.draft_id) : [];
  const hasPreviousTokens = Boolean(context.draft_id && options.previousTokenSnapshots?.has(context.draft_id));
  const previousTokens = hasPreviousTokens ? options.previousTokenSnapshots.get(context.draft_id) || [] : [];
  const ledgerRows = context.draft_id && db ? db.getLedgerFull(context.draft_id) : [];
  const sendLogs = db ? db.getSendLogs({ chatId: context.chat_id_raw, updateId: context.update_id }) : [];
  const visibleButtons = extractGeneratedVisibleButtons(execution, tokens, context);
  const artifactPaths = extractArtifactPaths(draft || {}, ledgerRows);
  const dispatch = dispatchSummary(execution, context);
  const tokenChanges = hasPreviousTokens
    ? tokenDiff(previousTokens, tokens)
    : tokenChangesFromExecutionWindow(tokens, context);
  const staleDbSnapshot = dbSnapshotNewerThanExecution(draft, context);
  const latency = latencyMetricsForContext(context, options.args || {});
  const interactionRisks = detectInteractionRisks(context, options.args || {}, counters);

  let failures = [];
  failures = failures.concat(latencyFailures(latency, context));
  failures = failures.concat(interactionRisks.failures || []);
  if (!staleDbSnapshot && shouldAuditDraftStateButtons(context, visibleButtons)) {
    failures = failures.concat(detectStateButtonFailures({ state, buttons: visibleButtons, context }));
  }
  failures = failures.concat(detectTokenFailures({ context, tokens, buttons: visibleButtons }));
  failures = failures.concat(detectDeliveryConfirmTokenInvalidAfterPrepare({ context, counters, handle }));
  failures = failures.concat(detectFreeTextCallbackRecoveryFailures(context));
  failures = failures.concat(detectDocumentNavCallbackInvalid(context));
  failures = failures.concat(detectDocumentStatusReturnsToList(context));
  failures = failures.concat(detectDocumentStatusLostCurrentItem(context));
  failures = failures.concat(detectPaymentConfirmProviderBoundaryMissing(context));
  failures = failures.concat(detectCollectionUsesLocalDraftIdWhenProviderAvailable(context, state));
  failures = failures.concat(detectPaymentConfirmedButStillListedPending({ context, counters }));
  failures = failures.concat(detectPaymentPaidViewDeprecatedOrMissing(context));
  failures = failures.concat(detectPresentationFailures(context));
  failures = failures.concat(detectDispatchFailures({ execution, context, dispatch }));
  failures = failures.concat(detectActionFailures({ execution, context, draftBefore: priorDraft, draftAfter: draft, ledgerRows, artifactPaths }));
  failures = failures.concat(providerEmailFailures({ context, args: options.args || {}, ledgerRows, env: process.env, state: draft || {} }));

  const providerEmailSentRows = currentExecutionSentLedgerRows(ledgerRows, context, "PROVIDER_EMAIL");
  const telegramChannelSentRows = currentExecutionSentLedgerRows(ledgerRows, context, "TELEGRAM_DOCUMENT_CHANNEL");
  counters.providerEmailDeliveryIds = counters.providerEmailDeliveryIds || new Set();
  counters.telegramChannelDeliveryIds = counters.telegramChannelDeliveryIds || new Set();
  for (const row of providerEmailSentRows) {
    const key = String(row.delivery_id || `${row.draft_id || context.draft_id || "draft"}:PROVIDER_EMAIL:${row.sent_at || row.created_at || ""}`);
    if (!counters.providerEmailDeliveryIds.has(key)) {
      counters.providerEmailDeliveryIds.add(key);
      counters.providerEmailSendCount = (counters.providerEmailSendCount || 0) + 1;
    }
  }
  for (const row of telegramChannelSentRows) {
    const key = String(row.delivery_id || `${row.draft_id || context.draft_id || "draft"}:TELEGRAM_DOCUMENT_CHANNEL:${row.sent_at || row.created_at || ""}`);
    if (!counters.telegramChannelDeliveryIds.has(key)) {
      counters.telegramChannelDeliveryIds.add(key);
      counters.telegramChannelSendCount = (counters.telegramChannelSendCount || 0) + 1;
    }
  }
  const providerEmailSent = providerEmailSentRows.length > 0;
  const telegramChannelSent = telegramChannelSentRows.length > 0;
  if ((counters.providerEmailSendCount || 0) > Number(options.args?.maxProviderEmailSend || 1)) {
    failures.push(failure("PROVIDER_EMAIL_REAL_SEND_LIMIT_EXCEEDED", "Provider email send exceeded per-run limit", { count: counters.providerEmailSendCount }));
  }
  if (telegramChannelSent && options.args?.allowTelegramChannelSend !== true) {
    failures.push(warning("TELEGRAM_CHANNEL_SEND_OBSERVED", "Telegram channel send observed without explicit watcher allow flag", { draft_id: context.draft_id }));
  }
  rememberConfirmedLocalPayment(counters, context, draft);
  rememberFreshDeliveryConfirmTokens(counters, tokenChanges, context);

  const event = {
    type: failures.some((item) => item.severity === "FAIL") ? "BREAK_DETECTED" : "EXECUTION_OK",
    observed_at: new Date().toISOString(),
    execution_id: context.execution_id,
    workflow_id: context.workflow_id,
    status: context.status,
    source_kind: context.source_kind,
    callback_query_id_present: context.callback_query_id_present,
    callback_message_id_present: context.callback_message_id_present,
    chat_id_present: context.chat_id_present,
    chat_id_redacted: context.chat_id_redacted,
    update_id: context.update_id,
    route: context.route,
    requested_action: context.requested_action,
    requested_sandbox_action: context.requested_sandbox_action,
    action: context.action,
    draft_id: context.draft_id || null,
    invoice_status: state.invoice_status || null,
    artifact_status: state.artifact_status || null,
    tokens_created: tokenChanges.created.map(safeToken),
    tokens_used: tokenChanges.used.map(safeToken),
    token_expired_or_invalid_reason: context.callback_reason || null,
    latency,
    duplicate_interaction: interactionRisks.duplicate,
    interaction_ordering: interactionRisks.ordering,
    reply_markup_generated: visibleButtons.length > 0,
    visible_actions: visibleButtons.map(buttonSummary),
    dispatch,
    telegram_method: dispatch.methods.map((item) => item.node).join(", ") || null,
    telegram_dispatch_ok: dispatch.ok,
    db_state_before: priorDraft ? safeDraftSnapshot(priorDraft) : null,
    db_state_after: state,
    db_snapshot_newer_than_execution: staleDbSnapshot,
    runtime_artifacts: {
      xml_path: artifactPaths.xml || null,
      pdf_path: artifactPaths.pdf || null,
      manifest_path: artifactPaths.manifest || null,
      xml_exists: artifactPaths.xml ? fs.existsSync(path.join(ROOT, artifactPaths.xml)) : false,
      pdf_exists: artifactPaths.pdf ? fs.existsSync(path.join(ROOT, artifactPaths.pdf)) : false,
    },
    document_delivery_ledger: ledgerRows.map(safeLedger),
    send_logs: sendLogs.map(safeSendLog),
    nodes_executed: context.nodes_executed,
    errors: context.sandbox_errors || [],
    warnings: context.sandbox_warnings || [],
    failures,
  };

  return {
    pass: !failures.some((item) => item.severity === "FAIL"),
    event,
    context,
    db_snapshot: {
      draft_id: context.draft_id || null,
      draft: state,
      ledger: ledgerRows.map(safeLedger),
      send_logs: sendLogs.map(safeSendLog),
      runtime_artifacts: event.runtime_artifacts,
    },
    token_snapshot: {
      draft_id: context.draft_id || null,
      tokens: tokens.map(safeToken),
    },
    raw_execution: execution,
    draft,
    tokens,
    stale_db_snapshot: staleDbSnapshot,
  };
}

function createSessionState(args, reportDir) {
  return {
    label: args.label,
    report_dir: reportDir,
    started_at: new Date().toISOString(),
    finished_at: null,
    pass: true,
    env: envAudit(),
    workflow_status: null,
    workflow_sync: null,
    services_detected: {},
    timeline: [],
    events: [],
    failures: [],
    dbSnapshots: [],
    tokenSnapshots: [],
    n8nExecutions: [],
    latestState: {},
    draftIds: new Set(),
    executionIds: new Set(),
    previousDraftSnapshots: new Map(),
    previousTokenSnapshots: new Map(),
    counters: {
      providerEmailSendCount: 0,
      telegramChannelSendCount: 0,
    },
    human_steps: [],
  };
}

async function runWorkflowChecks(args, state) {
  try {
    state.workflow_status = await runScenario({ scenario: "workflow-status", safe: true, noRealSend: true, allowRemoteN8n: args.allowRemoteN8n === true });
  } catch (error) {
    state.workflow_status = { pass: false, failures: [error.message] };
    state.failures.push(failure("WORKFLOW_STATUS_FAILED", error.message));
  }
  try {
    state.workflow_sync = await runScenario({ scenario: "workflow-sync-check", safe: true, noRealSend: true, allowRemoteN8n: args.allowRemoteN8n === true });
  } catch (error) {
    state.workflow_sync = { pass: false, failures: [error.message] };
    state.failures.push(failure("WORKFLOW_SYNC_CHECK_FAILED", error.message));
  }
  if (state.workflow_sync && state.workflow_sync.workflow_in_sync === false) {
    state.failures.push(failure("WORKFLOW_OUT_OF_SYNC", "workflow-sync-check reports out-of-sync"));
  }
}

function updateStateFromClassified(state, classified) {
  const event = classified.event;
  state.timeline.push({
    observed_at: event.observed_at,
    execution_id: event.execution_id,
    draft_id: event.draft_id,
    action: event.action,
    route: event.route,
    type: event.type,
    latency_status: event.latency?.status || "LATENCY_UNKNOWN",
    duration_ms: event.latency?.execution_duration_ms ?? null,
    duplicate_detected: event.duplicate_interaction?.duplicate_detected === true,
  });
  state.events.push(event);
  state.n8nExecutions.push(sanitizeReport(classified.raw_execution));
  state.dbSnapshots.push(classified.db_snapshot);
  state.tokenSnapshots.push(classified.token_snapshot);
  if (event.draft_id) {
    state.draftIds.add(event.draft_id);
    if (classified.stale_db_snapshot !== true) {
      state.previousDraftSnapshots.set(event.draft_id, classified.draft || null);
      state.previousTokenSnapshots.set(event.draft_id, classified.tokens || []);
      state.latestState[event.draft_id] = classified.db_snapshot;
    }
  }
  if (event.execution_id) state.executionIds.add(String(event.execution_id));
  for (const item of event.failures || []) state.failures.push(item);
  if ((event.failures || []).some((item) => item.severity === "FAIL")) state.pass = false;
}

async function inspectExecutionById({ n8nClient, db, args, state, executionId }) {
  const execution = await n8nClient.getExecution({ executionId, includeData: true });
  const classified = classifyExecution(execution, {
    db,
    args,
    previousDraftSnapshots: state.previousDraftSnapshots,
    previousTokenSnapshots: state.previousTokenSnapshots,
    counters: state.counters,
  });
  updateStateFromClassified(state, classified);
  return classified;
}

function compareExecutionIds(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return String(a).localeCompare(String(b));
}

function isAfterExecutionId(id, sinceId) {
  if (!sinceId) return true;
  return compareExecutionIds(id, sinceId) > 0;
}

async function runWatch({ args, n8nClient, db, state }) {
  const start = Date.now();
  const seen = new Set();
  let sinceId = args.sinceExecutionId || "";
  if (args.sinceNow) {
    const list = await n8nClient.listExecutions({ limit: 1 });
    const latest = firstExecutionFromList(list);
    sinceId = latest?.id || latest?.executionId || "";
  }
  while (Date.now() - start <= args.timeoutMs) {
    const list = await n8nClient.listExecutions({ limit: WATCH_LIMIT });
    const items = executionsFromList(list)
      .map((item) => ({ id: String(item.id || item.executionId || ""), item }))
      .filter((item) => item.id && !seen.has(item.id) && isAfterExecutionId(item.id, sinceId))
      .sort((a, b) => compareExecutionIds(a.id, b.id));
    for (const entry of items) {
      seen.add(entry.id);
      const classified = await inspectExecutionById({ n8nClient, db, args, state, executionId: entry.id });
      printEventLine(classified.event);
      if (classified.event.type === "BREAK_DETECTED") {
        console.log(`BREAK DETECTED execution=${entry.id} cause=${classified.event.failures.map((item) => item.code).join(",")}`);
        if (args.failFast) return;
      }
    }
    await sleep(args.pollMs);
  }
}

function executionsFromList(list) {
  if (Array.isArray(list?.data)) return list.data;
  if (Array.isArray(list?.results)) return list.results;
  if (Array.isArray(list)) return list;
  return [];
}

function firstExecutionFromList(list) {
  return executionsFromList(list)[0] || null;
}

function printEventLine(event) {
  const status = event.type === "BREAK_DETECTED" ? "BREAK" : "OK";
  const bits = [
    status,
    `execution=${event.execution_id || "N/A"}`,
    `action=${event.action || "N/A"}`,
    `route=${event.route || "N/A"}`,
    `draft=${event.draft_id || "N/A"}`,
    `dispatch=${event.telegram_dispatch_ok === true}`,
    `latency=${event.latency?.status || "LATENCY_UNKNOWN"}`,
    `duration_ms=${event.latency?.measured_ms ?? "UNKNOWN"}`,
  ];
  console.log(bits.join(" "));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function markHumanTimeout(state, details = {}) {
  const item = failure("TIMEOUT_WAITING_FOR_HUMAN_CLICK", "User did not click before timeout", details, "WARN");
  state.failures.push(item);
  state.human_steps.push({ type: "timeout", ...details, created_at: new Date().toISOString() });
  return item;
}

async function runGuided({ args, n8nClient, db, state }) {
  const flow = args.flow || "full-sandbox";
  if (flow === "full-sandbox") {
    state.human_steps.push({
      type: "guided-info",
      message: "Use Telegram normally: create, confirm, approve, stamp, detail, download, delivery prepare/send. Watcher will audit new executions.",
      created_at: new Date().toISOString(),
    });
    console.log("Guided full-sandbox: navega normalmente en Telegram; el watcher auditara ejecuciones nuevas.");
    return runWatch({ args: { ...args, watch: true, sinceNow: true }, n8nClient, db, state });
  }

  const flowToCase = {
    "download-ready": "download-ready",
    "downloaded-delivery": "downloaded-delivery",
    "expired-token-recovery": "expired-token-recovery",
  };
  const acceptanceCase = flowToCase[flow];
  if (!acceptanceCase) throw new Error(`NEEDS_INPUT: --flow invalido: ${flow}`);
  const guidedDraft = locateGuidedDraft({ flow, args, db });
  const result = await runAcceptance({
    case: acceptanceCase,
    draftId: guidedDraft?.draft_id || args.draftId,
    chatId: args.chatId || guidedDraft?.chat_id || undefined,
    timeoutMs: args.timeoutMs,
    renderTimeoutMs: parseNumber(args.renderTimeoutMs, 30000),
    pollMs: args.pollMs,
    checkOnly: args.checkOnly === true,
    allowRemoteN8n: args.allowRemoteN8n,
    dbExecMode: args.dbExecMode,
  });
  state.human_steps.push({
    type: "guided-acceptance",
    flow,
    draft_id: result.draft_id || null,
    expected_button: result.expected_button || null,
    human_click_requested: result.human_click_requested === true,
    human_click_observed: result.human_click_observed === true,
    created_at: new Date().toISOString(),
  });
  if (result.execution_id) {
    await inspectExecutionById({ n8nClient, db, args, state, executionId: result.execution_id });
  }
  if (result.pass !== true) {
    recordGuidedFailure(state, result, flow);
  }
  state.latestState.guided_result = sanitizeReport(result);
}

function recordGuidedFailure(state, result, flow) {
  if (result.fail_code === "HUMAN_CLICK_TIMEOUT") {
    markHumanTimeout(state, { flow, draft_id: result.draft_id || null });
    return;
  }
  state.pass = false;
  const item = failure(result.fail_code || "GUIDED_FLOW_FAILED", (result.failures || []).join(" | ") || "Guided flow failed", {
    flow,
    draft_id: result.draft_id || null,
    draft_state: result.draft_state || result.db_snapshot?.pre_state || null,
    tokens_generated: result.tokens_generated || result.db_snapshot?.tokens_after_render || [],
    visible_actions_found: result.visible_actions_found || [],
    n8n_execution_associated: result.n8n_execution_associated || result.render_execution_id || result.execution_id || null,
  });
  state.failures.push(item);
  if (result.fail_code !== "UI_RENDER_FAIL") return;
  const event = {
    type: "BREAK_DETECTED",
    observed_at: new Date().toISOString(),
    execution_id: result.n8n_execution_associated || result.render_execution_id || result.execution_id || null,
    workflow_id: null,
    status: null,
    source_kind: "GUIDED_RENDER",
    callback_query_id_present: false,
    callback_message_id_present: false,
    chat_id_present: null,
    chat_id_redacted: "",
    update_id: null,
    route: null,
    requested_action: null,
    requested_sandbox_action: null,
    action: result.expected_action || null,
    draft_id: result.draft_id || null,
    invoice_status: result.draft_state?.invoice_status || null,
    artifact_status: result.draft_state?.artifact_status || null,
    tokens_created: result.tokens_generated || result.db_snapshot?.tokens_after_render || [],
    tokens_used: [],
    token_expired_or_invalid_reason: null,
    reply_markup_generated: (result.visible_actions_found || []).length > 0,
    visible_actions: result.visible_actions_found || [],
    dispatch: null,
    telegram_method: null,
    telegram_dispatch_ok: false,
    db_state_before: null,
    db_state_after: result.draft_state || result.db_snapshot?.pre_state || null,
    runtime_artifacts: {},
    document_delivery_ledger: [],
    send_logs: [],
    nodes_executed: [],
    errors: [],
    warnings: [],
    failures: [item],
  };
  state.events.push(event);
  state.timeline.push({
    observed_at: event.observed_at,
    execution_id: event.execution_id,
    draft_id: event.draft_id,
    action: event.action,
    route: event.route,
    type: event.type,
  });
  if (event.draft_id) {
    state.draftIds.add(event.draft_id);
    state.latestState[event.draft_id] = {
      draft: event.db_state_after || {},
      runtime_artifacts: {},
    };
  }
  if (event.execution_id) state.executionIds.add(String(event.execution_id));
}

function locateGuidedDraft({ flow, args, db }) {
  if (!db || args.chatId) {
    if (args.draftId && db?.getDraftFull) return db.getDraftFull(args.draftId);
    return null;
  }
  if (args.draftId) return db.getDraftFull(args.draftId);
  if (flow === "download-ready" && db.findDraftByState) {
    return db.findDraftByState({ invoiceStatus: "SANDBOX_TIMBRADO", artifactStatus: "DOWNLOAD_READY" });
  }
  if (flow === "downloaded-delivery" && db.findDraftByState) {
    return db.findDraftByState({ invoiceStatus: "SANDBOX_TIMBRADO", artifactStatus: "DOWNLOADED" });
  }
  if (flow === "expired-token-recovery" && db.findDraftByState) {
    return db.findDraftByState({ invoiceStatus: "SANDBOX_TIMBRADO", artifactStatus: "DOWNLOAD_READY" })
      || db.findDraftByState({ invoiceStatus: "SANDBOX_TIMBRADO", artifactStatus: "DOWNLOADED" });
  }
  return null;
}

function buildSummaryMarkdown(state) {
  const failures = state.failures || [];
  const failItems = failures.filter((item) => item.severity !== "WARN");
  const draftIds = Array.from(state.draftIds || []);
  const executionIds = Array.from(state.executionIds || []);
  const tokenCreated = state.events.reduce((sum, event) => sum + (event.tokens_created || []).length, 0);
  const tokenUsed = state.events.reduce((sum, event) => sum + (event.tokens_used || []).length, 0);
  const telegramSends = state.events.flatMap((event) => event.dispatch?.methods || []).filter((item) => /Telegram/.test(item.node));
  const providerEmailSends = state.events.flatMap((event) => event.document_delivery_ledger || []).filter((row) => row.channel === "PROVIDER_EMAIL" && row.delivery_status === "SENT");
  const measuredLatencies = state.events
    .map((event) => event.latency?.measured_ms)
    .filter((value) => Number.isFinite(Number(value)))
    .map(Number);
  const slowExecutions = state.events.filter((event) => ["LATENCY_WARN", "LATENCY_FAIL"].includes(event.latency?.status));
  const maxDuration = measuredLatencies.length ? Math.max(...measuredLatencies) : null;
  const avgDuration = measuredLatencies.length ? Math.round(measuredLatencies.reduce((sum, value) => sum + value, 0) / measuredLatencies.length) : null;
  const duplicateInteractions = state.events.filter((event) => event.duplicate_interaction?.duplicate_detected === true);
  const unknownLatency = state.events.filter((event) => event.latency?.status === "LATENCY_UNKNOWN");
  const lines = [
    "# Telegram UI Session Watch",
    "",
    `Result: ${failItems.length ? "FAIL" : "PASS"}`,
    `Label: ${state.label}`,
    `Start: ${state.started_at}`,
    `End: ${state.finished_at || "N/A"}`,
    `Workflow active: ${state.workflow_status?.workflow_active === true}`,
    `Workflow sync: ${state.workflow_sync?.workflow_in_sync === true}`,
    `Draft IDs: ${draftIds.join(", ") || "N/A"}`,
    `Execution IDs: ${executionIds.join(", ") || "N/A"}`,
    `Tokens created: ${tokenCreated}`,
    `Tokens used: ${tokenUsed}`,
    `Routes: ${unique(state.events.map((event) => event.route).filter(Boolean)).join(", ") || "N/A"}`,
    `Telegram sends: ${telegramSends.length}`,
    `Provider email sends: ${providerEmailSends.length}`,
    `Total executions: ${state.events.length}`,
    `Slow executions: ${slowExecutions.length}`,
    `Max duration ms: ${maxDuration === null ? "UNKNOWN" : maxDuration}`,
    `Avg duration ms: ${avgDuration === null ? "UNKNOWN" : avgDuration}`,
    `Unknown latency: ${unknownLatency.length}`,
    `Duplicate callbacks/interactions: ${duplicateInteractions.length}`,
    `Bugs detected: ${failures.map((item) => item.code).join(", ") || "none"}`,
    `Human steps: ${(state.human_steps || []).map((item) => item.type).join(", ") || "none"}`,
    "",
    "## Buttons",
    ...state.events.flatMap((event) => {
      const found = (event.visible_actions || []).map((button) => `${button.text}:${button.action || "unknown"}`).join(" | ") || "none";
      const latency = event.latency?.status || "LATENCY_UNKNOWN";
      const duration = event.latency?.measured_ms ?? "UNKNOWN";
      const duplicate = event.duplicate_interaction?.duplicate_detected === true ? " duplicate=true" : "";
      return [`- execution ${event.execution_id || "N/A"} draft ${event.draft_id || "N/A"} latency=${latency} duration_ms=${duration}${duplicate}: ${found}`];
    }),
    "",
    "## DB Final",
    ...draftIds.map((draftId) => {
      const snap = state.latestState[draftId]?.draft || {};
      const artifacts = state.latestState[draftId]?.runtime_artifacts || {};
      return `- ${draftId}: invoice=${snap.invoice_status || "N/A"} artifact=${snap.artifact_status || "N/A"} xml=${artifacts.xml_exists === true} pdf=${artifacts.pdf_exists === true}`;
    }),
    "",
  ];
  return lines.join("\n");
}

function unique(values) {
  return Array.from(new Set(values));
}

function writeSessionReport(state, reportDir) {
  fs.mkdirSync(reportDir, { recursive: true });
  state.finished_at = state.finished_at || new Date().toISOString();
  if (!(state.events || []).length && !(state.failures || []).some((item) => item.code === "WATCHER_NO_EXECUTIONS_CAPTURED")) {
    state.failures = state.failures || [];
    state.failures.push(warning("WATCHER_NO_EXECUTIONS_CAPTURED", "Watcher finished without captured n8n executions"));
  }
  state.pass = !(state.failures || []).some((item) => item.severity !== "WARN");
  const serializable = {
    ...state,
    draftIds: Array.from(state.draftIds || []),
    executionIds: Array.from(state.executionIds || []),
    previousDraftSnapshots: undefined,
    previousTokenSnapshots: undefined,
  };
  const safe = sanitizeReport(serializable);
  const summary = sanitizeReport(buildSummaryMarkdown(serializable));
  const files = {
    "summary.md": summary,
    "timeline.json": JSON.stringify(safe.timeline || [], null, 2) + "\n",
    "events.jsonl": (safe.events || []).map((event) => JSON.stringify(event)).join("\n") + ((safe.events || []).length ? "\n" : ""),
    "failures.json": JSON.stringify(safe.failures || [], null, 2) + "\n",
    "db-snapshots.json": JSON.stringify(safe.dbSnapshots || [], null, 2) + "\n",
    "token-snapshots.json": JSON.stringify(safe.tokenSnapshots || [], null, 2) + "\n",
    "n8n-executions.json": JSON.stringify(safe.n8nExecutions || [], null, 2) + "\n",
    "latest-state.json": JSON.stringify(safe.latestState || {}, null, 2) + "\n",
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(reportDir, name), content);
  }
  return { dir: reportDir, summary: files["summary.md"], state: safe };
}

function readExistingReport(reportDir) {
  const summaryPath = path.join(reportDir, "summary.md");
  if (!fs.existsSync(summaryPath)) throw new Error(`NOT_FOUND: summary.md no encontrado en ${reportDir}`);
  return fs.readFileSync(summaryPath, "utf8");
}

async function run(args, injected = {}) {
  loadLocalEnv();
  if (args.help) {
    printHelp();
    return { printedHelp: true };
  }
  if (args.report) {
    const summary = readExistingReport(args.report);
    if (!args.json) console.log(summary);
    return { summary };
  }

  const reportDir = injected.reportDir || reportDirFor(args.label || args.flow || "session");
  const state = createSessionState(args, reportDir);
  state.failures.push(...envFailures(state.env));

  const n8nClient = injected.n8nClient || createN8nApiClient({ env: process.env, allowRemote: args.allowRemoteN8n === true });
  const db = injected.db || createDbAccess(args);
  await runWorkflowChecks(args, state);

  if (args.last) {
    if (!args.executionId) throw new Error("NEEDS_INPUT: --execution-id requerido con --last");
    await inspectExecutionById({ n8nClient, db, args, state, executionId: args.executionId });
  } else if (args.guided) {
    await runGuided({ args, n8nClient, db, state });
  } else if (args.watch) {
    await runWatch({ args, n8nClient, db, state });
  } else {
    throw new Error("NEEDS_INPUT: usa --watch, --guided, --last o --report.");
  }

  const written = writeSessionReport(state, reportDir);
  if (args.json) console.log(JSON.stringify(written.state, null, 2));
  else if (args.markdown) console.log(written.summary);
  else {
    console.log(written.summary);
    console.log(`Report dir: ${written.dir}`);
  }
  return written;
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  run(args).catch((error) => {
    const safe = sanitizeReport({ message: error?.message || String(error), code: error?.code || null, body: error?.body || null });
    console.error(safe.message || String(error));
    if (safe.body) console.error(`body=${JSON.stringify(safe.body)}`);
    process.exitCode = 1;
  });
}

module.exports = {
  buildSummaryMarkdown,
  classifyExecution,
  createDbAccess,
  detectInteractionRisks,
  detectStateButtonFailures,
  dispatchSummary,
  envAudit,
  envFailures,
  latencyMetricsForContext,
  isProviderEmailAllowed,
  markHumanTimeout,
  parseArgs,
  redactEmail,
  redactId,
  run,
  writeSessionReport,
};

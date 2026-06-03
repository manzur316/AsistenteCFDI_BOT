"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  N8N_INGEST_URL: "http://127.0.0.1:5678/webhook/cfdi-local-ingest",
  RUNNER_OFFSET_FILE: "runtime/runner-offset.json",
  TELEGRAM_POLL_TIMEOUT_SECONDS: "25",
  TELEGRAM_POLL_LIMIT: "10",
  N8N_INGEST_TIMEOUT_MS: "60000",
  RUNNER_SECRET: "CAMBIAR_SECRET_LOCAL",
};

const TOKEN_PATTERN = /(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/g;

function parseEnvText(text) {
  const output = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[key] = value;
  }
  return output;
}

function loadEnvFile(envFilePath = ".env.local") {
  const absolutePath = path.resolve(envFilePath);
  if (!fs.existsSync(absolutePath)) return {};
  return parseEnvText(fs.readFileSync(absolutePath, "utf8"));
}

function readConfig({ env = process.env, envFilePath = ".env.local" } = {}) {
  const fileEnv = loadEnvFile(envFilePath);
  const merged = { ...DEFAULT_CONFIG, ...fileEnv, ...env };
  const telegramBotToken = String(merged.TELEGRAM_BOT_TOKEN || "").trim();
  const ingestUrl = String(merged.N8N_INGEST_URL || "").trim();
  const offsetFile = String(merged.RUNNER_OFFSET_FILE || DEFAULT_CONFIG.RUNNER_OFFSET_FILE).trim();
  const pollTimeoutSeconds = Math.max(1, Number(merged.TELEGRAM_POLL_TIMEOUT_SECONDS || 25) || 25);
  const pollLimit = Math.max(1, Math.min(100, Number(merged.TELEGRAM_POLL_LIMIT || 10) || 10));
  const ingestTimeoutMs = Math.max(1000, Number(merged.N8N_INGEST_TIMEOUT_MS || 60000) || 60000);
  const runnerSecret = String(merged.RUNNER_SECRET || "").trim();

  if (!telegramBotToken || telegramBotToken.startsWith("REEMPLAZAR")) {
    throw new Error("Configura TELEGRAM_BOT_TOKEN en .env.local. No guardes tokens reales en el repo.");
  }
  if (!ingestUrl.startsWith("http://127.0.0.1:") && !ingestUrl.startsWith("http://localhost:")) {
    throw new Error("N8N_INGEST_URL debe apuntar a localhost o 127.0.0.1.");
  }
  if (!runnerSecret || runnerSecret === "CAMBIAR_SECRET_LOCAL") {
    throw new Error("Configura RUNNER_SECRET en .env.local y en el Set Config del workflow n8n.");
  }

  return {
    telegramBotToken,
    ingestUrl,
    offsetFile,
    pollTimeoutSeconds,
    pollLimit,
    ingestTimeoutMs,
    runnerSecret,
  };
}

function ensureParentDirectory(filePath) {
  const dir = path.dirname(path.resolve(filePath));
  fs.mkdirSync(dir, { recursive: true });
}

function readOffset(offsetFile) {
  try {
    if (!fs.existsSync(offsetFile)) return 0;
    const parsed = JSON.parse(fs.readFileSync(offsetFile, "utf8"));
    const offset = Number(parsed.offset || 0);
    return Number.isFinite(offset) && offset > 0 ? Math.trunc(offset) : 0;
  } catch (_error) {
    return 0;
  }
}

function writeOffset(offsetFile, offset) {
  ensureParentDirectory(offsetFile);
  const safeOffset = Number.isFinite(Number(offset)) ? Math.trunc(Number(offset)) : 0;
  fs.writeFileSync(
    offsetFile,
    JSON.stringify({ offset: safeOffset, updated_at: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

function sanitizeText(value) {
  return String(value || "").replace(TOKEN_PATTERN, "[redacted-token]");
}

function sanitizeTelegramUrl(value) {
  return sanitizeText(value).replace(/\/bot[^/]+/g, "/bot[redacted-token]");
}

function safeErrorMessage(error) {
  if (!error) return "";
  if (typeof error === "string") return sanitizeText(error);
  return sanitizeText(error.message || String(error));
}

function isAbortError(error) {
  return Boolean(error && (error.name === "AbortError" || error.code === "ABORT_ERR"));
}

function buildGetUpdatesUrl(config, offset) {
  const url = new URL(`https://api.telegram.org/bot${config.telegramBotToken}/getUpdates`);
  if (offset > 0) url.searchParams.set("offset", String(offset));
  url.searchParams.set("timeout", String(config.pollTimeoutSeconds));
  url.searchParams.set("limit", String(config.pollLimit));
  url.searchParams.set("allowed_updates", JSON.stringify(["message", "callback_query"]));
  return url.toString();
}

async function fetchUpdates(config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("fetch nativo no disponible. Usa Node.js 22 o superior.");
  const offset = readOffset(config.offsetFile);
  const url = buildGetUpdatesUrl(config, offset);
  const response = await fetchImpl(url, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Telegram getUpdates fallo con HTTP ${response.status} en ${sanitizeTelegramUrl(url)}`);
  }
  const payload = await response.json();
  if (!payload || payload.ok !== true || !Array.isArray(payload.result)) {
    throw new Error("Telegram getUpdates no devolvio result valido.");
  }
  return payload.result;
}

async function postUpdateToN8n(update, config, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== "function") throw new Error("fetch nativo no disponible. Usa Node.js 22 o superior.");
  const timeoutMs = Math.max(1, Number(config.ingestTimeoutMs || 60000) || 60000);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetchImpl(config.ingestUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CFDI-Runner-Secret": config.runnerSecret,
      },
      body: JSON.stringify(update),
      signal: controller ? controller.signal : undefined,
    });
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: typeof response.text === "function" ? await response.text() : "",
    };
  } catch (error) {
    if (isAbortError(error)) {
      return {
        ok: false,
        status: 0,
        timedOut: true,
        text: `n8n ingest timeout despues de ${timeoutMs}ms`,
      };
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function processUpdates(updates, config, fetchImpl = globalThis.fetch, logger = console) {
  const sorted = Array.isArray(updates)
    ? updates.slice().sort((a, b) => Number(a.update_id || 0) - Number(b.update_id || 0))
    : [];
  let processed = 0;
  for (const update of sorted) {
    const updateId = Number(update && update.update_id);
    if (!Number.isFinite(updateId)) continue;
    const result = await postUpdateToN8n(update, config, fetchImpl);
    if (!result.ok) {
      const reason = result.timedOut ? `timeout ${config.ingestTimeoutMs || 60000}ms` : `HTTP ${result.status}`;
      logger.error(`n8n ingest fallo ${reason}; offset no avanza para update ${Math.trunc(updateId)}.`);
      return { processed, failed: true, failedUpdateId: Math.trunc(updateId) };
    }
    writeOffset(config.offsetFile, Math.trunc(updateId) + 1);
    processed += 1;
  }
  return { processed, failed: false };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runLoop(config = readConfig(), { fetchImpl = globalThis.fetch, logger = console } = {}) {
  let stopping = false;
  const stop = () => {
    stopping = true;
    logger.log("Runner CFDI deteniendo...");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  logger.log("Runner CFDI iniciado. Ingest local: " + config.ingestUrl);
  while (!stopping) {
    try {
      const updates = await fetchUpdates(config, fetchImpl);
      if (updates.length) logger.log(`Updates recibidos: ${updates.length}`);
      const result = await processUpdates(updates, config, fetchImpl, logger);
      if (result.failed) await delay(3000);
    } catch (error) {
      logger.error("Runner CFDI error: " + safeErrorMessage(error));
      await delay(3000);
    }
  }
}

module.exports = {
  DEFAULT_CONFIG,
  parseEnvText,
  loadEnvFile,
  readConfig,
  readOffset,
  writeOffset,
  sanitizeText,
  sanitizeTelegramUrl,
  safeErrorMessage,
  isAbortError,
  buildGetUpdatesUrl,
  fetchUpdates,
  postUpdateToN8n,
  processUpdates,
  runLoop,
};

if (require.main === module) {
  runLoop().catch((error) => {
    console.error("Runner CFDI fatal: " + safeErrorMessage(error));
    process.exitCode = 1;
  });
}

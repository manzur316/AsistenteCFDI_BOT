const fs = require("fs");
const path = require("path");

const {
  validateSandboxPdfArtifact,
  validateSandboxXmlArtifact,
} = require("./sandbox-artifact-content-validator");

const repoRoot = path.resolve(__dirname, "../..");
const runtimeRoot = path.join(repoRoot, "runtime");

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRelative(filePath) {
  const resolved = path.resolve(filePath);
  if (isInside(repoRoot, resolved)) return path.relative(repoRoot, resolved).replace(/\\/g, "/");
  return "[BLOCKED_PATH]";
}

function redactChatId(value) {
  const raw = text(value);
  if (!raw) return null;
  return `[REDACTED_CHAT_ID len=${raw.length}]`;
}

function safeTelegramDescription(value) {
  const textValue = text(value);
  if (!textValue) return null;
  return textValue
    .replace(/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
    .replace(/[A-Za-z]:[\\/][^\s|]+/g, "[redacted-path]")
    .replace(/\b-?\d{6,}\b/g, "[redacted-id]")
    .slice(0, 240);
}

function normalizeTelegramSendResult(result = {}) {
  const data = result.data && typeof result.data === "object" ? result.data : {};
  const errorCode = data.error_code || result.error_code || null;
  const description = safeTelegramDescription(data.description || result.description || result.error || result.message);
  return {
    ok: result.ok === true,
    telegram_http_status: result.status || result.telegram_http_status || null,
    telegram_error_code: errorCode,
    telegram_description_safe: description,
  };
}

function resolveRuntimeFile(filePath) {
  const raw = text(filePath);
  if (!raw) return null;
  const resolved = path.resolve(repoRoot, raw);
  if (!isInside(runtimeRoot, resolved)) return null;
  return resolved;
}

function diagnoseDocumentDeliveryConfig(env = process.env) {
  const enabled = String(env.TELEGRAM_DOCUMENT_DELIVERY_ENABLED || "0") === "1";
  const chatId = text(env.TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID);
  const token = text(env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN);
  const ready = enabled && Boolean(chatId) && Boolean(token);
  return {
    status: ready ? "OK" : "NEEDS_CONFIG",
    delivery_enabled: enabled,
    delivery_chat_id_present: Boolean(chatId),
    delivery_chat_id_redacted: redactChatId(chatId),
    telegram_token_present: Boolean(token),
    ready,
    warnings: ready ? [] : ["TELEGRAM_DOCUMENT_DELIVERY_DISABLED_OR_INCOMPLETE"],
  };
}

function validateDeliveryFiles(files = {}) {
  const xmlPath = resolveRuntimeFile(files.xml || files.xmlPath || files.xml_path);
  const pdfPath = resolveRuntimeFile(files.pdf || files.pdfPath || files.pdf_path);
  const xmlValidation = xmlPath && fs.existsSync(xmlPath)
    ? validateSandboxXmlArtifact(fs.readFileSync(xmlPath), { fileName: "cfdi.xml" })
    : { ok: false, status: "XML_FILE_MISSING", errors: ["XML_FILE_MISSING"] };
  const pdfValidation = pdfPath && fs.existsSync(pdfPath)
    ? validateSandboxPdfArtifact(fs.readFileSync(pdfPath), { fileName: "cfdi.pdf" })
    : { ok: false, status: "PDF_FILE_MISSING", errors: ["PDF_FILE_MISSING"] };
  return {
    ok: xmlValidation.ok === true && pdfValidation.ok === true,
    xml_path: xmlPath,
    pdf_path: pdfPath,
    xml_path_safe: xmlPath ? safeRelative(xmlPath) : null,
    pdf_path_safe: pdfPath ? safeRelative(pdfPath) : null,
    xml: xmlValidation,
    pdf: pdfValidation,
  };
}

async function defaultTelegramRequest({ token, chatId, filePath, caption, requestFn }) {
  if (typeof requestFn === "function") return requestFn({ token, chatId, filePath, caption });
  if (typeof fetch !== "function" || typeof FormData === "undefined" || typeof Blob === "undefined") {
    throw new Error("TELEGRAM_SEND_REQUIRES_FETCH_FORMDATA");
  }
  const body = new FormData();
  body.append("chat_id", chatId);
  if (caption) body.append("caption", caption);
  body.append("document", new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, { method: "POST", body });
  const data = await response.json().catch(() => ({}));
  return normalizeTelegramSendResult({ ok: response.ok && data.ok !== false, status: response.status, data });
}

async function sendSandboxInvoiceDocumentsToTelegram({
  chatId,
  files,
  caption,
  telegramBotToken,
  env = process.env,
  dryRun,
  requestFn,
} = {}) {
  const config = diagnoseDocumentDeliveryConfig({
    ...env,
    TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: chatId || env.TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID,
    TELEGRAM_BOT_TOKEN: telegramBotToken || env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN,
  });
  const validation = validateDeliveryFiles(files);
  const effectiveDryRun = dryRun !== false || config.ready !== true;
  if (!validation.ok) {
    return {
      status: "BLOCKED",
      ok: false,
      dry_run: true,
      delivery_ready: config.ready,
      files_valid: false,
      xml_validation_status: validation.xml.status,
      pdf_validation_status: validation.pdf.status,
      errors: ["DOCUMENT_ARTIFACT_CONTENT_INVALID"],
      warnings: config.warnings,
    };
  }
  if (effectiveDryRun) {
    return {
      status: config.ready ? "DRY_RUN" : "NEEDS_CONFIG",
      ok: config.ready,
      dry_run: true,
      delivery_ready: config.ready,
      delivery_chat_id_present: config.delivery_chat_id_present,
      telegram_token_present: config.telegram_token_present,
      files_valid: true,
      files: [
        { kind: "XML", path: validation.xml_path_safe, size_bytes: validation.xml.size_bytes, sha256: validation.xml.sha256 },
        { kind: "PDF", path: validation.pdf_path_safe, size_bytes: validation.pdf.size_bytes, sha256: validation.pdf.sha256 },
      ],
      warnings: config.warnings,
      errors: [],
    };
  }
  const token = telegramBotToken || env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_TOKEN;
  const targetChat = chatId || env.TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID;
  const results = [];
  for (const filePath of [validation.xml_path, validation.pdf_path]) {
    try {
      results.push(normalizeTelegramSendResult(await defaultTelegramRequest({ token, chatId: targetChat, filePath, caption, requestFn })));
    } catch (error) {
      results.push(normalizeTelegramSendResult({
        ok: false,
        status: null,
        error: error.message || String(error),
      }));
    }
  }
  const failed = results.filter((item) => item.ok !== true);
  return {
    status: results.every((item) => item.ok === true) ? "OK" : "ERROR",
    ok: results.every((item) => item.ok === true),
    dry_run: false,
    delivery_ready: true,
    files_valid: true,
    sent_count: results.filter((item) => item.ok === true).length,
    telegram_results: results,
    telegram_error_diagnostics: failed,
    errors: failed.length ? ["TELEGRAM_DOCUMENT_SEND_FAILED"] : [],
    warnings: [],
  };
}

module.exports = {
  diagnoseDocumentDeliveryConfig,
  normalizeTelegramSendResult,
  safeTelegramDescription,
  sendSandboxInvoiceDocumentsToTelegram,
  validateDeliveryFiles,
};

const {
  listSandboxActions,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");

function sanitizeDiagnosticText(value) {
  return String(value || "")
    .replace(/(?:bot)?\d{6,}:[A-Za-z0-9_-]{20,}/g, "[redacted-token]")
    .replace(/\b[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}\b/gi, "[redacted-rfc]")
    .replace(/[A-Za-z]:[\\/][^\s|]+/g, "[redacted-path]")
    .replace(/runtime[\\/][A-Za-z0-9_.\\/-]+/gi, "[runtime-hidden]")
    .replace(/https:\/\/api\.factura\.com/gi, "[production-url-blocked]")
    .replace(/\b(F-Api-Key|F-Secret-Key|F-PLUGIN)\s*:\s*[^\s,'"{}]+/gi, "$1: [redacted]")
    .replace(/\b(FACTURACOM_(?:API|SECRET)_KEY|FACTURACOM_PLUGIN)\s*=\s*[^\s,'"{}]+/gi, "$1=[redacted]")
    .replace(/<\?xml[\s\S]*$/i, "[xml-hidden]")
    .replace(/%PDF[\s\S]*$/i, "[pdf-hidden]")
    .replace(/\r?\n/g, " ")
    .trim()
    .slice(0, 500);
}

async function runWithCapturedOutput(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  const capturedStdout = [];
  const capturedStderr = [];

  console.log = (...args) => capturedStdout.push(args.map(String).join(" "));
  console.error = (...args) => capturedStderr.push(args.map(String).join(" "));
  process.stdout.write = (chunk, encoding, callback) => {
    capturedStdout.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };
  process.stderr.write = (chunk, encoding, callback) => {
    capturedStderr.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    if (typeof encoding === "function") encoding();
    if (typeof callback === "function") callback();
    return true;
  };

  try {
    const result = await fn();
    return {
      result,
      capturedStdout: sanitizeDiagnosticText(capturedStdout.join(" ")),
      capturedStderr: sanitizeDiagnosticText(capturedStderr.join(" ")),
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

function attachCapturedDiagnostics(result, captured) {
  const output = result && typeof result === "object" ? result : {
    ok: false,
    status: "ERROR",
    action: "UNKNOWN",
    error_class: "ACTION_RESULT_NOT_OBJECT",
    errors: ["ACTION_RESULT_NOT_OBJECT"],
    warnings: [],
    sensitive_findings: [],
    artifacts: [],
  };
  const warnings = Array.isArray(output.warnings) ? [...output.warnings] : [];
  if (captured.capturedStdout) warnings.push(`CAPTURED_STDOUT:${captured.capturedStdout}`);
  if (captured.capturedStderr) warnings.push(`CAPTURED_STDERR:${captured.capturedStderr}`);
  return {
    ...output,
    ok: output.ok === true,
    status: output.status || "ERROR",
    action: output.action || "UNKNOWN",
    error_class: output.error_class || output.error_classification || null,
    artifacts: Array.isArray(output.artifacts) ? output.artifacts : [],
    warnings,
    errors: Array.isArray(output.errors) ? output.errors : [],
    sensitive_findings: Array.isArray(output.sensitive_findings) ? output.sensitive_findings : [],
    diagnostics: {
      ...(output.diagnostics || {}),
      captured_stdout_present: Boolean(captured.capturedStdout),
      captured_stderr_present: Boolean(captured.capturedStderr),
      captured_stdout_preview: captured.capturedStdout || "",
      captured_stderr_preview: captured.capturedStderr || "",
    },
  };
}

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const auditContext = {};
  const options = {};
  const optionMap = {
    "--audit-source-kind": "source_kind",
    "--audit-chat-redacted": "chat_id_redacted",
    "--audit-user-redacted": "user_id_redacted",
    "--audit-callback-data": "callback_data",
    "--audit-command-token": "command_token",
    "--audit-workflow-version": "workflow_version",
  };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!Object.prototype.hasOwnProperty.call(optionMap, key)) continue;
    auditContext[optionMap[key]] = rest[index + 1] || "";
    index += 1;
  }
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (key === "--draft-id") {
      options.draftId = rest[index + 1] || "";
      index += 1;
    } else if (key === "--draft-json-b64") {
      options.draftJsonBase64 = rest[index + 1] || "";
      index += 1;
    } else if (key === "--idempotency-key") {
      options.idempotencyKey = rest[index + 1] || "";
      index += 1;
    } else if (key === "--client-id") {
      options.clientId = rest[index + 1] || "";
      index += 1;
    } else if (key === "--tenant-id") {
      options.tenantId = rest[index + 1] || "";
      index += 1;
    } else if (key === "--provider-client-uid") {
      options.providerClientUid = rest[index + 1] || "";
      index += 1;
    } else if (key === "--cfdi-uid") {
      options.cfdiUid = rest[index + 1] || "";
      index += 1;
    } else if (key === "--uuid") {
      options.uuid = rest[index + 1] || "";
      index += 1;
    } else if (key === "--pac-invoice-id") {
      options.pacInvoiceId = rest[index + 1] || "";
      index += 1;
    } else if (key === "--db-exec-mode") {
      options.dbExecMode = rest[index + 1] || "";
      index += 1;
    } else if (key === "--rfc") {
      options.rfc = rest[index + 1] || "";
      index += 1;
    } else if (key === "--legal-name") {
      options.legalName = rest[index + 1] || "";
      index += 1;
    } else if (key === "--fiscal-zip") {
      options.fiscalZip = rest[index + 1] || "";
      index += 1;
    } else if (key === "--fiscal-regime") {
      options.fiscalRegime = rest[index + 1] || "";
      index += 1;
    } else if (key === "--cfdi-use") {
      options.cfdiUse = rest[index + 1] || "";
      index += 1;
    } else if (key === "--validated-by-human") {
      options.validatedByHuman = true;
    } else if (key === "--create-if-missing") {
      options.createIfMissing = true;
    } else if (key === "--update-provider") {
      options.updateProvider = true;
    } else if (key === "--render-check") {
      options.renderCheck = true;
    } else if (key === "--debug-render") {
      options.debugRender = true;
    } else if (key === "--allow-legacy-receiver-uid") {
      options.allowLegacyReceiverUid = true;
    } else if (key === "--require-live-sandbox") {
      options.requireLiveSandbox = true;
    } else if (key === "--dry-run") {
      options.dryRun = true;
    } else if (key === "--send-real") {
      options.dryRun = false;
    } else if (key === "--channel") {
      options.channel = rest[index + 1] || "";
      index += 1;
    } else if (key === "--confirm-recipient") {
      options.confirmRecipient = true;
    }
  }
  return { action, auditContext, options };
}

async function main() {
  const { action, auditContext, options } = parseArgs(process.argv.slice(2));
  if (!action || action === "--help" || action === "-h") {
    console.log(JSON.stringify({
      ok: false,
      status: "ERROR",
      message: "Uso: node scripts/run-sandbox-action.js <action>",
      actions: listSandboxActions(),
    }, null, 2));
    process.exit(action ? 0 : 1);
  }
  const captured = await runWithCapturedOutput(() => runSandboxAction(action, { ...options, auditContext }));
  const result = attachCapturedDiagnostics(captured.result, captured);
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({
      ok: false,
      status: "ERROR",
      action: process.argv[2] || "UNKNOWN",
      error_class: "UNHANDLED_CLI_ERROR",
      errors: [error.message || String(error)],
      warnings: [],
      sensitive_findings: [],
      artifacts: [],
    }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  attachCapturedDiagnostics,
  parseArgs,
  runWithCapturedOutput,
  sanitizeDiagnosticText,
};

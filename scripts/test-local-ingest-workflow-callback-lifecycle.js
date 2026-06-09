const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const workflowPath = path.join(root, "workflow", "cfdi_telegram_local_ingest.n8n.json");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

function getNode(workflow, name) {
  const node = (workflow.nodes || []).find((item) => item.name === name);
  if (!node?.parameters?.jsCode) throw new Error(`No encontre nodo ${name}`);
  return node;
}

const raw = fs.readFileSync(workflowPath, "utf8");
const workflow = JSON.parse(raw);
const handleCode = getNode(workflow, "Handle Commands And Scoring").parameters.jsCode;
const summaryCode = getNode(workflow, "Build PAC Sandbox Action Summary").parameters.jsCode;

check("workflow_has_token_used_recovery_router", () => {
  assert(handleCode.includes("function tokenUsedRecoveryResult"), "token used recovery function missing");
  assert(handleCode.includes("if (validation.reason === 'token_usado') return tokenUsedRecoveryResult"), "token_usado must route to recovery");
  assert(!handleCode.includes("existingAction !== 'DOWNLOAD_SANDBOX_ARTIFACTS'"), "download-specific dead-end exception must be removed");
  return "tokenUsedRecoveryResult";
});

check("workflow_has_action_specific_recovery", () => {
  for (const expected of [
    "STAMP_DRAFT_SANDBOX",
    "DOWNLOAD_SANDBOX_ARTIFACTS",
    "DELIVERY_CONFIRM_PROVIDER_EMAIL",
    "DELIVERY_CONFIRM_TELEGRAM_CHANNEL",
    "DELIVERY_FORCE_PROVIDER_EMAIL",
    "DELIVERY_FORCE_TELEGRAM_CHANNEL",
  ]) {
    assert(handleCode.includes(expected), `${expected} missing`);
  }
  assert(handleCode.includes("draftHasDownloadedSandboxArtifacts"), "download artifact recovery helper missing");
  assert(handleCode.includes("draftDeliveryHasSent"), "delivery sent recovery helper missing");
  return "stamp/download/delivery";
});

check("stamp_result_keyboard_contains_download_and_status", () => {
  const stampKeyboardStart = handleCode.indexOf("function buildSandboxDraftStampResultKeyboard");
  const stampKeyboardEnd = handleCode.indexOf("function buildSandboxDraftCancelConfirmationKeyboard", stampKeyboardStart);
  const snippet = handleCode.slice(stampKeyboardStart, stampKeyboardEnd);
  assert(snippet.includes("DOWNLOAD_SANDBOX_ARTIFACTS"), "post-stamp download button missing");
  assert(snippet.includes("DELIVERY_STATUS"), "post-stamp delivery status button missing");
  assert(snippet.includes("cfdi_sbx:latest"), "post-stamp latest sandbox button missing");
  return "download/status/latest";
});

check("summary_records_lifecycle_response_built", () => {
  assert(summaryCode.includes("callback_lifecycle_stage: 'action_summary_built'"), "summary lifecycle stage missing");
  assert(summaryCode.includes("action_executed: true"), "action_executed missing");
  assert(summaryCode.includes("response_built: Boolean(text)"), "response_built missing");
  assert(summaryCode.includes("safeResponse.telegram_message = sanitizeText(response.telegram_message"), "telegram_message newline-preserving sanitize missing");
  return "action_summary_built";
});

check("workflow_does_not_implement_provider_sync_ux_718b", () => {
  assert(!/7\.18B|Provider Client Sync UX Prepare\/Confirm|DELIVERY_PREPARE_PROVIDER_CLIENT_SYNC/i.test(raw), "7.18B UX leaked into workflow");
  return "not implemented";
});

console.log("Local Ingest Workflow Callback Lifecycle Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

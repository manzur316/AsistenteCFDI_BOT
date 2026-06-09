const assert = require("assert");

const DISPATCH_NODES = ["Telegram editMessageText", "Telegram sendMessage", "Telegram fallback sendMessage"];

function getRunData(execution) {
  return execution?.data?.resultData?.runData
    || execution?.executionData?.resultData?.runData
    || execution?.resultData?.runData
    || execution?.runData
    || {};
}

function listExecutedNodes(execution) {
  return Object.keys(getRunData(execution));
}

function getNodeRuns(execution, nodeName) {
  const runs = getRunData(execution)[nodeName];
  return Array.isArray(runs) ? runs : [];
}

function nodeExecuted(execution, nodeName) {
  return getNodeRuns(execution, nodeName).length > 0;
}

function extractJsonItemsFromRun(run) {
  const output = [];
  const main = run?.data?.main || run?.data || [];
  const branches = Array.isArray(main) ? main : [];
  for (const branch of branches) {
    const items = Array.isArray(branch) ? branch : [];
    for (const item of items) {
      if (item && typeof item.json === "object") output.push(item.json);
    }
  }
  return output;
}

function getNodeJsonItems(execution, nodeName) {
  return getNodeRuns(execution, nodeName).flatMap(extractJsonItemsFromRun);
}

function latestNodeJson(execution, nodeName) {
  const items = getNodeJsonItems(execution, nodeName);
  return items.length ? items[items.length - 1] : null;
}

function searchJson(value, predicate) {
  if (predicate(value)) return true;
  if (Array.isArray(value)) return value.some((item) => searchJson(item, predicate));
  if (value && typeof value === "object") return Object.values(value).some((child) => searchJson(child, predicate));
  return false;
}

function hasTelegramMessage(execution) {
  return searchJson(execution, (value) => value && typeof value === "object" && typeof value.telegram_message === "string" && value.telegram_message.trim());
}

function hasReplyMarkup(execution) {
  return searchJson(execution, (value) => value && typeof value === "object" && value.reply_markup && Array.isArray(value.reply_markup.inline_keyboard));
}

function hasActionExecuted(execution) {
  return searchJson(execution, (value) => value && typeof value === "object" && value.json_debug?.callback_lifecycle?.action_executed === true);
}

function dispatchNodesExecuted(execution) {
  return DISPATCH_NODES.filter((nodeName) => nodeExecuted(execution, nodeName));
}

function assertNodeExecuted(execution, nodeName) {
  assert(nodeExecuted(execution, nodeName), `${nodeName} no ejecutado`);
}

function assertNodeNotExecuted(execution, nodeName) {
  assert(!nodeExecuted(execution, nodeName), `${nodeName} no debio ejecutarse`);
}

function assertDispatchContextPresent(execution) {
  const plan = latestNodeJson(execution, "Build Telegram Dispatch Plan");
  assert(plan, "Build Telegram Dispatch Plan no ejecutado o sin data");
  assert(plan.chat_id, "chat_id missing at dispatch plan");
  assert.strictEqual(String(plan.source_kind || ""), "CALLBACK_QUERY", "source_kind must be CALLBACK_QUERY");
  assert(plan.callback_query_id, "callback_query_id missing at dispatch plan");
  assert(plan.callback_message_id, "callback_message_id missing at dispatch plan");
}

function assertTelegramDispatchAttempted(execution) {
  const dispatched = dispatchNodesExecuted(execution);
  assert(dispatched.length > 0, "No Telegram edit/send/fallback node executed");
}

function assertTelegramDispatchOkOrExplained(execution) {
  const dispatched = dispatchNodesExecuted(execution);
  if (dispatched.length) return;
  const plan = latestNodeJson(execution, "Build Telegram Dispatch Plan");
  assert(plan?.telegram_dispatch_blocked_reason, "Telegram dispatch missing and no blocked reason recorded");
}

function assertNoSilentSuccess(execution) {
  const messageBuilt = hasTelegramMessage(execution);
  const actionExecuted = hasActionExecuted(execution) || nodeExecuted(execution, "Execute PAC Sandbox Action");
  if (!messageBuilt || !actionExecuted) return;
  const dispatched = dispatchNodesExecuted(execution);
  const plan = latestNodeJson(execution, "Build Telegram Dispatch Plan");
  assert(dispatched.length > 0 || plan?.telegram_dispatch_blocked_reason, "Silent success: action/message built but no dispatch or controlled reason");
}

function assertConfirmTokenCreated({ tokens, channel }) {
  const expected = channel === "PROVIDER_EMAIL" ? "DELIVERY_CONFIRM_PROVIDER_EMAIL" : "DELIVERY_CONFIRM_TELEGRAM_CHANNEL";
  const found = (tokens || []).find((token) => String(token.action || "").toUpperCase() === expected);
  assert(found, `${expected} not created`);
  return found;
}

function assertReplyMarkupReferencesToken({ execution, token }) {
  const expected = `cfdi:${String(token || "").trim()}`;
  assert(expected !== "cfdi:", "token requerido");
  assert(searchJson(execution, (value) => typeof value === "string" && value === expected), "reply_markup no referencia confirm token");
}

function assertDraftStatus({ draft, invoiceStatus, artifactStatus }) {
  if (invoiceStatus) assert.strictEqual(String(draft?.invoice_status || ""), invoiceStatus, "invoice_status mismatch");
  if (artifactStatus) assert.strictEqual(String(draft?.sandbox_pac_summary?.artifact_status || ""), artifactStatus, "artifact_status mismatch");
}

function analyzeExecution(execution, options = {}) {
  const nodesExecuted = listExecutedNodes(execution);
  const plan = latestNodeJson(execution, "Build Telegram Dispatch Plan");
  const summary = latestNodeJson(execution, "Build PAC Sandbox Action Summary");
  const dispatchExecuted = dispatchNodesExecuted(execution);
  const failures = [];
  const warnings = [];
  const telegramMessagePresent = hasTelegramMessage(execution);
  const replyMarkupPresent = hasReplyMarkup(execution);
  const actionExecuted = hasActionExecuted(execution) || nodeExecuted(execution, "Execute PAC Sandbox Action");
  const blockedReason = plan?.telegram_dispatch_blocked_reason || null;

  if (telegramMessagePresent && plan && !plan.chat_id) failures.push("telegram_message built but chat_id missing at Build Telegram Dispatch Plan");
  if (telegramMessagePresent && plan && plan.should_send_telegram === false && !blockedReason) failures.push("telegram_message built but should_send_telegram=false without controlled reason");
  if (telegramMessagePresent && actionExecuted && !dispatchExecuted.length && !blockedReason) failures.push("action/message built but workflow did not reach Telegram dispatch");
  if (telegramMessagePresent && actionExecuted && nodesExecuted[nodesExecuted.length - 1] === "Build Webhook Response" && !dispatchExecuted.length && !blockedReason) failures.push("workflow ended at Build Webhook Response instead of Telegram send/edit");
  if (plan && String(plan.source_kind || "") === "CALLBACK_QUERY" && !plan.callback_message_id) failures.push("callback_message_id missing at dispatch plan");
  if (plan && String(plan.source_kind || "") === "CALLBACK_QUERY" && !plan.callback_query_id) failures.push("callback_query_id missing at dispatch plan");
  if (options.confirmToken && !searchJson(execution, (value) => typeof value === "string" && value === `cfdi:${options.confirmToken}`)) failures.push("confirm token created but reply_markup does not reference it");
  if (!plan) warnings.push("Build Telegram Dispatch Plan not found");

  return {
    workflow_id: execution?.workflowId || execution?.workflow_id || execution?.workflowData?.id || null,
    execution_id: execution?.id || execution?.executionId || null,
    status: execution?.status || (execution?.finished ? "finished" : "unknown"),
    nodes_executed: nodesExecuted,
    last_node_executed: nodesExecuted[nodesExecuted.length - 1] || null,
    action_executed: actionExecuted,
    telegram_message_present: telegramMessagePresent,
    reply_markup_present: replyMarkupPresent,
    dispatch_nodes_executed: dispatchExecuted,
    telegram_dispatch_attempted: dispatchExecuted.length > 0,
    telegram_dispatch_method: dispatchExecuted[0] || plan?.telegram_dispatch_method || null,
    telegram_dispatch_payload_built: plan?.telegram_dispatch_payload_built === true,
    should_send_telegram: plan?.should_send_telegram === true,
    chat_id_present: Boolean(plan?.chat_id),
    source_kind: plan?.source_kind || null,
    callback_query_id_present: Boolean(plan?.callback_query_id),
    callback_message_id_present: Boolean(plan?.callback_message_id),
    telegram_token_present: plan?.telegram_bot_token_present === true,
    blocked_reason: blockedReason,
    failures,
    warnings,
    pass: failures.length === 0,
    build_telegram_dispatch_plan: plan || null,
    build_pac_sandbox_action_summary: summary || null,
  };
}

module.exports = {
  DISPATCH_NODES,
  analyzeExecution,
  assertConfirmTokenCreated,
  assertDispatchContextPresent,
  assertDraftStatus,
  assertNoSilentSuccess,
  assertNodeExecuted,
  assertNodeNotExecuted,
  assertReplyMarkupReferencesToken,
  assertTelegramDispatchAttempted,
  assertTelegramDispatchOkOrExplained,
  dispatchNodesExecuted,
  getNodeJsonItems,
  getRunData,
  latestNodeJson,
  listExecutedNodes,
  nodeExecuted,
};

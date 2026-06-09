const { runPsqlJson } = require("../lib/local-db-psql-runner");

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function jsonSelect(table, whereSql, orderSql = "", limitSql = "") {
  return `SELECT COALESCE(jsonb_agg(to_jsonb(t)${orderSql ? ` ${orderSql}` : ""}), '[]'::jsonb) FROM (SELECT * FROM ${table}${whereSql ? ` WHERE ${whereSql}` : ""}${orderSql ? ` ${orderSql.replace(/^ORDER BY /i, "ORDER BY ")}` : ""}${limitSql ? ` LIMIT ${Number(limitSql) || 20}` : ""}) t;`;
}

function createPostgresQaClient(options = {}) {
  const dbOptions = {
    dbExecMode: options.dbExecMode || options.execMode || (options.env || process.env).CFDI_DB_EXEC_MODE || "docker",
    env: options.env || process.env,
    execFileSync: options.execFileSync,
  };

  function queryJson(sql) {
    return runPsqlJson(sql, dbOptions);
  }

  return {
    getActionTokensByDraft(draftId) {
      return queryJson(jsonSelect("cfdi_action_tokens", `draft_id = ${sqlQuote(draftId)}`, "ORDER BY created_at DESC", 100)) || [];
    },
    getActionToken(token) {
      return queryJson(`SELECT to_jsonb(t) FROM cfdi_action_tokens t WHERE token = ${sqlQuote(token)} LIMIT 1;`);
    },
    getLatestActionTokens(chatId) {
      return queryJson(jsonSelect("cfdi_action_tokens", `chat_id = ${sqlQuote(chatId)}`, "ORDER BY created_at DESC", 80)) || [];
    },
    getDraft(draftId) {
      return queryJson(`SELECT to_jsonb(d) FROM cfdi_drafts d WHERE draft_id = ${sqlQuote(draftId)} LIMIT 1;`);
    },
    getDeliveryLedger(draftId) {
      const draft = queryJson(`SELECT jsonb_build_object('draft_id', draft_id, 'document_delivery_ledger', COALESCE(document_delivery_ledger, '[]'::jsonb), 'sandbox_pac_summary', COALESCE(sandbox_pac_summary, '{}'::jsonb)) FROM cfdi_drafts WHERE draft_id = ${sqlQuote(draftId)} LIMIT 1;`);
      return draft || {};
    },
    getDeliveryLedgerRows(draftId, options = {}) {
      const limit = Number(options.limit || 30);
      const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 30;
      return queryJson(`SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY created_at DESC), '[]'::jsonb) FROM (SELECT delivery_id, draft_id, channel, delivery_status, delivery_action, recipient_present, recipient_redacted, documents_valid, xml_content_valid, pdf_content_valid, xml_sha256, pdf_sha256, created_at, updated_at, sent_at FROM document_delivery_ledger WHERE draft_id = ${sqlQuote(draftId)} ORDER BY created_at DESC LIMIT ${safeLimit}) d;`) || [];
    },
    getDeliveryStatusByChannel(draftId, channel) {
      const rows = this.getDeliveryLedgerRows(draftId, { limit: 20 }) || [];
      const normalized = String(channel || "").trim().toUpperCase();
      const match = rows.find((row) => String(row?.channel || "").trim().toUpperCase() === normalized);
      return match || null;
    },
    getDocumentDeliverySummaryFromDraft(draftId) {
      const draft = this.getDeliveryLedger(draftId);
      const row = draft?.sandbox_pac_summary || {};
      return {
        draft_id: row.draft_id || draftId,
        invoice_status: row.invoice_status || null,
        artifact_status: row.artifact_status || null,
        documents_valid: row.documents_valid === true || (row.xml_content_valid === true && row.pdf_content_valid === true),
        telegram_document_channel: row.telegram_document_channel || null,
        provider_email: row.provider_email || null,
      };
    },
    getRecentBotEvents(chatId) {
      return queryJson(jsonSelect("bot_events", `chat_id = ${sqlQuote(chatId)}`, "ORDER BY created_at DESC", 80)) || [];
    },
    getAuthorizedChat() {
      return queryJson("SELECT to_jsonb(a) FROM cfdi_authorized_users a WHERE enabled = true ORDER BY updated_at DESC LIMIT 1;");
    },
  };
}

module.exports = {
  createPostgresQaClient,
  sqlQuote,
};

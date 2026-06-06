const childProcess = require("child_process");

const DEFAULT_CONNECTION = Object.freeze({
  host: "127.0.0.1",
  port: "5432",
  database: "cfdi_bot",
  user: "cfdi_bot_user",
});

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function connectionFromEnv(env = process.env) {
  return {
    psqlBin: env.CFDI_PSQL_BIN || env.PSQL_BIN || "psql",
    host: env.CFDI_PGHOST || env.POSTGRES_HOST || env.PGHOST || DEFAULT_CONNECTION.host,
    port: env.CFDI_PGPORT || env.POSTGRES_PORT || env.PGPORT || DEFAULT_CONNECTION.port,
    database: env.CFDI_PGDATABASE || env.POSTGRES_DB || env.PGDATABASE || DEFAULT_CONNECTION.database,
    user: env.CFDI_PGUSER || env.POSTGRES_USER || env.PGUSER || DEFAULT_CONNECTION.user,
    password: env.CFDI_PGPASSWORD || env.POSTGRES_PASSWORD || env.PGPASSWORD || "",
  };
}

function buildDraftByIdQuery(draftId) {
  const safeDraftId = sqlQuote(draftId);
  return [
    "WITH selected_draft AS (",
    "SELECT",
    "d.*,",
    "COALESCE(NULLIF(d.client_snapshot, '{}'::jsonb), to_jsonb(c), '{}'::jsonb) AS merged_client_snapshot,",
    "COALESCE((",
    "SELECT jsonb_agg(jsonb_build_object(",
    "'line_id', li.line_id,",
    "'line_number', li.line_number,",
    "'concept_id', li.concept_id,",
    "'concepto_factura', li.concepto_factura,",
    "'clave_prod_serv', li.clave_prod_serv,",
    "'clave_unidad', li.clave_unidad,",
    "'unidad', li.unidad,",
    "'family', li.family,",
    "'item_type', li.item_type,",
    "'operation_type', li.operation_type,",
    "'quantity', li.quantity,",
    "'unit_price', li.unit_price,",
    "'subtotal', li.subtotal,",
    "'iva_rate', li.iva_rate,",
    "'iva_amount', li.iva_amount,",
    "'isr_retention_rate', li.isr_retention_rate,",
    "'isr_retention_amount', li.isr_retention_amount,",
    "'iva_retention_rate', li.iva_retention_rate,",
    "'iva_retention_amount', li.iva_retention_amount,",
    "'total', li.total,",
    "'tax_mode', li.tax_mode",
    ") ORDER BY li.line_number)",
    "FROM cfdi_draft_line_items li",
    "WHERE li.draft_id = d.draft_id",
    "), '[]'::jsonb) AS line_items",
    "FROM cfdi_drafts d",
    "LEFT JOIN cfdi_clients c ON c.client_id = d.client_id",
    `WHERE d.draft_id = ${safeDraftId}`,
    ")",
    "SELECT jsonb_build_object(",
    "'draft_id', d.draft_id,",
    "'chat_id', d.chat_id,",
    "'update_id', d.update_id,",
    "'message_original', d.message_original,",
    "'status', d.status,",
    "'invoice_status', COALESCE(d.invoice_status, CASE WHEN d.status = 'PENDIENTE' THEN 'BORRADOR' ELSE d.status END),",
    "'payment_status', COALESCE(d.payment_status, 'NO_APLICA'),",
    "'action', d.action,",
    "'ready_to_copy', d.ready_to_copy,",
    "'requires_human_review', d.requires_human_review,",
    "'client_id', d.client_id,",
    "'client_snapshot', d.merged_client_snapshot,",
    "'concept', d.concept,",
    "'top_3', d.top_3,",
    "'telegram_message', d.telegram_message,",
    "'amount', d.amount,",
    "'tax_mode', d.tax_mode,",
    "'subtotal', d.subtotal,",
    "'iva_amount', d.iva_amount,",
    "'isr_retention_amount', d.isr_retention_amount,",
    "'iva_retention_amount', d.iva_retention_amount,",
    "'total', d.total,",
    "'tax_summary', d.tax_summary,",
    "'line_items', d.line_items,",
    "'blockers', COALESCE(d.tax_summary->'blockers', '[]'::jsonb)",
    ")::text",
    "FROM selected_draft d;",
  ].join(" ");
}

function parsePsqlJsonOutput(raw) {
  const line = String(raw || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  return JSON.parse(line);
}

function normalizeDraftRow(row) {
  if (!row || typeof row !== "object") return null;
  const clientSnapshot = row.client_snapshot && typeof row.client_snapshot === "object" ? row.client_snapshot : {};
  const lineItems = Array.isArray(row.line_items) ? row.line_items : [];
  const firstLine = lineItems[0] || {};
  const concept = row.concept && typeof row.concept === "object" && Object.keys(row.concept).length
    ? row.concept
    : {
        id: text(firstLine.concept_id),
        concepto_factura: text(firstLine.concepto_factura),
        clave_prod_serv: text(firstLine.clave_prod_serv),
        clave_unidad: text(firstLine.clave_unidad),
        unidad: text(firstLine.unidad),
        familia: text(firstLine.family),
        tipo: text(firstLine.item_type),
        operacion: text(firstLine.operation_type),
        objeto_imp: "02",
      };

  return {
    ...row,
    draft_id: text(row.draft_id),
    status: text(row.status),
    invoice_status: text(row.invoice_status),
    payment_status: text(row.payment_status) || "NO_APLICA",
    client_snapshot: clientSnapshot,
    client: clientSnapshot,
    concept,
    line_items: lineItems,
    amount: row.amount ?? row.subtotal ?? firstLine.subtotal ?? firstLine.unit_price ?? null,
    subtotal: row.subtotal ?? firstLine.subtotal ?? row.amount ?? null,
    iva_amount: row.iva_amount ?? firstLine.iva_amount ?? row.tax_summary?.iva_transferred ?? null,
    isr_retention_amount: row.isr_retention_amount ?? firstLine.isr_retention_amount ?? row.tax_summary?.isr_retained ?? 0,
    iva_retention_amount: row.iva_retention_amount ?? firstLine.iva_retention_amount ?? row.tax_summary?.iva_retained ?? 0,
    total: row.total ?? firstLine.total ?? null,
    tax_mode: text(row.tax_mode || firstLine.tax_mode),
    blockers: Array.isArray(row.blockers) ? row.blockers : [],
  };
}

function loadDraftFromPostgres(draftId, options = {}) {
  const safeDraftId = text(draftId);
  if (!safeDraftId) return null;
  const config = {
    ...connectionFromEnv(options.env || process.env),
    ...options,
  };
  const env = { ...process.env, PGCONNECT_TIMEOUT: "8" };
  if (config.password) env.PGPASSWORD = config.password;
  const args = [
    "-w",
    "-h", String(config.host),
    "-p", String(config.port),
    "-d", String(config.database),
    "-U", String(config.user),
    "-At",
    "-F", "",
    "-c", buildDraftByIdQuery(safeDraftId),
  ];
  const execFileSync = options.execFileSync || childProcess.execFileSync;
  try {
    const raw = execFileSync(config.psqlBin || "psql", args, {
      env,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    return normalizeDraftRow(parsePsqlJsonOutput(raw));
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    const message = stderr || error.message || "psql failed";
    const wrapped = new Error(`DRAFT_DB_LOAD_FAILED: ${message}`);
    wrapped.code = "DRAFT_DB_LOAD_FAILED";
    throw wrapped;
  }
}

module.exports = {
  DEFAULT_CONNECTION,
  buildDraftByIdQuery,
  connectionFromEnv,
  loadDraftFromPostgres,
  normalizeDraftRow,
  parsePsqlJsonOutput,
};

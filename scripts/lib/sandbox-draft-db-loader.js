const {
  DEFAULT_CONNECTION,
  connectionFromEnv,
  runPsqlRaw,
} = require("./local-db-psql-runner");


function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function sqlQuote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildDraftByIdQuery(draftId) {
  const safeDraftId = sqlQuote(draftId);
  return [
    "WITH selected_draft AS (",
    "SELECT",
    "d.*,",
    "COALESCE(to_jsonb(c), '{}'::jsonb) AS current_client,",
    "COALESCE(d.client_snapshot, '{}'::jsonb) AS historical_client_snapshot,",
    "CASE WHEN d.client_id IS NULL OR c.client_id IS NOT NULL THEN true ELSE false END AS client_found,",
    "COALESCE(to_jsonb(c), NULLIF(d.client_snapshot, '{}'::jsonb), '{}'::jsonb) AS merged_client_snapshot,",
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
    ", COALESCE(pcl.provider_client_link, '{}'::jsonb) AS provider_client_link",
    "FROM cfdi_drafts d",
    "LEFT JOIN cfdi_clients c ON c.client_id = d.client_id",
    "LEFT JOIN LATERAL (",
    "SELECT jsonb_build_object(",
    "'provider_client_link_id', provider_client_link_id,",
    "'tenant_id', tenant_id,",
    "'client_id', client_id,",
    "'provider', provider,",
    "'environment', environment,",
    "'provider_client_uid', provider_client_uid,",
    "'provider_client_uid_present', provider_client_uid IS NOT NULL,",
    "'sync_status', sync_status,",
    "'provider_response_sanitized', provider_response_sanitized,",
    "'last_sync_at', last_sync_at",
    ") AS provider_client_link",
    "FROM provider_client_links",
    "WHERE tenant_id = COALESCE(to_jsonb(d)->>'tenant_id', 'TENANT_PERSONAL_DEFAULT')",
    "AND client_id = d.client_id",
    "AND provider = 'factura_com'",
    "AND environment = 'SANDBOX'",
    "ORDER BY last_sync_at DESC NULLS LAST, created_at DESC",
    "LIMIT 1",
    ") pcl ON true",
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
    "'sandbox_pac_summary', COALESCE(to_jsonb(d)->'sandbox_pac_summary', '{}'::jsonb),",
    "'action', d.action,",
    "'ready_to_copy', d.ready_to_copy,",
    "'requires_human_review', d.requires_human_review,",
    "'client_id', d.client_id,",
    "'client_found', d.client_found,",
    "'current_client', d.current_client,",
    "'historical_client_snapshot', d.historical_client_snapshot,",
    "'client_snapshot', d.merged_client_snapshot,",
    "'provider_client_link', d.provider_client_link,",
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
  const currentClient = row.current_client && typeof row.current_client === "object" ? row.current_client : clientSnapshot;
  const historicalClientSnapshot = row.historical_client_snapshot && typeof row.historical_client_snapshot === "object" ? row.historical_client_snapshot : {};
  const lineItems = Array.isArray(row.line_items) ? row.line_items : [];
  const providerClientLink = row.provider_client_link && typeof row.provider_client_link === "object"
    ? row.provider_client_link
    : {};
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
    client_found: row.client_found !== false,
    current_client: currentClient,
    historical_client_snapshot: historicalClientSnapshot,
    client_snapshot: clientSnapshot,
    client: currentClient,
    provider_client_link: providerClientLink,
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
  try {
    const raw = runPsqlRaw(buildDraftByIdQuery(safeDraftId), options);
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

const { runPsqlRaw } = require("./lib/local-db-psql-runner");
const { normalizeProviderInvoiceIdentity } = require("./lib/provider-contracts/provider-invoice-identity.contract");

const CATEGORY_KEYS = Object.freeze([
  "HAS_PROVIDER_FOLIO",
  "HAS_SERIE_AND_FOLIO",
  "NO_FOLIO_HAS_UUID",
  "NO_FOLIO_HAS_PROVIDER_ID",
  "FALLBACK_FAC_SBX",
  "SANDBOX_ERROR",
  "DOWNLOAD_ERROR",
  "MOCK_OR_LEGACY_SUSPECT",
  "INCOMPLETE_PROVIDER_IDENTITY",
]);

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = { dryRun: true, json: false, limit: 100, fixtureRows: null };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") args.dryRun = true;
    else if (key === "--json") args.json = true;
    else if (key === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else if (key === "--fixture-json") {
      args.fixtureRows = JSON.parse(argv[index + 1] || "[]");
      index += 1;
    }
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) args.limit = 100;
  args.limit = Math.min(500, Math.trunc(args.limit));
  return args;
}

function hasDbConfig(env = process.env) {
  return Boolean(
    env.CFDI_DB_EXEC_MODE
      || env.CFDI_PG_DOCKER_CONTAINER
      || env.CFDI_PGHOST
      || env.CFDI_PGPORT
      || env.CFDI_PGDATABASE
      || env.CFDI_PGUSER
      || env.CFDI_PGPASSWORD
      || env.POSTGRES_HOST
      || env.POSTGRES_PORT
      || env.POSTGRES_DB
      || env.POSTGRES_USER
      || env.PGHOST
      || env.PGPORT
      || env.PGDATABASE
      || env.PGUSER
      || env.PGPASSWORD
  );
}

function sqlLimit(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.min(500, Math.trunc(number)) : 100;
}

function buildInvoiceIdentityQualityReadOnlySql(limit = 100) {
  const safeLimit = sqlLimit(limit);
  return [
    "SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb)::text FROM (",
    "SELECT jsonb_build_object(",
    "'draft_id', COALESCE(pil.draft_id, d.draft_id),",
    "'provider_invoice_link_id', pil.provider_invoice_link_id,",
    "'provider_invoice_id', pil.provider_invoice_id,",
    "'provider_invoice_uid', pil.provider_invoice_uid,",
    "'uuid', pil.uuid,",
    "'serie', pil.serie,",
    "'folio', pil.folio,",
    "'provider', pil.provider,",
    "'environment', pil.environment,",
    "'provider_status', pil.provider_status,",
    "'invoice_status', COALESCE(pil.invoice_status, to_jsonb(d)->>'invoice_status', d.sandbox_pac_summary->>'invoice_status'),",
    "'payment_status', COALESCE(pil.payment_status_local, to_jsonb(d)->>'payment_status'),",
    "'artifact_status', COALESCE(d.sandbox_pac_summary->>'artifact_status', ''),",
    "'xml_downloaded', COALESCE(pil.xml_downloaded, CASE WHEN lower(COALESCE(d.sandbox_pac_summary->>'xml_downloaded', 'false')) = 'true' THEN true ELSE false END, false),",
    "'pdf_downloaded', COALESCE(pil.pdf_downloaded, CASE WHEN lower(COALESCE(d.sandbox_pac_summary->>'pdf_downloaded', 'false')) = 'true' THEN true ELSE false END, false),",
    "'sandbox_pac_summary', COALESCE(d.sandbox_pac_summary, '{}'::jsonb)",
    ") AS row_json",
    "FROM provider_invoice_links pil",
    "FULL OUTER JOIN cfdi_drafts d ON d.draft_id = pil.draft_id",
    "WHERE COALESCE(pil.draft_id, d.draft_id) IS NOT NULL",
    "ORDER BY COALESCE(pil.last_sync_at, pil.created_at, d.updated_at, d.created_at) DESC NULLS LAST",
    `LIMIT ${safeLimit}`,
    ") rows;",
  ].join(" ");
}

function parsePsqlJsonArray(raw) {
  const line = String(raw || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return [];
  const parsed = JSON.parse(line);
  return Array.isArray(parsed) ? parsed : [];
}

function isLocalTechnicalIdentity(value) {
  const raw = text(value);
  return Boolean(raw && (/^DRAFT-/i.test(raw) || /^SANDBOX-INV-DRAFT-/i.test(raw) || /DRAFT-[0-9A-Za-z_-]+/i.test(raw)));
}

function isPlaceholderIdentityValue(value) {
  const raw = text(value);
  if (!raw) return true;
  const upper = raw.toUpperCase();
  const compact = upper.replace(/[^A-Z0-9]+/g, "");
  if (isLocalTechnicalIdentity(raw)) return true;
  if (["NULL", "UNDEFINED", "N/A", "NA", "NO_APLICA", "NOAPLICA", "SIN_UUID", "SINUUID", "SIN_FOLIO", "SINFOLIO", "DUMMY", "TEST"].includes(upper) || ["NOAPLICA", "SINUUID", "SINFOLIO"].includes(compact)) return true;
  if (upper === "00000000" || upper === "UUID-00000000") return true;
  if (/^0{8}-0{4}-0{4}-0{4}-0{12}$/i.test(raw)) return true;
  if (/^0{8}-/i.test(raw) || /^UUID-0{8}/i.test(raw)) return true;
  return false;
}

function identityText(value) {
  const raw = text(value);
  return raw && !isPlaceholderIdentityValue(raw) ? raw : null;
}

function normalizedIdentityFromRow(row = {}) {
  const summary = row.sandbox_pac_summary && typeof row.sandbox_pac_summary === "object" ? row.sandbox_pac_summary : {};
  return normalizeProviderInvoiceIdentity({
    local_draft_id: row.draft_id,
    provider_name: row.provider || summary.provider || "Factura.com Sandbox",
    provider_environment: row.environment || summary.environment || "SANDBOX",
    provider_invoice_id: row.provider_invoice_id || summary.pac_invoice_id || summary.provider_invoice_id,
    provider_invoice_uid: row.provider_invoice_uid || summary.cfdi_uid || summary.provider_invoice_uid,
    provider_folio: row.folio || summary.folio,
    provider_serie: row.serie || summary.serie,
    provider_uuid: row.uuid || summary.uuid || summary.cfdi_uuid,
    provider_status: row.provider_status || summary.status,
    local_status: row.invoice_status || summary.invoice_status,
    payment_status: row.payment_status,
    artifact_status: row.artifact_status || summary.artifact_status,
    xml_downloaded: row.xml_downloaded === true || summary.xml_downloaded === true,
    pdf_downloaded: row.pdf_downloaded === true || summary.pdf_downloaded === true,
    require_provider_identity: String(row.invoice_status || summary.invoice_status || "").toUpperCase() === "SANDBOX_TIMBRADO",
  });
}

function classifyInvoiceIdentityQuality(row = {}) {
  const identity = normalizedIdentityFromRow(row);
  const invoiceStatus = String(row.invoice_status || row.sandbox_pac_summary?.invoice_status || identity.local_status || "").toUpperCase();
  const artifactStatus = String(row.artifact_status || row.sandbox_pac_summary?.artifact_status || identity.artifact_status || "").toUpperCase();
  const folio = identityText(identity.provider_folio);
  const serie = identityText(identity.provider_serie);
  const uuid = identityText(identity.provider_uuid);
  const providerId = identityText(identity.provider_invoice_id);
  const providerUid = identityText(identity.provider_invoice_uid);
  const categories = [];

  if (folio) categories.push("HAS_PROVIDER_FOLIO");
  if (serie && folio) categories.push("HAS_SERIE_AND_FOLIO");
  if (!folio && uuid) categories.push("NO_FOLIO_HAS_UUID");
  if (!folio && !uuid && (providerId || providerUid)) categories.push("NO_FOLIO_HAS_PROVIDER_ID");
  if (!folio && !uuid && !providerId && !providerUid) categories.push("FALLBACK_FAC_SBX");
  if (invoiceStatus === "SANDBOX_ERROR") categories.push("SANDBOX_ERROR");
  if (artifactStatus === "DOWNLOAD_ERROR") categories.push("DOWNLOAD_ERROR");

  const suspectValues = [row.provider_invoice_id, row.provider_invoice_uid, row.uuid, row.folio, row.serie, row.sandbox_pac_summary?.pac_invoice_id, row.sandbox_pac_summary?.cfdi_uid]
    .map(text)
    .filter(Boolean);
  if (suspectValues.some((value) => isLocalTechnicalIdentity(value) || /MOCK|DUMMY|SANDBOX-INV-DRAFT/i.test(value))) {
    categories.push("MOCK_OR_LEGACY_SUSPECT");
  }
  if (invoiceStatus === "SANDBOX_TIMBRADO" && !folio && !uuid && !providerId && !providerUid) {
    categories.push("INCOMPLETE_PROVIDER_IDENTITY");
  }

  return {
    categories: Array.from(new Set(categories)),
    identity,
    sample: sanitizeSample(row, identity),
  };
}

function redactDraftId(value) {
  const raw = text(value);
  if (!raw) return null;
  const digits = (raw.match(/\d/g) || []).join("");
  const suffix = digits ? digits.slice(-4).padStart(4, "0") : raw.replace(/[^A-Za-z0-9]/g, "").slice(-4).toUpperCase().padStart(4, "0");
  return `DRAFT-...${suffix}`;
}

function redactUuid(value) {
  const raw = identityText(value);
  return raw ? `UUID-${raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}` : null;
}

function sanitizeSample(row, identity) {
  return {
    draft_ref: redactDraftId(row.draft_id || identity.local_draft_id),
    display_id: identity.ui_display_id,
    folio: identity.provider_folio || null,
    serie: identity.provider_serie || null,
    uuid_short: redactUuid(identity.provider_uuid),
    provider_id_present: Boolean(identity.provider_invoice_id),
    provider_uid_present: Boolean(identity.provider_invoice_uid),
    invoice_status: row.invoice_status || identity.local_status || null,
    artifact_status: row.artifact_status || identity.artifact_status || null,
  };
}

function buildInvoiceIdentityQualityAudit(rows = []) {
  const counts = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]));
  const samples = {};
  const entries = rows.map((row) => {
    const classified = classifyInvoiceIdentityQuality(row);
    for (const category of classified.categories) {
      counts[category] = (counts[category] || 0) + 1;
      if (!samples[category]) samples[category] = classified.sample;
    }
    return classified;
  });
  return {
    ok: true,
    dry_run: true,
    total: rows.length,
    counts,
    samples,
    entries,
  };
}

function sanitizeAuditForOutput(audit) {
  return {
    ok: audit.ok === true,
    dry_run: true,
    total: audit.total || 0,
    counts: audit.counts || Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0])),
    samples: audit.samples || {},
    warnings: audit.warnings || [],
  };
}

function loadRows(options = {}) {
  if (Array.isArray(options.fixtureRows)) return { rows: options.fixtureRows, warnings: [] };
  if (!hasDbConfig(options.env || process.env) && !options.forceDbRead) {
    return { rows: [], warnings: ["DB_CONFIG_NOT_DETECTED_DRY_RUN_EMPTY"] };
  }
  const raw = runPsqlRaw(buildInvoiceIdentityQualityReadOnlySql(options.limit), {
    env: options.env || process.env,
    dbConfig: options.dbConfig,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    dockerContainer: options.dockerContainer,
    execFileSync: options.execFileSync,
  });
  return { rows: parsePsqlJsonArray(raw), warnings: [] };
}

function runInvoiceIdentityQualityAudit(options = {}) {
  const args = { ...parseArgs([]), ...options };
  const loaded = loadRows(args);
  const audit = buildInvoiceIdentityQualityAudit(loaded.rows);
  audit.warnings = loaded.warnings;
  return sanitizeAuditForOutput(audit);
}

function printTextReport(audit) {
  console.log("Provider invoice identity quality audit");
  console.log("Modo: dry-run/read-only");
  console.log(`Total facturas analizadas: ${audit.total}`);
  console.log(`Con folio proveedor: ${audit.counts.HAS_PROVIDER_FOLIO}`);
  console.log(`Con serie+folio: ${audit.counts.HAS_SERIE_AND_FOLIO}`);
  console.log(`Sin folio pero con UUID: ${audit.counts.NO_FOLIO_HAS_UUID}`);
  console.log(`Sin folio pero con provider id: ${audit.counts.NO_FOLIO_HAS_PROVIDER_ID}`);
  console.log(`Fallback FAC-SBX: ${audit.counts.FALLBACK_FAC_SBX}`);
  console.log(`SANDBOX_ERROR: ${audit.counts.SANDBOX_ERROR}`);
  console.log(`DOWNLOAD_ERROR: ${audit.counts.DOWNLOAD_ERROR}`);
  console.log(`Mock/legacy sospechoso: ${audit.counts.MOCK_OR_LEGACY_SUSPECT}`);
  console.log(`Identidad proveedor incompleta: ${audit.counts.INCOMPLETE_PROVIDER_IDENTITY}`);
  if ((audit.warnings || []).length) console.log(`Warnings: ${audit.warnings.join(", ")}`);
}

function main() {
  const args = parseArgs();
  const audit = runInvoiceIdentityQualityAudit(args);
  if (args.json) console.log(JSON.stringify(audit, null, 2));
  else printTextReport(audit);
}

if (require.main === module) main();

module.exports = {
  CATEGORY_KEYS,
  buildInvoiceIdentityQualityAudit,
  buildInvoiceIdentityQualityReadOnlySql,
  classifyInvoiceIdentityQuality,
  parseArgs,
  runInvoiceIdentityQualityAudit,
  sanitizeAuditForOutput,
};

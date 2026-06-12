const fs = require("fs");
const path = require("path");

const { runPsqlRaw } = require("./lib/local-db-psql-runner");
const {
  buildProviderInvoiceIdentityBackfillPlan,
  sanitizeBackfillPlanForOutput,
} = require("./lib/provider-contracts/provider-contract-index");

const repoRoot = path.resolve(__dirname, "..");

/*
Backfill source priority:
1. cfdi_drafts.sandbox_pac_summary is the primary source because it is the
   persisted provider stamp/download summary.
2. JSON manifests can fill missing identity/document flags, but do not replace
   non-null DB values.
3. provider_invoice_links, when present, is used only to classify INSERT,
   UPDATE or SKIP_ALREADY_COMPLETE.

Minimum useful identity:
- draft_id plus at least one provider identity field: folio, uuid, cfdi_uid or
  pac_invoice_id.

Missing folio:
- backfill may still plan UPDATE/INSERT if UUID or provider id exists, but it
  emits PROVIDER_FOLIO_MISSING for post-stamped drafts.

Existing rows:
- idempotency is delegated to buildProviderInvoiceLinkPersistencePlan(), which
  uses UPDATE then INSERT WHERE NOT EXISTS for the current schema.
*/

function text(value) {
  const cleaned = String(value ?? "").trim();
  return cleaned || null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dryRun: true,
    apply: false,
    confirmed: false,
    json: false,
    limit: null,
    fixturePath: null,
    manifestRoot: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (key === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else if (key === "--yes-i-understand-this-mutates-db") {
      args.confirmed = true;
    } else if (key === "--json") {
      args.json = true;
    } else if (key === "--limit") {
      args.limit = Number(argv[index + 1]);
      index += 1;
    } else if (key === "--fixture") {
      args.fixturePath = argv[index + 1] || "";
      index += 1;
    } else if (key === "--manifest-root") {
      args.manifestRoot = argv[index + 1] || "";
      index += 1;
    }
  }
  if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = null;
  return args;
}

function safeBasename(value) {
  const raw = text(value);
  if (!raw) return null;
  if (/(secret|token|password|api[_-]?key|authorization|bearer)/i.test(raw)) return "[path-redacted]";
  return raw.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "[path-redacted]";
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

function buildBackfillDraftRowsReadOnlySql(limit = null) {
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.floor(Number(limit)) : 100;
  return [
    "SELECT COALESCE(jsonb_agg(row_json), '[]'::jsonb)::text FROM (",
    "SELECT jsonb_build_object(",
    "'tenant_id', COALESCE(to_jsonb(d)->>'tenant_id', 'TENANT_PERSONAL_DEFAULT'),",
    "'draft_id', d.draft_id,",
    "'client_id', to_jsonb(d)->>'client_id',",
    "'invoice_status', to_jsonb(d)->>'invoice_status',",
    "'payment_status', to_jsonb(d)->>'payment_status',",
    "'artifact_status', COALESCE(d.sandbox_pac_summary->>'artifact_status', ''),",
    "'sandbox_pac_summary', COALESCE(d.sandbox_pac_summary, '{}'::jsonb),",
    "'provider_invoice_link', CASE WHEN pil.provider_invoice_link_id IS NULL THEN NULL ELSE jsonb_build_object(",
    "'provider_invoice_link_id', pil.provider_invoice_link_id,",
    "'tenant_id', pil.tenant_id,",
    "'draft_id', pil.draft_id,",
    "'provider', pil.provider,",
    "'environment', pil.environment,",
    "'provider_invoice_id', pil.provider_invoice_id,",
    "'provider_invoice_uid', pil.provider_invoice_uid,",
    "'uuid', pil.uuid,",
    "'serie', pil.serie,",
    "'folio', pil.folio,",
    "'xml_downloaded', pil.xml_downloaded,",
    "'pdf_downloaded', pil.pdf_downloaded",
    ") END",
    ") AS row_json",
    "FROM cfdi_drafts d",
    "LEFT JOIN LATERAL (",
    "SELECT * FROM provider_invoice_links pil",
    "WHERE pil.tenant_id = COALESCE(to_jsonb(d)->>'tenant_id', 'TENANT_PERSONAL_DEFAULT')",
    "AND pil.draft_id = d.draft_id",
    "AND pil.provider = CASE WHEN lower(COALESCE(NULLIF(d.sandbox_pac_summary->>'provider', ''), 'factura_com')) LIKE '%factura%' THEN 'factura_com' ELSE COALESCE(NULLIF(d.sandbox_pac_summary->>'provider', ''), 'factura_com') END",
    "AND pil.environment = COALESCE(NULLIF(d.sandbox_pac_summary->>'environment', ''), 'SANDBOX')",
    "ORDER BY pil.last_sync_at DESC NULLS LAST, pil.created_at DESC",
    "LIMIT 1",
    ") pil ON true",
    "WHERE COALESCE(to_jsonb(d)->>'invoice_status', d.sandbox_pac_summary->>'invoice_status', '') = 'SANDBOX_TIMBRADO'",
    "AND COALESCE(d.sandbox_pac_summary, '{}'::jsonb) <> '{}'::jsonb",
    "AND (",
    "NULLIF(d.sandbox_pac_summary->>'folio', '') IS NOT NULL OR",
    "NULLIF(d.sandbox_pac_summary->>'serie', '') IS NOT NULL OR",
    "NULLIF(d.sandbox_pac_summary->>'uuid', '') IS NOT NULL OR",
    "NULLIF(d.sandbox_pac_summary->>'cfdi_uid', '') IS NOT NULL OR",
    "NULLIF(d.sandbox_pac_summary->>'pac_invoice_id', '') IS NOT NULL OR",
    "COALESCE(d.sandbox_pac_summary->>'artifact_status', '') IN ('DOWNLOAD_READY', 'DOWNLOADED')",
    ")",
    "ORDER BY COALESCE(to_jsonb(d)->>'updated_at', '') DESC",
    `LIMIT ${safeLimit}`,
    ") rows;",
  ].join(" ");
}

function parseJsonArray(raw) {
  const line = String(raw || "")
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return [];
  const value = JSON.parse(line);
  return Array.isArray(value) ? value : [];
}

function loadFixture(filePath) {
  const resolved = path.resolve(filePath);
  const fixture = JSON.parse(fs.readFileSync(resolved, "utf8"));
  return {
    draftRows: Array.isArray(fixture.draftRows) ? fixture.draftRows : [],
    manifests: Array.isArray(fixture.manifests) ? fixture.manifests : [],
  };
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function findJsonManifestFiles(root, limit = 1000) {
  const resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) return [];
  const out = [];
  const stack = [resolvedRoot];
  while (stack.length && out.length < limit) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && /manifest.*\.json$|.*manifest\.json$/i.test(entry.name)) {
        out.push(fullPath);
        if (out.length >= limit) break;
      }
    }
  }
  return out.sort();
}

function loadManifests(manifestRoot, limit = 1000) {
  if (!manifestRoot) return [];
  const files = findJsonManifestFiles(manifestRoot, limit);
  const resolvedRoot = path.resolve(manifestRoot);
  return files.map((filePath) => {
    try {
      const manifest = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const ref = isInside(repoRoot, filePath)
        ? path.relative(repoRoot, filePath).replace(/\\/g, "/")
        : safeBasename(path.relative(resolvedRoot, filePath));
      return { ...manifest, _manifest_path: ref };
    } catch (_error) {
      return null;
    }
  }).filter(Boolean);
}

function loadDraftRowsFromDb(options = {}) {
  if (!hasDbConfig(options.env || process.env) && !options.forceDbRead) {
    return { draftRows: [], warnings: ["DB_CONFIG_NOT_DETECTED_DRY_RUN_EMPTY"] };
  }
  const sql = buildBackfillDraftRowsReadOnlySql(options.limit);
  const raw = runPsqlRaw(sql, {
    env: options.env || process.env,
    dbConfig: options.dbConfig,
    dbExecMode: options.dbExecMode,
    execMode: options.execMode,
    pgDockerContainer: options.pgDockerContainer,
    dockerContainer: options.dockerContainer,
    execFileSync: options.execFileSync,
  });
  return { draftRows: parseJsonArray(raw), warnings: [] };
}

function applyBackfillPlan(plan, options = {}) {
  const entries = (plan.entries || []).filter((entry) => entry.sql && (entry.action === "INSERT" || entry.action === "UPDATE"));
  let applied = 0;
  for (const entry of entries) {
    runPsqlRaw(entry.sql, {
      env: options.env || process.env,
      dbConfig: options.dbConfig,
      dbExecMode: options.dbExecMode,
      execMode: options.execMode,
      pgDockerContainer: options.pgDockerContainer,
      dockerContainer: options.dockerContainer,
      execFileSync: options.execFileSync,
    });
    applied += 1;
  }
  return { applied };
}

function runBackfillProviderInvoiceLinks(options = {}) {
  const args = {
    ...parseArgs([]),
    ...options,
  };
  if (args.apply === true && args.confirmed !== true) {
    return {
      ok: false,
      status: "ABORTED",
      dry_run: false,
      error_class: "APPLY_CONFIRMATION_REQUIRED",
      message: "Use --apply --yes-i-understand-this-mutates-db para mutar DB.",
    };
  }

  const fixture = args.fixturePath ? loadFixture(args.fixturePath) : { draftRows: [], manifests: [] };
  const dbLoad = args.fixturePath ? { draftRows: [], warnings: [] } : loadDraftRowsFromDb(args);
  const manifests = [
    ...fixture.manifests,
    ...loadManifests(args.manifestRoot, args.limit || 1000),
  ];
  const draftRows = [
    ...fixture.draftRows,
    ...dbLoad.draftRows,
  ];
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows,
    manifests,
    limit: args.limit,
    dryRun: args.apply !== true,
  });
  plan.warnings = Array.from(new Set([...(plan.warnings || []), ...(dbLoad.warnings || [])]));
  plan.warnings_count = plan.warnings.length;
  let applyResult = { applied: 0 };
  if (args.apply === true) applyResult = applyBackfillPlan(plan, args);
  return {
    ok: true,
    status: args.apply === true ? "APPLIED" : "DRY_RUN",
    dry_run: args.apply !== true,
    source: {
      draft_rows: draftRows.length,
      manifests: manifests.length,
      manifest_root: args.manifestRoot ? safeBasename(args.manifestRoot) : null,
    },
    apply: applyResult,
    plan,
    summary: sanitizeBackfillPlanForOutput(plan),
  };
}

function printText(result) {
  if (result.ok !== true) {
    console.log(`Provider invoice identity backfill: ${result.status}`);
    console.log(result.message || result.error_class || "Error");
    return;
  }
  const summary = result.summary;
  console.log(`Provider invoice identity backfill ${result.status}`);
  console.log(`Dry run: ${result.dry_run ? "yes" : "no"}`);
  console.log(`Candidates: ${summary.candidates_found}`);
  console.log(`Planned inserts: ${summary.inserts_planned}`);
  console.log(`Planned updates: ${summary.updates_planned}`);
  console.log(`Skip no identity: ${summary.skips_no_identity}`);
  console.log(`Skip already complete: ${summary.skips_already_complete}`);
  console.log(`Warnings: ${summary.warnings_count}`);
  for (const candidate of summary.candidates.slice(0, 20)) {
    console.log([
      candidate.action,
      candidate.ui_display_id || "NO_DISPLAY",
      candidate.identity_confidence,
      candidate.xml_downloaded ? "xml" : "no-xml",
      candidate.pdf_downloaded ? "pdf" : "no-pdf",
    ].join(" | "));
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runBackfillProviderInvoiceLinks(args);
  if (args.json) {
    console.log(JSON.stringify(result.ok ? {
      ...result.summary,
      status: result.status,
      dry_run: result.dry_run,
      source: result.source,
      apply: result.apply,
    } : result, null, 2));
  } else {
    printText(result);
  }
  if (result.ok !== true) process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  applyBackfillPlan,
  buildBackfillDraftRowsReadOnlySql,
  findJsonManifestFiles,
  hasDbConfig,
  loadManifests,
  parseArgs,
  runBackfillProviderInvoiceLinks,
};

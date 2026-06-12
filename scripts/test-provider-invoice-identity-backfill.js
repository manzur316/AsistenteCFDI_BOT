const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  BACKFILL_ACTIONS,
  buildBackfillCandidateFromDraftRow,
  buildBackfillCandidateFromManifest,
  buildProviderInvoiceIdentityBackfillPlan,
  dedupeBackfillCandidates,
  mergeDraftSummaryAndManifestIdentity,
  sanitizeBackfillPlanForOutput,
} = require("./lib/provider-contracts/provider-contract-index");
const {
  buildBackfillDraftRowsReadOnlySql,
  parseArgs,
  runBackfillProviderInvoiceLinks,
} = require("./backfill-provider-invoice-links");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-provider-invoice-identity-backfill");
fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const uuid = "12345678-1234-4000-8000-1234567890ab";
const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function draftRow(extra = {}) {
  const { sandbox_pac_summary: sandboxOverride, ...rest } = extra;
  return {
    tenant_id: "TENANT_PERSONAL_DEFAULT",
    draft_id: "DRAFT-BACKFILL-5412",
    client_id: "CLIENT-DEMO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    sandbox_pac_summary: {
      provider: "Factura.com Sandbox",
      environment: "SANDBOX",
      artifact_status: "DOWNLOAD_READY",
      folio: "F66",
      serie: "A",
      uuid,
      cfdi_uid: "CFDIUID716",
      pac_invoice_id: "PACINV716",
      ...(sandboxOverride || {}),
    },
    ...rest,
  };
}

function manifest(extra = {}) {
  return {
    draft_id: "DRAFT-BACKFILL-5412",
    client_id: "CLIENT-DEMO",
    provider: "Factura.com Sandbox",
    environment: "SANDBOX",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    artifact_status: "DOWNLOADED",
    folio: "F66",
    serie: "A",
    uuid,
    cfdi_uid: "CFDIUID716",
    pac_invoice_id: "PACINV716",
    manifest_path: "runtime/storage-sandbox/demo/sandbox-download-manifest.json",
    ...extra,
  };
}

function fixturePath(fixture) {
  const filePath = path.join(tempRoot, `fixture-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  return filePath;
}

check("candidate_from_sandbox_pac_summary_folio", () => {
  const candidate = buildBackfillCandidateFromDraftRow(draftRow({ sandbox_pac_summary: { folio: "F66" } }));
  const plan = buildProviderInvoiceIdentityBackfillPlan({ candidates: [candidate] });
  assert.strictEqual(plan.entries[0].persistence_plan.link.folio, "F66");
  return plan.entries[0].persistence_plan.link.folio;
});

check("candidate_from_sandbox_pac_summary_serie_folio", () => {
  const candidate = buildBackfillCandidateFromDraftRow(draftRow());
  const plan = buildProviderInvoiceIdentityBackfillPlan({ candidates: [candidate] });
  assert.strictEqual(plan.entries[0].persistence_plan.identity.ui_display_id, "A-F66");
  return plan.entries[0].persistence_plan.identity.ui_display_id;
});

check("candidate_with_uuid", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({ draftRows: [draftRow()] });
  assert.strictEqual(plan.entries[0].persistence_plan.link.uuid, uuid);
  return "uuid";
});

check("candidate_with_cfdi_uid", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({ draftRows: [draftRow()] });
  assert.strictEqual(plan.entries[0].persistence_plan.link.provider_invoice_uid, "CFDIUID716");
  return "cfdi_uid";
});

check("candidate_with_pac_invoice_id", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({ draftRows: [draftRow()] });
  assert.strictEqual(plan.entries[0].persistence_plan.link.provider_invoice_id, "PACINV716");
  return "pac_invoice_id";
});

check("downloaded_artifact_marks_xml_pdf_true", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { artifact_status: "DOWNLOADED", xml_downloaded: false, pdf_downloaded: false } })],
  });
  assert.strictEqual(plan.entries[0].persistence_plan.link.xml_downloaded, true);
  assert.strictEqual(plan.entries[0].persistence_plan.link.pdf_downloaded, true);
  return "DOWNLOADED";
});

check("download_ready_keeps_xml_pdf_false", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { artifact_status: "DOWNLOAD_READY", xml_downloaded: false, pdf_downloaded: false } })],
  });
  assert.strictEqual(plan.entries[0].persistence_plan.link.xml_downloaded, false);
  assert.strictEqual(plan.entries[0].persistence_plan.link.pdf_downloaded, false);
  return "DOWNLOAD_READY";
});

check("dedupes_multiple_sources_same_draft", () => {
  const deduped = dedupeBackfillCandidates([
    buildBackfillCandidateFromDraftRow(draftRow({ sandbox_pac_summary: { folio: null, uuid } })),
    buildBackfillCandidateFromManifest(manifest({ folio: "F66" })),
  ]);
  assert.strictEqual(deduped.length, 1);
  assert.strictEqual(deduped[0].provider_folio, "F66");
  return deduped.length;
});

check("prefers_non_null_folio_over_null", () => {
  const merged = mergeDraftSummaryAndManifestIdentity(
    draftRow({ sandbox_pac_summary: { folio: null, uuid } }),
    manifest({ folio: "F66" }),
  );
  assert.strictEqual(merged.provider_folio, "F66");
  return merged.provider_folio;
});

check("prefers_non_null_uuid_over_null", () => {
  const merged = mergeDraftSummaryAndManifestIdentity(
    draftRow({ sandbox_pac_summary: { folio: "F66", uuid: null } }),
    manifest({ uuid }),
  );
  assert.strictEqual(merged.provider_uuid, uuid);
  return "uuid";
});

check("identity_none_generates_no_apply_sql", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { folio: null, serie: null, uuid: null, cfdi_uid: null, pac_invoice_id: null } })],
  });
  assert.strictEqual(plan.entries[0].action, BACKFILL_ACTIONS.SKIP_NO_IDENTITY);
  assert.strictEqual(plan.entries[0].sql, "");
  return plan.entries[0].action;
});

check("post_stamp_without_folio_warns", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { folio: null, uuid } })],
  });
  assert(plan.entries[0].warnings.includes("PROVIDER_FOLIO_MISSING"), plan.entries[0].warnings.join(","));
  return plan.entries[0].warnings.join(",");
});

check("ui_display_does_not_expose_DRAFT", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { folio: null, uuid } })],
  });
  assert(!/^DRAFT-/i.test(plan.entries[0].summary.ui_display_id), plan.entries[0].summary.ui_display_id);
  return plan.entries[0].summary.ui_display_id;
});

check("summary_redacts_local_paths", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    manifests: [manifest({ manifest_path: "C:\\Users\\Private\\runtime\\secret\\sandbox-download-manifest.json" })],
  });
  const safe = sanitizeBackfillPlanForOutput(plan);
  const text = JSON.stringify(safe);
  assert(!/C:\\\\Users|Private|runtime\\\\secret/i.test(text), text);
  return safe.candidates[0].manifest_ref;
});

check("summary_redacts_tokens_and_secrets", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    manifests: [manifest({ manifest_path: "runtime/token-secret/provider-response.json", provider_invoice_id: "INV-TOKEN-SECRET" })],
  });
  const safe = sanitizeBackfillPlanForOutput(plan);
  const text = JSON.stringify(safe);
  assert(!/TOKEN|SECRET/i.test(text), text);
  return "redacted";
});

check("classifies_insert", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({ draftRows: [draftRow()] });
  assert.strictEqual(plan.entries[0].action, BACKFILL_ACTIONS.INSERT);
  return plan.entries[0].action;
});

check("classifies_update", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({
      provider_invoice_link: { provider_invoice_link_id: "PIL-1", draft_id: "DRAFT-BACKFILL-5412", provider: "factura_com", environment: "SANDBOX", uuid: null },
    })],
  });
  assert.strictEqual(plan.entries[0].action, BACKFILL_ACTIONS.UPDATE);
  return plan.entries[0].action;
});

check("classifies_skip_no_identity", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({ sandbox_pac_summary: { folio: null, serie: null, uuid: null, cfdi_uid: null, pac_invoice_id: null } })],
  });
  assert.strictEqual(plan.entries[0].action, BACKFILL_ACTIONS.SKIP_NO_IDENTITY);
  return plan.entries[0].action;
});

check("classifies_skip_already_complete", () => {
  const plan = buildProviderInvoiceIdentityBackfillPlan({
    draftRows: [draftRow({
      sandbox_pac_summary: { artifact_status: "DOWNLOADED", xml_downloaded: true, pdf_downloaded: true },
      provider_invoice_link: {
        provider_invoice_link_id: "PIL-1",
        draft_id: "DRAFT-BACKFILL-5412",
        provider: "factura_com",
        environment: "SANDBOX",
        provider_invoice_id: "PACINV716",
        provider_invoice_uid: "CFDIUID716",
        uuid,
        serie: "A",
        folio: "F66",
        xml_downloaded: true,
        pdf_downloaded: true,
      },
    })],
  });
  assert.strictEqual(plan.entries[0].action, BACKFILL_ACTIONS.SKIP_ALREADY_COMPLETE);
  return plan.entries[0].action;
});

check("dry_run_does_not_execute_sql", () => {
  let calls = 0;
  const result = runBackfillProviderInvoiceLinks({
    fixturePath: fixturePath({ draftRows: [draftRow()], manifests: [] }),
    dryRun: true,
    apply: false,
    execFileSync: () => {
      calls += 1;
      return "[]";
    },
  });
  assert.strictEqual(result.status, "DRY_RUN");
  assert.strictEqual(calls, 0);
  return result.status;
});

check("apply_without_confirmation_aborts", () => {
  const result = runBackfillProviderInvoiceLinks({
    fixturePath: fixturePath({ draftRows: [draftRow()], manifests: [] }),
    apply: true,
    confirmed: false,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error_class, "APPLY_CONFIRMATION_REQUIRED");
  return result.status;
});

check("apply_with_confirmation_allows_mock_apply", () => {
  let calls = 0;
  const result = runBackfillProviderInvoiceLinks({
    fixturePath: fixturePath({ draftRows: [draftRow()], manifests: [] }),
    apply: true,
    confirmed: true,
    execFileSync: () => {
      calls += 1;
      return "";
    },
  });
  assert.strictEqual(result.status, "APPLIED");
  assert.strictEqual(calls, 1);
  assert.strictEqual(result.apply.applied, 1);
  return "mock apply";
});

check("script_runs_with_fixtures_without_db", () => {
  const result = runBackfillProviderInvoiceLinks({
    fixturePath: fixturePath({ draftRows: [draftRow()], manifests: [manifest({ draft_id: "DRAFT-BACKFILL-5412" })] }),
    dryRun: true,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.source.draft_rows, 1);
  return "fixture";
});

check("does_not_require_n8n", () => {
  const sql = buildBackfillDraftRowsReadOnlySql(5);
  assert(!/n8n|workflow-sync|telegram-ui-session-watch/i.test(sql), sql);
  return "no n8n";
});

check("does_not_require_watcher", () => {
  const parsed = parseArgs(["--dry-run", "--limit", "5"]);
  assert.strictEqual(parsed.dryRun, true);
  assert.strictEqual(parsed.apply, false);
  return "no watcher";
});

check("does_not_require_real_xml_or_pdf", () => {
  const result = runBackfillProviderInvoiceLinks({
    fixturePath: fixturePath({ draftRows: [], manifests: [manifest({ xml_path: "cfdi.xml", pdf_path: "cfdi.pdf" })] }),
    dryRun: true,
  });
  const safe = JSON.stringify(result.summary);
  assert(!/<\?xml|%PDF|cfdi\.xml|cfdi\.pdf/i.test(safe), safe);
  return "no files";
});

check("does_not_require_provider_calls", () => {
  const sql = buildBackfillDraftRowsReadOnlySql(5);
  assert(!/factura\.com\/api|https?:\/\//i.test(sql), sql);
  return "no provider";
});

Promise.all(checks).then((results) => {
  console.log("Provider Invoice Identity Backfill Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

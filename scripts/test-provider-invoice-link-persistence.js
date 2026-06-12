const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  buildProviderInvoiceLinkPersistencePlan,
  buildProviderInvoiceLinkUpsertSql,
  normalizeProviderInvoiceIdentity,
} = require("./lib/provider-contracts/provider-contract-index");
const { persistSandboxStampResult } = require("./lib/sandbox-draft-stamp-persistence");

const root = path.resolve(__dirname, "..");
const schemaSql = fs.readFileSync(path.join(root, "sql", "009_provider_multitenant_foundation.sql"), "utf8");
const checks = [];
const uuid = "12345678-1234-4000-8000-1234567890ab";

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

function baseInput(extra = {}) {
  return {
    tenant_id: "TENANT_PERSONAL_DEFAULT",
    draft_id: "DRAFT-5412",
    client_id: "CLIENT-DEMO",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    sandbox_pac_summary: {
      folio: "F66",
      serie: "A",
      uuid,
      cfdi_uid: "CFDIUID716",
      pac_invoice_id: "PACINV716",
      artifact_status: "DOWNLOAD_READY",
    },
    ...extra,
  };
}

function assertNoSensitiveSql(sql) {
  assert(!/TOKEN|SECRET|PASSWORD|F-Api-Key|F-Secret-Key|Bearer/i.test(sql), sql);
  assert(!/<\?xml|<cfdi:Comprobante|%PDF|raw_provider_response/i.test(sql), sql);
}

check("generates_candidate_and_sql_for_folio", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    ...baseInput(),
    sandbox_pac_summary: { folio: "F66" },
  });
  assert.strictEqual(plan.should_persist, true);
  assert.strictEqual(plan.link.folio, "F66");
  assert(plan.sql.includes("provider_invoice_links"));
  return plan.link.folio;
});

check("generates_serie_folio_display_identity", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.identity.ui_display_id, "A-F66");
  assert.strictEqual(plan.link.serie, "A");
  assert.strictEqual(plan.link.folio, "F66");
  return plan.identity.ui_display_id;
});

check("includes_uuid", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.link.uuid, uuid);
  assert(plan.sql.includes(uuid));
  return "uuid";
});

check("maps_cfdi_uid_to_provider_invoice_uid", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.link.provider_invoice_uid, "CFDIUID716");
  return plan.link.provider_invoice_uid;
});

check("maps_pac_invoice_id_to_provider_invoice_id", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.link.provider_invoice_id, "PACINV716");
  return plan.link.provider_invoice_id;
});

check("does_not_use_DRAFT_as_ui_id", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    draft_id: "DRAFT-ONLY-5412",
    sandbox_pac_summary: { uuid },
  });
  assert(!/^DRAFT-/i.test(plan.identity.ui_display_id), plan.identity.ui_display_id);
  return plan.identity.ui_display_id;
});

check("uses_draft_id_as_local_technical_key", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.link.draft_id, "DRAFT-5412");
  assert(plan.sql.includes("draft_id = 'DRAFT-5412'"));
  return plan.link.draft_id;
});

check("skips_insert_when_identity_confidence_none", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    draft_id: "DRAFT-NONE",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    invoice_status: "SANDBOX_TIMBRADO",
  });
  assert.strictEqual(plan.should_persist, false);
  assert.strictEqual(plan.sql, "");
  assert(plan.warnings.includes("PROVIDER_INVOICE_LINK_SKIPPED_EMPTY_IDENTITY"));
  return "skipped";
});

check("warns_post_stamp_without_folio", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    draft_id: "DRAFT-UUID-ONLY",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    invoice_status: "SANDBOX_TIMBRADO",
    uuid,
  });
  assert.strictEqual(plan.should_persist, true);
  assert(plan.warnings.includes("PROVIDER_FOLIO_MISSING"), plan.warnings.join(","));
  return plan.warnings.join(",");
});

check("update_then_insert_strategy_is_idempotent_without_unique_constraint", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.idempotency_strategy, "update_then_insert_no_unique_constraint");
  assert(/UPDATE provider_invoice_links SET/i.test(plan.sql));
  assert(/INSERT INTO provider_invoice_links/i.test(plan.sql));
  assert(/WHERE NOT EXISTS \(SELECT 1 FROM provider_invoice_links WHERE tenant_id = 'TENANT_PERSONAL_DEFAULT' AND draft_id = 'DRAFT-5412' AND provider = 'factura_com' AND environment = 'SANDBOX'\)/i.test(plan.sql), plan.sql);
  return plan.idempotency_strategy;
});

check("update_does_not_overwrite_existing_folio_with_null", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    draft_id: "DRAFT-UUID-ONLY",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    uuid,
  });
  assert(plan.sql.includes("folio = COALESCE(NULL, folio)"), plan.sql);
  return "folio guarded";
});

check("update_does_not_overwrite_existing_uuid_with_null", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan({
    draft_id: "DRAFT-FOLIO-ONLY",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    folio: "F66",
  });
  assert(plan.sql.includes("uuid = COALESCE(NULL, uuid)"), plan.sql);
  return "uuid guarded";
});

check("download_update_marks_has_xml", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    sandbox_pac_summary: { folio: "F66", uuid, xml_downloaded: true },
  }));
  assert.strictEqual(plan.link.xml_downloaded, true);
  assert(plan.sql.includes("xml_downloaded = provider_invoice_links.xml_downloaded OR true"));
  return "xml";
});

check("download_update_marks_has_pdf", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    sandbox_pac_summary: { folio: "F66", uuid, pdf_downloaded: true },
  }));
  assert.strictEqual(plan.link.pdf_downloaded, true);
  assert(plan.sql.includes("pdf_downloaded = provider_invoice_links.pdf_downloaded OR true"));
  return "pdf";
});

check("download_update_preserves_serie_folio", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    sandbox_pac_summary: { serie: "A", folio: "F66", uuid, xml_downloaded: true, pdf_downloaded: true },
  }));
  assert.strictEqual(plan.link.serie, "A");
  assert.strictEqual(plan.link.folio, "F66");
  return "A-F66";
});

check("sql_does_not_contain_tokens_or_secrets", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    provider_raw_snapshot_ref: "runtime/token-secret/provider-response.json",
    sandbox_pac_summary: { folio: "F66", uuid, api_token: "SECRET" },
  }));
  assertNoSensitiveSql(plan.sql);
  return "clean";
});

check("sql_does_not_contain_raw_provider_response", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    provider_response: {
      folio: "F66",
      uuid,
      raw_provider_response: "<cfdi:Comprobante>raw</cfdi:Comprobante>",
    },
  }));
  assertNoSensitiveSql(plan.sql);
  assert(!plan.sql.includes("raw_provider_response"));
  return "sanitized";
});

check("sql_escapes_quotes", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    sandbox_pac_summary: { folio: "F'66", uuid },
  }));
  assert(plan.sql.includes("'F''66'"), plan.sql);
  return "escaped";
});

check("candidate_is_compatible_with_provider_invoice_links_columns", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  const tableMatch = schemaSql.match(/CREATE TABLE IF NOT EXISTS provider_invoice_links \(([\s\S]*?)\n\);/);
  assert(tableMatch, "provider_invoice_links table missing");
  const columns = Array.from(tableMatch[1].matchAll(/^\s{2}([a-z_]+)\s+/gm)).map((match) => match[1]);
  for (const column of [
    "draft_id",
    "provider_invoice_id",
    "provider_invoice_uid",
    "uuid",
    "serie",
    "folio",
    "provider_status",
    "invoice_status",
    "xml_downloaded",
    "pdf_downloaded",
  ]) {
    assert(columns.includes(column), `${column} missing`);
  }
  assert(!columns.includes("xml_path"));
  assert(!columns.includes("pdf_path"));
  assert(plan.columns.every((column) => columns.includes(column)), "plan exposes unknown schema columns");
  return "schema";
});

check("missing_constraint_uses_update_then_insert_plan", () => {
  const hasUniqueDraftProviderEnvironment = /CREATE\s+UNIQUE\s+INDEX[\s\S]+provider_invoice_links[\s\S]+tenant_id,\s*draft_id,\s*provider,\s*environment/i.test(schemaSql);
  assert.strictEqual(hasUniqueDraftProviderEnvironment, false);
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput());
  assert.strictEqual(plan.idempotency_strategy, "update_then_insert_no_unique_constraint");
  return "no unique constraint";
});

check("declared_unique_constraint_uses_on_conflict_plan", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput(), {
    hasUniqueDraftProviderEnvironment: true,
  });
  assert.strictEqual(plan.idempotency_strategy, "on_conflict");
  assert(/ON CONFLICT \(tenant_id, draft_id, provider, environment\) DO UPDATE SET/i.test(plan.sql), plan.sql);
  return "on conflict";
});

check("stamp_and_download_persistence_use_same_contract", async () => {
  const captured = [];
  const execFileSync = (_command, args) => {
    captured.push(args[args.length - 1]);
    return `${JSON.stringify({
      draft_id: "DRAFT-5412",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      sandbox_pac_summary: { folio: "F66", uuid },
    })}\n`;
  };
  const stamp = await persistSandboxStampResult({
    draftId: "DRAFT-5412",
    clientId: "CLIENT-DEMO",
    invoiceStatus: "SANDBOX_TIMBRADO",
    paymentStatus: "PENDIENTE",
    pacResult: { ok: true, status: "OK", folio: "F66", uuid, cfdi_uid: "CFDIUID716", pac_invoice_id: "PACINV716" },
    sandboxPacSummary: { folio: "F66", uuid, cfdi_uid: "CFDIUID716", pac_invoice_id: "PACINV716" },
    execFileSync,
  });
  const download = await persistSandboxStampResult({
    draftId: "DRAFT-5412",
    clientId: "CLIENT-DEMO",
    invoiceStatus: "SANDBOX_TIMBRADO",
    paymentStatus: "PENDIENTE",
    artifactStatus: "DOWNLOADED",
    pacResult: { ok: true, status: "DOWNLOADED", folio: "F66", uuid, cfdi_uid: "CFDIUID716", pac_invoice_id: "PACINV716", xml_downloaded: true, pdf_downloaded: true },
    sandboxPacSummary: { folio: "F66", uuid, cfdi_uid: "CFDIUID716", pac_invoice_id: "PACINV716", artifact_status: "DOWNLOADED", xml_downloaded: true, pdf_downloaded: true },
    execFileSync,
  });
  assert.strictEqual(stamp.provider_invoice_link_status, "UPSERTED");
  assert.strictEqual(download.provider_invoice_link_status, "UPSERTED");
  assert.strictEqual(captured.length, 2);
  assert(captured.every((sql) => sql.includes("provider_invoice_links")), captured.join("\n"));
  assert(captured[1].includes("xml_downloaded = provider_invoice_links.xml_downloaded OR true"), captured[1]);
  return "same contract";
});

check("helper_does_not_require_db_connection", () => {
  const sql = buildProviderInvoiceLinkUpsertSql(baseInput());
  assert(sql.includes("provider_invoice_links"));
  return "pure";
});

check("helper_does_not_require_n8n", () => {
  const identity = normalizeProviderInvoiceIdentity(baseInput());
  assert.strictEqual(identity.provider_folio, "F66");
  return "node only";
});

check("helper_does_not_require_real_xml_or_pdf", () => {
  const plan = buildProviderInvoiceLinkPersistencePlan(baseInput({
    sandbox_pac_summary: { folio: "F66", uuid, xml_downloaded: true, pdf_downloaded: true },
  }));
  assert.strictEqual(plan.link.xml_downloaded, true);
  assert.strictEqual(plan.link.pdf_downloaded, true);
  assert(!/cfdi\.xml|cfdi\.pdf|<\?xml|%PDF/i.test(plan.sql), plan.sql);
  return "no files";
});

Promise.all(checks).then((results) => {
  console.log("Provider Invoice Link Persistence Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

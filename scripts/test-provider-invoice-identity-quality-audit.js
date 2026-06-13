const assert = require("assert");

const {
  buildInvoiceIdentityQualityAudit,
  buildInvoiceIdentityQualityReadOnlySql,
  classifyInvoiceIdentityQuality,
  parseArgs,
  runInvoiceIdentityQualityAudit,
} = require("./audit-provider-invoice-identity-quality");

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

const realUuid = "12345678-1234-4000-8000-1234567890ab";

function row(extra = {}) {
  const { sandbox_pac_summary: summaryOverride, ...rest } = extra;
  return {
    draft_id: "DRAFT-AUDIT-000000000123",
    provider_invoice_link_id: "PIL-123",
    provider: "factura_com",
    environment: "SANDBOX",
    provider_invoice_id: null,
    provider_invoice_uid: null,
    uuid: null,
    serie: null,
    folio: null,
    invoice_status: "SANDBOX_TIMBRADO",
    artifact_status: "DOWNLOAD_READY",
    payment_status: "PENDIENTE",
    xml_downloaded: false,
    pdf_downloaded: false,
    sandbox_pac_summary: {
      invoice_status: "SANDBOX_TIMBRADO",
      artifact_status: "DOWNLOAD_READY",
      ...(summaryOverride || {}),
    },
    ...rest,
  };
}

function categoriesFor(input) {
  return classifyInvoiceIdentityQuality(input).categories;
}

check("classifies_real_folio", () => {
  const categories = categoriesFor(row({ folio: "F-68" }));
  assert(categories.includes("HAS_PROVIDER_FOLIO"), categories.join(","));
  return categories.join(",");
});

check("classifies_serie_and_folio", () => {
  const categories = categoriesFor(row({ serie: "A", folio: "F-68" }));
  assert(categories.includes("HAS_SERIE_AND_FOLIO"), categories.join(","));
  return categories.join(",");
});

check("classifies_no_folio_with_uuid", () => {
  const categories = categoriesFor(row({ uuid: realUuid }));
  assert(categories.includes("NO_FOLIO_HAS_UUID"), categories.join(","));
  return categories.join(",");
});

check("classifies_no_folio_with_provider_id", () => {
  const categories = categoriesFor(row({ provider_invoice_id: "PACINV-681" }));
  assert(categories.includes("NO_FOLIO_HAS_PROVIDER_ID"), categories.join(","));
  return categories.join(",");
});

check("classifies_no_identity_as_fallback_fac_sbx", () => {
  const categories = categoriesFor(row());
  assert(categories.includes("FALLBACK_FAC_SBX"), categories.join(","));
  assert(categories.includes("INCOMPLETE_PROVIDER_IDENTITY"), categories.join(","));
  return categories.join(",");
});

check("classifies_sandbox_error", () => {
  const categories = categoriesFor(row({ invoice_status: "SANDBOX_ERROR", artifact_status: "N/A", sandbox_pac_summary: { invoice_status: "SANDBOX_ERROR", artifact_status: "N/A" } }));
  assert(categories.includes("SANDBOX_ERROR"), categories.join(","));
  return categories.join(",");
});

check("classifies_download_error", () => {
  const categories = categoriesFor(row({ artifact_status: "DOWNLOAD_ERROR", uuid: realUuid }));
  assert(categories.includes("DOWNLOAD_ERROR"), categories.join(","));
  return categories.join(",");
});

check("detects_draft_derived_provider_id_as_mock_or_legacy", () => {
  const categories = categoriesFor(row({ provider_invoice_id: "SANDBOX-INV-DRAFT-AUDIT-000000000123" }));
  assert(categories.includes("MOCK_OR_LEGACY_SUSPECT"), categories.join(","));
  return categories.join(",");
});

check("sanitized_audit_does_not_print_full_uuid", () => {
  const audit = buildInvoiceIdentityQualityAudit([row({ uuid: realUuid })]);
  const text = JSON.stringify(audit.samples);
  assert(!text.includes(realUuid), text);
  assert(text.includes("UUID-12345678"), text);
  return "uuid redacted";
});

check("sanitized_audit_does_not_print_full_draft_id", () => {
  const audit = buildInvoiceIdentityQualityAudit([row({ folio: "F-68" })]);
  const text = JSON.stringify(audit.samples);
  assert(!text.includes("DRAFT-AUDIT-000000000123"), text);
  assert(text.includes("DRAFT-...0123"), text);
  return "draft redacted";
});

check("sanitized_audit_does_not_print_rfc", () => {
  const audit = buildInvoiceIdentityQualityAudit([row({ rfc: "ABC010203XYZ", folio: "F-68" })]);
  const text = JSON.stringify(audit);
  assert(!/ABC010203XYZ/.test(text), text);
  return "rfc absent";
});

check("dry_run_default", () => {
  const parsed = parseArgs([]);
  assert.strictEqual(parsed.dryRun, true);
  return "dry-run";
});

check("json_arg_supported", () => {
  const parsed = parseArgs(["--json"]);
  assert.strictEqual(parsed.json, true);
  return "json";
});

check("limit_arg_supported", () => {
  const parsed = parseArgs(["--limit", "50"]);
  assert.strictEqual(parsed.limit, 50);
  assert(buildInvoiceIdentityQualityReadOnlySql(parsed.limit).includes("LIMIT 50"));
  return parsed.limit;
});

check("run_with_fixture_rows_does_not_require_db_or_mutate", () => {
  let called = false;
  const audit = runInvoiceIdentityQualityAudit({
    fixtureRows: [row({ folio: "F-68" })],
    execFileSync: () => {
      called = true;
      throw new Error("DB should not be called for fixture rows");
    },
  });
  assert.strictEqual(called, false);
  assert.strictEqual(audit.total, 1);
  assert.strictEqual(audit.counts.HAS_PROVIDER_FOLIO, 1);
  return audit.total;
});

console.log("Provider Invoice Identity Quality Audit Tests");
for (const item of checks) printCheck(item);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

const assert = require("assert");

const {
  buildProviderInvoiceLinkCandidate,
  isProviderInvoiceIdentityComplete,
  normalizeProviderInvoiceIdentity,
  resolveInvoiceDisplayIdentity,
  resolveProviderDisplayId,
  sanitizeProviderInvoiceIdentityForDebug,
  sanitizeProviderInvoiceIdentityForUi,
} = require("./lib/provider-contracts/provider-contract-index");

const directContract = require("./lib/provider-contracts/provider-invoice-identity.contract");

const checks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const fullUuid = "12345678-1234-4000-8000-1234567890ab";

check("normalizes_folio_from_sandbox_pac_summary_folio", () => {
  const identity = normalizeProviderInvoiceIdentity({
    draft_id: "DRAFT-5412",
    sandbox_pac_summary: { folio: "F66" },
  });
  assert.strictEqual(identity.provider_folio, "F66");
  return identity.provider_folio;
});

check("normalizes_folio_from_Folio", () => {
  const identity = normalizeProviderInvoiceIdentity({ Folio: "F66" });
  assert.strictEqual(identity.provider_folio, "F66");
  return identity.provider_folio;
});

check("normalizes_serie_folio_and_display", () => {
  const identity = normalizeProviderInvoiceIdentity({ Serie: "A", Folio: "F66" });
  assert.strictEqual(identity.provider_serie, "A");
  assert.strictEqual(identity.provider_folio, "F66");
  assert.strictEqual(identity.ui_display_id, "A-F66");
  assert.strictEqual(resolveProviderDisplayId(identity), "A-F66");
  return identity.ui_display_id;
});

check("normalizes_uuid_from_uuid", () => {
  const identity = normalizeProviderInvoiceIdentity({ uuid: fullUuid });
  assert.strictEqual(identity.provider_uuid, fullUuid);
  return "uuid";
});

check("normalizes_uuid_from_UUID", () => {
  const identity = normalizeProviderInvoiceIdentity({ UUID: fullUuid });
  assert.strictEqual(identity.provider_uuid, fullUuid);
  return "UUID";
});

check("normalizes_cfdi_uid_as_provider_invoice_uid", () => {
  const identity = normalizeProviderInvoiceIdentity({ cfdi_uid: "CFDIUID716" });
  assert.strictEqual(identity.provider_invoice_uid, "CFDIUID716");
  return identity.provider_invoice_uid;
});

check("normalizes_pac_invoice_id_as_provider_invoice_id", () => {
  const identity = normalizeProviderInvoiceIdentity({ pac_invoice_id: "PAC-INV-716" });
  assert.strictEqual(identity.provider_invoice_id, "PAC-INV-716");
  return identity.provider_invoice_id;
});

check("ui_display_prefers_provider_folio_over_BOR", () => {
  const identity = normalizeProviderInvoiceIdentity({
    local_human_draft_id: "BOR-5412",
    provider_folio: "F66",
  });
  assert.strictEqual(identity.ui_display_id, "F66");
  return identity.ui_display_id;
});

check("ui_display_uses_BOR_only_without_provider_identity", () => {
  const identity = normalizeProviderInvoiceIdentity({ local_human_draft_id: "BOR-5412" });
  assert.strictEqual(identity.ui_display_id, "BOR-5412");
  return identity.ui_display_id;
});

check("ui_display_never_uses_DRAFT", () => {
  const identity = normalizeProviderInvoiceIdentity({ local_draft_id: "DRAFT-PRIVATE-ABC" });
  assert(identity.ui_display_id, "ui_display_id expected");
  assert(!/^DRAFT-/i.test(identity.ui_display_id), identity.ui_display_id);
  return identity.ui_display_id;
});

check("debug_display_can_include_DRAFT", () => {
  const identity = normalizeProviderInvoiceIdentity({ local_draft_id: "DRAFT-PRIVATE-ABC", provider_folio: "F66" });
  assert(identity.debug_display_id.includes("DRAFT-PRIVATE-ABC"), identity.debug_display_id);
  return identity.debug_display_id;
});

check("confidence_NONE_without_provider_identity", () => {
  const identity = normalizeProviderInvoiceIdentity({ local_human_draft_id: "BOR-5412" });
  assert.strictEqual(identity.identity_confidence, "NONE");
  assert.strictEqual(isProviderInvoiceIdentityComplete(identity), false);
  return identity.identity_confidence;
});

check("confidence_PARTIAL_with_only_folio", () => {
  const identity = normalizeProviderInvoiceIdentity({ provider_folio: "F66" });
  assert.strictEqual(identity.identity_confidence, "PARTIAL");
  assert.strictEqual(isProviderInvoiceIdentityComplete(identity), false);
  return identity.identity_confidence;
});

check("confidence_STRONG_with_folio_and_uuid", () => {
  const identity = normalizeProviderInvoiceIdentity({ provider_folio: "F66", provider_uuid: fullUuid });
  assert.strictEqual(identity.identity_confidence, "STRONG");
  assert.strictEqual(isProviderInvoiceIdentityComplete(identity), true);
  return identity.identity_confidence;
});

check("candidate_generates_provider_invoice_link_fields", () => {
  const candidate = buildProviderInvoiceLinkCandidate({
    local_draft_id: "DRAFT-5412",
    provider_name: "Factura.com Sandbox",
    provider_environment: "SANDBOX",
    provider_folio: "F66",
    provider_serie: "A",
    provider_uuid: fullUuid,
    provider_invoice_uid: "CFDIUID716",
    provider_invoice_id: "PAC-INV-716",
    provider_status: "SANDBOX_TIMBRADO",
    xml_path: "runtime/storage-sandbox/demo.xml",
    pdf_path: "runtime/storage-sandbox/demo.pdf",
  });
  assert.strictEqual(candidate.draft_id, "DRAFT-5412");
  assert.strictEqual(candidate.folio, "F66");
  assert.strictEqual(candidate.serie, "A");
  assert.strictEqual(candidate.uuid, fullUuid);
  assert.strictEqual(candidate.provider_invoice_uid, "CFDIUID716");
  assert.strictEqual(candidate.provider_invoice_id, "PAC-INV-716");
  assert.strictEqual(candidate.has_xml, true);
  assert.strictEqual(candidate.has_pdf, true);
  return "candidate";
});

check("candidate_does_not_generate_sql_or_mutate_input", () => {
  const source = Object.freeze({
    local_draft_id: "DRAFT-5412",
    provider_folio: "F66",
  });
  const before = JSON.stringify(source);
  const candidate = buildProviderInvoiceLinkCandidate(source);
  assert(!Object.prototype.hasOwnProperty.call(candidate, "sql"));
  assert(!Object.prototype.hasOwnProperty.call(candidate, "query"));
  assert.strictEqual(JSON.stringify(source), before);
  return "pure";
});

check("ui_sanitizer_does_not_expose_full_uuid", () => {
  const ui = sanitizeProviderInvoiceIdentityForUi({ provider_folio: "F66", provider_uuid: fullUuid });
  const text = JSON.stringify(ui);
  assert(!text.includes(fullUuid), text);
  assert(text.includes("UUID-12345678"), text);
  return ui.provider_uuid_short;
});

check("ui_sanitizer_does_not_expose_local_paths", () => {
  const ui = sanitizeProviderInvoiceIdentityForUi({
    provider_folio: "F66",
    xml_path: "C:\\Users\\Private\\runtime\\secret\\cfdi.xml",
    pdf_path: "C:\\Users\\Private\\runtime\\secret\\cfdi.pdf",
  });
  const text = JSON.stringify(ui);
  assert(!/C:\\\\Users|runtime\\\\secret|cfdi\.xml|cfdi\.pdf/i.test(text), text);
  assert.strictEqual(ui.xml_available, true);
  assert.strictEqual(ui.pdf_available, true);
  return "paths hidden";
});

check("debug_sanitizer_does_not_expose_tokens_or_secrets", () => {
  const debug = sanitizeProviderInvoiceIdentityForDebug({
    local_draft_id: "DRAFT-5412",
    provider_folio: "F66",
    provider_invoice_id: "INV-TOKEN-SECRET",
    provider_raw_snapshot_ref: "runtime/token-secret/provider-response.json",
  });
  const text = JSON.stringify(debug);
  assert(!/TOKEN|SECRET/i.test(text), text);
  return "redacted";
});

check("merge_draft_and_sandbox_summary_preserves_local_human_draft_id", () => {
  const identity = normalizeProviderInvoiceIdentity({
    draft: {
      draft_id: "DRAFT-PRIVATE-5412",
      local_human_draft_id: "BOR-5412",
      sandbox_pac_summary: {
        folio: "F66",
        uuid: fullUuid,
      },
    },
  });
  assert.strictEqual(identity.local_human_draft_id, "BOR-5412");
  assert.strictEqual(identity.provider_folio, "F66");
  assert.strictEqual(identity.ui_display_id, "F66");
  return identity.local_human_draft_id;
});

check("uuid_fallback_display_without_folio", () => {
  const identity = normalizeProviderInvoiceIdentity({ provider_uuid: fullUuid, local_human_draft_id: "BOR-5412" });
  assert.strictEqual(identity.ui_display_id, "UUID-12345678");
  return identity.ui_display_id;
});

check("provider_uid_fallback_display_without_folio_or_uuid", () => {
  const identity = normalizeProviderInvoiceIdentity({ provider_invoice_uid: "CFDIUID716000" });
  assert.strictEqual(identity.ui_display_id, "PAC-CFDIUID7");
  return identity.ui_display_id;
});

check("warnings_when_provider_identity_missing_post_stamp", () => {
  const identity = normalizeProviderInvoiceIdentity({
    local_draft_id: "DRAFT-5412",
    invoice_status: "SANDBOX_TIMBRADO",
  });
  assert(identity.warnings.includes("PROVIDER_IDENTITY_MISSING"), identity.warnings.join(","));
  return identity.warnings.join(",");
});

check("downloaded_artifact_status_marks_xml_and_pdf_available", () => {
  const candidate = buildProviderInvoiceLinkCandidate({
    local_draft_id: "DRAFT-5412",
    provider_folio: "F66",
    artifact_status: "DOWNLOADED",
  });
  assert.strictEqual(candidate.has_xml, true);
  assert.strictEqual(candidate.has_pdf, true);
  return "DOWNLOADED";
});

check("contract_exports_do_not_break_require_import", () => {
  assert.strictEqual(typeof normalizeProviderInvoiceIdentity, "function");
  assert.strictEqual(typeof directContract.normalizeProviderInvoiceIdentity, "function");
  const identity = resolveInvoiceDisplayIdentity({ provider_folio: "F66" });
  assert.strictEqual(identity.ui_display_id, "F66");
  return "require ok";
});

console.log("Provider Invoice Identity Contract Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

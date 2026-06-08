const assert = require("assert");

const { runSandboxPdfDiagnose } = require("./lib/sandbox-pdf-diagnose-action");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function pdfResult(status, visual) {
  return {
    ok: visual === true,
    status: visual ? "OK" : "PAC_SANDBOX_ERROR",
    pdf_downloaded: visual === true,
    pdf_content_valid: visual === true,
    pdf_validation_status: status,
    content_validation: {
      status,
      size_bytes: 6990,
      sha256: "a".repeat(64),
      pdf_magic_present: true,
      pdf_eof_present: true,
      pdf_page_count_estimate: 1,
      pdf_content_streams_present: true,
      pdf_visual_content_present: visual === true,
      pdf_text_present: visual === true,
      pdf_graphics_present: false,
      pdf_image_xobject_present: false,
    },
    normalized_errors: visual ? [] : [{ code: "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID" }],
    normalized_warnings: [],
  };
}

check("diagnose_reports_ok_when_any_ref_has_visual_pdf", async () => {
  const calls = [];
  const result = await runSandboxPdfDiagnose({
    cfdiUid: "CFDI-UID-ROOT-CAUSE",
    adapter: {
      downloadPdf: async (ref) => {
        calls.push(ref);
        return pdfResult("VALID", true);
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.tested_refs[0].pdf_visual_content_present, true);
  assert.strictEqual(calls[0].cfdi_uid, "CFDI-UID-ROOT-CAUSE");
  const raw = JSON.stringify(result);
  assert(!raw.includes("CFDI-UID-ROOT-CAUSE"), "raw provider ref must be redacted");
  return result.status;
});

check("diagnose_classifies_structural_blank_pdf_as_provider_limitation", async () => {
  const result = await runSandboxPdfDiagnose({
    cfdiUid: "CFDI-UID-BLANK",
    pacInvoiceId: "PAC-ID-BLANK",
    uuid: "00000000-0000-4000-8000-000000000716",
    adapter: { downloadPdf: async () => pdfResult("PDF_VISUAL_CONTENT_MISSING", false) },
  });
  assert.strictEqual(result.status, "PROVIDER_LIMITATION");
  assert.strictEqual(result.output.provider_limitation_documented, true);
  assert.strictEqual(result.output.tested_refs.length, 3);
  return result.status;
});

check("diagnose_requires_identity", async () => {
  const result = await runSandboxPdfDiagnose({ adapter: { downloadPdf: async () => pdfResult("VALID", true) } });
  assert.strictEqual(result.status, "ERROR");
  assert.strictEqual(result.output.tested_refs.length, 0);
  return result.status;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com PDF Root Cause Diagnose Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

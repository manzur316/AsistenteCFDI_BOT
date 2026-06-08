const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runSandboxPdfDiagnose } = require("./lib/sandbox-pdf-diagnose-action");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-sandbox-pdf-diagnose-render-check");

function blankProviderPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 8 >>\nstream\n/Im1 Do\nendstream\nendobj\n5 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\nabc\nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

async function main() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  const invalidPdfPath = path.join(temp, "provider.invalid.pdf");
  fs.writeFileSync(invalidPdfPath, blankProviderPdf());
  const result = await runSandboxPdfDiagnose({
    draft: {
      draft_id: "DRAFT-RENDER-CHECK",
      sandbox_pac_summary: {
        cfdi_uid: "CFDIUID716",
        pac_invoice_id: "CFDIUID716",
        uuid: "00000000-0000-4000-8000-000000000716",
      },
    },
    renderCheck: true,
    debugRender: true,
    adapter: {
      downloadPdf: async () => ({
        ok: false,
        status: "PAC_SANDBOX_ERROR",
        raw: {
          data: {
            invalid_artifact_path: path.relative(root, invalidPdfPath).replace(/\\/g, "/"),
            validation: {
              status: "PDF_RENDER_CHECK_REQUIRED",
              pdf_magic_present: true,
              pdf_eof_present: true,
              pdf_page_count_estimate: 1,
              pdf_content_streams_present: true,
              pdf_visual_content_present: false,
              pdf_text_present: false,
              pdf_graphics_present: false,
              pdf_image_xobject_present: true,
            },
          },
        },
        normalized_errors: [{ code: "FACTURACOM_SANDBOX_PDF_CONTENT_INVALID" }],
      }),
    },
    renderToPpm: ({ outputDir }) => {
      const ppm = path.join(outputDir, "blank.ppm");
      fs.mkdirSync(outputDir, { recursive: true });
      fs.writeFileSync(ppm, Buffer.concat([Buffer.from("P6\n1 1\n255\n", "ascii"), Buffer.from([255, 255, 255])]));
      return ppm;
    },
  });
  assert.strictEqual(result.status, "PROVIDER_LIMITATION");
  assert.strictEqual(result.output.render_check_requested, true);
  assert.strictEqual(result.output.tested_refs[0].render_check_executed, true);
  assert.strictEqual(result.output.tested_refs[0].render_status, "BLANK");
  assert.strictEqual(result.output.tested_refs[0].pdf_validation_status, "PDF_RENDER_BLANK_PAGE");
  console.log("Sandbox PDF Diagnose Render Check Tests");
  console.log(" - render_blank_provider_pdf: PASS (PROVIDER_LIMITATION)");
  console.log("\nPASS total: 1/1");
}

main().catch((error) => {
  console.error(` - render_blank_provider_pdf: FAIL (${error.message})`);
  console.log("\nPASS total: 0/1");
  process.exit(1);
});

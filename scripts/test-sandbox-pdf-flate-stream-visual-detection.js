const assert = require("assert");
const zlib = require("zlib");

const { validateSandboxPdfArtifact } = require("./lib/sandbox-artifact-content-validator");

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
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function pdfWithStream(stream, dictionary) {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n", "latin1"),
    Buffer.from(dictionary, "latin1"),
    Buffer.from("\nstream\r\n", "latin1"),
    Buffer.isBuffer(stream) ? stream : Buffer.from(stream, "latin1"),
    Buffer.from("\r\nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

check("flate_array_filter_text_is_valid", () => {
  const compressed = zlib.deflateSync(Buffer.from("BT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET", "latin1"));
  const result = validateSandboxPdfArtifact(pdfWithStream(compressed, `<< /Length ${compressed.length} /Filter [/FlateDecode] >>`));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pdf_text_present, true);
  assert.strictEqual(result.pdf_visual_content_present, true);
  return result.status;
});

check("flate_raw_text_is_valid", () => {
  const compressed = zlib.deflateRawSync(Buffer.from("BT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET", "latin1"));
  const result = validateSandboxPdfArtifact(pdfWithStream(compressed, `<< /Length ${compressed.length} /Filter /FlateDecode >>`));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pdf_text_present, true);
  return result.status;
});

check("flate_unreadable_is_uncertain", () => {
  const result = validateSandboxPdfArtifact(pdfWithStream(Buffer.from("not-deflate", "latin1"), "<< /Length 11 /Filter /FlateDecode >>"));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PDF_VISUAL_CONTENT_UNCERTAIN");
  assert(result.warnings.includes("PDF_FLATE_STREAM_UNREADABLE"));
  return result.status;
});

console.log("Sandbox PDF Flate Stream Visual Detection Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

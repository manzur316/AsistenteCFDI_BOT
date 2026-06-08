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
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function pdfWithStream(stream, dictionary = "<< /Length 44 >>", resources = "/Font << /F1 5 0 R >>", extraObjects = "") {
  return Buffer.concat([
    Buffer.from(`%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << ${resources} >> >>\nendobj\n4 0 obj\n`, "latin1"),
    Buffer.from(dictionary, "latin1"),
    Buffer.from("\nstream\n", "latin1"),
    Buffer.isBuffer(stream) ? stream : Buffer.from(stream, "latin1"),
    Buffer.from(`\nendstream\nendobj\n${extraObjects}`, "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

check("pdf_texto_visible_es_valido", () => {
  const result = validateSandboxPdfArtifact(pdfWithStream("BT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET"));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pdf_visual_content_present, true);
  assert.strictEqual(result.pdf_text_present, true);
  return result.status;
});

check("pdf_pagina_blanca_es_invalido", () => {
  const result = validateSandboxPdfArtifact(pdfWithStream(" "));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PDF_VISUAL_CONTENT_MISSING");
  return result.status;
});

check("pdf_imagen_xobject_requiere_render_check", () => {
  const result = validateSandboxPdfArtifact(pdfWithStream(
    "q 1 0 0 1 10 10 cm /Im1 Do Q",
    "<< /Length 27 >>",
    "/XObject << /Im1 6 0 R >>",
    "6 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\nabc\nendstream\nendobj\n",
  ));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.pdf_image_xobject_present, true);
  assert.strictEqual(result.pdf_render_check_required, true);
  return result.status;
});

check("pdf_flate_texto_comprimido_es_valido", () => {
  const compressed = zlib.deflateSync(Buffer.from("BT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET", "latin1"));
  const result = validateSandboxPdfArtifact(pdfWithStream(compressed, `<< /Length ${compressed.length} /Filter /FlateDecode >>`));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.pdf_text_present, true);
  return result.status;
});

check("pdf_sin_arbol_paginas_es_invalido", () => {
  const result = validateSandboxPdfArtifact(Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PDF_PAGE_TREE_MISSING");
  return result.status;
});

console.log("Sandbox PDF Visual Content Validator Tests");
for (const item of checks) printCheck(item.name, item.pass, item.value);
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

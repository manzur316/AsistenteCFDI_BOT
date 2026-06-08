const assert = require("assert");
const {
  validateSandboxPdfArtifact,
  validateSandboxXmlArtifact,
} = require("./lib/sandbox-artifact-content-validator");

const UUID = "00000000-0000-4000-8000-000000000716";
function validXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" SubTotal="100.00" Total="116.00">
  <cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${UUID}" /></cfdi:Complemento>
</cfdi:Comprobante>`;
}
function validPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

const checks = [];
function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

check("xml_cfdi_valido", () => {
  const result = validateSandboxXmlArtifact(validXml());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "VALID");
  assert.strictEqual(result.uuid_present, true);
  return result.status;
});

check("xml_placeholder_rechazado", () => {
  const result = validateSandboxXmlArtifact("CFDI XML");
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "INVALID_PLACEHOLDER");
  return result.status;
});

check("xml_json_success_rechazado", () => {
  const result = validateSandboxXmlArtifact('{"status":"success"}');
  assert.strictEqual(result.ok, false);
  assert.ok(["INVALID_PLACEHOLDER", "INVALID_XML"].includes(result.status));
  return result.status;
});

check("xml_sin_timbre_uuid_rechazado", () => {
  const result = validateSandboxXmlArtifact('<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0"></cfdi:Comprobante>');
  assert.strictEqual(result.ok, false);
  assert.ok(["CFDI_MARKERS_MISSING", "UUID_MISSING"].includes(result.status));
  return result.status;
});

check("pdf_valido", () => {
  const result = validateSandboxPdfArtifact(validPdf());
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "VALID");
  return result.size_bytes;
});

check("pdf_placeholder_rechazado", () => {
  const result = validateSandboxPdfArtifact(Buffer.from("CFDI PDF"));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "INVALID_PLACEHOLDER");
  return result.status;
});

check("pdf_texto_plano_rechazado", () => {
  const result = validateSandboxPdfArtifact(Buffer.from("success"));
  assert.strictEqual(result.ok, false);
  assert.ok(["INVALID_PLACEHOLDER", "PDF_MAGIC_MISSING"].includes(result.status));
  return result.status;
});

check("pdf_muy_pequeno_rechazado", () => {
  const result = validateSandboxPdfArtifact(Buffer.from("%PDF-1.4\n%%EOF"));
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "PDF_TOO_SMALL");
  return result.status;
});

for (const item of checks) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}
const failed = checks.filter((item) => !item.pass);
console.log(`\nPASS total ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);

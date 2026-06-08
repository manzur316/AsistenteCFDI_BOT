const assert = require("assert");
const { validateSandboxXmlArtifact } = require("./lib/sandbox-artifact-content-validator");

const xml = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
const result = validateSandboxXmlArtifact(xml);
assert.strictEqual(result.ok, true);
assert.strictEqual(result.xml_contains_redaction_markers, false);
console.log("XML Raw Artifact Not Redacted Test");
console.log(" - raw_xml_valid: PASS (VALID)");
console.log("\nPASS total: 1/1");

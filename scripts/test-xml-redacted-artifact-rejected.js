const assert = require("assert");
const { validateSandboxXmlArtifact } = require("./lib/sandbox-artifact-content-validator");

const xml = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Emisor Rfc=\"[REDACTED_RFC]\" Nombre=\"Demo\"/><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
const result = validateSandboxXmlArtifact(xml);
assert.strictEqual(result.ok, false);
assert.strictEqual(result.status, "XML_SANITIZED_ARTIFACT_INVALID");
assert.strictEqual(result.xml_contains_redaction_markers, true);
console.log("XML Redacted Artifact Rejected Test");
console.log(" - redacted_xml_rejected: PASS (XML_SANITIZED_ARTIFACT_INVALID)");
console.log("\nPASS total: 1/1");

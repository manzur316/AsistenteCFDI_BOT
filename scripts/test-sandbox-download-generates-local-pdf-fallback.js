const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const temp = path.join(root, "runtime", "test-sandbox-download-local-pdf-fallback");

function validXml() {
  return `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="F" Folio="25" Fecha="2026-06-08T10:00:00" SubTotal="800.00" Total="928.00" MetodoPago="PUE" FormaPago="03" LugarExpedicion="77500"><cfdi:Emisor Rfc="AAA010101AAA" Nombre="EMISOR DEMO"/><cfdi:Receptor Rfc="BBB010101BBB" Nombre="REAL BILBAO" UsoCFDI="G03"/><cfdi:Conceptos><cfdi:Concepto ClaveProdServ="81111811" Cantidad="1" ClaveUnidad="E48" Descripcion="Servicio sandbox" ValorUnitario="800.00" Importe="800.00"/></cfdi:Conceptos><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="00000000-0000-4000-8000-000000000716" FechaTimbrado="2026-06-08T10:01:00"/></cfdi:Complemento></cfdi:Comprobante>`;
}

function structuralOnlyPdf() {
  return Buffer.concat([
    Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /XObject << /Im1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 12 >>\nstream\n/Im1 Do\nendstream\nendobj\n5 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Length 3 >>\nstream\nabc\nendstream\nendobj\n", "latin1"),
    Buffer.alloc(1100, "A"),
    Buffer.from("\n%%EOF", "latin1"),
  ]);
}

async function main() {
  fs.rmSync(temp, { recursive: true, force: true });
  fs.mkdirSync(temp, { recursive: true });
  const result = await runSandboxDraftDownloadArtifacts({
    storageRoot: temp,
    draft: {
      draft_id: "DRAFT-LOCAL-PDF-FALLBACK",
      status: "APROBADO",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLI-DEMO",
      current_client: { client_id: "CLI-DEMO", display_name: "Real Bilbao" },
      sandbox_pac_summary: {
        cfdi_uid: "CFDIUID716",
        uuid: "00000000-0000-4000-8000-000000000716",
        pac_invoice_id: "CFDIUID716",
        serie: "F",
        folio: "25",
      },
    },
    env: {
      FACTURACOM_SANDBOX_MODE: "live",
      FACTURACOM_SANDBOX_LIVE: "1",
      FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
      FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
      FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
      FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    },
    adapterContext: {
      requestFn: async (request) => request.path.endsWith("/xml")
        ? { ok: true, status: 200, contentType: "application/xml", rawText: validXml() }
        : { ok: true, status: 200, contentType: "application/pdf", rawBuffer: structuralOnlyPdf() },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.pdf_source, "LOCAL_RENDERED_FROM_XML");
  assert.strictEqual(result.output.provider_pdf_content_valid, false);
  assert.strictEqual(result.output.pdf_content_valid, true);
  assert(result.output.human_pdf_path.endsWith("_LOCAL.pdf"));
  console.log("Sandbox Download Generates Local PDF Fallback Tests");
  console.log(" - local_pdf_fallback_created: PASS (LOCAL_RENDERED_FROM_XML)");
  console.log("\nPASS total: 1/1");
}

main().catch((error) => {
  console.error(` - local_pdf_fallback_created: FAIL (${error.message})`);
  console.log("\nPASS total: 0/1");
  process.exit(1);
});

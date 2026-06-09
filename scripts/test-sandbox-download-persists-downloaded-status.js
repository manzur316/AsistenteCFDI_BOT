const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { runSandboxDraftDownloadArtifacts } = require("./lib/sandbox-draft-download-artifacts-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-download-persists-downloaded-status");

if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const uuid = "00000000-0000-4000-8000-000000000718";
const validXml = `<?xml version="1.0"?><cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" Version="4.0" Serie="F" Folio="31"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" UUID="${uuid}" /></cfdi:Complemento></cfdi:Comprobante>`;
const validPdf = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

async function requestFn(request) {
  if (request.path.endsWith("/xml")) {
    return { ok: true, status: 200, statusText: "OK", contentType: "application/xml", rawText: validXml, data: validXml };
  }
  return { ok: true, status: 200, statusText: "OK", contentType: "application/pdf", rawBuffer: validPdf };
}

let capturedSql = "";
(async () => {
  const result = await runSandboxDraftDownloadArtifacts({
    draft: {
      draft_id: "DRAFT-DOWNLOAD-PERSIST-718",
      status: "APROBADO",
      invoice_status: "SANDBOX_TIMBRADO",
      payment_status: "PENDIENTE",
      emitter_id: "EMITTER-DEMO",
      client_id: "CLI-REAL-BILBAO",
      total: 1160,
      current_client: { client_id: "CLI-REAL-BILBAO", display_name: "Real Bilbao" },
      provider_client_link: { provider_client_uid: "UID-PROVIDER-REAL-BILBAO", sync_status: "SYNCED" },
      sandbox_pac_summary: {
        provider: "Factura.com Sandbox",
        mode: "live",
        cfdi_uid: "CFDIUID718",
        uuid,
        pac_invoice_id: "PACINV718",
        serie: "F",
        folio: "31",
        artifact_status: "DOWNLOAD_READY",
        provider_client_uid_source: "provider_client_links",
        provider_client_uid: "UID-PROVIDER-REAL-BILBAO",
        provider_client_link_status: "FOUND",
        legacy_receiver_uid_used: false,
        xml_provider_available: true,
        pdf_provider_available: true,
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
    storageRoot: tempRoot,
    adapterContext: { requestFn },
    execFileSync: (_command, args) => {
      capturedSql = args[args.length - 1];
      return `${JSON.stringify({
        draft_id: "DRAFT-DOWNLOAD-PERSIST-718",
        invoice_status: "SANDBOX_TIMBRADO",
        payment_status: "PENDIENTE",
        sandbox_pac_summary: {
          artifact_status: "DOWNLOADED",
          uuid_present: true,
          cfdi_uid_present: true,
          pac_invoice_id_present: true,
          serie_present: true,
          folio_present: true,
          provider_client_uid_source: "provider_client_links",
          provider_client_link_status: "FOUND",
        },
      })}\n`;
    },
  });

  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.artifact_status, "DOWNLOADED");
  assert.strictEqual(result.output.persistence_status, "UPDATED");
  assert.strictEqual(result.output.persistence_row.sandbox_pac_summary.artifact_status, "DOWNLOADED");
  assert(capturedSql.includes('"artifact_status":"DOWNLOADED"'), "DOWNLOADED artifact status not persisted");
  assert(capturedSql.includes(`"uuid":"${uuid}"`), "uuid not preserved in persistence SQL");
  assert(capturedSql.includes('"serie":"F"'), "serie not preserved in persistence SQL");
  assert(capturedSql.includes('"folio":"31"'), "folio not preserved in persistence SQL");
  assert(capturedSql.includes('"provider_client_uid_source":"provider_client_links"'), "provider link source not preserved");
  assert(capturedSql.includes('"provider_client_link_status":"FOUND"'), "provider link status not preserved");
  assert(!capturedSql.includes('"artifact_status":"NOT_REQUESTED"'), "persistence degraded artifact status");
  assert(!capturedSql.includes('"provider_client_uid_source":"missing"'), "persistence degraded provider link source");

  console.log("Sandbox Download Persists Downloaded Status Tests");
  console.log(" - download_persists_downloaded_status: PASS (DOWNLOADED)");
  console.log("\nPASS total: 1/1");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

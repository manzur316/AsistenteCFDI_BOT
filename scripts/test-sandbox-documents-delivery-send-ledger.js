const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDocumentDeliverySend,
} = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-delivery-send-ledger");
if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000717\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

function files() {
  const dir = path.join(tempRoot, String(Date.now()), "exports");
  fs.mkdirSync(dir, { recursive: true });
  const xml = path.join(dir, "cfdi.xml");
  const pdf = path.join(dir, "cfdi.pdf");
  fs.writeFileSync(xml, VALID_XML);
  fs.writeFileSync(pdf, VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

function draft() {
  const f = files();
  return {
    draft_id: "DRAFT-DELIVERY-SEND-717",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    total: 928,
    current_client: {
      display_name: "Real Bilbao",
      email: "cliente@example.com",
      email_confirmed: true,
      provider_email_sync_status: "SYNCED",
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: f.xml,
      human_pdf_path: f.pdf,
      pdf_source: "PROVIDER",
      provider_pdf_content_valid: true,
    },
  };
}

function execNoDuplicate(_command, args) {
  const sql = args.join(" ");
  if (sql.includes("delivery_status = 'SENT'")) return "\n";
  const status = sql.includes("'SENT'") ? "SENT" : sql.includes("'DRY_RUN'") ? "DRY_RUN" : "READY";
  return JSON.stringify({
    delivery_id: "DELIV-" + status,
    delivery_status: status,
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    recipient_redacted: "[REDACTED_CHAT_ID len=9]",
    sent_at: status === "SENT" ? "2026-06-08T12:00:00.000Z" : null,
  }) + "\n";
}

(async () => {
  const dryRun = await runSandboxDocumentDeliverySend({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
    execFileSync: execNoDuplicate,
  });
  assert.strictEqual(dryRun.status, "OK");
  assert.strictEqual(dryRun.output.delivery_ledger.delivery_status, "DRY_RUN");

  const sent = await runSandboxDocumentDeliverySend({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: false,
    confirmed: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
    requestFn: () => ({ ok: true, status: 200, data: { ok: true } }),
    execFileSync: execNoDuplicate,
  });
  assert.strictEqual(sent.status, "OK");
  assert.strictEqual(sent.output.delivery_ledger.delivery_status, "SENT");

  const duplicate = await runSandboxDocumentDeliverySend({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: false,
    confirmed: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
    execFileSync: () => JSON.stringify({
      delivery_id: "DELIV-SENT-OLD",
      delivery_status: "SENT",
      recipient_redacted: "[REDACTED_CHAT_ID len=9]",
      sent_at: "2026-06-08T11:00:00.000Z",
    }) + "\n",
  });
  assert.strictEqual(duplicate.status, "BLOCKED_DUPLICATE");

  const forced = await runSandboxDocumentDeliverySend({
    draft: draft(),
    channel: "TELEGRAM_DOCUMENT_CHANNEL",
    dryRun: false,
    confirmed: true,
    force: true,
    env: {
      TELEGRAM_DOCUMENT_DELIVERY_ENABLED: "1",
      TELEGRAM_DOCUMENT_DELIVERY_CHAT_ID: "123456789",
      TELEGRAM_BOT_TOKEN: "TEST_TOKEN_NOT_REAL",
    },
    requestFn: () => ({ ok: true, status: 200, data: { ok: true } }),
    execFileSync: execNoDuplicate,
  });
  assert.strictEqual(forced.status, "OK");
  assert.strictEqual(forced.output.delivery_ledger.delivery_status, "SENT");

  const raw = JSON.stringify({ dryRun, sent, duplicate, forced });
  assert(!raw.includes("TEST_TOKEN_NOT_REAL"));
  assert(!raw.includes("123456789"));
  assert(!raw.includes("cliente@example.com"));

  console.log("Sandbox Documents Delivery Send Ledger Tests");
  console.log(" - dry_run_records_dry_run: PASS (DRY_RUN)");
  console.log(" - send_real_records_sent: PASS (SENT)");
  console.log(" - duplicate_blocks: PASS (BLOCKED_DUPLICATE)");
  console.log(" - force_allows_resend: PASS (SENT)");
  console.log("\nPASS total: 4/4");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

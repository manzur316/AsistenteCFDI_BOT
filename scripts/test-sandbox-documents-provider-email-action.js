const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  runSandboxDocumentDeliveryDiagnose,
  runSandboxDocumentDeliverySend,
} = require("./lib/sandbox-document-delivery-action");

const root = path.resolve(__dirname, "..");
const tempRoot = path.join(root, "runtime", "test-sandbox-documents-provider-email-action");
const checks = [];
let fixtureCounter = 0;

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

if (fs.existsSync(tempRoot)) fs.rmSync(tempRoot, { recursive: true, force: true });
fs.mkdirSync(tempRoot, { recursive: true });

const VALID_XML = "<?xml version=\"1.0\"?><cfdi:Comprobante xmlns:cfdi=\"http://www.sat.gob.mx/cfd/4\" Version=\"4.0\"><cfdi:Complemento><tfd:TimbreFiscalDigital xmlns:tfd=\"http://www.sat.gob.mx/TimbreFiscalDigital\" UUID=\"00000000-0000-4000-8000-000000000716\" /></cfdi:Complemento></cfdi:Comprobante>";
const VALID_PDF = Buffer.concat([
  Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 720 Td (CFDI sandbox) Tj ET\nendstream\nendobj\n5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n", "latin1"),
  Buffer.alloc(1100, "A"),
  Buffer.from("\n%%EOF", "latin1"),
]);

function writeFiles() {
  fixtureCounter += 1;
  const dir = path.join(tempRoot, `case-${fixtureCounter}`, "exports");
  fs.mkdirSync(dir, { recursive: true });
  const xml = path.join(dir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.xml");
  const pdf = path.join(dir, "Real-Bilbao_2026-06-08_F-24_SANDBOX.pdf");
  fs.writeFileSync(xml, VALID_XML);
  fs.writeFileSync(pdf, VALID_PDF);
  return {
    xml: path.relative(root, xml).replace(/\\/g, "/"),
    pdf: path.relative(root, pdf).replace(/\\/g, "/"),
  };
}

function draft({ email = null, confirmed = false } = {}) {
  const files = writeFiles();
  return {
    draft_id: "DRAFT-PROVIDER-EMAIL-716",
    client_id: "CLI-REAL-BILBAO",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    total: 1160,
    current_client: {
      client_id: "CLI-REAL-BILBAO",
      display_name: "Real Bilbao",
      email,
      email_confirmed: confirmed,
    },
    sandbox_pac_summary: {
      artifact_status: "DOWNLOADED",
      human_xml_path: files.xml,
      human_pdf_path: files.pdf,
      cfdi_uid: "CFDIUID716",
      uuid: "00000000-0000-4000-8000-000000000716",
    },
  };
}

check("provider_email_diagnose_needs_recipient_without_email", () => {
  const result = runSandboxDocumentDeliveryDiagnose({
    draft: draft(),
    channel: "PROVIDER_EMAIL",
  });
  assert.strictEqual(result.status, "NEEDS_RECIPIENT");
  assert.strictEqual(result.output.provider_email_ready, false);
  return result.status;
});

check("provider_email_dry_run_redacts_unconfirmed_email", async () => {
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ email: "cliente.real@example.com", confirmed: false }),
    channel: "PROVIDER_EMAIL",
    dryRun: true,
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.status, "DRY_RUN");
  assert.strictEqual(result.output.recipient_email_redacted, "c***@example.com");
  assert(result.warnings.includes("CLIENT_EMAIL_NOT_CONFIRMED_DRY_RUN_ONLY"));
  const raw = JSON.stringify(result);
  assert(!/cliente\.real@example\.com|00000000-0000-4000-8000-000000000716/.test(raw), "email or UUID leaked");
  return result.output.status;
});

check("provider_email_real_send_requires_confirmation", async () => {
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ email: "cliente.real@example.com", confirmed: false }),
    channel: "PROVIDER_EMAIL",
    dryRun: false,
  });
  assert.strictEqual(result.status, "NEEDS_RECIPIENT");
  assert(result.errors.includes("CLIENT_PRIMARY_EMAIL_NOT_CONFIRMED"));
  return result.status;
});

check("provider_email_real_send_requires_env_guard", async () => {
  const calls = [];
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ email: "cliente.real@example.com", confirmed: true }),
    channel: "PROVIDER_EMAIL",
    dryRun: false,
    confirmRecipient: true,
    env: {
      SATBOT_PROVIDER_EMAIL_ALLOWLIST: "cliente.real@example.com",
    },
    adapter: {
      sendInvoiceEmail: async () => {
        calls.push("called");
        return { ok: true };
      },
    },
  });
  assert.strictEqual(result.status, "PROVIDER_EMAIL_REAL_SEND_DISABLED");
  assert.strictEqual(calls.length, 0);
  assert(result.errors.includes("PROVIDER_EMAIL_REAL_SEND_DISABLED"));
  return result.status;
});

check("provider_email_real_send_requires_allowlist", async () => {
  const calls = [];
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ email: "cliente.real@example.com", confirmed: true }),
    channel: "PROVIDER_EMAIL",
    dryRun: false,
    confirmRecipient: true,
    env: {
      SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED: "1",
      SATBOT_PROVIDER_EMAIL_ALLOWLIST: "otro@example.com",
    },
    adapter: {
      sendInvoiceEmail: async () => {
        calls.push("called");
        return { ok: true };
      },
    },
  });
  assert.strictEqual(result.status, "PROVIDER_EMAIL_OUTSIDE_ALLOWLIST");
  assert.strictEqual(calls.length, 0);
  assert(result.errors.includes("PROVIDER_EMAIL_OUTSIDE_ALLOWLIST"));
  return result.status;
});

check("provider_email_real_send_uses_adapter_when_confirmed", async () => {
  const calls = [];
  const result = await runSandboxDocumentDeliverySend({
    draft: draft({ email: "cliente.real@example.com", confirmed: true }),
    channel: "PROVIDER_EMAIL",
    dryRun: false,
    confirmRecipient: true,
    env: {
      SATBOT_PROVIDER_EMAIL_REAL_SEND_ENABLED: "1",
      SATBOT_PROVIDER_EMAIL_ALLOWLIST: "cliente.real@example.com",
    },
    adapter: {
      sendInvoiceEmail: async (invoiceRef, context) => {
        calls.push({ invoiceRef, context });
        return {
          ok: true,
          provider: "factura_com",
          operation: "sendInvoiceEmail",
          delivery_channel: "PROVIDER_EMAIL",
          status: "SENT",
          provider_message: "Email sandbox enviado",
          normalized_errors: [],
          normalized_warnings: [],
        };
      },
    },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.status, "SENT");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].invoiceRef.cfdi_uid, "CFDIUID716");
  return result.output.status;
});

Promise.all(checks).then((results) => {
  console.log("Sandbox Documents Provider Email Action Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

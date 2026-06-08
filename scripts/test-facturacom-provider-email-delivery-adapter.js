const assert = require("assert");

const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

const checks = [];

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

function env(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_MODE: "live",
    FACTURACOM_SANDBOX_LIVE: "1",
    FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
    FACTURACOM_API_KEY: "SANDBOXKEYLOCAL123",
    FACTURACOM_SECRET_KEY: "SANDBOXSECRETLOCAL123",
    FACTURACOM_PLUGIN: "SANDBOXPLUGINLOCAL123",
    ...overrides,
  };
}

check("send_invoice_email_uses_sandbox_endpoint", async () => {
  let called = null;
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.sendInvoiceEmail({ cfdi_uid: "CFDIUID716" }, {
    env: env(),
    recipient: { email: "cliente@example.com" },
    requestFn: async (request) => {
      called = request;
      return { ok: true, status: 200, statusText: "OK", data: { response: "success", message: "Correo enviado" } };
    },
  });
  assert.strictEqual(called.method, "GET");
  assert.strictEqual(called.path, "/v4/cfdi40/CFDIUID716/email");
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.status, "SENT");
  assert.strictEqual(result.delivery_channel, "PROVIDER_EMAIL");
  assert.strictEqual(result.recipient_email_present, true);
  const raw = JSON.stringify(result);
  assert(!/SANDBOXKEYLOCAL123|SANDBOXSECRETLOCAL123|SANDBOXPLUGINLOCAL123|cliente@example\.com/.test(raw), "secret/email leaked");
  return result.status;
});

check("send_invoice_email_requires_live_sandbox", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: env({ FACTURACOM_SANDBOX_MODE: "mock" }) });
  const result = await adapter.sendInvoiceEmail({ cfdi_uid: "CFDIUID716" }, { env: env({ FACTURACOM_SANDBOX_MODE: "mock" }) });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  return result.normalized_errors[0].code;
});

check("send_invoice_email_blocks_production_url", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: env({ FACTURACOM_BASE_URL: "https://api.factura.com" }) });
  const result = await adapter.sendInvoiceEmail({ cfdi_uid: "CFDIUID716" }, { env: env({ FACTURACOM_BASE_URL: "https://api.factura.com" }) });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_CONFIG");
  assert(!/https:\/\/api\.factura\.com/.test(JSON.stringify(result)), "production URL leaked");
  return result.status;
});

check("send_invoice_email_requires_identity", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: env() });
  const result = await adapter.sendInvoiceEmail({}, { env: env() });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.status, "NEEDS_RUNTIME");
  return result.normalized_errors[0].code;
});

Promise.all(checks).then((results) => {
  console.log("Factura.com Provider Email Delivery Adapter Tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

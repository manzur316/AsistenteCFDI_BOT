const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { assertPacAdapter, PAC_ENVIRONMENTS } = require("./lib/pac-adapter-contract");
const {
  ADAPTER_NAME,
  ENV_KEYS,
  PROVIDER,
  FacturaComSandboxAdapter,
} = require("./lib/factura-com-sandbox-adapter");

const root = path.resolve(__dirname, "..");
const adapterPath = path.join(root, "scripts", "lib", "factura-com-sandbox-adapter.js");
const envExamplePath = path.join(root, ".env.pac.sandbox.example");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

const checks = [];
const pendingChecks = [];

function check(name, fn) {
  try {
    const value = fn();
    checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
  } catch (error) {
    checks.push({ name, pass: false, value: error.message });
  }
}

async function checkAsync(name, fn) {
  const pending = (async () => {
    try {
      const value = await fn();
      checks.push({ name, pass: true, value: value === undefined ? "" : String(value) });
    } catch (error) {
      checks.push({ name, pass: false, value: error.message || String(error) });
    }
  })();
  pendingChecks.push(pending);
}

function sandboxEnv(overrides = {}) {
  return {
    FACTURACOM_SANDBOX_BASE_URL: "https://sandbox.example.test",
    FACTURACOM_SANDBOX_API_KEY: "TEST_SANDBOX_API_KEY",
    FACTURACOM_SANDBOX_SECRET_KEY: "TEST_SANDBOX_SECRET_KEY",
    FACTURACOM_SANDBOX_LIVE: "0",
    ...overrides,
  };
}

function fakeContext() {
  return {
    emitter: {
      id: "EMITTER-DEMO",
      name: "Emisor Demo",
      rfc: "AAA010101AAA",
      regimen_fiscal: "626",
      codigo_postal_fiscal: "00000",
    },
  };
}

function fakeDraft() {
  return {
    draft_id: "DRAFT-PAC-DEMO-001",
    update_id: 1001,
    message_id: "2001",
    client: {
      id: "CLIENT-DEMO",
      name: "Cliente Demo",
      rfc: "XAXX010101000",
      regimen_fiscal: "616",
      codigo_postal_fiscal: "00000",
      uso_cfdi: "S01",
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
    },
    subtotal: 1000,
    iva_amount: 160,
    total: 1160,
  };
}

function getChangedPaths() {
  const output = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: root,
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^.. /, "").replace(/\\/g, "/"));
}

check("adapter_satisfies_contract", () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv(), httpClient: async () => ({ ok: true }) });
  const result = assertPacAdapter(adapter);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(adapter.adapterName, ADAPTER_NAME);
  assert.strictEqual(adapter.provider, PROVIDER);
  return result.methods.length;
});

check("production_disabled", () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv(), httpClient: async () => ({ ok: true }) });
  assert.strictEqual(adapter.environment, PAC_ENVIRONMENTS.SANDBOX);
  assert.strictEqual(adapter.supportsProduction, false);
  assert.strictEqual(typeof adapter.stampProduction, "undefined");
  return "sandbox only";
});

check("env_keys_are_sandbox_only", () => {
  assert.deepStrictEqual(ENV_KEYS, {
    BASE_URL: "FACTURACOM_SANDBOX_BASE_URL",
    API_KEY: "FACTURACOM_SANDBOX_API_KEY",
    SECRET_KEY: "FACTURACOM_SANDBOX_SECRET_KEY",
    LIVE: "FACTURACOM_SANDBOX_LIVE",
  });
  return Object.values(ENV_KEYS).join(",");
});

check("public_config_redacts_credentials", () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv(), httpClient: async () => ({ ok: true }) });
  const publicConfig = adapter.getPublicConfig();
  assert(!publicConfig.apiKey.includes("TEST_SANDBOX_API_KEY"));
  assert(!publicConfig.secretKey.includes("TEST_SANDBOX_SECRET_KEY"));
  assert(publicConfig.apiKey.includes("[redacted]"));
  assert.strictEqual(publicConfig.liveEnabled, false);
  return "redacted";
});

check("payload_fake_valido", () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv(), httpClient: async () => ({ ok: true }) });
  const payload = adapter.createDraftPayload(fakeDraft(), fakeContext());
  const validation = adapter.validatePayload(payload);
  assert.strictEqual(payload.provider, "FACTURA_COM");
  assert.strictEqual(payload.environment, "SANDBOX");
  assert.strictEqual(payload.cfdi_version, "4.0");
  assert.strictEqual(payload.requires_human_review, true);
  assert.strictEqual(validation.ok, true, validation.errors.join(", "));
  return `${payload.items.length} item`;
});

check("payload_invalido_reporta_errores", () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv(), httpClient: async () => ({ ok: true }) });
  const validation = adapter.validatePayload({ provider: "FACTURA_COM", environment: "SANDBOX" });
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.some((item) => item.includes("draft_id")));
  assert(validation.errors.some((item) => item.includes("items")));
  return validation.errors.length;
});

checkAsync("real_sandbox_calls_disabled_without_live_flag", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: sandboxEnv() });
  const payload = adapter.createDraftPayload(fakeDraft(), fakeContext());
  await assert.rejects(
    () => adapter.stampSandbox(payload),
    (error) => error.code === "FACTURA_COM_SANDBOX_LIVE_DISABLED",
  );
  return "FACTURACOM_SANDBOX_LIVE=0";
});

checkAsync("missing_env_rejected_before_network", async () => {
  const adapter = new FacturaComSandboxAdapter({ env: {}, httpClient: async () => ({ ok: true }) });
  const payload = adapter.createDraftPayload(fakeDraft(), fakeContext());
  await assert.rejects(
    () => adapter.stampSandbox(payload),
    (error) => error.code === "FACTURA_COM_SANDBOX_CONFIG_MISSING",
  );
  return "missing sandbox env";
});

checkAsync("stampSandbox_uses_mock_http_client", async () => {
  const requests = [];
  const adapter = new FacturaComSandboxAdapter({
    env: sandboxEnv(),
    httpClient: async (request) => {
      requests.push(request);
      return { data: { id: "sandbox-invoice-1", uuid: "SANDBOX-UUID-1" } };
    },
  });
  const payload = adapter.createDraftPayload(fakeDraft(), fakeContext());
  const response = await adapter.stampSandbox(payload);
  assert.strictEqual(requests.length, 1);
  assert.strictEqual(requests[0].method, "POST");
  assert.strictEqual(requests[0].url, "https://sandbox.example.test/cfdi40/stamp");
  assert.strictEqual(requests[0].headers["X-Api-Key"], "TEST_SANDBOX_API_KEY");
  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.status, "SANDBOX_STAMPED");
  assert.strictEqual(response.invoice_ref.uuid, "SANDBOX-UUID-1");
  return response.status;
});

checkAsync("download_and_status_use_mock_http_client", async () => {
  const paths = [];
  const adapter = new FacturaComSandboxAdapter({
    env: sandboxEnv({ FACTURACOM_SANDBOX_BASE_URL: "https://sandbox.example.test/" }),
    httpClient: async (request) => {
      paths.push(request.url);
      if (request.url.endsWith("/xml")) return { data: { xml: "<xml>demo</xml>" } };
      if (request.url.endsWith("/pdf")) return { data: { pdf: "PDF-DEMO" } };
      return { data: { status: "SANDBOX_READY" } };
    },
  });
  const invoiceRef = { id: "sandbox-invoice-1" };
  const xml = await adapter.downloadXml(invoiceRef);
  const pdf = await adapter.downloadPdf(invoiceRef);
  const status = await adapter.getStatus(invoiceRef);
  assert.strictEqual(xml.content, "<xml>demo</xml>");
  assert.strictEqual(pdf.content, "PDF-DEMO");
  assert.strictEqual(status.status, "SANDBOX_READY");
  assert(paths.every((value) => value.startsWith("https://sandbox.example.test/cfdi40/sandbox-invoice-1")));
  return paths.length;
});

checkAsync("errores_normalizados", async () => {
  const adapter = new FacturaComSandboxAdapter({
    env: sandboxEnv(),
    httpClient: async () => {
      const error = new Error("PAC sandbox fallo");
      error.response = { status: 422, data: { error: "demo" } };
      throw error;
    },
  });
  const payload = adapter.createDraftPayload(fakeDraft(), fakeContext());
  await assert.rejects(
    () => adapter.stampSandbox(payload),
    (error) => {
      assert.strictEqual(error.ok, false);
      assert.strictEqual(error.provider, "FACTURA_COM");
      assert.strictEqual(error.environment, "SANDBOX");
      assert.strictEqual(error.http_status, 422);
      return true;
    },
  );
  return "normalized";
});

check("adapter_no_hardcoded_credentials_or_production", () => {
  const source = fs.readFileSync(adapterPath, "utf8");
  assert(!/FACTURACOM_PRODUCTION|stampProduction/i.test(source));
  assert(!/sk_live|pk_live|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(source));
  assert(source.includes("FACTURACOM_SANDBOX_BASE_URL"));
  return "source scan";
});

check("env_example_has_placeholders_only", () => {
  const text = fs.readFileSync(envExamplePath, "utf8");
  assert(text.includes("FACTURACOM_SANDBOX_LIVE=0"));
  assert(text.includes("FACTURACOM_SANDBOX_BASE_URL=REEMPLAZAR_SANDBOX_BASE_URL"));
  assert(text.includes("FACTURACOM_SANDBOX_API_KEY=REEMPLAZAR_SANDBOX_API_KEY"));
  assert(text.includes("FACTURACOM_SANDBOX_SECRET_KEY=REEMPLAZAR_SANDBOX_SECRET_KEY"));
  assert(!/sk_live|pk_live|Bearer\s+[A-Za-z0-9._-]{20,}/i.test(text));
  return ".env.pac.sandbox.example";
});

check("protected_paths_not_changed", () => {
  const protectedPaths = [
    "data/concepts.normalized.json",
    "data/base_cfdi_resico_n8n_emberhub_2026.xlsx",
    "workflow/cfdi_manual_test.n8n.json",
    "workflow/cfdi_telegram_postgres_polling.n8n.json",
    "workflow/cfdi_telegram_local_ingest.n8n.json",
  ];
  const changed = getChangedPaths();
  const touched = protectedPaths.filter((item) => changed.includes(item));
  assert.deepStrictEqual(touched, []);
  return "none";
});

check("no_real_rfc_or_client_names_in_new_files", () => {
  const forbiddenNames = [
    String.fromCharCode(74, 117, 97, 110, 100, 105),
    "Ember" + "hub",
    "CLIENTE" + "_" + "REAL",
    "RFC" + "_" + "REAL",
  ];
  const rfcLikePattern = /[A-Z&Ñ]{3,4}\d{6}[A-Z0-9]{3}/;
  const files = [
    "scripts/lib/factura-com-sandbox-adapter.js",
    "scripts/test-factura-com-sandbox-adapter.js",
    "scripts/smoke-factura-com-sandbox-adapter.js",
    "docs/FACTURACOM_SANDBOX_ADAPTER.md",
    ".env.pac.sandbox.example",
  ];
  const combined = files
    .filter((file) => fs.existsSync(path.join(root, file)))
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  const sanitized = combined.replace(/AAA010101AAA|XAXX010101000/g, "");
  for (const forbidden of forbiddenNames) assert(!sanitized.includes(forbidden));
  assert(!rfcLikePattern.test(sanitized));
  return "demo only";
});

(async () => {
  await Promise.all(pendingChecks);

  console.log("Factura.com Sandbox Adapter Tests");
  for (const item of checks) {
    printCheck(item.name, item.pass, item.value);
  }

  const failed = checks.filter((item) => !item.pass);
  console.log(`\nPASS total: ${checks.length - failed.length}/${checks.length}`);
  if (failed.length) {
    console.log(`FAIL total: ${failed.length}`);
    process.exit(1);
  }
})();

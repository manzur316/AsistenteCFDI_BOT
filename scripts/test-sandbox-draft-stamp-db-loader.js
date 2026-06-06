const assert = require("assert");

const {
  buildDraftByIdQuery,
  connectionFromEnv,
  loadDraftFromPostgres,
  normalizeDraftRow,
  parsePsqlJsonOutput,
} = require("./lib/sandbox-draft-db-loader");
const { runSandboxDraftStamp } = require("./lib/sandbox-draft-stamp-action");

const checks = [];

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function validDbRow(overrides = {}) {
  return {
    draft_id: "DRAFT-DB-OK",
    chat_id: "CHAT-DB",
    update_id: 71431,
    message_original: "venta de camara CCTV",
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    client_id: "CLIENT-DEMO",
    client_snapshot: {
      client_id: "CLIENT-DEMO",
      display_name: "Cliente Demo",
      razon_social: "CLIENTE DEMO SA DE CV",
      rfc: "XAXX010101000",
      regimen_fiscal: "616",
      codigo_postal_fiscal: "77500",
      uso_cfdi_default: "S01",
      validated_by_human: true,
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "VENTA DE CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "45121500",
      clave_unidad: "H87",
      unidad: "Pieza",
      familia: "CCTV",
      tipo: "PRODUCTO",
      operacion: "VENTA",
      objeto_imp: "02",
    },
    amount: 800,
    subtotal: 800,
    iva_amount: 128,
    isr_retention_amount: 0,
    iva_retention_amount: 0,
    total: 928,
    tax_mode: "ADD_IVA",
    tax_summary: {},
    line_items: [],
    blockers: [],
    ...overrides,
  };
}

check("build_query_selects_draft_client_and_line_items", () => {
  const sql = buildDraftByIdQuery("DRAFT-20260606-062030-173694217");
  assert(sql.includes("FROM cfdi_drafts d"));
  assert(sql.includes("LEFT JOIN cfdi_clients c"));
  assert(sql.includes("cfdi_draft_line_items"));
  assert(sql.includes("WHERE d.draft_id = 'DRAFT-20260606-062030-173694217'"));
  assert(!sql.includes("raw_payload"));
  return "query";
});

check("parse_and_normalize_db_row", () => {
  const row = validDbRow({ concept: {}, line_items: [{ concept_id: "SVC-1", concepto_factura: "SERVICIO", clave_prod_serv: "81111811", clave_unidad: "E48", unidad: "Unidad", subtotal: 100, iva_amount: 16, total: 116, tax_mode: "ADD_IVA" }] });
  const parsed = parsePsqlJsonOutput(`${JSON.stringify(row)}\n`);
  const draft = normalizeDraftRow(parsed);
  assert.strictEqual(draft.draft_id, "DRAFT-DB-OK");
  assert.strictEqual(draft.concept.id, "SVC-1");
  assert.strictEqual(draft.total, 928);
  return draft.concept.id;
});

check("load_draft_from_postgres_uses_psql_and_normalizes", () => {
  const row = validDbRow();
  const seen = {};
  const draft = loadDraftFromPostgres("DRAFT-DB-OK", {
    env: { CFDI_PGPASSWORD: "LOCAL_TEST_PASSWORD" },
    execFileSync: (bin, args, options) => {
      seen.bin = bin;
      seen.args = args;
      seen.password = options.env.PGPASSWORD;
      return `${JSON.stringify(row)}\n`;
    },
  });
  assert.strictEqual(draft.draft_id, "DRAFT-DB-OK");
  assert.strictEqual(seen.bin, "psql");
  assert(seen.args.includes("-At"));
  assert.strictEqual(seen.password, "LOCAL_TEST_PASSWORD");
  return draft.invoice_status;
});

check("draft_id_existing_uses_loader_fixture", async () => {
  const result = await runSandboxDraftStamp({
    draftId: "DRAFT-DB-OK",
    draftLoader: async () => validDbRow(),
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
    adapter: { stampSandbox: async () => ({ ok: true, provider: "Factura.com Sandbox", environment: "SANDBOX", status: "OK", uuid: "00000000-0000-4000-8000-000000000000", pac_invoice_id: "UID-DEMO", xml_available: false, pdf_available: false }) },
  });
  assert.strictEqual(result.status, "OK");
  assert.strictEqual(result.output.invoice_status, "SANDBOX_TIMBRADO");
  assert.strictEqual(result.output.payment_status, "PENDIENTE");
  return result.output.invoice_status;
});

check("draft_id_missing_returns_stable_context_error", async () => {
  const result = await runSandboxDraftStamp({
    draftId: "DRAFT-NOT-FOUND",
    draftLoader: async () => null,
    env: { FACTURACOM_SANDBOX_LIVE: "1" },
  });
  assert.strictEqual(result.status, "ERROR");
  assert(result.errors.includes("DRAFT_NOT_FOUND"));
  assert.strictEqual(result.output.error_class, "DRAFT_CONTEXT_MISSING");
  assert(result.output.validation_error_codes.includes("DRAFT_CONTEXT_MISSING"));
  return result.output.error_class;
});

check("connection_defaults_accept_local_postgres_env", () => {
  const config = connectionFromEnv({
    POSTGRES_HOST: "localhost",
    POSTGRES_PORT: "5432",
    POSTGRES_DB: "cfdi_bot",
    POSTGRES_USER: "cfdi_bot_user",
    POSTGRES_PASSWORD: "CAMBIAR_PASSWORD_LOCAL",
  });
  assert.strictEqual(config.host, "localhost");
  assert.strictEqual(config.port, "5432");
  assert.strictEqual(config.database, "cfdi_bot");
  assert.strictEqual(config.user, "cfdi_bot_user");
  assert.strictEqual(config.password, "CAMBIAR_PASSWORD_LOCAL");
  return `${config.user}@${config.host}:${config.port}`;
});

Promise.all(checks).then((results) => {
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`PASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

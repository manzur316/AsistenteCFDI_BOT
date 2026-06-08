const assert = require("assert");
const fs = require("fs");

const docs = [
  "docs/TRIAL_MODE_DEMO_TENANT_ROADMAP.md",
  "docs/ROADMAP_SHARED_BOT_SUBSCRIPTION_ACCESS.md",
  "docs/ADR_0003_SHARED_TELEGRAM_BOT_ACCESS_MODEL.md",
];

function read(file) {
  return fs.readFileSync(file, "utf8");
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("trial_docs_existen", () => {
  for (const file of docs) assert(fs.existsSync(file), file);
  return docs.length;
});

test("trial_documenta_demo_privada_3_dias_5_facturas", () => {
  const text = read("docs/TRIAL_MODE_DEMO_TENANT_ROADMAP.md");
  for (const term of ["demos privadas", "3 dias", "5 facturas", "MODO PRUEBA"]) {
    assert(new RegExp(term, "i").test(text), term);
  }
  return "trial";
});

test("trial_no_produccion_y_sandbox_test", () => {
  const text = read("docs/TRIAL_MODE_DEMO_TENANT_ROADMAP.md");
  assert(/Factura\.com Sandbox/i.test(text));
  assert(/Facturapi Test/i.test(text));
  assert(/No produccion|No timbrado fiscal real/i.test(text));
  assert(/no CSD real/i.test(text));
  return "sandbox/test";
});

test("roadmap_trial_es_futuro_no_operativo", () => {
  const text = read("docs/ROADMAP_SHARED_BOT_SUBSCRIPTION_ACCESS.md");
  assert(/Etapa 5 - Trial Mode/i.test(text));
  assert(/No trial funcional real/i.test(text));
  assert(/No billing real/i.test(text));
  return "future";
});

test("adr_incluye_white_label_futuro_y_read_only", () => {
  const text = read("docs/ADR_0003_SHARED_TELEGRAM_BOT_ACCESS_MODEL.md");
  assert(/WHITE_LABEL_BOT/i.test(text));
  assert(/READ_ONLY/i.test(text));
  assert(/un solo bot Telegram compartido/i.test(text));
  return "ADR";
});

let pass = 0;
for (const item of tests) {
  try {
    const detail = item.fn();
    pass += 1;
    console.log(`PASS ${item.name}: ${detail}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`PASS total: ${pass}/${tests.length}`);

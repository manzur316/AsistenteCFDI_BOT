const assert = require("assert");
const { evaluateCfdi40Rules } = require("./lib/cfdi-rules/cfdi-rule-engine");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function baseInvoice(overrides = {}) {
  return {
    tipo_comprobante: "I",
    metodo_pago: "PPD",
    forma_pago: "99",
    subtotal: 100,
    total: 116,
    receptor: {
      rfc: "XAXX010101000",
      regimen_fiscal: "626",
      uso_cfdi: "G03",
    },
    line_items: [
      {
        product_service_key: "81111812",
        unit_key: "E48",
        tax_object: "02",
        quantity: 1,
        unit_price: 100,
        subtotal: 100,
        taxes: [{ type: "IVA", rate: "0.160000", amount: 16 }],
      },
    ],
    ...overrides,
  };
}

test("PPD requiere forma_pago 99", () => {
  const result = evaluateCfdi40Rules(baseInvoice({ forma_pago: "03" }));
  assert(result.blockers.some((item) => item.rule_id === "CFDI40_PAYMENT_PPD_REQUIRES_FORMA99"));
  return "blocker";
});

test("ObjetoImp 02 requiere impuestos", () => {
  const invoice = baseInvoice({
    line_items: [{ product_service_key: "81111812", unit_key: "E48", tax_object: "02", subtotal: 100, taxes: [] }],
  });
  const result = evaluateCfdi40Rules(invoice);
  assert(result.blockers.some((item) => item.rule_id === "CFDI40_OBJETOIMP_02_REQUIRES_CONCEPT_TAXES"));
  return "blocker";
});

test("UsoCFDI vs regimen incompatible bloquea", () => {
  const invoice = baseInvoice({ receptor: { rfc: "XAXX010101000", regimen_fiscal: "616", uso_cfdi: "G03" } });
  const result = evaluateCfdi40Rules(invoice);
  assert(result.blockers.some((item) => item.rule_id === "CFDI40_RECEPTOR_USO_CFDI_MATCHES_REGIMEN"));
  return "blocker";
});

test("Tasa 0.160000 pasa y tasa corta bloquea", () => {
  const ok = evaluateCfdi40Rules(baseInvoice());
  assert(!ok.blockers.some((item) => item.rule_id === "CFDI40_TASAOCUOTA_SIX_DECIMALS"));
  const bad = evaluateCfdi40Rules(baseInvoice({
    line_items: [{ tax_object: "02", subtotal: 100, taxes: [{ type: "IVA", rate: "0.16" }] }],
  }));
  assert(bad.blockers.some((item) => item.rule_id === "CFDI40_TASAOCUOTA_SIX_DECIMALS"));
  return "rate validation";
});

test("Rule engine devuelve contrato advisory", () => {
  const result = evaluateCfdi40Rules(baseInvoice());
  assert.strictEqual(result.requires_human_review, true);
  assert(Array.isArray(result.blockers));
  assert(Array.isArray(result.warnings));
  assert(Array.isArray(result.suggestions));
  assert(Array.isArray(result.evaluated_rules));
  return `${result.evaluated_rules.length} evaluated`;
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

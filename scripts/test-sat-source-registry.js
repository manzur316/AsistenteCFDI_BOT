const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  SAT_SOURCE_STATUSES,
  buildSatSourceRegistry,
} = require("./lib/sat-catalogs/sat-source-registry");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test("detecta XLS y PDF locales con hash", () => {
  const registry = buildSatSourceRegistry();
  const xls = registry.sources.find((source) => source.source_name.endsWith(".xls"));
  const pdf = registry.sources.find((source) => source.source_name.endsWith(".pdf"));
  assert(xls, "missing xls");
  assert(pdf, "missing pdf");
  if (xls.status !== SAT_SOURCE_STATUSES.NEEDS_SOURCE) {
    assert.match(xls.source_hash, /^[a-f0-9]{64}$/);
    assert.strictEqual(xls.catalog_version, "20260603");
  }
  if (pdf.status !== SAT_SOURCE_STATUSES.NEEDS_SOURCE) {
    assert.match(pdf.source_hash, /^[a-f0-9]{64}$/);
  }
  return `${xls.status}/${pdf.status}`;
});

test("ruta inexistente devuelve NEEDS_SOURCE sin fallar", () => {
  const sourceDir = path.join(os.tmpdir(), `missing-sat-${Date.now()}`);
  const registry = buildSatSourceRegistry({ sourceDir });
  assert.strictEqual(registry.ok, false);
  assert(registry.sources.every((source) => source.status === SAT_SOURCE_STATUSES.NEEDS_SOURCE));
  return "NEEDS_SOURCE";
});

test("no copia fuentes completas a data", () => {
  const forbidden = [
    path.join("data", "catCFDI_V_4_20260603.xls"),
    path.join("data", "Anexo_20_Guia_de_llenado_CFDI .pdf"),
  ];
  for (const file of forbidden) assert.strictEqual(fs.existsSync(file), false, file);
  return "no heavy copies";
});

let pass = 0;
for (const item of tests) {
  try {
    const detail = item.fn();
    pass += 1;
    console.log(`PASS ${item.name}${detail ? `: ${detail}` : ""}`);
  } catch (error) {
    console.error(`FAIL ${item.name}: ${error.message}`);
    process.exitCode = 1;
  }
}
console.log(`PASS total: ${pass}/${tests.length}`);

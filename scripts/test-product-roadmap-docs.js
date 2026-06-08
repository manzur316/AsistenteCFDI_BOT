const assert = require("assert");
const fs = require("fs");
const { spawnSync } = require("child_process");

const DOCS = [
  "docs/ADR_0002_SATBOT_PRODUCT_MODES_AND_APPROVALS.md",
  "docs/ROADMAP_SAAS_PRODUCT_MODES_APPROVALS.md",
  "docs/APPROVAL_POLICY_ARCHITECTURE.md",
  "docs/CHANNEL_ADAPTERS_TELEGRAM_WHATSAPP_ROADMAP.md",
];

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function allDocsText() {
  return DOCS.map(read).join("\n");
}

function gitDiffNameOnly(target) {
  const result = spawnSync("git", ["diff", "--name-only", "--", target], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("docs existen", () => {
  for (const file of DOCS) assert(fs.existsSync(file), file);
  return `${DOCS.length} docs`;
});

test("modos de producto y actores estan documentados", () => {
  const text = allDocsText();
  for (const term of [
    "DIRECT_BUSINESS_MODE",
    "ACCOUNTING_FIRM_MODE",
    "Cliente SATBOT",
    "Emisor fiscal",
    "Receptor CFDI",
    "Operador",
    "Contador",
    "Real Bilbao",
  ]) {
    assert(text.includes(term), term);
  }
  return "product modes";
});

test("approval policy, override y link futuro estan documentados", () => {
  const text = allDocsText();
  for (const term of [
    "SELF_APPROVAL",
    "DELEGATED_ACCOUNTANT",
    "CLIENT_APPROVAL_REQUIRED",
    "SEND_TO_CLIENT_APPROVAL",
    "aprobacion por link real",
    "un solo uso",
    "temporal",
    "revocable",
  ]) {
    assert(new RegExp(term, "i").test(text), term);
  }
  return "approval";
});

test("regeneracion de link y snapshot congelada estan documentadas", () => {
  const text = allDocsText();
  for (const term of [
    "approval_snapshot",
    "snapshot_hash",
    "Si el borrador no cambio",
    "Si el borrador cambio",
    "Solo debe existir un approval token activo",
    "Al generar uno nuevo, el anterior se revoca",
  ]) {
    assert(text.includes(term), term);
  }
  return "snapshot/link";
});

test("auditoria invisible y anti-complejidad estan documentadas", () => {
  const text = allDocsText();
  for (const term of [
    "draft_created",
    "approval_link_generated",
    "invoice_cancelled",
    "no satura Telegram",
    "Que problema resuelve",
    "Que problema nuevo crea",
    "Si el usuario lo tiene que ver",
  ]) {
    assert(new RegExp(term, "i").test(text), term);
  }
  return "audit/complexity";
});

test("channels documentan WhatsApp futuro no implementado", () => {
  const text = read("docs/CHANNEL_ADAPTERS_TELEGRAM_WHATSAPP_ROADMAP.md");
  assert(text.includes("TelegramAdapter"));
  assert(text.includes("WhatsAppAdapter"));
  assert(text.includes("WebApprovalAdapter"));
  assert(/WhatsApp es canal futuro, no implementado/i.test(text));
  assert(text.includes("No se implementa WhatsApp"));
  return "channels";
});

test("no se modifica workflow ni catalogo activo", () => {
  assert.strictEqual(gitDiffNameOnly("data/concepts.normalized.json"), "");
  assert.strictEqual(gitDiffNameOnly("workflow/cfdi_telegram_local_ingest.n8n.json"), "");
  assert.strictEqual(gitDiffNameOnly("workflow/cfdi_sandbox_action_router.n8n.json"), "");
  return "protected clean";
});

test("no se implementa panel web real ni approval link real", () => {
  const status = spawnSync("git", ["diff", "--name-only"], { encoding: "utf8" });
  assert.strictEqual(status.status, 0);
  const changed = status.stdout.trim().split(/\r?\n/).filter(Boolean);
  assert(!changed.some((file) => /^workflow\//.test(file)), "workflow changed");
  assert(!changed.some((file) => /^runtime\//.test(file)), "runtime changed");
  assert(!changed.some((file) => /^web|^app|^frontend/i.test(file)), "web implementation changed");
  return "docs/contracts only";
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

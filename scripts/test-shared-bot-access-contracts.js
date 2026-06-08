const assert = require("assert");
const fs = require("fs");
const { spawnSync } = require("child_process");

const {
  assertCanonicalChannelIdentity,
  buildCanonicalChannelIdentity,
  redactedChannelIdentity,
} = require("./lib/access-control/channel-identity-contract");
const { evaluateAccess } = require("./lib/access-control/access-gate");

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

function diffNameOnly(target) {
  const result = spawnSync("git", ["diff", "--name-only", "--", target], { encoding: "utf8" });
  assert.strictEqual(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test("telegram_user_id_no_es_tenant", () => {
  const identity = buildCanonicalChannelIdentity({
    channel: "TELEGRAM",
    telegram_user_id: "TGUSER-123",
    user_id: "USER-1",
    tenant_id: "TGUSER-123",
  });
  const validation = assertCanonicalChannelIdentity(identity);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("telegram_user_id no debe ser tenant_id"));
  return "guarded";
});

test("username_no_es_llave_primaria", () => {
  const identity = buildCanonicalChannelIdentity({
    channel: "TELEGRAM",
    telegram_user_id: "TGUSER-123",
    username: "TGUSER-123",
    user_id: "USER-1",
    tenant_id: "TENANT-1",
  });
  const validation = assertCanonicalChannelIdentity(identity);
  assert.strictEqual(validation.ok, false);
  assert(validation.errors.includes("username no debe ser llave primaria"));
  return "username";
});

test("identidad_canal_valida_no_expone_ids_completos", () => {
  const identity = buildCanonicalChannelIdentity({
    channel: "TELEGRAM",
    channel_user_id: "6573879494",
    chat_id: "123456789",
    username: "usuario_demo",
    user_id: "USER-1",
    tenant_id: "TENANT-1",
    emitter_id: "EMITTER-1",
  });
  assert.strictEqual(assertCanonicalChannelIdentity(identity).ok, true);
  const redacted = redactedChannelIdentity(identity);
  const raw = JSON.stringify(redacted);
  assert(!raw.includes("6573879494"));
  assert(!raw.includes("123456789"));
  assert.strictEqual(redacted.channel_user_id_present, true);
  return "redacted";
});

test("access_gate_unregistered_usa_mensaje_invitacion", () => {
  const decision = evaluateAccess({ requestedAction: "CREATE_DRAFT" });
  assert.strictEqual(decision.allowed, false);
  assert.strictEqual(decision.access_status, "UNREGISTERED");
  assert(decision.human_message.includes("codigo de invitacion"));
  return decision.reason_code;
});

test("no_toca_workflow_ni_catalogo_activo", () => {
  assert.strictEqual(diffNameOnly("workflow/cfdi_telegram_local_ingest.n8n.json"), "");
  assert.strictEqual(diffNameOnly("workflow/cfdi_sandbox_action_router.n8n.json"), "");
  assert.strictEqual(diffNameOnly("data/concepts.normalized.json"), "");
  return "protected";
});

test("docs_declaran_un_solo_bot_compartido", () => {
  const text = fs.readFileSync("docs/ADR_0003_SHARED_TELEGRAM_BOT_ACCESS_MODEL.md", "utf8");
  assert(/un solo bot Telegram compartido/i.test(text));
  assert(/WHITE_LABEL_BOT/i.test(text));
  assert(/READ_ONLY/i.test(text));
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

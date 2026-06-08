const assert = require("assert");

const {
  buildDraftByIdQuery,
  loadDraftFromPostgres,
} = require("./lib/sandbox-draft-db-loader");

const checks = [];

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function printCheck(name, pass, value = "") {
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${value === "" ? "" : ` (${value})`}`);
}

function draftRow() {
  return {
    draft_id: "DRAFT-DOCKER-1",
    chat_id: "CHAT",
    update_id: 1,
    status: "APROBADO",
    invoice_status: "APROBADO",
    payment_status: "NO_APLICA",
    action: "SUGERIR",
    ready_to_copy: true,
    requires_human_review: true,
    client_id: "CLI-REAL-BILBAO",
    client_found: true,
    current_client: {},
    historical_client_snapshot: {},
    client_snapshot: {},
    provider_client_link: {
      provider_client_link_id: "PCL-1",
      provider_client_uid: "UID-REAL-BILBAO-SECRET",
      sync_status: "MANUAL_LINKED",
    },
    concept: {},
    line_items: [],
    tax_summary: {},
    blockers: [],
  };
}

check("draft_loader_docker_mode_uses_docker_exec", () => {
  const seen = {};
  const draft = loadDraftFromPostgres("DRAFT-DOCKER-1", {
    env: {
      CFDI_DB_EXEC_MODE: "docker",
      CFDI_PG_DOCKER_CONTAINER: "cfdi-postgres",
      CFDI_PGDATABASE: "cfdi_bot",
      CFDI_PGUSER: "cfdi_bot_user",
      CFDI_PGPASSWORD: "BAD_PASSWORD_SHOULD_NOT_BE_USED",
    },
    execFileSync: (command, args, options) => {
      seen.command = command;
      seen.args = args;
      seen.env = options.env;
      return `${JSON.stringify(draftRow())}\n`;
    },
  });
  assert.strictEqual(seen.command, "docker");
  assert.deepStrictEqual(seen.args.slice(0, 4), ["exec", "-i", "cfdi-postgres", "psql"]);
  assert(!seen.args.includes("-h"));
  assert(!seen.args.includes("127.0.0.1"));
  assert(!seen.env.PGPASSWORD);
  assert.strictEqual(draft.draft_id, "DRAFT-DOCKER-1");
  assert.strictEqual(draft.provider_client_link.sync_status, "MANUAL_LINKED");
  return draft.provider_client_link.sync_status;
});

check("draft_query_still_reads_provider_client_links", () => {
  const sql = buildDraftByIdQuery("DRAFT-DOCKER-1");
  assert(sql.includes("FROM provider_client_links"));
  assert(sql.includes("provider_client_uid"));
  return "provider_client_links";
});

Promise.all(checks).then((results) => {
  console.log("Sandbox draft DB loader Docker DB mode tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

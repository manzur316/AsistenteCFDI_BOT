const assert = require("assert");

const {
  buildPsqlExecution,
  connectionFromEnv,
  runPsqlJson,
} = require("./lib/local-db-psql-runner");

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

check("tcp_mode_keeps_current_psql_shape", () => {
  const config = connectionFromEnv({
    CFDI_DB_EXEC_MODE: "tcp",
    CFDI_PGHOST: "127.0.0.1",
    CFDI_PGPORT: "5432",
    CFDI_PGDATABASE: "cfdi_bot",
    CFDI_PGUSER: "cfdi_bot_user",
    CFDI_PGPASSWORD: "LOCAL_SECRET",
  });
  const execution = buildPsqlExecution("SELECT 1;", config);
  assert.strictEqual(execution.command, "psql");
  assert(execution.args.includes("-h"));
  assert(execution.args.includes("127.0.0.1"));
  assert.strictEqual(execution.env.PGPASSWORD, "LOCAL_SECRET");
  return execution.execMode;
});

check("docker_mode_builds_docker_exec_without_password_or_host", () => {
  const execution = buildPsqlExecution("SELECT 1;", connectionFromEnv({
    CFDI_DB_EXEC_MODE: "docker",
    CFDI_PG_DOCKER_CONTAINER: "cfdi-postgres",
    CFDI_PGDATABASE: "cfdi_bot",
    CFDI_PGUSER: "cfdi_bot_user",
    CFDI_PGPASSWORD: "SHOULD_NOT_PASS",
  }));
  assert.strictEqual(execution.command, "docker");
  assert.deepStrictEqual(execution.args.slice(0, 4), ["exec", "-i", "cfdi-postgres", "psql"]);
  assert(!execution.args.includes("-h"));
  assert(!execution.args.includes("127.0.0.1"));
  assert(!Object.prototype.hasOwnProperty.call(execution.env, "PGPASSWORD"));
  assert(!Object.prototype.hasOwnProperty.call(execution.env, "CFDI_PGPASSWORD"));
  assert(!Object.prototype.hasOwnProperty.call(execution.env, "POSTGRES_PASSWORD"));
  return execution.args.join(" ");
});

check("run_psql_json_uses_execFileSync_adapter", () => {
  const seen = {};
  const result = runPsqlJson("SELECT '{}'::text;", {
    env: { CFDI_DB_EXEC_MODE: "docker" },
    execFileSync: (command, args, options) => {
      seen.command = command;
      seen.args = args;
      seen.hasPassword = Boolean(options.env.PGPASSWORD);
      return '{"ok":true}\n';
    },
  });
  assert.strictEqual(seen.command, "docker");
  assert.strictEqual(seen.hasPassword, false);
  assert.strictEqual(result.ok, true);
  return "json";
});

Promise.all(checks).then((results) => {
  console.log("Local DB psql runner tests");
  for (const item of results) printCheck(item.name, item.pass, item.value);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

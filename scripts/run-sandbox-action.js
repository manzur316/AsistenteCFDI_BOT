const {
  listSandboxActions,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");

async function main() {
  const action = process.argv[2];
  if (!action || action === "--help" || action === "-h") {
    console.log(JSON.stringify({
      ok: false,
      status: "ERROR",
      message: "Uso: node scripts/run-sandbox-action.js <action>",
      actions: listSandboxActions(),
    }, null, 2));
    process.exit(action ? 0 : 1);
  }
  const result = await runSandboxAction(action);
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "ERROR") process.exit(1);
}

main().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    status: "ERROR",
    action: process.argv[2] || "UNKNOWN",
    errors: [error.message || String(error)],
  }, null, 2));
  process.exit(1);
});

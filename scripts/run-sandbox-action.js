const {
  listSandboxActions,
  runSandboxAction,
} = require("./lib/sandbox-action-runner");

function parseArgs(argv) {
  const [action, ...rest] = argv;
  const auditContext = {};
  const optionMap = {
    "--audit-source-kind": "source_kind",
    "--audit-chat-redacted": "chat_id_redacted",
    "--audit-user-redacted": "user_id_redacted",
    "--audit-callback-data": "callback_data",
    "--audit-command-token": "command_token",
    "--audit-workflow-version": "workflow_version",
  };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (!Object.prototype.hasOwnProperty.call(optionMap, key)) continue;
    auditContext[optionMap[key]] = rest[index + 1] || "";
    index += 1;
  }
  return { action, auditContext };
}

async function main() {
  const { action, auditContext } = parseArgs(process.argv.slice(2));
  if (!action || action === "--help" || action === "-h") {
    console.log(JSON.stringify({
      ok: false,
      status: "ERROR",
      message: "Uso: node scripts/run-sandbox-action.js <action>",
      actions: listSandboxActions(),
    }, null, 2));
    process.exit(action ? 0 : 1);
  }
  const result = await runSandboxAction(action, { auditContext });
  console.log(JSON.stringify(result, null, 2));
  if (result.status === "ERROR") process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.log(JSON.stringify({
      ok: false,
      status: "ERROR",
      action: process.argv[2] || "UNKNOWN",
      errors: [error.message || String(error)],
    }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  parseArgs,
};

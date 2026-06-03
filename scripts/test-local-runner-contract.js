const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const runnerPath = path.join(root, "runner", "telegram-local-runner.js");
const runnerReadmePath = path.join(root, "runner", "README.md");
const envLocalExamplePath = path.join(root, ".env.local.example");
const gitignorePath = path.join(root, ".gitignore");
const testRuntimeDir = path.join(root, "runtime", "test-local-runner-contract");
const offsetFile = path.join(testRuntimeDir, "runner-offset.json");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function tokenLikeValues(text) {
  return text.match(/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/g) || [];
}

function freshOffsetFile() {
  fs.mkdirSync(testRuntimeDir, { recursive: true });
  if (fs.existsSync(offsetFile)) fs.unlinkSync(offsetFile);
}

async function main() {
  const checks = [];
  let runner = null;
  let runnerText = "";
  let envText = "";
  let gitignoreText = "";

  try {
    runnerText = readText(runnerPath);
    envText = readText(envLocalExamplePath);
    gitignoreText = readText(gitignorePath);
    runner = require(runnerPath);
    checks.push({ name: "runner_exists", pass: true, value: "runner/telegram-local-runner.js" });
    checks.push({ name: "runner_readme_exists", pass: fs.existsSync(runnerReadmePath), value: "runner/README.md" });
    checks.push({ name: "env_local_example_exists", pass: fs.existsSync(envLocalExamplePath), value: ".env.local.example" });
  } catch (error) {
    checks.push({ name: "runner_loads", pass: false, value: error.message });
  }

  if (runner) {
  checks.push({ name: "no_real_token_in_runner", pass: tokenLikeValues(runnerText).length === 0, value: "none" });
  checks.push({ name: "no_real_token_in_env_local_example", pass: tokenLikeValues(envText).length === 0, value: "none" });
  checks.push({ name: "uses_native_fetch", pass: runnerText.includes("globalThis.fetch") && !runnerText.includes("node-fetch"), value: "Node fetch" });
  checks.push({ name: "uses_getUpdates", pass: runnerText.includes("getUpdates"), value: "Telegram API" });
  checks.push({ name: "uses_allowed_updates_message_callback", pass: runnerText.includes("message") && runnerText.includes("callback_query") && runnerText.includes("allowed_updates"), value: "message/callback_query" });
  checks.push({ name: "uses_offset_file", pass: runnerText.includes("RUNNER_OFFSET_FILE") && runnerText.includes("readOffset") && runnerText.includes("writeOffset"), value: "runtime/runner-offset.json" });
  checks.push({ name: "uses_runner_secret_header", pass: runnerText.includes("X-CFDI-Runner-Secret"), value: "secret header" });
  checks.push({ name: "uses_localhost_ingest_url", pass: envText.includes("http://127.0.0.1:5678/webhook/cfdi-local-ingest"), value: "local ingest" });
  checks.push({ name: "does_not_use_public_webhook_setup", pass: !/setWebhook|ngrok|https:\/\/[^\\s"']+webhook/i.test(runnerText), value: "no public webhook" });
  checks.push({ name: "gitignore_env_local", pass: gitignoreText.includes(".env.local"), value: ".env.local" });
  checks.push({ name: "gitignore_runner_offset", pass: gitignoreText.includes("runtime/runner-offset.json"), value: "runtime/runner-offset.json" });
  checks.push({ name: "gitignore_runner_logs", pass: gitignoreText.includes("runner/*.log"), value: "runner/*.log" });

  const config = {
    telegramBotToken: "TEST_TELEGRAM_TOKEN_LOCAL",
    ingestUrl: "http://127.0.0.1:5678/webhook/cfdi-local-ingest",
    offsetFile,
    pollTimeoutSeconds: 25,
    pollLimit: 10,
    runnerSecret: "TEST_SECRET",
  };

  try {
    const url = runner.buildGetUpdatesUrl(config, 44);
    checks.push({ name: "getUpdates_url_has_offset", pass: url.includes("offset=44"), value: url.replace(config.telegramBotToken, "[token]") });
    checks.push({ name: "getUpdates_url_has_timeout", pass: url.includes("timeout=25"), value: "timeout=25" });
    checks.push({ name: "getUpdates_url_has_limit", pass: url.includes("limit=10"), value: "limit=10" });
    checks.push({ name: "getUpdates_url_has_allowed_updates", pass: decodeURIComponent(url).includes('["message","callback_query"]'), value: "message/callback_query" });
  } catch (error) {
    checks.push({ name: "getUpdates_url_builds", pass: false, value: error.message });
  }

  try {
    const parsed = runner.parseEnvText("A=1\nB='dos'\n# x\nC=\"tres\"");
    checks.push({ name: "env_parser_basic", pass: parsed.A === "1" && parsed.B === "dos" && parsed.C === "tres", value: JSON.stringify(parsed) });
  } catch (error) {
    checks.push({ name: "env_parser_basic", pass: false, value: error.message });
  }

  try {
    const fakeToken = ["123456789", "ABCDEF_abcdef-1234567890"].join(":");
    const dirtyUrl = `https://api.telegram.org/bot${fakeToken}/getUpdates`;
    const clean = runner.sanitizeTelegramUrl(dirtyUrl);
    checks.push({ name: "sanitizes_token_in_urls", pass: !clean.includes(fakeToken) && clean.includes("[redacted-token]"), value: clean });
  } catch (error) {
    checks.push({ name: "sanitizes_token_in_urls", pass: false, value: error.message });
  }

  freshOffsetFile();
  try {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url, options });
      return { status: 204, text: async () => "" };
    };
    const result = await runner.processUpdates([{ update_id: 1001 }], config, fetchImpl, { log() {}, error() {} });
    const offset = runner.readOffset(offsetFile);
    checks.push({ name: "advances_offset_on_2xx", pass: result.processed === 1 && offset === 1002, value: `offset=${offset}` });
    checks.push({ name: "posts_update_to_n8n", pass: calls.length === 1 && calls[0].url === config.ingestUrl, value: `${calls.length} call` });
    checks.push({ name: "posts_runner_secret_header", pass: calls[0].options.headers["X-CFDI-Runner-Secret"] === "TEST_SECRET", value: "header sent" });
  } catch (error) {
    checks.push({ name: "advances_offset_on_2xx", pass: false, value: error.message });
  }

  freshOffsetFile();
  try {
    const errors = [];
    const fetchImpl = async () => ({ status: 500, text: async () => "fail" });
    const result = await runner.processUpdates([{ update_id: 2001 }], config, fetchImpl, { log() {}, error(message) { errors.push(message); } });
    const offset = runner.readOffset(offsetFile);
    checks.push({ name: "does_not_advance_offset_when_n8n_fails", pass: result.failed === true && offset === 0, value: `offset=${offset}` });
    checks.push({ name: "logs_n8n_failure_without_token", pass: errors.length === 1 && !/\\d{6,}:[A-Za-z0-9_-]{20,}/.test(errors[0]), value: errors[0] || "none" });
  } catch (error) {
    checks.push({ name: "does_not_advance_offset_when_n8n_fails", pass: false, value: error.message });
  }

  try {
    const fetchImpl = async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: [{ update_id: 3001 }] }),
      url,
    });
    runner.writeOffset(offsetFile, 3000);
    const updates = await runner.fetchUpdates(config, fetchImpl);
    checks.push({ name: "fetchUpdates_uses_offset_file", pass: updates.length === 1 && updates[0].update_id === 3001, value: "update 3001" });
  } catch (error) {
    checks.push({ name: "fetchUpdates_uses_offset_file", pass: false, value: error.message });
  }
  }

  console.log("Local runner contract");
  for (const check of checks) printCheck(check.name, check.pass, check.value);
  const passed = checks.filter((check) => check.pass).length;
  console.log(`PASS TOTAL: ${passed}/${checks.length}`);
  if (passed !== checks.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

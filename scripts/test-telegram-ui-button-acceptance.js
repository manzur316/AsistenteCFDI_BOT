const assert = require("assert");
const fs = require("fs");
const path = require("path");

const {
  CASES,
  applyChannelToCase,
  executionHasCallbackQuery,
  extractArtifactPaths,
  extractVisibleButtons,
  parseArgs,
  runAcceptance,
  validateTelegramUiTestChat,
  validateUiRender,
} = require("./qa/telegram-ui-button-acceptance");

const checks = [];
const root = path.resolve(__dirname, "..");

function check(name, fn) {
  checks.push(Promise.resolve()
    .then(fn)
    .then((value) => ({ name, pass: true, value: value === undefined ? "" : String(value) }))
    .catch((error) => ({ name, pass: false, value: error.message })));
}

function callbackExecutionWithToken(token) {
  return {
    id: "exec-callback-1",
    data: {
      resultData: {
        runData: {
          "Handle Commands And Scoring": [{
            data: {
              main: [[{
                json: {
                  source_kind: "CALLBACK_QUERY",
                  callback_query_id: "callback-query-id",
                  text: `cfdi:${token}`,
                  action_token: { token },
                },
              }]],
            },
          }],
        },
      },
    },
  };
}

function printCheck(item) {
  console.log(` - ${item.name}: ${item.pass ? "PASS" : "FAIL"}${item.value ? ` (${item.value})` : ""}`);
}

function tokenRow(token, action, draftId, overrides = {}) {
  return {
    token,
    action,
    draft_id: draftId,
    chat_id: "6573879494",
    used_at: null,
    expires_at: "2099-01-01T00:00:00.000Z",
    created_at: overrides.created_at || new Date().toISOString(),
    payload: {
      action,
      draft_id: draftId,
      channel: overrides.channel || null,
    },
  };
}

function executionWithMarkup(replyMarkup, extra = {}) {
  return {
    id: extra.id || "exec-render-1",
    finished: true,
    status: "success",
    data: {
      resultData: {
        runData: {
          "Build Telegram Dispatch Plan": [{
            data: {
              main: [[{
                json: {
                  update_id: extra.update_id || 1937100001,
                  chat_id: "6573879494",
                  telegram_message: "Detalle de borrador",
                  should_send_telegram: true,
                  telegram_dispatch_payload_built: true,
                  reply_markup: replyMarkup,
                },
              }]],
            },
          }],
          "Telegram sendMessage": [{
            data: {
              main: [[{ json: { ok: true, result: { message_id: 77 } } }]],
            },
          }],
        },
      },
    },
  };
}

function telegramFetchMock(responses) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url,
      body: options.body ? JSON.parse(options.body) : null,
    });
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch call");
    return {
      ok: next.ok,
      status: next.status,
      text: async () => JSON.stringify(next.body),
    };
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function stampedDraft(draftId, artifactStatus) {
  return {
    draft_id: draftId,
    chat_id: "6573879494",
    status: "APROBADO",
    invoice_status: "SANDBOX_TIMBRADO",
    payment_status: "PENDIENTE",
    sandbox_pac_summary: {
      artifact_status: artifactStatus,
      documents_valid: artifactStatus === "DOWNLOADED",
      xml_content_valid: artifactStatus === "DOWNLOADED",
      pdf_content_valid: artifactStatus === "DOWNLOADED",
    },
  };
}

check("extracts_visible_buttons_with_db_actions", () => {
  const draftId = "DRAFT-ACCEPT-001";
  const tokens = [
    tokenRow("DOWNLOADTOKEN01", "DOWNLOAD_SANDBOX_ARTIFACTS", draftId),
    tokenRow("VIEWTOKEN000001", "VIEW_DRAFT", draftId),
  ];
  const execution = executionWithMarkup({
    inline_keyboard: [[
      { text: "Descargar XML/PDF sandbox", callback_data: "cfdi:DOWNLOADTOKEN01" },
      { text: "Ver factura", callback_data: "cfdi:VIEWTOKEN000001" },
    ]],
  });
  const buttons = extractVisibleButtons(execution, tokens);
  assert(buttons.some((button) => button.text === "Descargar XML/PDF sandbox" && button.action === "DOWNLOAD_SANDBOX_ARTIFACTS"));
  assert(buttons.every((button) => button.token_masked && !button.token_masked.includes("DOWNLOADTOKEN01")));
  return buttons.length;
});

check("download_ready_render_passes_and_selects_button", () => {
  const draftId = "DRAFT-ACCEPT-002";
  const tokens = [tokenRow("DOWNLOADTOKEN02", "DOWNLOAD_SANDBOX_ARTIFACTS", draftId)];
  const execution = executionWithMarkup({
    inline_keyboard: [[{ text: "Descargar XML/PDF sandbox", callback_data: "cfdi:DOWNLOADTOKEN02" }]],
  });
  const visibleButtons = extractVisibleButtons(execution, tokens);
  const result = validateUiRender({
    config: CASES["download-ready"],
    draft: stampedDraft(draftId, "DOWNLOAD_READY"),
    tokens,
    visibleButtons,
    renderExecution: execution,
    renderStartedMs: Date.now() - 1000,
  });
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.target_button.text, "Descargar XML/PDF sandbox");
  assert.strictEqual(result.target_button.action, "DOWNLOAD_SANDBOX_ARTIFACTS");
  return result.target_button.text;
});

check("missing_download_button_returns_ui_render_fail_diagnostics", () => {
  const draftId = "DRAFT-ACCEPT-003";
  const tokens = [tokenRow("STAMPTOKEN00003", "STAMP_DRAFT_SANDBOX", draftId)];
  const execution = executionWithMarkup({
    inline_keyboard: [[{ text: "Timbrar sandbox", callback_data: "cfdi:STAMPTOKEN00003" }]],
  });
  const visibleButtons = extractVisibleButtons(execution, tokens);
  const result = validateUiRender({
    config: CASES["download-ready"],
    draft: stampedDraft(draftId, "DOWNLOAD_READY"),
    tokens,
    visibleButtons,
    renderExecution: execution,
    renderStartedMs: Date.now() - 1000,
  });
  assert.strictEqual(result.pass, false);
  assert.strictEqual(result.fail_code, "UI_RENDER_FAIL");
  assert.strictEqual(result.draft_id, draftId);
  assert(result.visible_actions_found.some((button) => button.action === "STAMP_DRAFT_SANDBOX"));
  assert(result.failures.some((item) => item.includes("missing visible action DOWNLOAD_SANDBOX_ARTIFACTS")));
  assert(result.failures.some((item) => item.includes("forbidden visible action STAMP_DRAFT_SANDBOX")));
  return result.fail_code;
});

check("downloaded_delivery_provider_channel_selects_email_prepare", () => {
  const config = applyChannelToCase(CASES["downloaded-delivery"], "PROVIDER_EMAIL");
  assert.strictEqual(config.clickAction, "DELIVERY_PREPARE_PROVIDER_EMAIL");
  assert.strictEqual(config.expectedConfirmAction, "DELIVERY_CONFIRM_PROVIDER_EMAIL");
  assert.strictEqual(config.buttonText, "Enviar por correo");
  return config.clickAction;
});

check("parse_args_check_only_aliases", () => {
  const args = parseArgs(["--case", "download-ready", "--draft-id", "DRAFT-1", "--check-only"]);
  assert.strictEqual(args.case, "download-ready");
  assert.strictEqual(args.draftId, "DRAFT-1");
  assert.strictEqual(args.checkOnly, true);
  return "check-only";
});

check("render_token_is_not_treated_as_human_callback", () => {
  const execution = executionWithMarkup({
    inline_keyboard: [[{ text: "Descargar XML/PDF sandbox", callback_data: "cfdi:DOWNLOADTOKEN05" }]],
  });
  assert.strictEqual(executionHasCallbackQuery(execution), false);
  assert.strictEqual(executionHasCallbackQuery(callbackExecutionWithToken("DOWNLOADTOKEN05")), true);
  return "CALLBACK_QUERY required";
});

check("artifact_paths_fall_back_to_manifest_when_db_paths_hidden", () => {
  const dir = path.join(root, "runtime", "test-telegram-ui-button-acceptance");
  fs.mkdirSync(dir, { recursive: true });
  const xmlPath = "runtime/test-telegram-ui-button-acceptance/demo.xml";
  const pdfPath = "runtime/test-telegram-ui-button-acceptance/demo.pdf";
  const manifestPath = "runtime/test-telegram-ui-button-acceptance/manifest.json";
  fs.writeFileSync(path.join(root, xmlPath), "<xml />\n");
  fs.writeFileSync(path.join(root, pdfPath), "%PDF-1.4\n");
  fs.writeFileSync(path.join(root, manifestPath), JSON.stringify({
    human_xml_path: xmlPath,
    human_pdf_path: pdfPath,
  }, null, 2));
  const paths = extractArtifactPaths({
    sandbox_pac_summary: {
      human_xml_path: "[runtime-hidden]",
      human_pdf_path: "[runtime-hidden]",
      client_storage_manifest_path: manifestPath,
    },
  });
  assert.strictEqual(paths.xml, xmlPath);
  assert.strictEqual(paths.pdf, pdfPath);
  assert.strictEqual(paths.manifest, manifestPath);
  return "manifest";
});

check("telegram_ui_test_chat_invalid_has_clear_diagnostic", async () => {
  const fetchImpl = telegramFetchMock([
    {
      ok: true,
      status: 200,
      body: { ok: true, result: { username: "satbot_qa_bot" } },
    },
    {
      ok: false,
      status: 400,
      body: { ok: false, description: "Bad Request: chat not found" },
    },
  ]);
  await assert.rejects(
    () => validateTelegramUiTestChat({
      chatId: "6573879494",
      source: "SATBOT_TELEGRAM_UI_TEST_CHAT_ID",
      env: { TELEGRAM_BOT_TOKEN: "123456:ABCDEFABCDEFABCDEFABCDEF" },
      fetchImpl,
    }),
    (error) => {
      assert.strictEqual(error.code, "INVALID_SATBOT_TELEGRAM_UI_TEST_CHAT_ID");
      assert(error.message.includes("SATBOT_TELEGRAM_UI_TEST_CHAT_ID"));
      assert(error.message.includes("@satbot_qa_bot"));
      assert(error.message.includes("chat not found"));
      assert(!error.message.includes("ABCDEFABCDEF"));
      assert.strictEqual(error.body.reason, "chat_not_found");
      assert.strictEqual(error.body.chat_id_masked, "657...494");
      return true;
    },
  );
  assert.strictEqual(fetchImpl.calls[1].body.chat_id, "6573879494");
  return "INVALID_SATBOT_TELEGRAM_UI_TEST_CHAT_ID";
});

check("telegram_ui_test_bot_token_invalid_has_clear_diagnostic", async () => {
  const fetchImpl = telegramFetchMock([
    {
      ok: false,
      status: 401,
      body: { ok: false, description: "Unauthorized" },
    },
  ]);
  await assert.rejects(
    () => validateTelegramUiTestChat({
      chatId: "6573879494",
      source: "SATBOT_TELEGRAM_UI_TEST_CHAT_ID",
      env: { TELEGRAM_BOT_TOKEN: "123456:BADTOKENBADTOKENBADTOKEN" },
      fetchImpl,
    }),
    (error) => {
      assert.strictEqual(error.code, "TELEGRAM_BOT_TOKEN_INVALID");
      assert(error.message.includes("TELEGRAM_BOT_TOKEN"));
      assert(error.message.includes("HTTP 401"));
      assert(!error.message.includes("BADTOKEN"));
      return true;
    },
  );
  assert.strictEqual(fetchImpl.calls.length, 1);
  return "TELEGRAM_BOT_TOKEN_INVALID";
});

check("run_acceptance_check_only_does_not_wait_for_click", async () => {
  const draftId = "DRAFT-ACCEPT-004";
  const draft = stampedDraft(draftId, "DOWNLOAD_READY");
  const tokens = [tokenRow("DOWNLOADTOKEN04", "DOWNLOAD_SANDBOX_ARTIFACTS", draftId)];
  const execution = executionWithMarkup({
    inline_keyboard: [[{ text: "Descargar XML/PDF sandbox", callback_data: "cfdi:DOWNLOADTOKEN04" }]],
  });
  const db = {
    getAuthorizedChat: () => ({ telegram_chat_id: "6573879494" }),
    getDraft: async () => draft,
    getActionTokensByDraft: async () => tokens,
  };
  const n8nClient = {
    listExecutions: async () => [{ id: "exec-render-1" }],
    getExecution: async () => execution,
  };
  const result = await runAcceptance({
    case: "download-ready",
    draftId,
    checkOnly: true,
    renderTimeoutMs: 1000,
    pollMs: 10,
  }, {
    db,
    n8nClient,
    renderDraftDetail: async () => ({
      renderStartedMs: Date.now() - 1000,
      execution,
      render_message_id: 77,
    }),
  });
  assert.strictEqual(result.pass, true);
  assert.strictEqual(result.human_click_requested, false);
  assert.strictEqual(result.check_only, true);
  assert(result.manual_instruction.includes("Presiona ahora el botón: Descargar XML/PDF sandbox"));
  return result.scenario;
});

Promise.all(checks).then((results) => {
  for (const item of results) printCheck(item);
  const failed = results.filter((item) => !item.pass);
  console.log(`\nPASS total: ${results.length - failed.length}/${results.length}`);
  if (failed.length) process.exit(1);
});

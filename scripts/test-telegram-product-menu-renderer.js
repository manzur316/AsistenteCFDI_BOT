const fs = require("fs");
const path = require("path");

const {
  ROLES,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");
const {
  FOOTER,
  TELEGRAM_PRODUCT_MENU_RENDERER_VERSION,
  renderTelegramHelp,
  renderTelegramMainMenu,
  renderTelegramMenuError,
  renderTelegramSubmenu,
  renderTelegramUnauthorized,
} = require("./lib/telegram-product-menu-renderer");

const root = path.resolve(__dirname, "..");
const rendererPath = path.join(root, "scripts", "lib", "telegram-product-menu-renderer.js");
const rendererSource = fs.readFileSync(rendererPath, "utf8");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function flattenButtons(payload) {
  return (payload.reply_markup?.inline_keyboard || []).flat();
}

function allStrings(value, output = []) {
  if (value === null || value === undefined) return output;
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) allStrings(item, output);
    return output;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value)) allStrings(item, output);
  }
  return output;
}

function payloadHasForbiddenSensitiveValue(payload) {
  const text = allStrings(payload).join("\n");
  const patterns = [
    /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b/i,
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /\buid\b|_uid\b|\buid_/i,
    /\bmonto\b|\bamount\b|\btotal\b/i,
    /[a-z]:[\\/]|[\\/](?:users|runtime|documents|tmp|var)[\\/]/i,
    /\bXML\b|\bPDF\b|\bZIP\b|\bExcel\b|\bxlsx\b/i,
    /\bCSD\b|\.env|secret|password|api[_-]?key/i,
    /\b\d{6,}:[A-Za-z0-9_-]{20,}\b/,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

function callbacks(payload) {
  return flattenButtons(payload).map((button) => button.callback_data);
}

function callbacksValidAndShort(payload) {
  return callbacks(payload).every((callbackData) => {
    const validation = validateTelegramCallbackData(callbackData);
    return validation.ok && callbackData.length <= 32;
  });
}

const checks = [];

const mainAssistant = renderTelegramMainMenu(ROLES.ASSISTANT_OPERATOR);
const mainAssistantCallbacks = callbacks(mainAssistant);
checks.push({
  name: "renderer_version_exists",
  pass: TELEGRAM_PRODUCT_MENU_RENDERER_VERSION === "TELEGRAM_PRODUCT_MENU_RENDERER_V1",
  value: TELEGRAM_PRODUCT_MENU_RENDERER_VERSION,
});
checks.push({
  name: "main_menu_renders_text_and_keyboard",
  pass: typeof mainAssistant.text === "string"
    && mainAssistant.text.includes("Menu CFDI")
    && flattenButtons(mainAssistant).length > 0,
  value: `${flattenButtons(mainAssistant).length} buttons`,
});
checks.push({
  name: "main_menu_includes_human_review_footer",
  pass: mainAssistant.text.includes(FOOTER),
  value: "footer",
});

const submenuPayloads = [
  renderTelegramSubmenu("invoices", ROLES.ASSISTANT_OPERATOR),
  renderTelegramSubmenu("clients", ROLES.OWNER),
  renderTelegramSubmenu("reports", ROLES.ACCOUNTANT_READONLY),
  renderTelegramSubmenu("system", ROLES.ASSISTANT_OPERATOR),
  renderTelegramSubmenu("admin_sandbox", ROLES.OWNER, { includeSandbox: true }),
];
checks.push({
  name: "submenus_render_text_and_keyboard",
  pass: submenuPayloads.every((payload) => typeof payload.text === "string" && flattenButtons(payload).length > 0),
  value: `${submenuPayloads.length} submenus`,
});

checks.push({
  name: "normal_user_does_not_see_admin_or_sandbox",
  pass: !mainAssistantCallbacks.includes("cfdi_nav:admin")
    && !mainAssistantCallbacks.some((callbackData) => callbackData.startsWith("cfdi_sbx:")),
  value: mainAssistantCallbacks.join(", "),
});

const ownerAdmin = renderTelegramMainMenu(ROLES.OWNER, { includeAdmin: true });
const ownerAdminCallbacks = callbacks(ownerAdmin);
checks.push({
  name: "admin_can_see_admin_entry_when_requested",
  pass: ownerAdminCallbacks.includes("cfdi_nav:admin"),
  value: ownerAdminCallbacks.join(", "),
});

const adminSubmenu = renderTelegramSubmenu("admin_sandbox", ROLES.OWNER, { includeSandbox: true });
checks.push({
  name: "admin_sandbox_submenu_visible_for_owner",
  pass: callbacks(adminSubmenu).some((callbackData) => callbackData.startsWith("cfdi_sbx:")),
  value: callbacks(adminSubmenu).join(", "),
});

const blockedAdminSubmenu = renderTelegramSubmenu("admin_sandbox", ROLES.ASSISTANT_OPERATOR, { includeSandbox: true });
checks.push({
  name: "admin_sandbox_submenu_hidden_for_normal_user",
  pass: !blockedAdminSubmenu.reply_markup && blockedAdminSubmenu.text.includes("Acceso no autorizado"),
  value: "unauthorized",
});

const allRenderedPayloads = [
  mainAssistant,
  ownerAdmin,
  adminSubmenu,
  blockedAdminSubmenu,
  renderTelegramHelp(ROLES.ASSISTANT_OPERATOR),
  renderTelegramUnauthorized(),
  renderTelegramMenuError("UNKNOWN_MENU"),
  ...submenuPayloads,
];

checks.push({
  name: "callbacks_safe_and_short",
  pass: allRenderedPayloads.every(callbacksValidAndShort),
  value: "all rendered keyboards",
});
checks.push({
  name: "payloads_have_no_sensitive_data",
  pass: allRenderedPayloads.every((payload) => !payloadHasForbiddenSensitiveValue(payload)),
  value: "no sensitive strings",
});
checks.push({
  name: "payloads_have_no_telegram_token",
  pass: allRenderedPayloads.every((payload) => !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(JSON.stringify(payload))),
  value: "no token",
});
checks.push({
  name: "payloads_have_no_paths",
  pass: allRenderedPayloads.every((payload) => !/[a-z]:[\\/]|[\\/](?:users|runtime|documents|tmp|var)[\\/]/i.test(JSON.stringify(payload))),
  value: "no paths",
});
checks.push({
  name: "payloads_have_no_file_artifact_terms",
  pass: allRenderedPayloads.every((payload) => !/\bXML\b|\bPDF\b|\bZIP\b|\bExcel\b|\bxlsx\b/i.test(JSON.stringify(payload))),
  value: "no file terms",
});

checks.push({
  name: "source_has_no_runtime_or_filesystem_dependency",
  pass: !/require\(["']fs["']\)|require\(["']path["']\)|readFileSync|writeFileSync|appendFileSync|runtime[\\/]/i.test(rendererSource),
  value: "no fs/path/runtime",
});
checks.push({
  name: "source_has_no_n8n_dependency",
  pass: !/n8n|workflow|webhook|\$json|\$node/i.test(rendererSource),
  value: "pure renderer",
});
checks.push({
  name: "source_does_not_send_messages",
  pass: !/sendMessage|editMessageText|answerCallbackQuery|fetch\(|axios|TelegramBot/i.test(rendererSource),
  value: "no network/send",
});

let passCount = 0;
for (const check of checks) {
  if (check.pass) passCount += 1;
  printCheck(check.name, check.pass, check.value);
}

console.log(`PASS total: ${passCount}/${checks.length}`);
if (passCount !== checks.length) {
  process.exit(1);
}

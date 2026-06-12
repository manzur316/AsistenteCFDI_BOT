const fs = require("fs");
const path = require("path");

const {
  ACTION_CLASSIFICATION,
  CALLBACK_DATA_LIMIT,
  LEGACY_COMMANDS,
  MAIN_MENU,
  PRODUCT_NAV_CALLBACK_LIMIT,
  ROLES,
  SUBMENUS,
  TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
  classifyTelegramMenuAction,
  getTelegramProductMenu,
  getTelegramSubmenu,
  validateTelegramCallbackData,
} = require("./lib/telegram-product-menu-contract");

const root = path.resolve(__dirname, "..");
const contractPath = path.join(root, "scripts", "lib", "telegram-product-menu-contract.js");

function printCheck(name, pass, value = "") {
  const suffix = value === "" ? "" : ` (${value})`;
  console.log(` - ${name}: ${pass ? "PASS" : "FAIL"}${suffix}`);
}

function flattenButtons(menu) {
  return (menu.reply_markup?.inline_keyboard || []).flat();
}

function allContractButtons() {
  return [
    ...MAIN_MENU.buttons,
    ...Object.values(SUBMENUS).flatMap((submenu) => submenu.buttons),
  ];
}

function unique(values) {
  return [...new Set(values)];
}

const checks = [];
const contractSource = fs.readFileSync(contractPath, "utf8");

checks.push({
  name: "schema_version_exists",
  pass: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION === "TELEGRAM_PRODUCT_MENU_V1",
  value: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
});

const expectedMainLabels = [
  "Nueva factura",
  "Borradores",
  "Clientes",
  "Facturas",
  "Cobranza",
  "Documentos",
  "Sincronizar proveedor",
  "Ayuda",
];

const mainLabels = MAIN_MENU.buttons.map((item) => item.text);
checks.push({
  name: "main_menu_contains_expected_buttons",
  pass: expectedMainLabels.every((label) => mainLabels.includes(label)),
  value: `${expectedMainLabels.length}/${MAIN_MENU.buttons.length}`,
});

const expectedSubmenus = ["invoices", "documents", "provider", "clients", "reports", "system", "admin_sandbox"];
checks.push({
  name: "submenus_exist",
  pass: expectedSubmenus.every((id) => SUBMENUS[id]),
  value: expectedSubmenus.join(", "),
});

const productNavCallbacks = unique(allContractButtons()
  .map((item) => item.callback_data)
  .filter((value) => value.startsWith("cfdi_nav:")));

const allProductNavValid = productNavCallbacks.every((callbackData) => {
  const validation = validateTelegramCallbackData(callbackData);
  return validation.ok && callbackData.length <= PRODUCT_NAV_CALLBACK_LIMIT;
});
checks.push({
  name: "cfdi_nav_callbacks_safe_and_short",
  pass: allProductNavValid,
  value: `${productNavCallbacks.length} callbacks`,
});

const callbackCharsSafe = productNavCallbacks.every((callbackData) => /^[a-z0-9_:.-]+$/.test(callbackData));
checks.push({
  name: "cfdi_nav_callbacks_allowed_chars",
  pass: callbackCharsSafe,
  value: "[a-z0-9_:.-]",
});

const forbiddenCallbackSamples = [
  "cfdi_nav:AAA010101AAA",
  "cfdi_nav:uuid_123e4567-e89b-12d3-a456-426614174000",
  "cfdi_nav:uid_123",
  "cfdi_nav:monto_1000",
  "cfdi_nav:C:/runtime/file",
  "cfdi_nav:xml",
  "cfdi_nav:pdf",
  "cfdi_nav:zip",
  "cfdi_nav:excel",
  "cfdi_nav:secret",
];
checks.push({
  name: "cfdi_nav_rejects_sensitive_patterns",
  pass: forbiddenCallbackSamples.every((callbackData) => !validateTelegramCallbackData(callbackData).ok),
  value: `${forbiddenCallbackSamples.length} forbidden samples`,
});

const tokenValidation = validateTelegramCallbackData("cfdi:abcDEF123456");
checks.push({
  name: "tokenized_action_callback_supported",
  pass: tokenValidation.ok && "cfdi:abcDEF123456".length <= CALLBACK_DATA_LIMIT,
  value: "cfdi:<token>",
});

const sandboxValidation = validateTelegramCallbackData("cfdi_sbx:full");
checks.push({
  name: "sandbox_callback_supported_as_sandbox_only",
  pass: sandboxValidation.ok
    && classifyTelegramMenuAction("cfdi_sbx:full").classification === ACTION_CLASSIFICATION.SANDBOX_ONLY,
  value: "cfdi_sbx:full",
});

const assistantMenu = getTelegramProductMenu(ROLES.ASSISTANT_OPERATOR);
const assistantCallbacks = flattenButtons(assistantMenu).map((item) => item.callback_data);
checks.push({
  name: "sandbox_hidden_for_normal_user",
  pass: !assistantCallbacks.some((callbackData) => callbackData.startsWith("cfdi_sbx:") || callbackData === "cfdi_nav:admin"),
  value: assistantCallbacks.join(", "),
});

const assistantClientsSubmenu = getTelegramSubmenu("clients", ROLES.ASSISTANT_OPERATOR);
const assistantClientCallbacks = flattenButtons(assistantClientsSubmenu).map((item) => item.callback_data);
checks.push({
  name: "admin_only_hidden_for_normal_user",
  pass: !assistantClientCallbacks.includes("cfdi_nav:client_validate"),
  value: assistantClientCallbacks.join(", "),
});

const accountantMenuCallbacks = flattenButtons(getTelegramProductMenu(ROLES.ACCOUNTANT_READONLY)).map((item) => item.callback_data);
const accountantReportsCallbacks = flattenButtons(getTelegramSubmenu("reports", ROLES.ACCOUNTANT_READONLY)).map((item) => item.callback_data);
checks.push({
  name: "accountant_readonly_sees_readonly_operational_surfaces",
  pass: accountantMenuCallbacks.includes("cfdi_nav:invoices")
    && accountantMenuCallbacks.includes("cfdi_nav:docs")
    && accountantMenuCallbacks.includes("cfdi_nav:help")
    && !accountantMenuCallbacks.includes("cfdi_nav:acctpkg")
    && accountantReportsCallbacks.includes("cfdi_nav:report")
    && !accountantMenuCallbacks.includes("cfdi_nav:acctpkg")
    && !accountantReportsCallbacks.includes("cfdi_nav:acctpkg"),
  value: accountantMenuCallbacks.join(", "),
});

const ownerAdminMenu = getTelegramProductMenu(ROLES.OWNER, { includeAdmin: true });
const ownerAdminCallbacks = flattenButtons(ownerAdminMenu).map((item) => item.callback_data);
checks.push({
  name: "admin_not_visible_in_operational_menu_even_for_owner",
  pass: !ownerAdminCallbacks.includes("cfdi_nav:admin")
    && ownerAdminCallbacks.includes("cfdi_nav:provider"),
  value: ownerAdminCallbacks.join(", "),
});

const ownerSandboxSubmenu = getTelegramSubmenu("admin_sandbox", ROLES.OWNER, { includeSandbox: true });
const ownerSandboxCallbacks = flattenButtons(ownerSandboxSubmenu).map((item) => item.callback_data);
checks.push({
  name: "sandbox_submenu_owner_only",
  pass: ownerSandboxCallbacks.includes("cfdi_nav:status")
    && ownerSandboxCallbacks.includes("cfdi_nav:pac_sbx")
    && ownerSandboxCallbacks.includes("cfdi_sbx:smoke_menu")
    && ownerSandboxCallbacks.includes("cfdi_sbx:full"),
  value: ownerSandboxCallbacks.join(", "),
});

const assistantSandboxSubmenu = getTelegramSubmenu("admin_sandbox", ROLES.ASSISTANT_OPERATOR, { includeSandbox: true });
checks.push({
  name: "sandbox_submenu_empty_for_normal_user",
  pass: flattenButtons(assistantSandboxSubmenu).length === 0,
  value: `${flattenButtons(assistantSandboxSubmenu).length} buttons`,
});

checks.push({
  name: "future_actions_not_visible_by_default",
  pass: !getTelegramProductMenu(ROLES.OWNER).buttons.some((item) => item.classification === ACTION_CLASSIFICATION.FUTURE),
  value: "FUTURE hidden/absent",
});

const navClass = classifyTelegramMenuAction("cfdi_nav:new");
const adminClass = classifyTelegramMenuAction("cfdi_nav:client_validate");
const tokenClass = classifyTelegramMenuAction("cfdi:abcDEF123456");
checks.push({
  name: "classify_menu_actions",
  pass: navClass.classification === ACTION_CLASSIFICATION.USER_SAFE
    && adminClass.classification === ACTION_CLASSIFICATION.ADMIN_ONLY
    && tokenClass.target_action === "TOKENIZED_CONTEXT_ACTION",
  value: `${navClass.classification}/${adminClass.classification}/${tokenClass.target_action}`,
});

checks.push({
  name: "legacy_commands_classified",
  pass: [ACTION_CLASSIFICATION.USER_SAFE, ACTION_CLASSIFICATION.ADMIN_ONLY, ACTION_CLASSIFICATION.SANDBOX_ONLY]
    .every((classification) => LEGACY_COMMANDS.some((item) => item.classification === classification)),
  value: `${LEGACY_COMMANDS.length} legacy mappings`,
});

checks.push({
  name: "contract_has_no_telegram_token",
  pass: !/\b\d{6,}:[A-Za-z0-9_-]{20,}\b/.test(contractSource),
  value: "no token",
});

checks.push({
  name: "contract_has_no_n8n_or_telegram_runtime_dependency",
  pass: !/n8n|webhook|sendMessage|Telegram Trigger/i.test(contractSource),
  value: "pure JS contract",
});

checks.push({
  name: "contract_has_no_runtime_or_filesystem_dependency",
  pass: !/require\(["']fs["']\)|require\(["']path["']\)|readFileSync|writeFileSync|appendFileSync|fs\./.test(contractSource),
  value: "no fs/path",
});

checks.push({
  name: "contract_callbacks_have_no_fiscal_or_sensitive_data",
  pass: productNavCallbacks.every((callbackData) => !/AAA010101AAA|RFC|UUID|UID|XML|PDF|ZIP|EXCEL|CSD|secret|password|api/i.test(callbackData)),
  value: "product callbacks clean",
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

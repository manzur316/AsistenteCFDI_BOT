"use strict";

const TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION = "TELEGRAM_PRODUCT_MENU_V1";

const ACTION_CLASSIFICATION = Object.freeze({
  USER_SAFE: "USER_SAFE",
  ADMIN_ONLY: "ADMIN_ONLY",
  SANDBOX_ONLY: "SANDBOX_ONLY",
  FUTURE: "FUTURE",
  DEPRECATED: "DEPRECATED",
});

const ROLES = Object.freeze({
  OWNER: "OWNER",
  ASSISTANT_OPERATOR: "ASSISTANT_OPERATOR",
  ACCOUNTANT_READONLY: "ACCOUNTANT_READONLY",
  ADMIN_FUTURE: "ADMIN_FUTURE",
});

const CALLBACK_NAMESPACES = Object.freeze({
  PRODUCT_NAV: "cfdi_nav:",
  TOKENIZED_ACTION: "cfdi:",
  SANDBOX: "cfdi_sbx:",
});

const CALLBACK_DATA_LIMIT = 64;
const PRODUCT_NAV_CALLBACK_LIMIT = 32;
const SAFE_STATIC_CALLBACK_RE = /^[a-z0-9_:.-]+$/;
const SAFE_TOKEN_CALLBACK_RE = /^cfdi:[A-Za-z0-9_-]{8,48}$/;
const RFC_RE = /\b[A-Z&]{3,4}\d{6}[A-Z0-9]{3}\b/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const FORBIDDEN_CALLBACK_TEXT_RE = /(?:\buid\b|_uid\b|\buid_|uuid|rfc|monto|amount|total|secret|password|api[_-]?key|\.env|csd|cert|xml|pdf|zip|xlsx|excel|runtime|[a-z]:[\\/]|[\\/])/i;

function freezeDeep(value) {
  if (!value || typeof value !== "object") return value;
  Object.freeze(value);
  for (const item of Object.values(value)) {
    freezeDeep(item);
  }
  return value;
}

function button(params) {
  return {
    id: params.id,
    text: params.text,
    callback_data: params.callback_data,
    target_action: params.target_action,
    roles: params.roles || [ROLES.OWNER],
    classification: params.classification || ACTION_CLASSIFICATION.USER_SAFE,
    status: params.status || "ACTIVE",
    risk: params.risk || "LOW",
    route: params.route || null,
    notes: params.notes || "",
  };
}

const MAIN_MENU = freezeDeep({
  id: "main",
  title: "Menu principal",
  description: "Interfaz diaria operativa de Private SatBot.",
  buttons: [
    button({
      id: "new_invoice",
      text: "Nueva factura",
      callback_data: "cfdi_nav:new",
      target_action: "CREATE_DRAFT",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "INVOICE_WIZARD",
    }),
    button({
      id: "drafts",
      text: "Borradores",
      callback_data: "cfdi_nav:drafts",
      target_action: "OPEN_DRAFTS_MENU",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "DRAFTS_MENU",
    }),
    button({
      id: "clients",
      text: "Clientes",
      callback_data: "cfdi_nav:clients",
      target_action: "OPEN_CLIENTS_MENU",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "CLIENTS_LIST_SELECTION",
    }),
    button({
      id: "invoices",
      text: "Facturas",
      callback_data: "cfdi_nav:invoices",
      target_action: "OPEN_INVOICES_MENU",
      roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
      risk: "MEDIUM",
      route: "submenu:invoices",
    }),
    button({
      id: "collection",
      text: "Cobranza",
      callback_data: "cfdi_nav:pay_pending",
      target_action: "OPEN_COLLECTION_CLIENTS",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
      risk: "MEDIUM",
      route: "COLLECTION_CLIENTS",
    }),
    button({
      id: "documents",
      text: "Documentos",
      callback_data: "cfdi_nav:docs",
      target_action: "OPEN_DOCUMENTS_MENU",
      roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
      risk: "MEDIUM",
      route: "submenu:documents",
    }),
    button({
      id: "provider_sync",
      text: "Sincronizar proveedor",
      callback_data: "cfdi_nav:provider",
      target_action: "OPEN_PROVIDER_SYNC_PLACEHOLDER",
      roles: [ROLES.OWNER],
      classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
      risk: "HIGH",
      route: "submenu:provider",
    }),
    button({
      id: "help",
      text: "Ayuda",
      callback_data: "cfdi_nav:help",
      target_action: "VIEW_HELP",
      roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      risk: "LOW",
      route: "submenu:system",
    }),
  ],
});

const SUBMENUS = freezeDeep({
  drafts: {
    id: "drafts",
    title: "Borradores",
    buttons: [
      button({
        id: "drafts_pending",
        text: "Pendientes",
        callback_data: "cfdi_nav:pending",
        target_action: "LIST_PENDING_DRAFTS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "drafts_approved",
        text: "Aprobados",
        callback_data: "cfdi_nav:approved",
        target_action: "LIST_APPROVED_DRAFTS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "HIGH",
      }),
      button({
        id: "drafts_documents",
        text: "Documentos",
        callback_data: "cfdi_nav:docs",
        target_action: "OPEN_DOCUMENTS_MENU",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "drafts_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  invoices: {
    id: "invoices",
    title: "Facturas",
    buttons: [
      button({
        id: "invoices_recent",
        text: "Historial reciente",
        callback_data: "cfdi_nav:invoices",
        target_action: "OPEN_INVOICES_MENU",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "invoice_by_client",
        text: "Ver clientes",
        callback_data: "cfdi_nav:clients",
        target_action: "OPEN_CLIENTS_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "invoice_collection",
        text: "Facturas por cobrar",
        callback_data: "cfdi_nav:pay_pending",
        target_action: "OPEN_COLLECTION_CLIENTS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "invoice_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  documents: {
    id: "documents",
    title: "Documentos",
    buttons: [
      button({
        id: "documents_status",
        text: "Estado documental",
        callback_data: "cfdi_nav:docs",
        target_action: "OPEN_DOCUMENTS_MENU",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "documents_invoices",
        text: "Ver facturas",
        callback_data: "cfdi_nav:invoices",
        target_action: "OPEN_INVOICES_MENU",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "documents_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  provider: {
    id: "provider",
    title: "Proveedor",
    buttons: [
      button({
        id: "provider_placeholder",
        text: "Sincronizar proveedor",
        callback_data: "cfdi_nav:provider",
        target_action: "OPEN_PROVIDER_SYNC_PLACEHOLDER",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "provider_preflight",
        text: "Admin / QA",
        callback_data: "cfdi_nav:admin",
        target_action: "OPEN_ADMIN_QA_MENU",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "provider_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER],
      }),
    ],
  },
  clients: {
    id: "clients",
    title: "Clientes",
    buttons: [
      button({
        id: "client_find",
        text: "Buscar cliente",
        callback_data: "cfdi_nav:client_find",
        target_action: "FIND_CLIENT",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "MEDIUM",
      }),
      button({
        id: "client_new",
        text: "Nuevo cliente",
        callback_data: "cfdi_nav:client_new",
        target_action: "CREATE_CLIENT",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR],
        risk: "HIGH",
      }),
      button({
        id: "client_validate",
        text: "Validar cliente",
        callback_data: "cfdi_nav:client_validate",
        target_action: "VALIDATE_CLIENT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "clients_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  reports: {
    id: "reports",
    title: "Reportes",
    buttons: [
      button({
        id: "report_month",
        text: "Reporte mensual",
        callback_data: "cfdi_nav:report",
        target_action: "VIEW_MONTHLY_REPORT",
        roles: [ROLES.OWNER, ROLES.ACCOUNTANT_READONLY],
        risk: "MEDIUM",
      }),
      button({
        id: "report_accountant_package",
        text: "Paquete para contador",
        callback_data: "cfdi_nav:acctpkg",
        target_action: "RUN_ACCOUNTANT_PACKAGE_SANDBOX",
        roles: [ROLES.OWNER],
        risk: "HIGH",
      }),
      button({
        id: "reports_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  system: {
    id: "system",
    title: "Sistema",
    buttons: [
      button({
        id: "system_status",
        text: "Estado del sistema",
        callback_data: "cfdi_nav:status",
        target_action: "VIEW_SYSTEM_STATUS",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
      button({
        id: "system_help",
        text: "Ayuda",
        callback_data: "cfdi_nav:help",
        target_action: "VIEW_HELP",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
      button({
        id: "system_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER, ROLES.ASSISTANT_OPERATOR, ROLES.ACCOUNTANT_READONLY],
      }),
    ],
  },
  admin_sandbox: {
    id: "admin_sandbox",
    title: "Admin / QA",
    buttons: [
      button({
        id: "admin_status",
        text: "Estado tecnico",
        callback_data: "cfdi_nav:status",
        target_action: "VIEW_SYSTEM_STATUS",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "LOW",
      }),
      button({
        id: "sandbox_menu",
        text: "Sandbox",
        callback_data: "cfdi_nav:pac_sbx",
        target_action: "OPEN_PAC_SANDBOX_CONSOLE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "pac_sandbox_menu",
        text: "Proveedor Factura.com Sandbox",
        callback_data: "cfdi_sbx:menu",
        target_action: "OPEN_PAC_SANDBOX_CONSOLE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_preflight",
        text: "Preflight proveedor",
        callback_data: "cfdi_sbx:preflight",
        target_action: "RUN_SANDBOX_PREFLIGHT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_menu",
        text: "Smoke tests",
        callback_data: "cfdi_sbx:smoke_menu",
        target_action: "OPEN_SANDBOX_SMOKE_MENU",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_approved_drafts",
        text: "Borradores aprobados para timbrar",
        callback_data: "cfdi_nav:sbx_drafts",
        target_action: "LIST_APPROVED_DRAFTS_FOR_SANDBOX_STAMP",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_create",
        text: "Smoke: timbrar fixture sandbox",
        callback_data: "cfdi_sbx:smoke_create",
        target_action: "RUN_SANDBOX_SMOKE_CREATE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_download",
        text: "Smoke: timbrar + XML/PDF",
        callback_data: "cfdi_sbx:smoke_download",
        target_action: "RUN_SANDBOX_SMOKE_DOWNLOAD",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_smoke_cancel",
        text: "Smoke: timbrar + cancelar",
        callback_data: "cfdi_sbx:smoke_cancel",
        target_action: "RUN_SANDBOX_SMOKE_CANCEL",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_latest",
        text: "Workflow status / diagnostico",
        callback_data: "cfdi_sbx:latest",
        target_action: "RUN_SANDBOX_LATEST_RESULT",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "MEDIUM",
      }),
      button({
        id: "sandbox_audit",
        text: "Audit sandbox",
        callback_data: "cfdi_sbx:audit",
        target_action: "RUN_SANDBOX_AUDIT_SUMMARY",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "MEDIUM",
      }),
      button({
        id: "provider_redacted",
        text: "Proveedor / credenciales redacted",
        callback_data: "cfdi_nav:provider",
        target_action: "OPEN_PROVIDER_SYNC_PLACEHOLDER",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.ADMIN_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "sandbox_full",
        text: "Full monthly package sandbox",
        callback_data: "cfdi_sbx:full",
        target_action: "RUN_SANDBOX_FULL_PACKAGE",
        roles: [ROLES.OWNER],
        classification: ACTION_CLASSIFICATION.SANDBOX_ONLY,
        risk: "HIGH",
      }),
      button({
        id: "admin_back",
        text: "Menu principal",
        callback_data: "cfdi_nav:menu",
        target_action: "OPEN_MAIN_MENU",
        roles: [ROLES.OWNER],
      }),
    ],
  },
});

const LEGACY_COMMANDS = freezeDeep([
  { command: "/menu", target_action: "OPEN_MAIN_MENU", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/nueva", target_action: "CREATE_DRAFT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/factura", target_action: "CREATE_DRAFT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/borradores", target_action: "OPEN_DRAFTS_MENU", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/clientes", target_action: "LIST_CLIENTS", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/cliente TEXTO", target_action: "FIND_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/facturas", target_action: "OPEN_INVOICES_MENU", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/cobranza", target_action: "OPEN_COLLECTION_CLIENTS", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/documentos", target_action: "OPEN_DOCUMENTS_MENU", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/nuevocliente", target_action: "CREATE_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/editarcliente", target_action: "EDIT_CLIENT", classification: ACTION_CLASSIFICATION.USER_SAFE },
  { command: "/validarcliente", target_action: "VALIDATE_CLIENT", classification: ACTION_CLASSIFICATION.ADMIN_ONLY },
  { command: "/admin", target_action: "OPEN_ADMIN_QA_MENU", classification: ACTION_CLASSIFICATION.ADMIN_ONLY },
  { command: "/qa", target_action: "OPEN_ADMIN_QA_MENU", classification: ACTION_CLASSIFICATION.ADMIN_ONLY },
  { command: "/sandbox", target_action: "OPEN_SANDBOX_MENU", classification: ACTION_CLASSIFICATION.SANDBOX_ONLY },
  { command: "/sync", target_action: "OPEN_PROVIDER_SYNC_PLACEHOLDER", classification: ACTION_CLASSIFICATION.ADMIN_ONLY },
  { command: "/sandbox_menu", target_action: "OPEN_SANDBOX_MENU", classification: ACTION_CLASSIFICATION.SANDBOX_ONLY },
  { command: "/sandbox_*", target_action: "RUN_SANDBOX_ACTION", classification: ACTION_CLASSIFICATION.SANDBOX_ONLY },
]);

function normalizeRole(role) {
  const value = String(role || "").trim().toUpperCase();
  return Object.values(ROLES).includes(value) ? value : ROLES.ASSISTANT_OPERATOR;
}

function roleCanSee(buttonDefinition, role, options = {}) {
  const normalizedRole = normalizeRole(role);
  const includeFuture = options.includeFuture === true;
  const includeAdmin = options.includeAdmin === true || options.includeSandbox === true;
  const classification = buttonDefinition.classification;

  if (!buttonDefinition.roles.includes(normalizedRole)) return false;
  if (classification === ACTION_CLASSIFICATION.FUTURE) return includeFuture;
  if (classification === ACTION_CLASSIFICATION.ADMIN_ONLY && normalizedRole !== ROLES.OWNER) return false;
  if (classification === ACTION_CLASSIFICATION.SANDBOX_ONLY) {
    return normalizedRole === ROLES.OWNER && includeAdmin;
  }
  return true;
}

function toTelegramButton(buttonDefinition) {
  return {
    text: buttonDefinition.text,
    callback_data: buttonDefinition.callback_data,
  };
}

function buildMenuResponse(menuDefinition, role, options = {}) {
  const visibleButtons = menuDefinition.buttons.filter((item) => roleCanSee(item, role, options));
  const inlineKeyboard = visibleButtons.map((item) => [toTelegramButton(item)]);
  return {
    schema_version: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
    menu_id: menuDefinition.id,
    title: menuDefinition.title,
    role: normalizeRole(role),
    buttons: visibleButtons.map((item) => ({ ...item })),
    reply_markup: {
      inline_keyboard: inlineKeyboard,
    },
  };
}

function getTelegramProductMenu(role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  return buildMenuResponse(MAIN_MENU, role, options);
}

function getTelegramSubmenu(menuId, role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  const key = String(menuId || "").trim();
  const menuDefinition = SUBMENUS[key];
  if (!menuDefinition) {
    return {
      schema_version: TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
      menu_id: null,
      role: normalizeRole(role),
      buttons: [],
      reply_markup: { inline_keyboard: [] },
      error: "submenu_desconocido",
    };
  }
  return buildMenuResponse(menuDefinition, role, options);
}

function hasSensitiveCallbackContent(callbackData, { allowSandboxArtifacts = false } = {}) {
  const value = String(callbackData || "");
  if (RFC_RE.test(value) || UUID_RE.test(value)) return true;
  if (allowSandboxArtifacts && value.startsWith(CALLBACK_NAMESPACES.SANDBOX)) {
    return /(?:\buid\b|_uid\b|\buid_|uuid|rfc|monto|amount|total|secret|password|api[_-]?key|\.env|csd|cert|runtime|[a-z]:[\\/]|[\\/])/i.test(value);
  }
  return FORBIDDEN_CALLBACK_TEXT_RE.test(value);
}

function validateTelegramCallbackData(callbackData) {
  const value = String(callbackData || "").trim();
  const errors = [];
  if (!value) errors.push("callback_data_required");
  if (value.length > CALLBACK_DATA_LIMIT) errors.push("callback_data_too_long");

  if (value.startsWith(CALLBACK_NAMESPACES.PRODUCT_NAV)) {
    if (value.length > PRODUCT_NAV_CALLBACK_LIMIT) errors.push("cfdi_nav_too_long");
    if (!SAFE_STATIC_CALLBACK_RE.test(value)) errors.push("cfdi_nav_invalid_chars");
    if (hasSensitiveCallbackContent(value)) errors.push("cfdi_nav_sensitive_content");
  } else if (value.startsWith(CALLBACK_NAMESPACES.SANDBOX)) {
    if (value.length > PRODUCT_NAV_CALLBACK_LIMIT) errors.push("cfdi_sbx_too_long");
    if (!SAFE_STATIC_CALLBACK_RE.test(value)) errors.push("cfdi_sbx_invalid_chars");
    if (hasSensitiveCallbackContent(value, { allowSandboxArtifacts: true })) errors.push("cfdi_sbx_sensitive_content");
  } else if (value.startsWith(CALLBACK_NAMESPACES.TOKENIZED_ACTION)) {
    if (!SAFE_TOKEN_CALLBACK_RE.test(value)) errors.push("cfdi_token_invalid_format");
  } else {
    errors.push("callback_namespace_unknown");
  }

  return {
    ok: errors.length === 0,
    callback_data: value,
    errors,
  };
}

function allButtons() {
  return [
    ...MAIN_MENU.buttons,
    ...Object.values(SUBMENUS).flatMap((submenu) => submenu.buttons),
  ];
}

function classifyTelegramMenuAction(callbackData) {
  const value = String(callbackData || "").trim();
  const validation = validateTelegramCallbackData(value);
  if (!validation.ok) {
    return {
      callback_data: value,
      classification: null,
      target_action: null,
      valid: false,
      errors: validation.errors,
    };
  }

  if (value.startsWith(CALLBACK_NAMESPACES.TOKENIZED_ACTION)) {
    return {
      callback_data: value,
      classification: ACTION_CLASSIFICATION.USER_SAFE,
      target_action: "TOKENIZED_CONTEXT_ACTION",
      valid: true,
      tokenized: true,
      errors: [],
    };
  }

  const match = allButtons().find((item) => item.callback_data === value);
  if (!match) {
    return {
      callback_data: value,
      classification: value.startsWith(CALLBACK_NAMESPACES.SANDBOX)
        ? ACTION_CLASSIFICATION.SANDBOX_ONLY
        : ACTION_CLASSIFICATION.USER_SAFE,
      target_action: "UNKNOWN_ALLOWLIST_REQUIRED",
      valid: true,
      errors: [],
    };
  }

  return {
    callback_data: value,
    classification: match.classification,
    target_action: match.target_action,
    roles: [...match.roles],
    valid: true,
    errors: [],
  };
}

module.exports = {
  ACTION_CLASSIFICATION,
  CALLBACK_DATA_LIMIT,
  CALLBACK_NAMESPACES,
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
};

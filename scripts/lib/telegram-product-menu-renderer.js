"use strict";

const {
  ROLES,
  TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
  getTelegramProductMenu,
  getTelegramSubmenu,
  validateTelegramCallbackData,
} = require("./telegram-product-menu-contract");

const TELEGRAM_PRODUCT_MENU_RENDERER_VERSION = "TELEGRAM_PRODUCT_MENU_RENDERER_V1";

const FOOTER = "Borrador sujeto a revision humana. No sustituye contador.";

const SUBMENU_TEXT = Object.freeze({
  drafts: [
    "Borradores",
    "",
    "Gestiona borradores antes de timbrar.",
    "Por revisar y Listos para facturar viven aqui; facturas historicas viven en Facturas.",
  ].join("\n"),
  invoices: [
    "Facturas",
    "",
    "Consulta facturas ya generadas/timbradas o historial por cliente.",
    "No uses esta pantalla para marcar pagos.",
  ].join("\n"),
  documents: [
    "Documentos",
    "",
    "Superficie para XML/PDF, estado documental y envios.",
    "Por ahora conserva rutas seguras existentes sin ejecutar acciones nuevas.",
  ].join("\n"),
  provider: [
    "Sincronizar proveedor",
    "",
    "Pendiente de implementacion segura.",
    "No ejecuta sync real, no corre preflight y no muestra credenciales.",
  ].join("\n"),
  clients: [
    "Clientes",
    "",
    "Lista, busca o crea clientes locales antes de preparar borradores.",
    "Facturas y cobranza viven en sus modulos o en el detalle de cliente.",
  ].join("\n"),
  reports: [
    "Reportes",
    "",
    "Consulta resumen mensual y paquete para contador en modo seguro.",
    "En esta fase Telegram solo muestra resumen, no envia documentos.",
  ].join("\n"),
  system: [
    "Sistema",
    "",
    "Consulta estado y ayuda del bot privado.",
    "Las acciones dependen del rol autorizado.",
  ].join("\n"),
  admin_sandbox: [
    "Admin / QA",
    "",
    "Consola OWNER para diagnostico, sandbox y pruebas tecnicas.",
    "No representa la experiencia diaria del usuario.",
  ].join("\n"),
});

const MENU_ERRORS = Object.freeze({
  UNKNOWN_MENU: "No encontre ese menu.",
  UNAUTHORIZED: "Acceso no autorizado.",
  EMPTY_MENU: "No hay acciones disponibles para este rol.",
  INVALID_CALLBACK: "El menu contiene un callback invalido.",
  UNKNOWN_ERROR: "No pude preparar el menu.",
});

function normalizeRole(role) {
  const value = String(role || "").trim().toUpperCase();
  return Object.values(ROLES).includes(value) ? value : ROLES.ASSISTANT_OPERATOR;
}

function safeOptions(options = {}) {
  return {
    includeAdmin: options.includeAdmin === true,
    includeSandbox: options.includeSandbox === true,
    includeFuture: options.includeFuture === true,
  };
}

function appendFooter(text) {
  return [text, "", FOOTER].join("\n");
}

function cloneInlineKeyboard(replyMarkup) {
  const rows = replyMarkup?.inline_keyboard || [];
  return rows.map((row) => row.map((button) => ({
    text: String(button.text || ""),
    callback_data: String(button.callback_data || ""),
  })));
}

function validateKeyboard(inlineKeyboard) {
  const errors = [];
  for (const row of inlineKeyboard) {
    for (const button of row) {
      const validation = validateTelegramCallbackData(button.callback_data);
      if (!validation.ok) {
        errors.push({
          callback_data: button.callback_data,
          errors: validation.errors,
        });
      }
    }
  }
  return {
    ok: errors.length === 0,
    errors,
  };
}

function buildPayload(text, replyMarkup) {
  const inlineKeyboard = cloneInlineKeyboard(replyMarkup);
  const validation = validateKeyboard(inlineKeyboard);
  const payload = {
    text: appendFooter(text),
  };

  if (inlineKeyboard.length > 0) {
    payload.reply_markup = { inline_keyboard: inlineKeyboard };
  }

  if (!validation.ok) {
    return {
      text: appendFooter(MENU_ERRORS.INVALID_CALLBACK),
      errors: validation.errors,
    };
  }

  return payload;
}

function renderTelegramMainMenu(role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  const menu = getTelegramProductMenu(normalizeRole(role), safeOptions(options));
  const text = [
    "Menu principal",
    "",
    "Operaciones rapidas de Private SatBot.",
    "Elige una opcion para continuar.",
  ].join("\n");
  return buildPayload(text, menu.reply_markup);
}

function renderTelegramSubmenu(menuId, role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  const normalizedMenuId = String(menuId || "").trim();
  const menu = getTelegramSubmenu(normalizedMenuId, normalizeRole(role), safeOptions(options));

  if (menu.error) {
    return renderTelegramMenuError("UNKNOWN_MENU");
  }

  if ((menu.reply_markup?.inline_keyboard || []).length === 0) {
    return normalizedMenuId === "admin_sandbox"
      ? renderTelegramUnauthorized()
      : renderTelegramMenuError("EMPTY_MENU");
  }

  return buildPayload(SUBMENU_TEXT[normalizedMenuId] || MENU_ERRORS.UNKNOWN_ERROR, menu.reply_markup);
}

function renderTelegramHelp(role = ROLES.ASSISTANT_OPERATOR, options = {}) {
  const menu = getTelegramProductMenu(normalizeRole(role), safeOptions(options));
  const text = [
    "Ayuda CFDI",
    "",
    "Puedes iniciar un borrador, revisar clientes, consultar facturas, cobranza o documentos.",
    "Comandos: /menu, /nueva, /borradores, /clientes, /facturas, /cobranza, /documentos, /ayuda.",
    "Tambien puedes escribir una actividad en lenguaje natural y el bot pedira lo que falte.",
  ].join("\n");
  return buildPayload(text, menu.reply_markup);
}

function renderTelegramUnauthorized() {
  return {
    text: appendFooter([
      "Acceso no autorizado.",
      "",
      "Este bot es privado. Pide al propietario que revise tu acceso.",
    ].join("\n")),
  };
}

function renderTelegramMenuError(errorCode = "UNKNOWN_ERROR") {
  const code = String(errorCode || "UNKNOWN_ERROR").trim().toUpperCase();
  const message = MENU_ERRORS[code] || MENU_ERRORS.UNKNOWN_ERROR;
  return {
    text: appendFooter([
      "Menu no disponible.",
      "",
      message,
    ].join("\n")),
  };
}

module.exports = {
  FOOTER,
  TELEGRAM_PRODUCT_MENU_RENDERER_VERSION,
  TELEGRAM_PRODUCT_MENU_SCHEMA_VERSION,
  renderTelegramHelp,
  renderTelegramMainMenu,
  renderTelegramMenuError,
  renderTelegramSubmenu,
  renderTelegramUnauthorized,
};

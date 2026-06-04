-- Example seed for the private Telegram allowlist.
-- Copy this file locally, replace placeholders, and execute the local copy.
-- Do not commit real chat_id, telegram_user_id, names, or credentials.

INSERT INTO cfdi_authorized_users (
  user_id,
  telegram_chat_id,
  telegram_user_id,
  display_name,
  role,
  enabled,
  created_at,
  updated_at
) VALUES (
  'REEMPLAZAR_USER_ID',
  'REEMPLAZAR_TELEGRAM_CHAT_ID',
  'REEMPLAZAR_TELEGRAM_USER_ID',
  'Usuario autorizado local',
  'OWNER',
  true,
  now(),
  now()
) ON CONFLICT (user_id) DO UPDATE SET
  telegram_chat_id = EXCLUDED.telegram_chat_id,
  telegram_user_id = EXCLUDED.telegram_user_id,
  display_name = EXCLUDED.display_name,
  role = EXCLUDED.role,
  enabled = EXCLUDED.enabled,
  updated_at = now();

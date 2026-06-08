-- 012_provider_client_sync_foundation.sql
-- Additive support for local client -> provider client links.
-- No production enablement. No credential material. No destructive changes.

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_client_links_unique_local
ON provider_client_links(tenant_id, client_id, provider, environment);

CREATE INDEX IF NOT EXISTS idx_provider_client_links_provider_uid
ON provider_client_links(provider, environment, provider_client_uid);

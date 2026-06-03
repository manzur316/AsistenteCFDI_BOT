-- Example seed only. Do not place real client data in the repository.

INSERT INTO cfdi_clients (
  client_id,
  display_name,
  razon_social,
  rfc,
  tipo_persona,
  regimen_fiscal,
  codigo_postal_fiscal,
  uso_cfdi_default,
  tax_profile,
  validated_by_human,
  notes,
  enabled
) VALUES (
  'CLI-DEMO-RIVERA',
  'Privada Rivera',
  'Privada Rivera Demo',
  'AAA010101AAA',
  'MORAL_SIN_FINES_LUCRO',
  '603',
  '00000',
  'G03',
  'PM_NO_LUCRATIVA',
  false,
  'Cliente ficticio de prueba. BORRADOR SUJETO A REVISION HUMANA.',
  true
)
ON CONFLICT (client_id) DO NOTHING;

INSERT INTO cfdi_client_aliases (
  alias_id,
  client_id,
  alias,
  normalized_alias,
  weight,
  enabled
) VALUES
  ('ALIAS-DEMO-RIVERA-PRIVADA', 'CLI-DEMO-RIVERA', 'privada rivera', 'privada rivera', 100, true),
  ('ALIAS-DEMO-RIVERA', 'CLI-DEMO-RIVERA', 'rivera', 'rivera', 80, true)
ON CONFLICT (alias_id) DO NOTHING;

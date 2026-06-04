const { FacturaComSandboxAdapter } = require("./lib/factura-com-sandbox-adapter");

function fakeDraft() {
  return {
    draft_id: `SMOKE-SANDBOX-${Date.now()}`,
    client: {
      id: "CLIENT-DEMO",
      name: "Cliente Demo",
      rfc: "XAXX010101000",
      regimen_fiscal: "616",
      codigo_postal_fiscal: "00000",
      uso_cfdi: "S01",
    },
    concept: {
      id: "PROD-CCTV-001",
      concepto_factura: "CAMARA DE VIDEOVIGILANCIA",
      clave_prod_serv: "46171610",
      clave_unidad: "H87",
      unidad: "Pieza",
    },
    subtotal: 100,
    iva_amount: 16,
    total: 116,
  };
}

async function main() {
  if (process.env.FACTURACOM_SANDBOX_LIVE !== "1") {
    console.log("SKIP: FACTURACOM_SANDBOX_LIVE no es 1. No se hizo llamada real sandbox.");
    return;
  }

  const adapter = new FacturaComSandboxAdapter();
  const payload = adapter.createDraftPayload(fakeDraft(), {
    emitter: {
      id: "EMITTER-DEMO",
      name: "Emisor Demo",
      rfc: "AAA010101AAA",
      regimen_fiscal: "626",
      codigo_postal_fiscal: "00000",
    },
  });
  const validation = adapter.validatePayload(payload);
  if (!validation.ok) {
    console.error(JSON.stringify(validation, null, 2));
    process.exit(1);
  }

  const result = await adapter.stampSandbox(payload);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify(error, null, 2));
  process.exit(1);
});

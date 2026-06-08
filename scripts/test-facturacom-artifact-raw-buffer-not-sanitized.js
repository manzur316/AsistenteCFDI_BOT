const assert = require("assert");
const { facturaComRequest } = require("./lib/factura-com-live-client");

async function main() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: (name) => String(name).toLowerCase() === "content-type" ? "application/xml" : null,
      forEach: (fn) => fn("application/xml", "content-type"),
    },
    arrayBuffer: async () => Buffer.from("<cfdi:Comprobante Rfc=\"AAA010101AAA\"></cfdi:Comprobante>", "utf8"),
  });
  try {
    const response = await facturaComRequest({
      method: "GET",
      path: "/v4/cfdi40/UID/xml",
      env: {
        FACTURACOM_BASE_URL: "https://sandbox.factura.com/api",
        FACTURACOM_SANDBOX_LIVE: "1",
        FACTURACOM_API_KEY: "KEY",
        FACTURACOM_SECRET_KEY: "SECRET",
        FACTURACOM_PLUGIN: "PLUGIN",
      },
    });
    assert(response.rawText.includes("[REDACTED_RFC]"));
    assert(Buffer.isBuffer(response.rawArtifactBuffer));
    assert(response.rawArtifactBuffer.toString("utf8").includes("AAA010101AAA"));
    assert(!Object.keys(response).includes("rawArtifactBuffer"));
    console.log("Factura.com Artifact Raw Buffer Not Sanitized Tests");
    console.log(" - raw_artifact_buffer_non_enumerable: PASS (raw-safe)");
    console.log("\nPASS total: 1/1");
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(` - raw_artifact_buffer_non_enumerable: FAIL (${error.message})`);
  console.log("\nPASS total: 0/1");
  process.exit(1);
});

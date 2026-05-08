import { createClientAsync } from "soap";
import { COLORS } from "./rabbit";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://soap-gateway:8080/wsdl?wsdl";
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 1000);

async function waitForWsdl(): Promise<Awaited<ReturnType<typeof createClientAsync>>> {
  for (let i = 0; i < 60; i++) {
    try {
      return await createClientAsync(GATEWAY_URL);
    } catch {
      console.log(`[client] WSDL not ready yet (attempt ${i + 1}), retrying in 2s...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error(`Could not load WSDL from ${GATEWAY_URL}`);
}

async function main() {
  console.log(`[client] loading WSDL from ${GATEWAY_URL}`);
  const client = await waitForWsdl();

  // A WSDL-nek van egy fixen kódolt soap:address-e, amely a localhost:8080-ra mutat, ami maga a *client* konténer.
  // Felül kell írni, hogy a hívás a Docker hálózaton lévő gatewayre irányuljon.
  const endpoint = GATEWAY_URL.replace(/\?wsdl.*$/i, "");
  client.setEndpoint(endpoint);
  console.log(`[client] endpoint set to ${endpoint}`);
  console.log(`[client] sending colors every ${INTERVAL_MS}ms`);

  setInterval(async () => {
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    try {
      const [result] = await client.SendColorAsync({ color });
      console.log(
        `[client] -> SOAP SendColor(${color})  <- ${result?.status ?? "?"}: ${
          result?.message ?? ""
        }`
      );
    } catch (err) {
      const e = err as { message?: string; body?: string; response?: { status?: number } };
      console.error(
        `[client] SOAP call failed:`,
        e?.message || JSON.stringify(err),
        e?.response?.status ? `(http ${e.response.status})` : "",
        e?.body ? `body=${e.body.slice(0, 200)}` : ""
      );
    }
  }, INTERVAL_MS);
}

main().catch((err) => {
  console.error("[client] fatal:", err);
  process.exit(1);
});

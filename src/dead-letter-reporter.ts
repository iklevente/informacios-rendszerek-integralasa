import { assertTopology, connectWithRetry, DLQ_QUEUE } from "./rabbit";

async function main() {
  const conn = await connectWithRetry();
  const ch = await conn.createChannel();
  await assertTopology(ch);

  console.log(`[dlq] reading from "${DLQ_QUEUE}"...`);
  let total = 0;

  await ch.consume(DLQ_QUEUE, (msg) => {
    if (!msg) return;
    total += 1;
    let color = "UNKNOWN";
    const payloadStr = msg.content.toString();
    try {
      const data = JSON.parse(payloadStr);
      if (data && typeof data.color === "string") color = data.color;
    } catch {
      // ignore
    }
    // RabbitMQ adds an x-death header containing dead-letter info
    const xDeath = (msg.properties.headers as Record<string, unknown> | undefined)?.["x-death"] as
      | Array<Record<string, unknown>>
      | undefined;
    const reason = (xDeath && xDeath[0] && (xDeath[0]["reason"] as string)) ?? "unknown";

    console.log(
      `[dlq] FAILED ${color} message (reason=${reason}, totalDLQ=${total}) payload=${payloadStr}`
    );
    ch.ack(msg);
  });
}

main().catch((err) => {
  console.error("[dlq] fatal:", err);
  process.exit(1);
});

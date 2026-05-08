import { assertTopology, connectWithRetry, STATS_QUEUE } from "./rabbit";

interface StatsMessage {
  color: string;
  count: number;
  totalProcessed?: number;
  ts?: string;
}

async function main() {
  const conn = await connectWithRetry();
  const ch = await conn.createChannel();
  await assertTopology(ch);

  console.log(`[stats] reading from "${STATS_QUEUE}"...`);

  await ch.consume(STATS_QUEUE, (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString()) as StatsMessage;
      console.log(
        `${data.count} ${data.color} messages have been processed` +
          (data.totalProcessed ? ` (total ${data.color}: ${data.totalProcessed})` : "")
      );
    } catch (err) {
      console.error("[stats] failed to parse message:", err);
    }
    ch.ack(msg);
  });
}

main().catch((err) => {
  console.error("[stats] fatal:", err);
  process.exit(1);
});

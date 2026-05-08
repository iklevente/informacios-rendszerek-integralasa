import {
  assertTopology,
  Color,
  COLORS,
  STATS_QUEUE,
  colorQueueName,
  connectWithRetry,
} from "./rabbit";

const COLOR = (process.env.COLOR ?? "").toUpperCase() as Color;
const FAILURE_RATE = Number(process.env.FAILURE_RATE ?? 0.3);
const STATS_BATCH = Number(process.env.STATS_BATCH ?? 10);

if (!COLORS.includes(COLOR)) {
  console.error(`[consumer] COLOR env must be one of ${COLORS.join(", ")}, got "${COLOR}"`);
  process.exit(1);
}

async function main() {
  const conn = await connectWithRetry();
  const ch = await conn.createChannel();
  await assertTopology(ch);
  await ch.prefetch(1);

  const queue = colorQueueName(COLOR);
  let processed = 0;

  console.log(`[${COLOR}] consumer ready (queue=${queue}, failureRate=${FAILURE_RATE})`);

  await ch.consume(queue, (msg) => {
    if (!msg) return;
    const payload = msg.content.toString();

    if (Math.random() < FAILURE_RATE) {
      console.log(`[${COLOR}] FAILED to process message -> DLQ : ${payload}`);
      ch.nack(msg, false, false);
      return;
    }

    processed += 1;
    console.log(`[${COLOR}] processed message #${processed} : ${payload}`);
    ch.ack(msg);

    if (processed % STATS_BATCH === 0) {
      const stat = {
        color: COLOR,
        count: STATS_BATCH,
        totalProcessed: processed,
        ts: new Date().toISOString(),
      };
      ch.sendToQueue(STATS_QUEUE, Buffer.from(JSON.stringify(stat)), {
        persistent: true,
        contentType: "application/json",
      });
      console.log(`[${COLOR}] -> stats sent (total=${processed})`);
    }
  });
}

main().catch((err) => {
  console.error(`[${COLOR}] fatal:`, err);
  process.exit(1);
});

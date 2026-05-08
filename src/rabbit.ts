import amqplib, { Channel, ChannelModel } from "amqplib";

export const COLOR_EXCHANGE = "colorExchange";
export const DLX_EXCHANGE = "colorDlx";
export const STATS_QUEUE = "colorStatistics";
export const DLQ_QUEUE = "colorDLQ";

export const COLORS = ["RED", "GREEN", "BLUE"] as const;
export type Color = (typeof COLORS)[number];

export function colorQueueName(color: Color): string {
  return `colorQueue.${color}`;
}

const RABBIT_URL = process.env.RABBITMQ_URL ?? "amqp://rabbitmq:5672";

export async function connectWithRetry(attempts = 30, delayMs = 2000): Promise<ChannelModel> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const conn = await amqplib.connect(RABBIT_URL);
      return conn;
    } catch (err) {
      lastErr = err;
      console.log(
        `[rabbit] connection attempt ${i + 1}/${attempts} failed, retrying in ${delayMs}ms...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Declares the full topology used by the system:
 *  - colorExchange (direct) with one queue per color, each having a DLX set
 *  - colorDlx (direct) with one DLQ that captures all rejected messages
 *  - colorStatistics queue
 *
 * Idempotent – safe to call from any service on startup.
 */
export async function assertTopology(ch: Channel): Promise<void> {
  await ch.assertExchange(COLOR_EXCHANGE, "direct", { durable: true });
  await ch.assertExchange(DLX_EXCHANGE, "direct", { durable: true });

  // Single DLQ that receives all dead-lettered messages, routing key = color
  await ch.assertQueue(DLQ_QUEUE, { durable: true });
  for (const c of COLORS) {
    await ch.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, c);
  }

  // One queue per color, with DLX configured at the broker level
  for (const c of COLORS) {
    const q = colorQueueName(c);
    await ch.assertQueue(q, {
      durable: true,
      arguments: {
        "x-dead-letter-exchange": DLX_EXCHANGE,
        "x-dead-letter-routing-key": c,
      },
    });
    await ch.bindQueue(q, COLOR_EXCHANGE, c);
  }

  await ch.assertQueue(STATS_QUEUE, { durable: true });
}

const { Kafka }       = require('kafkajs');
const { getCollection } = require('./db');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'notification-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 5 },
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'notification-service-group',
});

// ─── Notification builders ────────────────────────────────────────────────────

/**
 * Build and store a notification document in RxDB.
 */
async function storeNotification({ userId, message, type }) {
  const col = getCollection();
  const id  = crypto.randomUUID();   // Node 22 built-in, no extra package needed

  await col.insert({
    id,
    userId:    String(userId),
    message,
    type,
    read:      false,
    createdAt: new Date().toISOString(),
  });

  console.log(`[RxDB] Notification stored for user ${userId} [${type}]`);
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleReservationCreated(payload) {
  const { reservation } = payload;
  if (!reservation) return;

  await storeNotification({
    userId:  reservation.user_id,
    message: `Your reservation #${reservation.id} for stadium ${reservation.stadium_id} (slot ${reservation.slot_id}) has been confirmed.`,
    type:    'reservation.created',
  });
}

async function handleReservationCancelled(payload) {
  const { reservation } = payload;
  if (!reservation) return;

  await storeNotification({
    userId:  reservation.user_id,
    message: `Your reservation #${reservation.id} for stadium ${reservation.stadium_id} (slot ${reservation.slot_id}) has been cancelled.`,
    type:    'reservation.cancelled',
  });
}

// ─── Consumer bootstrap ───────────────────────────────────────────────────────

async function startConsumer() {
  await consumer.connect();
  console.log('[Kafka] Notification consumer connected.');

  await consumer.subscribe({
    topics:        ['reservation.created', 'reservation.cancelled'],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        console.log(`[Consumer] Received ${topic}`);

        if (topic === 'reservation.created') {
          await handleReservationCreated(payload);
        } else if (topic === 'reservation.cancelled') {
          await handleReservationCancelled(payload);
        }
      } catch (err) {
        console.error(`[Consumer] Error processing ${topic}:`, err.message);
      }
    },
  });
}

async function stopConsumer() {
  await consumer.disconnect();
}

module.exports = { startConsumer, stopConsumer };

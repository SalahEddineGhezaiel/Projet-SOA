const { Kafka } = require('kafkajs');
const { run, all, get } = require('./db');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'reservation-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 5 },
});

const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'reservation-service-group',
});

/**
 * Handle a slot.updated event.
 *
 * When a slot becomes unavailable (is_available = false) from an external
 * source (e.g. admin override), find any confirmed reservation for that slot
 * and mark it as 'cancelled_slot_conflict'.
 *
 * When a slot becomes available again, this is informational — no action needed.
 */
async function handleSlotUpdated(payload) {
  const { slotId, isAvailable } = payload;

  if (isAvailable) {
    // Slot opened up — nothing to do on the reservation side
    console.log(`[Consumer] slot.updated: slot ${slotId} is now available (no action needed).`);
    return;
  }

  // Slot is now unavailable — cancel any conflicting confirmed reservations
  // EXCEPT the most recent one (highest id), which is the one that likely
  // triggered the slot to become unavailable.
  const conflicting = all(
    `SELECT * FROM reservations WHERE slot_id = ? AND status = 'confirmed' ORDER BY id DESC`,
    [slotId]
  );

  if (conflicting.length === 0) {
    console.log(`[Consumer] slot.updated: no confirmed reservations found for slot ${slotId}.`);
    return;
  }

  const toCancel = conflicting.slice(1);

  if (toCancel.length === 0) {
    console.log(`[Consumer] slot.updated: only 1 confirmed reservation found for slot ${slotId}, keeping it.`);
    return;
  }

  for (const reservation of toCancel) {
    run(
      `UPDATE reservations SET status = 'cancelled_slot_conflict' WHERE id = ?`,
      [reservation.id]
    );
    console.log(
      `[Consumer] Reservation ${reservation.id} cancelled due to slot ${slotId} conflict.`
    );
  }
}

/**
 * Start the Kafka consumer and listen to slot.updated.
 */
async function startConsumer() {
  await consumer.connect();
  console.log('[Kafka] Reservation consumer connected.');

  await consumer.subscribe({ topic: 'slot.updated', fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const payload = JSON.parse(message.value.toString());
        console.log(`[Consumer] Received ${topic}:`, payload);
        await handleSlotUpdated(payload);
      } catch (err) {
        console.error('[Consumer] Error processing slot.updated:', err.message);
      }
    },
  });
}

async function stopConsumer() {
  await consumer.disconnect();
}

module.exports = { startConsumer, stopConsumer };

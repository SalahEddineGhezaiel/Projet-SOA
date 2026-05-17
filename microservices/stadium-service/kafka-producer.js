const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'stadium-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const producer = kafka.producer();
let connected = false;

/**
 * Connect the producer once. Safe to call multiple times.
 */
async function connectProducer() {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('[Kafka] Stadium producer connected.');
  }
}

/**
 * Emit a slot.updated event.
 * @param {object} payload  - { slotId, stadiumId, isAvailable }
 */
async function emitSlotUpdated(payload) {
  try {
    await connectProducer();
    await producer.send({
      topic: 'slot.updated',
      messages: [
        {
          key:   String(payload.slotId),
          value: JSON.stringify({
            event:       'slot.updated',
            slotId:      payload.slotId,
            stadiumId:   payload.stadiumId,
            isAvailable: payload.isAvailable,
            timestamp:   new Date().toISOString(),
          }),
        },
      ],
    });
    console.log(`[Kafka] slot.updated emitted for slot ${payload.slotId}`);
  } catch (err) {
    console.error('[Kafka] Failed to emit slot.updated:', err.message);
  }
}

/**
 * Gracefully disconnect the producer.
 */
async function disconnectProducer() {
  if (connected) {
    await producer.disconnect();
    connected = false;
  }
}

module.exports = { emitSlotUpdated, disconnectProducer };

const { Kafka } = require('kafkajs');
require('dotenv').config();

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID || 'reservation-service',
  brokers:  [process.env.KAFKA_BROKER   || 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 5 },
});

const producer = kafka.producer();
let connected = false;

async function connectProducer() {
  if (!connected) {
    await producer.connect();
    connected = true;
    console.log('[Kafka] Reservation producer connected.');
  }
}

/**
 * Emit reservation.created event.
 * @param {object} reservation - full reservation row
 */
async function emitReservationCreated(reservation) {
  try {
    await connectProducer();
    await producer.send({
      topic: 'reservation.created',
      messages: [{
        key:   String(reservation.id),
        value: JSON.stringify({
          event:       'reservation.created',
          reservation,
          timestamp:   new Date().toISOString(),
        }),
      }],
    });
    console.log(`[Kafka] reservation.created emitted for reservation ${reservation.id}`);
  } catch (err) {
    console.error('[Kafka] Failed to emit reservation.created:', err.message);
  }
}

/**
 * Emit reservation.cancelled event.
 * @param {object} reservation - full reservation row
 */
async function emitReservationCancelled(reservation) {
  try {
    await connectProducer();
    await producer.send({
      topic: 'reservation.cancelled',
      messages: [{
        key:   String(reservation.id),
        value: JSON.stringify({
          event:       'reservation.cancelled',
          reservation,
          timestamp:   new Date().toISOString(),
        }),
      }],
    });
    console.log(`[Kafka] reservation.cancelled emitted for reservation ${reservation.id}`);
  } catch (err) {
    console.error('[Kafka] Failed to emit reservation.cancelled:', err.message);
  }
}

async function disconnectProducer() {
  if (connected) {
    await producer.disconnect();
    connected = false;
  }
}

module.exports = { emitReservationCreated, emitReservationCancelled, disconnectProducer };

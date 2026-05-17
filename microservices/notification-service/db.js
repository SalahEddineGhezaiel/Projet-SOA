const { createRxDatabase } = require('rxdb');
const { getRxStorageMemory } = require('rxdb/plugins/storage-memory');
require('dotenv').config();

let db          = null;   // RxDB database instance
let collection  = null;   // notifications collection

// ─── Notification schema (JSON Schema draft-07) ───────────────────────────────
const notificationSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
      maxLength: 100,         // required by RxDB for primary key
    },
    userId: {
      type: 'string',
      maxLength: 100,
    },
    message: {
      type: 'string',
    },
    type: {
      type: 'string',
      maxLength: 100,
    },
    read: {
      type: 'boolean',
    },
    createdAt: {
      type: 'string',
      maxLength: 50,
    },
  },
  required: ['id', 'userId', 'message', 'type', 'read', 'createdAt'],
  indexes: ['userId'],       // index on userId for fast per-user queries
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initDb() {
  db = await createRxDatabase({
    name:       'notificationdb',
    storage:    getRxStorageMemory(),
    ignoreDuplicate: true,   // safe for dev restarts
  });

  const collections = await db.addCollections({
    notifications: { schema: notificationSchema },
  });

  collection = collections.notifications;
  console.log('[RxDB] Notification database ready (in-memory).');
  return db;
}

// ─── Collection accessor ──────────────────────────────────────────────────────

function getCollection() {
  if (!collection) throw new Error('[RxDB] Database not initialised. Call initDb() first.');
  return collection;
}

module.exports = { initDb, getCollection };

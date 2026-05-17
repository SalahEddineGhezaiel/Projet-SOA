require('dotenv').config();

const path        = require('path');
const grpc        = require('@grpc/grpc-js');
const protoLoader  = require('@grpc/proto-loader');

const { initDb }                      = require('./db');
const handlers                        = require('./handlers');
const { startConsumer, stopConsumer } = require('./kafka-consumer');

// ─── Load proto ───────────────────────────────────────────────────────────────
const PROTO_PATH = path.resolve(__dirname, '../../proto/notification.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const grpcObject             = grpc.loadPackageDefinition(packageDef);
const notificationPackage    = grpcObject.notification;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const PORT = process.env.GRPC_PORT || '50053';

async function main() {
  // 1. Initialize RxDB (in-memory)
  await initDb();

  // 2. Start Kafka consumer — non-fatal if Kafka is not running
  try {
    await startConsumer();
  } catch (err) {
    console.warn('[Kafka] Consumer failed to start (Kafka may not be running):', err.message);
  }

  // 3. Start gRPC server
  const server = new grpc.Server();

  server.addService(notificationPackage.NotificationService.service, {
    GetNotifications: handlers.GetNotifications,
    MarkAsRead:       handlers.MarkAsRead,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('[gRPC] Failed to bind:', err.message);
        process.exit(1);
      }
      console.log(`[Notification Service] gRPC server running on port ${port}`);
    }
  );

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  async function shutdown() {
    console.log('[Notification Service] Shutting down...');
    await stopConsumer();
    server.tryShutdown((err) => {
      if (err) console.error('[gRPC] Shutdown error:', err.message);
      process.exit(0);
    });
  }

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Notification Service] Fatal startup error:', err.message);
  process.exit(1);
});

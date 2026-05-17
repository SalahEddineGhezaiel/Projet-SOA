require('dotenv').config();

const path        = require('path');
const grpc        = require('@grpc/grpc-js');
const protoLoader  = require('@grpc/proto-loader');

const { initDb }             = require('./db');
const handlers               = require('./handlers');
const { disconnectProducer } = require('./kafka-producer');

// ─── Load proto ───────────────────────────────────────────────────────────────
const PROTO_PATH = path.resolve(__dirname, '../../proto/stadium.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const grpcObject     = grpc.loadPackageDefinition(packageDef);
const stadiumPackage = grpcObject.stadium;

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const PORT = process.env.GRPC_PORT || '50051';

async function main() {
  // Initialize database first (sql.js is async due to WASM loading)
  await initDb();

  // Build gRPC server
  const server = new grpc.Server();

  server.addService(stadiumPackage.StadiumService.service, {
    GetStadium:             handlers.GetStadium,
    ListStadiums:           handlers.ListStadiums,
    ListSlots:              handlers.ListSlots,
    CheckAvailability:      handlers.CheckAvailability,
    UpdateSlotAvailability: handlers.UpdateSlotAvailability,
  });

  server.bindAsync(
    `0.0.0.0:${PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('[gRPC] Failed to bind:', err.message);
        process.exit(1);
      }
      console.log(`[Stadium Service] gRPC server running on port ${port}`);
    }
  );

  // ─── Graceful shutdown ──────────────────────────────────────────────────────
  async function shutdown() {
    console.log('[Stadium Service] Shutting down...');
    await disconnectProducer();
    server.tryShutdown((err) => {
      if (err) console.error('[gRPC] Shutdown error:', err.message);
      process.exit(0);
    });
  }

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[Stadium Service] Fatal startup error:', err.message);
  process.exit(1);
});

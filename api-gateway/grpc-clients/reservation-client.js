const path        = require('path');
const grpc        = require('@grpc/grpc-js');
const protoLoader  = require('@grpc/proto-loader');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PROTO_PATH = path.resolve(__dirname, '../../proto/reservation.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const { reservation } = grpc.loadPackageDefinition(packageDef);

const client = new reservation.ReservationService(
  process.env.RESERVATION_SERVICE_URL || 'localhost:50052',
  grpc.credentials.createInsecure()
);

// ─── Promisified helpers ──────────────────────────────────────────────────────

function call(method, request = {}) {
  return new Promise((resolve, reject) => {
    client[method](request, (err, response) => {
      if (err) reject(err);
      else resolve(response);
    });
  });
}

module.exports = {
  createReservation:    (req) => call('CreateReservation',    req),
  cancelReservation:    (req) => call('CancelReservation',    req),
  getReservation:       (req) => call('GetReservation',       req),
  listUserReservations: (req) => call('ListUserReservations', req),
};

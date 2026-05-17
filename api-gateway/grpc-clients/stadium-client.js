const path        = require('path');
const grpc        = require('@grpc/grpc-js');
const protoLoader  = require('@grpc/proto-loader');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PROTO_PATH = path.resolve(__dirname, '../../proto/stadium.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const { stadium } = grpc.loadPackageDefinition(packageDef);

const client = new stadium.StadiumService(
  process.env.STADIUM_SERVICE_URL || 'localhost:50051',
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
  getStadium:             (req) => call('GetStadium',             req),
  listStadiums:           (req) => call('ListStadiums',           req),
  listSlots:              (req) => call('ListSlots',              req),
  checkAvailability:      (req) => call('CheckAvailability',      req),
  updateSlotAvailability: (req) => call('UpdateSlotAvailability', req),
};

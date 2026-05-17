const path        = require('path');
const grpc        = require('@grpc/grpc-js');
const protoLoader  = require('@grpc/proto-loader');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const PROTO_PATH = path.resolve(__dirname, '../../proto/notification.proto');

const packageDef = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs:    String,
  enums:    String,
  defaults: true,
  oneofs:   true,
});

const { notification } = grpc.loadPackageDefinition(packageDef);

const client = new notification.NotificationService(
  process.env.NOTIFICATION_SERVICE_URL || 'localhost:50053',
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
  getNotifications: (req) => call('GetNotifications', req),
  markAsRead:       (req) => call('MarkAsRead',       req),
};

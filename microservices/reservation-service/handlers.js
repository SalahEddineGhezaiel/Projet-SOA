const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { run, all, get }                          = require('./db');
const { emitReservationCreated, emitReservationCancelled } = require('./kafka-producer');

// ─── Stadium Service gRPC Client ──────────────────────────────────────────────
const STADIUM_PROTO_PATH = path.resolve(__dirname, '../../proto/stadium.proto');
const packageDefinition = protoLoader.loadSync(STADIUM_PROTO_PATH, {
  keepCase: true, longs: String, enums: String, defaults: true, oneofs: true
});
const stadiumProto = grpc.loadPackageDefinition(packageDefinition).stadium;
const stadiumUrl = process.env.STADIUM_SERVICE_URL || 'localhost:50051';
const stadiumClient = new stadiumProto.StadiumService(
  stadiumUrl,
  grpc.credentials.createInsecure()
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToReservation(row) {
  return {
    id:         Number(row.id),
    user_id:    Number(row.user_id),
    stadium_id: Number(row.stadium_id),
    slot_id:    Number(row.slot_id),
    status:     row.status,
    created_at: row.created_at,
  };
}

// ─── gRPC Handlers ───────────────────────────────────────────────────────────

/**
 * CreateReservation
 * 1. Validate input
 * 2. Upsert user (find by phone or create)
 * 3. Check for an existing confirmed reservation on the same slot
 * 4. Insert reservation with status 'confirmed'
 * 5. Update slot availability on Stadium Service via gRPC
 * 6. Emit Kafka reservation.created
 */
async function CreateReservation(call, callback) {
  const { user_id, stadium_id, slot_id, user_name, user_phone } = call.request;

  if (!stadium_id || !slot_id) {
    return callback({ code: 3, message: 'stadium_id and slot_id are required.' });
  }

  // Resolve user — either use provided user_id or look up / create by phone
  let resolvedUserId = user_id;

  if (!resolvedUserId) {
    if (!user_name || !user_phone) {
      return callback({ code: 3, message: 'Provide user_id OR (user_name + user_phone).' });
    }

    let user = get('SELECT * FROM users WHERE phone = ?', [user_phone]);
    if (!user) {
      const { lastInsertRowid } = run(
        'INSERT INTO users (name, phone) VALUES (?, ?)',
        [user_name, user_phone]
      );
      resolvedUserId = Number(lastInsertRowid);
    } else {
      resolvedUserId = Number(user.id);
    }
  }

  // Check for duplicate confirmed reservation on same slot
  const existing = get(
    `SELECT * FROM reservations WHERE slot_id = ? AND status = 'confirmed'`,
    [slot_id]
  );
  if (existing) {
    return callback({
      code: 6, // ALREADY_EXISTS
      message: `Slot ${slot_id} is already booked (reservation #${existing.id}).`,
    });
  }

  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = run(
    `INSERT INTO reservations (user_id, stadium_id, slot_id, status, created_at)
     VALUES (?, ?, ?, 'confirmed', ?)`,
    [resolvedUserId, stadium_id, slot_id, createdAt]
  );

  const reservation = {
    id:         Number(lastInsertRowid),
    user_id:    resolvedUserId,
    stadium_id: Number(stadium_id),
    slot_id:    Number(slot_id),
    status:     'confirmed',
    created_at: createdAt,
  };

  // Mark slot as unavailable in Stadium Service
  stadiumClient.UpdateSlotAvailability({ slot_id: Number(slot_id), is_available: false }, (err, response) => {
    if (err) {
      console.error('[Reservation Service] Failed to update slot availability on Stadium Service:', err.message);
    } else {
      console.log('[Reservation Service] Stadium Service responded:', response.message);
    }
  });

  // Fire-and-forget Kafka event
  emitReservationCreated(reservation);

  callback(null, { success: true, message: 'Reservation confirmed.', reservation });
}

/**
 * CancelReservation
 * 1. Find reservation
 * 2. Guard against double-cancel
 * 3. Update status to 'cancelled'
 * 4. Emit Kafka reservation.cancelled
 */
async function CancelReservation(call, callback) {
  const { id } = call.request;
  if (!id) return callback({ code: 3, message: 'id is required.' });

  const row = get('SELECT * FROM reservations WHERE id = ?', [id]);
  if (!row) return callback({ code: 5, message: `Reservation ${id} not found.` });

  if (row.status === 'cancelled' || row.status === 'cancelled_slot_conflict') {
    return callback({ code: 9, message: `Reservation ${id} is already cancelled.` });
  }

  run(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`, [id]);

  const updated = rowToReservation({ ...row, status: 'cancelled' });

  // Mark slot as available again in Stadium Service
  stadiumClient.UpdateSlotAvailability({ slot_id: Number(row.slot_id), is_available: true }, (err, response) => {
    if (err) {
      console.error('[Reservation Service] Failed to free slot on Stadium Service:', err.message);
    } else {
      console.log('[Reservation Service] Stadium Service responded:', response.message);
    }
  });

  emitReservationCancelled(updated);

  callback(null, { success: true, message: 'Reservation cancelled.' });
}

/**
 * GetReservation
 */
function GetReservation(call, callback) {
  const { id } = call.request;
  if (!id) return callback({ code: 3, message: 'id is required.' });

  const row = get('SELECT * FROM reservations WHERE id = ?', [id]);
  if (!row) return callback({ code: 5, message: `Reservation ${id} not found.` });

  callback(null, { reservation: rowToReservation(row) });
}

/**
 * ListUserReservations
 */
function ListUserReservations(call, callback) {
  const { user_id } = call.request;
  if (!user_id) return callback({ code: 3, message: 'user_id is required.' });

  const rows = all('SELECT * FROM reservations WHERE user_id = ? ORDER BY created_at DESC', [user_id]);
  callback(null, { reservations: rows.map(rowToReservation) });
}

module.exports = {
  CreateReservation,
  CancelReservation,
  GetReservation,
  ListUserReservations,
};

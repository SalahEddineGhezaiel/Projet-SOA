const express     = require('express');
const stadiumClient      = require('../grpc-clients/stadium-client');
const reservationClient  = require('../grpc-clients/reservation-client');
const notificationClient = require('../grpc-clients/notification-client');

const router = express.Router();

// ─── Helper ───────────────────────────────────────────────────────────────────

/** Wrap async route handlers and forward errors to Express error middleware. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Stadium routes ───────────────────────────────────────────────────────────

/**
 * GET /stadiums
 * Optional query param: ?city=Casablanca
 */
router.get('/stadiums', asyncHandler(async (req, res) => {
  const { city = '' } = req.query;
  const result = await stadiumClient.listStadiums({ city });
  res.json({ success: true, data: result.stadiums });
}));

/**
 * GET /stadiums/:id/slots
 * Optional query param: ?date=2026-06-01
 */
router.get('/stadiums/:id/slots', asyncHandler(async (req, res) => {
  const stadium_id = parseInt(req.params.id, 10);
  if (isNaN(stadium_id)) return res.status(400).json({ success: false, message: 'Invalid stadium id.' });

  const { date = '' } = req.query;
  const result = await stadiumClient.listSlots({ stadium_id, date });
  res.json({ success: true, data: result.slots });
}));

// ─── Reservation routes ───────────────────────────────────────────────────────

/**
 * POST /reservations
 * Body: { user_id?, stadium_id, slot_id, user_name?, user_phone? }
 */
router.post('/reservations', asyncHandler(async (req, res) => {
  const { user_id = 0, stadium_id, slot_id, user_name = '', user_phone = '' } = req.body;

  if (!stadium_id || !slot_id) {
    return res.status(400).json({ success: false, message: 'stadium_id and slot_id are required.' });
  }

  const result = await reservationClient.createReservation({
    user_id:    user_id   || 0,
    stadium_id: parseInt(stadium_id, 10),
    slot_id:    parseInt(slot_id,    10),
    user_name,
    user_phone,
  });

  const status = result.success ? 201 : 409;
  res.status(status).json({ success: result.success, message: result.message, data: result.reservation });
}));

/**
 * DELETE /reservations/:id
 */
router.delete('/reservations/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid reservation id.' });

  const result = await reservationClient.cancelReservation({ id });
  res.json({ success: result.success, message: result.message });
}));

/**
 * GET /reservations/:id
 */
router.get('/reservations/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ success: false, message: 'Invalid reservation id.' });

  const result = await reservationClient.getReservation({ id });
  res.json({ success: true, data: result.reservation });
}));

// ─── Notification routes ──────────────────────────────────────────────────────

/**
 * GET /notifications/:userId
 */
router.get('/notifications/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const result = await notificationClient.getNotifications({ user_id: userId });
  res.json({ success: true, data: result.notifications });
}));

/**
 * PATCH /notifications/:id/read
 */
router.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await notificationClient.markAsRead({ notification_id: id });
  res.json({ success: result.success, message: result.message });
}));

// ─── Error middleware ─────────────────────────────────────────────────────────

router.use((err, req, res, _next) => {
  console.error('[REST Error]', err.message);
  const grpcCodeMap = { 3: 400, 5: 404, 6: 409, 9: 409 };
  const status = grpcCodeMap[err.code] || 500;
  res.status(status).json({ success: false, message: err.details || err.message });
});

module.exports = router;

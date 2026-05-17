const { getCollection } = require('./db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert a RxDB document to a plain Protobuf-compatible object. */
function docToNotification(doc) {
  const data = doc.toJSON();
  return {
    id:         data.id,
    user_id:    data.userId,
    message:    data.message,
    type:       data.type,
    read:       data.read,
    created_at: data.createdAt,
  };
}

// ─── gRPC Handlers ───────────────────────────────────────────────────────────

/**
 * GetNotifications — return all notifications for a given userId,
 * sorted by createdAt descending (newest first).
 */
async function GetNotifications(call, callback) {
  const { user_id } = call.request;

  if (!user_id || user_id.trim() === '') {
    return callback({ code: 3, message: 'user_id is required.' });
  }

  try {
    const col  = getCollection();
    const docs = await col.find({
      selector: { userId: String(user_id) },
      sort:     [{ createdAt: 'desc' }],
    }).exec();

    callback(null, { notifications: docs.map(docToNotification) });
  } catch (err) {
    console.error('[GetNotifications] Error:', err.message);
    callback({ code: 13, message: 'Internal error fetching notifications.' });
  }
}

/**
 * MarkAsRead — mark a single notification as read by its ID.
 */
async function MarkAsRead(call, callback) {
  const { notification_id } = call.request;

  if (!notification_id || notification_id.trim() === '') {
    return callback({ code: 3, message: 'notification_id is required.' });
  }

  try {
    const col = getCollection();
    const doc = await col.findOne(notification_id).exec();

    if (!doc) {
      return callback({ code: 5, message: `Notification ${notification_id} not found.` });
    }

    if (doc.read) {
      return callback(null, { success: true, message: 'Notification was already marked as read.' });
    }

    await doc.patch({ read: true });
    callback(null, { success: true, message: 'Notification marked as read.' });
  } catch (err) {
    console.error('[MarkAsRead] Error:', err.message);
    callback({ code: 13, message: 'Internal error updating notification.' });
  }
}

module.exports = { GetNotifications, MarkAsRead };

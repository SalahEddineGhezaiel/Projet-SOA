const { run, all, get } = require('./db');
const { emitSlotUpdated } = require('./kafka-producer');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert a sql.js row's is_available (0/1 integer) to a proper boolean. */
function rowToSlot(row) {
  return {
    id:           Number(row.id),
    stadium_id:   Number(row.stadium_id),
    date:         row.date,
    start_time:   row.start_time,
    end_time:     row.end_time,
    is_available: row.is_available === 1 || row.is_available === true,
  };
}

function rowToStadium(row) {
  return {
    id:             Number(row.id),
    name:           row.name,
    city:           row.city,
    address:        row.address,
    price_per_slot: Number(row.price_per_slot),
  };
}

// ─── gRPC Handlers ───────────────────────────────────────────────────────────

function GetStadium(call, callback) {
  const { id } = call.request;
  if (!id) return callback({ code: 3, message: 'id is required' });

  const row = get('SELECT * FROM stadiums WHERE id = ?', [id]);
  if (!row) return callback({ code: 5, message: `Stadium ${id} not found` });

  callback(null, { stadium: rowToStadium(row) });
}

function ListStadiums(call, callback) {
  const { city } = call.request;
  let rows;

  if (city && city.trim() !== '') {
    rows = all(
      'SELECT * FROM stadiums WHERE LOWER(city) LIKE ?',
      [`%${city.toLowerCase()}%`]
    );
  } else {
    rows = all('SELECT * FROM stadiums');
  }

  callback(null, { stadiums: rows.map(rowToStadium) });
}

function ListSlots(call, callback) {
  const { stadium_id, date } = call.request;
  if (!stadium_id) return callback({ code: 3, message: 'stadium_id is required' });

  let rows;
  let query = '';
  let params = [];
  
  if (date && date.trim() !== '') {
    query = 'SELECT * FROM slots WHERE stadium_id = ? AND date = ?';
    params = [Number(stadium_id), date.trim()];
    rows = all(query, params);
  } else {
    query = 'SELECT * FROM slots WHERE stadium_id = ?';
    params = [Number(stadium_id)];
    rows = all(query, params);
  }

  console.log(`[ListSlots] SQL: ${query} | Params: ${JSON.stringify(params)} | Rows found: ${rows.length}`);

  callback(null, { slots: rows.map(rowToSlot) });
}

function CheckAvailability(call, callback) {
  const { slot_id } = call.request;
  if (!slot_id) return callback({ code: 3, message: 'slot_id is required' });

  const row = get('SELECT * FROM slots WHERE id = ?', [slot_id]);
  if (!row) return callback({ code: 5, message: `Slot ${slot_id} not found` });

  const isAvailable = row.is_available === 1 || row.is_available === true;
  callback(null, {
    is_available: isAvailable,
    message: isAvailable ? 'Slot is available.' : 'Slot is already booked.',
  });
}

async function UpdateSlotAvailability(call, callback) {
  const { slot_id, is_available } = call.request;
  if (slot_id === undefined || slot_id === null) {
    return callback({ code: 3, message: 'slot_id is required' });
  }

  const row = get('SELECT * FROM slots WHERE id = ?', [slot_id]);
  if (!row) return callback({ code: 5, message: `Slot ${slot_id} not found` });

  run('UPDATE slots SET is_available = ? WHERE id = ?', [is_available ? 1 : 0, slot_id]);

  // Emit Kafka event (fire-and-forget)
  emitSlotUpdated({
    slotId:      slot_id,
    stadiumId:   Number(row.stadium_id),
    isAvailable: is_available,
  });

  callback(null, { success: true, message: 'Slot availability updated.' });
}

module.exports = {
  GetStadium,
  ListStadiums,
  ListSlots,
  CheckAvailability,
  UpdateSlotAvailability,
};

const stadiumClient      = require('../grpc-clients/stadium-client');
const reservationClient  = require('../grpc-clients/reservation-client');

// ─── Field name adapters ──────────────────────────────────────────────────────
// gRPC uses snake_case; GraphQL schema uses camelCase.

function adaptStadium(s) {
  if (!s) return null;
  return {
    id:           s.id,
    name:         s.name,
    city:         s.city,
    address:      s.address,
    pricePerSlot: s.price_per_slot,
    // slots resolved separately in the Stadium field resolver
  };
}

function adaptSlot(sl) {
  if (!sl) return null;
  return {
    id:          sl.id,
    stadiumId:   sl.stadium_id,
    date:        sl.date,
    startTime:   sl.start_time,
    endTime:     sl.end_time,
    isAvailable: sl.is_available,
  };
}

function adaptReservation(r) {
  if (!r) return null;
  return {
    id:        r.id,
    userId:    r.user_id,
    stadiumId: r.stadium_id,
    slotId:    r.slot_id,
    status:    r.status,
    createdAt: r.created_at,
  };
}

// ─── Resolvers ────────────────────────────────────────────────────────────────

const resolvers = {
  Query: {
    /**
     * stadium(id) — fetch one stadium with its slots.
     * Slots are resolved by the Stadium.slots field resolver below.
     */
    stadium: async (_, { id }) => {
      const res = await stadiumClient.getStadium({ id });
      return adaptStadium(res.stadium);
    },

    /**
     * myReservations(userId) — list reservations with nested stadium + slot.
     * Nested fields resolved by Reservation field resolvers below.
     */
    myReservations: async (_, { userId }) => {
      const res = await reservationClient.listUserReservations({ user_id: userId });
      return (res.reservations || []).map(adaptReservation);
    },

    /**
     * availableStadiums(date, city) — list stadiums that have at least one
     * available slot on the given date (and optionally in a given city).
     * Strategy: fetch all stadiums filtered by city, then filter those that
     * have at least one available slot on the requested date.
     */
    availableStadiums: async (_, { date, city }) => {
      const listRes = await stadiumClient.listStadiums({ city: city || '' });
      const stadiums = listRes.stadiums || [];

      if (!date) {
        // No date filter — return all stadiums (adapted)
        return stadiums.map(adaptStadium);
      }

      // Filter stadiums that have at least one available slot on that date
      const available = await Promise.all(
        stadiums.map(async (s) => {
          const slotsRes = await stadiumClient.listSlots({ stadium_id: s.id, date });
          const hasAvailable = (slotsRes.slots || []).some((sl) => sl.is_available);
          return hasAvailable ? adaptStadium(s) : null;
        })
      );

      return available.filter(Boolean);
    },
  },

  // ─── Field resolvers ──────────────────────────────────────────────────────

  Stadium: {
    /** Resolve slots for a stadium (called when the query includes `slots`). */
    slots: async (stadium) => {
      const res = await stadiumClient.listSlots({ stadium_id: stadium.id });
      return (res.slots || []).map(adaptSlot);
    },
  },

  Reservation: {
    /** Resolve nested stadium details for a reservation. */
    stadium: async (reservation) => {
      try {
        const res = await stadiumClient.getStadium({ id: reservation.stadiumId });
        return adaptStadium(res.stadium);
      } catch {
        return null;
      }
    },

    /** Resolve nested slot details for a reservation. */
    slot: async (reservation) => {
      try {
        const res = await stadiumClient.listSlots({ stadium_id: reservation.stadiumId });
        const slot = (res.slots || []).find((sl) => Number(sl.id) === Number(reservation.slotId));
        return slot ? adaptSlot(slot) : null;
      } catch {
        return null;
      }
    },
  },
};

module.exports = resolvers;

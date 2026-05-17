const { gql } = require('apollo-server-express');

const typeDefs = gql`
  type Stadium {
    id:            Int!
    name:          String!
    city:          String!
    address:       String!
    pricePerSlot:  Float!
    slots:         [Slot]
  }

  type Slot {
    id:          Int!
    stadiumId:   Int!
    date:        String!
    startTime:   String!
    endTime:     String!
    isAvailable: Boolean!
  }

  type Reservation {
    id:        Int!
    userId:    Int!
    stadiumId: Int!
    slotId:    Int!
    status:    String!
    createdAt: String!
    stadium:   Stadium
    slot:      Slot
  }

  type Notification {
    id:        String!
    userId:    String!
    message:   String!
    type:      String!
    read:      Boolean!
    createdAt: String!
  }

  type Query {
    "Full stadium details with its slots and pricing"
    stadium(id: Int!): Stadium

    "All reservations for a user, with nested stadium and slot info"
    myReservations(userId: Int!): [Reservation]

    "Search available stadiums by date and/or city"
    availableStadiums(date: String, city: String): [Stadium]
  }
`;

module.exports = typeDefs;

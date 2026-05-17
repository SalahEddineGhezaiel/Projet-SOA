# Soccer Stadium Reservation Platform

A microservices backend built with Node.js, gRPC, Apache Kafka, and SQLite.

---

## Architecture Overview

```
Client
  └── API Gateway (REST + GraphQL) — port 3000
        ├── Stadium Service (gRPC) ————————— port 50051  →  SQLite (sql.js)
        ├── Reservation Service (gRPC) ———— port 50052  →  SQLite (sql.js)
        └── Notification Service (gRPC) ——— port 50053  →  RxDB (in-memory)

Kafka (KRaft, no ZooKeeper) — port 9092
  Topics:
    slot.updated          (Stadium → Reservation)
    reservation.created   (Reservation → Notification)
    reservation.cancelled (Reservation → Notification)
```

---

## Prerequisites

- **Node.js** v18 or higher
- **Java** 11 or higher (required by Kafka)
- **Apache Kafka** 4.x (KRaft mode — no ZooKeeper needed)

---

## 1. Install and Start Kafka

### Download Kafka

Go to https://kafka.apache.org/downloads and download the latest **Kafka 4.x** binary (`.tgz`).

Extract it, for example to `C:\kafka`.

### Start Kafka in KRaft mode (Windows)

Open a terminal in your Kafka folder and run these commands **in order**:

```bash
# Step 1 — Generate a cluster UUID
bin\windows\kafka-storage.bat random-uuid
# Copy the UUID printed, e.g.: abc123XYZ...

# Step 2 — Format the storage directory with that UUID
bin\windows\kafka-storage.bat format -t <YOUR-UUID> -c config\kraft\server.properties

# Step 3 — Start the Kafka broker
bin\windows\kafka-server-start.bat config\kraft\server.properties
```

Kafka is ready when you see: `INFO Kafka Server started`

> **Note:** Keep this terminal open. Kafka must be running before starting the microservices.

### Create the Kafka topics

Open a **new terminal** in your Kafka folder:

```bash
bin\windows\kafka-topics.bat --create --topic slot.updated          --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
bin\windows\kafka-topics.bat --create --topic reservation.created   --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
bin\windows\kafka-topics.bat --create --topic reservation.cancelled --bootstrap-server localhost:9092 --partitions 1 --replication-factor 1
```

---

## 2. Project Structure

```
soccer-reservation/
├── proto/
│   ├── stadium.proto
│   ├── reservation.proto
│   └── notification.proto
├── microservices/
│   ├── stadium-service/        (port 50051)
│   ├── reservation-service/    (port 50052)
│   └── notification-service/   (port 50053)
├── api-gateway/                (port 3000)
└── README.md
```

---

## 3. Install Dependencies

Run `npm install` in each service folder separately:

```bash
cd microservices/stadium-service       && npm install && cd ../..
cd microservices/reservation-service   && npm install && cd ../..
cd microservices/notification-service  && npm install && cd ../..
cd api-gateway                         && npm install && cd ..
```

---

## 4. Start the Services

Open a **separate terminal** for each service and run `node index.js`.

**Terminal 1 — Stadium Service**
```bash
cd microservices/stadium-service
node index.js
# [Stadium Service] gRPC server running on port 50051
```

**Terminal 2 — Reservation Service**
```bash
cd microservices/reservation-service
node index.js
# [Reservation Service] gRPC server running on port 50052
```

**Terminal 3 — Notification Service**
```bash
cd microservices/notification-service
node index.js
# [Notification Service] gRPC server running on port 50053
```

**Terminal 4 — API Gateway**
```bash
cd api-gateway
node index.js
# [API Gateway] REST    → http://localhost:3000
# [API Gateway] GraphQL → http://localhost:3000/graphql
```

> **Start order:** Kafka first, then the three microservices, then the API Gateway.

---

## 5. REST API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/stadiums` | List all stadiums (optional: `?city=Tunis`) |
| `GET` | `/stadiums/:id/slots` | Get slots for a stadium (optional: `?date=2026-06-01`) |
| `POST` | `/reservations` | Create a reservation |
| `DELETE` | `/reservations/:id` | Cancel a reservation |
| `GET` | `/reservations/:id` | Get a reservation by ID |
| `GET` | `/notifications/:userId` | Get notifications for a user |
| `PATCH` | `/notifications/:id/read` | Mark a notification as read |

### Example: Create a reservation

```bash
curl -X POST http://localhost:3000/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "stadium_id": 1,
    "slot_id": 1,
    "user_name": "Ali Hassan",
    "user_phone": "0612345678"
  }'
```

### Example: List stadiums

```bash
curl http://localhost:3000/stadiums
curl http://localhost:3000/stadiums?city=Tunis
curl http://localhost:3000/stadiums/1/slots?date=2026-06-01
```

---

## 6. GraphQL API

Open **http://localhost:3000/graphql** in your browser to use the GraphQL Playground.

### Available Queries

**Get stadium with slots and pricing**
```graphql
query {
  stadium(id: 1) {
    name
    city
    pricePerSlot
    slots {
      date
      startTime
      endTime
      isAvailable
    }
  }
}
```

**Get user reservations with nested info**
```graphql
query {
  myReservations(userId: 1) {
    id
    status
    createdAt
    stadium {
      name
      city
    }
    slot {
      date
      startTime
      endTime
    }
  }
}
```

**Search available stadiums by date and city**
```graphql
query {
  availableStadiums(date: "2026-06-01", city: "Tunis") {
    id
    name
    pricePerSlot
  }
}
```

---

## 7. Environment Variables

Each service has its own `.env` file. Default values:

| Service | Variable | Default |
|---------|----------|---------|
| stadium-service | `GRPC_PORT` | `50051` |
| stadium-service | `KAFKA_BROKER` | `localhost:9092` |
| stadium-service | `DB_PATH` | `./stadium.db` |
| reservation-service | `GRPC_PORT` | `50052` |
| reservation-service | `KAFKA_BROKER` | `localhost:9092` |
| reservation-service | `DB_PATH` | `./reservation.db` |
| notification-service | `GRPC_PORT` | `50053` |
| notification-service | `KAFKA_BROKER` | `localhost:9092` |
| api-gateway | `PORT` | `3000` |
| api-gateway | `STADIUM_SERVICE_URL` | `localhost:50051` |
| api-gateway | `RESERVATION_SERVICE_URL` | `localhost:50052` |
| api-gateway | `NOTIFICATION_SERVICE_URL` | `localhost:50053` |


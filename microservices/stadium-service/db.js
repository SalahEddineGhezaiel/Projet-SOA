const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './stadium.db');

let db = null; // sql.js Database instance

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Persist the in-memory database to disk. */
function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

/** Run a write statement (INSERT / UPDATE / DELETE). Returns { lastInsertRowid }. */
function run(sql, params = []) {
  db.run(sql, params);
  const result = db.exec('SELECT last_insert_rowid()');
  const lastInsertRowid = result[0]?.values[0][0] ?? null;
  saveDb();
  return { lastInsertRowid };
}

/** Return all matching rows as plain objects. */
function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

/** Return the first matching row, or null. */
function get(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free();
  return row;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stadiums (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      city           TEXT    NOT NULL,
      address        TEXT    NOT NULL,
      price_per_slot REAL    NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS slots (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      stadium_id   INTEGER NOT NULL,
      date         TEXT    NOT NULL,
      start_time   TEXT    NOT NULL,
      end_time     TEXT    NOT NULL,
      is_available INTEGER NOT NULL DEFAULT 1
    );
  `);
}

// ─── Seed data ────────────────────────────────────────────────────────────────

function seedIfEmpty() {
  const count = get('SELECT COUNT(*) as cnt FROM stadiums');
  if (count && count.cnt > 0) return;

  const stadiums = [
    { name: 'Complexe Sportif de Sousse', city: 'Sousse', address: 'Avenue Taïeb Mhiri, Sousse', price: 80 },
    { name: 'Stade Municipal de Bizerte', city: 'Bizerte', address: 'Rue du 2 Mars, Bizerte', price: 70 },
    { name: 'Complexe El Menzah', city: 'Tunis', address: 'Cité Sportive El Menzah, Tunis', price: 100 },
    { name: 'Stade Taïeb Mhiri Sfax', city: 'Sfax', address: 'Route de Tunis, Sfax', price: 75 },
    { name: 'Complexe Sportif de Nabeul', city: 'Nabeul', address: 'Avenue Habib Bourguiba, Nabeul', price: 65 },
  ];

  const dates = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-07', '2026-06-08'];
  const timeslots = [
    ['08:00', '10:00'],
    ['10:00', '12:00'],
    ['14:00', '16:00'],
    ['16:00', '18:00'],
  ];

  for (const s of stadiums) {
    const { lastInsertRowid: stadiumId } = run(
      'INSERT INTO stadiums (name, city, address, price_per_slot) VALUES (?, ?, ?, ?)',
      [s.name, s.city, s.address, s.price]
    );

    for (const date of dates) {
      for (const [start, end] of timeslots) {
        run(
          'INSERT INTO slots (stadium_id, date, start_time, end_time, is_available) VALUES (?, ?, ?, ?, ?)',
          [stadiumId, date, start, end, 1]
        );
      }
    }
  }

  console.log('[DB] Seed data inserted.');
}

// ─── Init (async — sql.js loads WASM) ────────────────────────────────────────

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new in-memory database.');
  }

  createSchema();
  seedIfEmpty();
  saveDb(); // ensure file is written after schema/seed
  return db;
}

module.exports = { initDb, run, all, get, saveDb };

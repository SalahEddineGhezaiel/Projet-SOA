const initSqlJs = require('sql.js');
const fs   = require('fs');
const path = require('path');
require('dotenv').config();

const DB_PATH = path.resolve(process.env.DB_PATH || './reservation.db');

let db = null;

// ─── Internal persistence ─────────────────────────────────────────────────────

function saveDb() {
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// ─── Query helpers (mirror better-sqlite3 style) ──────────────────────────────

/** Execute a write statement. Returns { lastInsertRowid }. */
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
    CREATE TABLE IF NOT EXISTS users (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL,
      phone TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL,
      stadium_id INTEGER NOT NULL,
      slot_id    INTEGER NOT NULL,
      status     TEXT    NOT NULL DEFAULT 'confirmed',
      created_at TEXT    NOT NULL
    );
  `);
}

// ─── Init ─────────────────────────────────────────────────────────────────────

async function initDb() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
    console.log('[DB] Loaded existing reservation database from', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('[DB] Created new reservation database.');
  }

  createSchema();
  saveDb();
  return db;
}

module.exports = { initDb, run, all, get, saveDb };

'use strict';

/**
 * SQLite connection + schema. The database is a single file under data/.
 * better-sqlite3 is synchronous, which keeps the request handlers simple and
 * is more than fast enough for a small fleet.
 */

const fs = require('fs');
const Database = require('better-sqlite3');
const config = require('./config');

// Make sure the data + uploads directories exist before opening the file.
fs.mkdirSync(config.paths.data, { recursive: true });
fs.mkdirSync(config.paths.uploads, { recursive: true });

const db = new Database(config.paths.db);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT,
    role          TEXT NOT NULL DEFAULT 'staff',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bikes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    model       TEXT,
    status      TEXT NOT NULL DEFAULT 'available',  -- available | active | booked | maintenance
    battery     INTEGER NOT NULL DEFAULT 100,        -- 0..100
    range_km    INTEGER NOT NULL DEFAULT 60,
    pos_x       REAL,                                 -- staff map x (0..800)
    pos_y       REAL,                                 -- staff map y (0..620)
    place       TEXT,                                 -- human-readable location
    note        TEXT,
    sort        INTEGER NOT NULL DEFAULT 0,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ref           TEXT UNIQUE NOT NULL,
    bike_id       INTEGER,
    customer_name TEXT NOT NULL,
    contact       TEXT NOT NULL,
    pickup_date   TEXT NOT NULL,
    pickup_time   TEXT,
    days          INTEGER NOT NULL DEFAULT 1,
    quantity      INTEGER NOT NULL DEFAULT 1,
    pay_method    TEXT,
    passport_file TEXT,
    licence_file  TEXT,
    total_mvr     INTEGER,
    status        TEXT NOT NULL DEFAULT 'new',        -- new | confirmed | declined | completed | cancelled
    notes         TEXT,
    lang          TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (bike_id) REFERENCES bikes(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    booking_id    INTEGER,
    customer_name TEXT,
    bike_name     TEXT,
    amount_mvr    INTEGER NOT NULL,
    method        TEXT,
    status        TEXT NOT NULL DEFAULT 'paid',       -- paid | refunded
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    refunded_at   TEXT,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    author     TEXT NOT NULL,
    location   TEXT,
    rating     INTEGER NOT NULL DEFAULT 5,
    text       TEXT NOT NULL,
    source     TEXT,                                  -- google | instagram | tiktok
    published  INTEGER NOT NULL DEFAULT 1,
    sort       INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status);
  CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);
  CREATE INDEX IF NOT EXISTS idx_txn_created      ON transactions(created_at);
`);

/* ----------------------------- settings helpers ---------------------------- */

const _getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const _setSetting = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback = null) {
  const row = _getSetting.get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  _setSetting.run(key, value == null ? null : String(value));
}

function getNumber(key, fallback) {
  const v = getSetting(key);
  const n = v == null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { db, getSetting, setSetting, getNumber };

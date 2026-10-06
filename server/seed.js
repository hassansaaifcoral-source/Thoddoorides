'use strict';

/**
 * Seeds the database on first run. Idempotent: it only inserts a table's
 * defaults when that table is empty, so restarting the server never clobbers
 * real data. Run `npm run reset-db` to wipe and reseed from scratch.
 */

const { db, setSetting, getSetting } = require('./db');
const config = require('./config');
const { hashPassword } = require('./auth');

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function seedAdmin() {
  if (count('users') > 0) return;
  db.prepare(
    'INSERT INTO users (username, password_hash, name, role) VALUES (?, ?, ?, ?)'
  ).run(
    config.seedAdmin.username,
    hashPassword(config.seedAdmin.password),
    config.seedAdmin.name,
    'owner'
  );
  console.log(`[seed] created admin user "${config.seedAdmin.username}"`);
}

function seedBikes() {
  if (count('bikes') > 0) return;
  const rows = [
    // status: available | active | booked | maintenance
    // pos_x/pos_y map to the staff portal SVG (0..800 x 0..620).
    ['TR-01', 'Reef Cruiser', 'City e-bike', 'available', 100, 60, 293, 378, 'At the shop'],
    ['TR-02', 'Palm Glider', 'City e-bike', 'available', 96, 60, 322, 360, 'Near the harbour'],
    ['TR-03', 'Lagoon Runner', 'Step-through e-bike', 'active', 64, 60, 560, 290, 'Out near Bikini Beach'],
    ['TR-04', 'Sunset Rider', 'Step-through e-bike', 'booked', 88, 60, 360, 250, 'Held — guesthouse delivery'],
  ];
  const stmt = db.prepare(`
    INSERT INTO bikes (code, name, model, status, battery, range_km, pos_x, pos_y, place, sort)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((r, i) => stmt.run(...r, i));
  console.log(`[seed] inserted ${rows.length} bikes`);
}

function seedReviews() {
  if (count('reviews') > 0) return;
  const rows = [
    [
      'Emma & Jack',
      'United Kingdom · March',
      5,
      'Best way to see Thoddoo. We rode to the beach every morning and the farms in the afternoon — so easy, and the bikes were spotless.',
      'google',
    ],
    [
      'Anna K.',
      'Germany · February',
      5,
      'They delivered the bike to our guesthouse and picked it up after. Super friendly, quick replies on WhatsApp. Highly recommend.',
      'instagram',
    ],
    [
      'Dmitry & Olga',
      'Russia · January',
      5,
      'The e-bikes made the heat a non-issue. Battery lasted the whole day and getting around was effortless. Will rent again next trip.',
      'tiktok',
    ],
  ];
  const stmt = db.prepare(`
    INSERT INTO reviews (author, location, rating, text, source, sort)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((r, i) => stmt.run(...r, i));
  console.log(`[seed] inserted ${rows.length} reviews`);
}

function seedSettings() {
  const defaults = {
    daily_rate_mvr: config.business.dailyRateMvr,
    mvr_per_usd: config.business.mvrPerUsd,
    whatsapp: config.business.whatsapp,
    phone: config.business.phone,
    instagram: '@thoddooride',
    rating_avg: 4.9,
    rating_count: 38,
  };
  for (const [k, v] of Object.entries(defaults)) {
    if (getSetting(k) == null) setSetting(k, v);
  }
}

function ensureSeed() {
  seedAdmin();
  seedBikes();
  seedReviews();
  seedSettings();
}

function reset() {
  console.log('[seed] resetting database…');
  db.exec(`
    DELETE FROM transactions;
    DELETE FROM bookings;
    DELETE FROM reviews;
    DELETE FROM bikes;
    DELETE FROM users;
    DELETE FROM settings;
    DELETE FROM sqlite_sequence;
  `);
  ensureSeed();
  console.log('[seed] done.');
}

if (require.main === module) {
  if (process.argv.includes('--reset')) reset();
  else {
    ensureSeed();
    console.log('[seed] ensured defaults.');
  }
  process.exit(0);
}

module.exports = { ensureSeed, reset };

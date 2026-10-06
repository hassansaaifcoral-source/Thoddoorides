'use strict';

/**
 * Staff API (all routes require a valid session). Powers the operations
 * portal: live fleet, booking requests inbox, document viewing, and the
 * sales & refunds dashboard.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

const { db } = require('../db');
const config = require('../config');
const { requireAuth } = require('../auth');
const {
  BIKE_STATUSES,
  BOOKING_STATUSES,
  clampInt,
  trimStr,
  mvrToUsd,
} = require('../helpers');

const router = express.Router();
router.use(requireAuth);

/* ------------------------------ prepared SQL ------------------------------ */

const allBikes = db.prepare('SELECT * FROM bikes ORDER BY sort, id');
const getBike = db.prepare('SELECT * FROM bikes WHERE id = ?');
const insertBike = db.prepare(`
  INSERT INTO bikes (code, name, model, status, battery, range_km, pos_x, pos_y, place, note, sort)
  VALUES (@code, @name, @model, @status, @battery, @range_km, @pos_x, @pos_y, @place, @note, @sort)
`);
const deleteBike = db.prepare('DELETE FROM bikes WHERE id = ?');

const allBookings = db.prepare('SELECT * FROM bookings ORDER BY created_at DESC, id DESC');
const bookingsByStatus = db.prepare(
  'SELECT * FROM bookings WHERE status = ? ORDER BY created_at DESC, id DESC'
);
const getBooking = db.prepare('SELECT * FROM bookings WHERE id = ?');

const txnForBooking = db.prepare(
  "SELECT * FROM transactions WHERE booking_id = ? AND status = 'paid'"
);
const insertTxn = db.prepare(`
  INSERT INTO transactions (booking_id, customer_name, bike_name, amount_mvr, method, status)
  VALUES (@booking_id, @customer_name, @bike_name, @amount_mvr, @method, 'paid')
`);
const allTxns = db.prepare('SELECT * FROM transactions ORDER BY created_at DESC, id DESC');
const getTxn = db.prepare('SELECT * FROM transactions WHERE id = ?');

const countByBikeStatus = db.prepare(
  'SELECT status, COUNT(*) AS n FROM bikes GROUP BY status'
);
const countNewBookings = db.prepare(
  "SELECT COUNT(*) AS n FROM bookings WHERE status = 'new'"
);

/* -------------------------------- helpers --------------------------------- */

function bikeOut(b) {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    model: b.model,
    status: b.status,
    battery: b.battery,
    range_km: b.range_km,
    pos_x: b.pos_x,
    pos_y: b.pos_y,
    place: b.place,
    note: b.note,
    updated_at: b.updated_at,
  };
}

function bookingOut(b) {
  const bike = b.bike_id ? getBike.get(b.bike_id) : null;
  return {
    id: b.id,
    ref: b.ref,
    bike_id: b.bike_id,
    bike: bike ? { id: bike.id, code: bike.code, name: bike.name } : null,
    customer_name: b.customer_name,
    contact: b.contact,
    pickup_date: b.pickup_date,
    pickup_time: b.pickup_time,
    days: b.days,
    quantity: b.quantity,
    pay_method: b.pay_method,
    total_mvr: b.total_mvr,
    total_usd: b.total_mvr != null ? mvrToUsd(b.total_mvr) : null,
    status: b.status,
    notes: b.notes,
    has_passport: !!b.passport_file,
    has_licence: !!b.licence_file,
    created_at: b.created_at,
  };
}

function touchBike(id, fields) {
  const keys = Object.keys(fields);
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = @${k}`).join(', ');
  db.prepare(
    `UPDATE bikes SET ${set}, updated_at = datetime('now') WHERE id = @id`
  ).run({ ...fields, id });
}

/* --------------------------------- stats ---------------------------------- */

router.get('/stats', (_req, res) => {
  const counts = { available: 0, active: 0, booked: 0, maintenance: 0 };
  for (const row of countByBikeStatus.all()) {
    if (row.status in counts) counts[row.status] = row.n;
  }
  res.json({
    ...counts,
    requests: countNewBookings.get().n,
    synced_at: new Date().toISOString(),
  });
});

/* ---------------------------------- fleet --------------------------------- */

router.get('/fleet', (_req, res) => {
  res.json({ bikes: allBikes.all().map(bikeOut), synced_at: new Date().toISOString() });
});

router.post('/bikes', (req, res) => {
  const b = req.body || {};
  const code = trimStr(b.code, 20);
  const name = trimStr(b.name, 60);
  if (!code || !name) return res.status(400).json({ error: 'code_and_name_required' });

  const status = BIKE_STATUSES.includes(b.status) ? b.status : 'available';
  try {
    const info = insertBike.run({
      code,
      name,
      model: trimStr(b.model, 60),
      status,
      battery: clampInt(b.battery, 0, 100, 100),
      range_km: clampInt(b.range_km, 0, 500, 60),
      pos_x: b.pos_x != null ? Number(b.pos_x) : null,
      pos_y: b.pos_y != null ? Number(b.pos_y) : null,
      place: trimStr(b.place, 60),
      note: trimStr(b.note, 200),
      sort: clampInt(b.sort, 0, 9999, 0),
    });
    res.status(201).json({ bike: bikeOut(getBike.get(info.lastInsertRowid)) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'code_exists' });
    }
    throw e;
  }
});

router.patch('/bikes/:id', (req, res) => {
  const bike = getBike.get(req.params.id);
  if (!bike) return res.status(404).json({ error: 'not_found' });

  const b = req.body || {};
  const fields = {};
  if (b.status !== undefined) {
    if (!BIKE_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    fields.status = b.status;
  }
  if (b.battery !== undefined) fields.battery = clampInt(b.battery, 0, 100, bike.battery);
  if (b.range_km !== undefined) fields.range_km = clampInt(b.range_km, 0, 500, bike.range_km);
  if (b.pos_x !== undefined) fields.pos_x = b.pos_x == null ? null : Number(b.pos_x);
  if (b.pos_y !== undefined) fields.pos_y = b.pos_y == null ? null : Number(b.pos_y);
  if (b.name !== undefined) fields.name = trimStr(b.name, 60) || bike.name;
  if (b.model !== undefined) fields.model = trimStr(b.model, 60);
  if (b.place !== undefined) fields.place = trimStr(b.place, 60);
  if (b.note !== undefined) fields.note = trimStr(b.note, 200);

  touchBike(bike.id, fields);
  res.json({ bike: bikeOut(getBike.get(bike.id)) });
});

router.delete('/bikes/:id', (req, res) => {
  const bike = getBike.get(req.params.id);
  if (!bike) return res.status(404).json({ error: 'not_found' });
  deleteBike.run(bike.id);
  res.json({ ok: true });
});

/* -------------------------------- bookings -------------------------------- */

router.get('/bookings', (req, res) => {
  const status = req.query.status;
  const rows =
    status && BOOKING_STATUSES.includes(status)
      ? bookingsByStatus.all(status)
      : allBookings.all();
  res.json({ bookings: rows.map(bookingOut) });
});

router.get('/bookings/:id', (req, res) => {
  const b = getBooking.get(req.params.id);
  if (!b) return res.status(404).json({ error: 'not_found' });
  res.json({ booking: bookingOut(b) });
});

/**
 * Update a booking. Side effects:
 *  - confirmed : assign chosen bike (if free) -> bike becomes "booked",
 *                and record a paid transaction (once).
 *  - completed : free the assigned bike (-> available).
 *  - cancelled / declined : free the assigned bike if it was held.
 */
router.patch('/bookings/:id', (req, res) => {
  const booking = getBooking.get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const b = req.body || {};
  const updates = {};

  if (b.bike_id !== undefined) {
    if (b.bike_id === null || b.bike_id === '') {
      updates.bike_id = null;
    } else {
      const bike = getBike.get(b.bike_id);
      if (!bike) return res.status(400).json({ error: 'bike_not_found' });
      updates.bike_id = bike.id;
    }
  }
  if (b.pay_method !== undefined) updates.pay_method = trimStr(b.pay_method, 40);
  if (b.notes !== undefined) updates.notes = trimStr(b.notes, 1000);

  let newStatus = booking.status;
  if (b.status !== undefined) {
    if (!BOOKING_STATUSES.includes(b.status)) {
      return res.status(400).json({ error: 'invalid_status' });
    }
    newStatus = b.status;
    updates.status = b.status;
  }

  const apply = db.transaction(() => {
    if (Object.keys(updates).length) {
      const set = Object.keys(updates)
        .map((k) => `${k} = @${k}`)
        .join(', ');
      db.prepare(
        `UPDATE bookings SET ${set}, updated_at = datetime('now') WHERE id = @id`
      ).run({ ...updates, id: booking.id });
    }

    const finalBikeId =
      updates.bike_id !== undefined ? updates.bike_id : booking.bike_id;

    if (newStatus === 'confirmed') {
      if (finalBikeId) touchBike(finalBikeId, { status: 'booked' });
      // Record a paid transaction once per booking.
      if (!txnForBooking.get(booking.id)) {
        const bike = finalBikeId ? getBike.get(finalBikeId) : null;
        insertTxn.run({
          booking_id: booking.id,
          customer_name: booking.customer_name,
          bike_name: bike ? bike.name : null,
          amount_mvr: booking.total_mvr || 0,
          method: updates.pay_method || booking.pay_method || 'Cash',
        });
      }
    } else if (newStatus === 'completed') {
      if (finalBikeId) touchBike(finalBikeId, { status: 'available' });
    } else if (newStatus === 'cancelled' || newStatus === 'declined') {
      const bike = finalBikeId ? getBike.get(finalBikeId) : null;
      if (bike && bike.status === 'booked') {
        touchBike(finalBikeId, { status: 'available' });
      }
    }
  });
  apply();

  res.json({ booking: bookingOut(getBooking.get(booking.id)) });
});

// Stream a customer document (passport / licence). Staff-only.
router.get('/bookings/:id/document/:type', (req, res) => {
  const booking = getBooking.get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });

  const type = req.params.type;
  const fname =
    type === 'passport'
      ? booking.passport_file
      : type === 'licence'
      ? booking.licence_file
      : null;
  if (!fname) return res.status(404).json({ error: 'no_document' });

  // Guard against path traversal — only a bare filename is ever stored.
  const safe = path.basename(fname);
  const full = path.join(config.paths.uploads, safe);
  if (!full.startsWith(config.paths.uploads) || !fs.existsSync(full)) {
    return res.status(404).json({ error: 'file_missing' });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(full);
});

// Delete a stored document (privacy / after-rental cleanup).
router.delete('/bookings/:id/document/:type', (req, res) => {
  const booking = getBooking.get(req.params.id);
  if (!booking) return res.status(404).json({ error: 'not_found' });
  const type = req.params.type;
  const col = type === 'passport' ? 'passport_file' : type === 'licence' ? 'licence_file' : null;
  if (!col) return res.status(400).json({ error: 'bad_type' });

  const fname = booking[col];
  if (fname) {
    const full = path.join(config.paths.uploads, path.basename(fname));
    fs.promises.unlink(full).catch(() => {});
  }
  db.prepare(`UPDATE bookings SET ${col} = NULL WHERE id = ?`).run(booking.id);
  res.json({ ok: true });
});

/* ----------------------------- sales & refunds ---------------------------- */

function periodStart(period) {
  const days = period === 'month' ? 30 : 7;
  const d = new Date();
  d.setDate(d.getDate() - (days - 1));
  d.setHours(0, 0, 0, 0);
  return { days, since: d };
}

// SQLite stores datetime('now') in UTC "YYYY-MM-DD HH:MM:SS".
function sqlTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

router.get('/sales', (req, res) => {
  const { days, since } = periodStart(req.query.period);
  const sinceStr = sqlTime(since);

  const paid = db
    .prepare(
      "SELECT * FROM transactions WHERE status = 'paid' AND created_at >= ?"
    )
    .all(sinceStr);
  const refunded = db
    .prepare(
      "SELECT * FROM transactions WHERE status = 'refunded' AND refunded_at >= ?"
    )
    .all(sinceStr);

  const gross = paid.reduce((s, t) => s + t.amount_mvr, 0);
  const refundAmt = refunded.reduce((s, t) => s + t.amount_mvr, 0);

  // Per-day chart buckets.
  const buckets = [];
  const byDay = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDay[key] = 0;
    buckets.push({
      key,
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      amount: 0,
    });
  }
  for (const t of paid) {
    const key = String(t.created_at).slice(0, 10);
    if (key in byDay) byDay[key] += t.amount_mvr;
  }
  for (const t of refunded) {
    const key = String(t.refunded_at).slice(0, 10);
    if (key in byDay) byDay[key] -= t.amount_mvr;
  }
  for (const b of buckets) b.amount = Math.max(0, byDay[b.key]);

  res.json({
    period: days === 30 ? 'month' : 'week',
    net: gross - refundAmt,
    gross,
    rentals: paid.length,
    refunds: refunded.length,
    refundAmt,
    chart: buckets.map((b) => ({ label: b.label, amount: b.amount })),
  });
});

router.get('/transactions', (_req, res) => {
  res.json({
    transactions: allTxns.all().map((t) => ({
      id: t.id,
      booking_id: t.booking_id,
      customer_name: t.customer_name,
      bike_name: t.bike_name,
      amount_mvr: t.amount_mvr,
      amount_usd: mvrToUsd(t.amount_mvr),
      method: t.method,
      status: t.status,
      created_at: t.created_at,
      refunded_at: t.refunded_at,
    })),
  });
});

router.post('/transactions/:id/refund', (req, res) => {
  const txn = getTxn.get(req.params.id);
  if (!txn) return res.status(404).json({ error: 'not_found' });
  if (txn.status === 'refunded') {
    return res.status(409).json({ error: 'already_refunded' });
  }
  db.prepare(
    "UPDATE transactions SET status = 'refunded', refunded_at = datetime('now') WHERE id = ?"
  ).run(txn.id);
  res.json({ transaction: { ...txn, status: 'refunded' } });
});

module.exports = router;

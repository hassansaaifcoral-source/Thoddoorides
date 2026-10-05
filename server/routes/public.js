'use strict';

/**
 * Public API — everything the marketing site needs without authentication:
 * live availability, rates/config, reviews, and the booking-request endpoint
 * (which accepts the passport / licence uploads from the form).
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');

const { db, getSetting, getNumber } = require('../db');
const config = require('../config');
const {
  makeRef,
  dailyRate,
  mvrPerUsd,
  mvrToUsd,
  clampInt,
  isStr,
  trimStr,
  isValidDate,
  publicBike,
} = require('../helpers');

const router = express.Router();

/* -------------------------------- uploads --------------------------------- */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.paths.uploads),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().slice(0, 8);
    const safe = crypto.randomBytes(16).toString('hex');
    cb(null, `${Date.now()}-${safe}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxBytes, files: 2 },
  fileFilter: (_req, file, cb) => {
    if (config.upload.allowedMime.includes(file.mimetype)) return cb(null, true);
    cb(new Error('unsupported_file_type'));
  },
});

const bookingUpload = upload.fields([
  { name: 'passport', maxCount: 1 },
  { name: 'licence', maxCount: 1 },
]);

// Remove any files multer already wrote to disk (used when validation fails).
function cleanupFiles(files) {
  if (!files) return;
  for (const list of Object.values(files)) {
    for (const f of list) {
      fs.promises.unlink(f.path).catch(() => {});
    }
  }
}

const bookingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

/* ------------------------------ prepared SQL ------------------------------ */

const listBikes = db.prepare('SELECT * FROM bikes ORDER BY sort, id');
const findBikeByCode = db.prepare('SELECT * FROM bikes WHERE code = ?');
const listReviews = db.prepare(
  'SELECT * FROM reviews WHERE published = 1 ORDER BY sort, id'
);
const insertBooking = db.prepare(`
  INSERT INTO bookings
    (ref, bike_id, customer_name, contact, pickup_date, pickup_time,
     days, quantity, pay_method, passport_file, licence_file, total_mvr,
     status, notes, lang)
  VALUES
    (@ref, @bike_id, @customer_name, @contact, @pickup_date, @pickup_time,
     @days, @quantity, @pay_method, @passport_file, @licence_file, @total_mvr,
     'new', @notes, @lang)
`);

/* -------------------------------- routes ---------------------------------- */

router.get('/health', (_req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Public site configuration: rates, currency, contact details, fleet size.
router.get('/config', (_req, res) => {
  const bikes = listBikes.all();
  const available = bikes.filter((b) => b.status === 'available').length;
  res.json({
    currency: { mvrPerUsd: mvrPerUsd() },
    rates: {
      dailyMvr: dailyRate(),
      dailyUsd: mvrToUsd(dailyRate()),
    },
    contact: {
      whatsapp: getSetting('whatsapp', config.business.whatsapp),
      phone: getSetting('phone', config.business.phone),
      instagram: getSetting('instagram', '@thoddooride'),
    },
    fleet: { total: bikes.length, available },
  });
});

// Live availability for the public site (no GPS / internal notes).
router.get('/availability', (_req, res) => {
  const bikes = listBikes.all();
  const list = bikes.map(publicBike);
  const available = list.filter((b) => b.status === 'available').length;
  res.json({
    updated_at: new Date().toISOString(),
    total: list.length,
    available,
    bikes: list,
  });
});

// Alias used by some views.
router.get('/bikes', (_req, res) => {
  res.json({ bikes: listBikes.all().map(publicBike) });
});

router.get('/reviews', (_req, res) => {
  const rows = listReviews.all();
  const ratingDflt = getNumber('rating_avg', 4.9);
  const countDflt = getNumber('rating_count', rows.length);
  const avg = rows.length
    ? rows.reduce((s, r) => s + r.rating, 0) / rows.length
    : ratingDflt;
  res.json({
    average: Number(avg.toFixed(1)),
    count: countDflt || rows.length,
    reviews: rows.map((r) => ({
      id: r.id,
      author: r.author,
      location: r.location,
      rating: r.rating,
      text: r.text,
      source: r.source,
    })),
  });
});

// Create a booking request from the public form.
router.post('/bookings', bookingLimiter, (req, res) => {
  bookingUpload(req, res, (err) => {
    if (err) {
      cleanupFiles(req.files);
      const code =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'file_too_large'
          : err.message === 'unsupported_file_type'
          ? 'unsupported_file_type'
          : 'upload_failed';
      return res.status(400).json({ error: code });
    }

    const body = req.body || {};
    const files = req.files || {};

    const name = trimStr(body.name, 120);
    const contact = trimStr(body.contact, 60);
    const pickupDate = trimStr(body.from, 20);

    const fieldErrors = {};
    if (!isStr(name)) fieldErrors.name = 'required';
    if (!isStr(contact)) fieldErrors.contact = 'required';
    if (!isValidDate(pickupDate)) fieldErrors.from = 'invalid_date';
    if (!files.passport || !files.passport[0]) {
      fieldErrors.passport = 'required';
    }

    if (Object.keys(fieldErrors).length) {
      cleanupFiles(files);
      return res.status(400).json({ error: 'validation', fields: fieldErrors });
    }

    // Resolve optional bike selection (code -> id). "any" / blank => null.
    let bikeId = null;
    const bikeSel = trimStr(body.bike, 40);
    if (bikeSel && !/^any/i.test(bikeSel)) {
      const bike = findBikeByCode.get(bikeSel);
      if (bike) bikeId = bike.id;
    }

    const days = clampInt(body.days, 1, 60, 1);
    const quantity = clampInt(body.bikes || body.quantity, 1, 10, 1);
    const total = dailyRate() * days * quantity;

    const validPay = ['Cash', 'Bank transfer', 'Card'];
    let payMethod = trimStr(body.pay, 40);
    if (!validPay.includes(payMethod)) payMethod = 'Cash';

    const ref = makeRef();
    insertBooking.run({
      ref,
      bike_id: bikeId,
      customer_name: name,
      contact,
      pickup_date: pickupDate,
      pickup_time: trimStr(body.time, 10),
      days,
      quantity,
      pay_method: payMethod,
      passport_file: files.passport[0].filename,
      licence_file: files.licence && files.licence[0] ? files.licence[0].filename : null,
      total_mvr: total,
      notes: trimStr(body.notes, 1000),
      lang: trimStr(body.lang, 8),
    });

    res.status(201).json({
      ok: true,
      ref,
      total_mvr: total,
      total_usd: mvrToUsd(total),
      message: 'Booking request received. We will confirm by WhatsApp shortly.',
    });
  });
});

module.exports = router;

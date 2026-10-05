'use strict';

const crypto = require('crypto');
const { getNumber } = require('./db');
const config = require('./config');

const BIKE_STATUSES = ['available', 'active', 'booked', 'maintenance'];
const BOOKING_STATUSES = [
  'new',
  'confirmed',
  'declined',
  'completed',
  'cancelled',
];

/** Short, human-friendly booking reference, e.g. "TR-7F3A9C". */
function makeRef() {
  const part = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TR-${part}`;
}

function dailyRate() {
  return getNumber('daily_rate_mvr', config.business.dailyRateMvr);
}

function mvrPerUsd() {
  return getNumber('mvr_per_usd', config.business.mvrPerUsd);
}

function mvrToUsd(mvr) {
  const rate = mvrPerUsd();
  if (!rate) return null;
  return Math.round(Number(mvr) / rate);
}

/** Coerce to a clean integer within [min, max], or fallback. */
function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function isStr(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function trimStr(v, max = 500) {
  if (v == null) return null;
  return String(v).trim().slice(0, max) || null;
}

/** Basic ISO-ish date check (YYYY-MM-DD). */
function isValidDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) return false;
  const d = new Date(`${v}T00:00:00`);
  return !Number.isNaN(d.getTime());
}

/** Public-facing bike shape (no internal-only fields). */
function publicBike(b) {
  return {
    id: b.id,
    code: b.code,
    name: b.name,
    model: b.model,
    status: b.status,
    battery: b.battery,
    range_km: b.range_km,
  };
}

/** Full bike shape for the staff portal (includes map position). */
function adminBike(b) {
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

module.exports = {
  BIKE_STATUSES,
  BOOKING_STATUSES,
  makeRef,
  dailyRate,
  mvrPerUsd,
  mvrToUsd,
  clampInt,
  isStr,
  trimStr,
  isValidDate,
  publicBike,
  adminBike,
};

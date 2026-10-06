'use strict';

/**
 * Central configuration, sourced from environment variables with sensible
 * defaults for local development. Anything secret (JWT_SECRET, the seeded
 * admin password) should be overridden in production via a .env file or the
 * host's environment settings.
 */

require('dotenv').config();

const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function bool(value, fallback) {
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

const isProd = process.env.NODE_ENV === 'production';

const config = {
  isProd,
  port: Number(process.env.PORT) || 3000,

  // Filesystem locations (kept outside the public web root).
  paths: {
    root: ROOT,
    public: path.join(ROOT, 'public'),
    data: process.env.DATA_DIR || path.join(ROOT, 'data'),
    get db() {
      return process.env.DB_PATH || path.join(config.paths.data, 'thoddoo.db');
    },
    get uploads() {
      return process.env.UPLOAD_DIR || path.join(config.paths.data, 'uploads');
    },
  },

  // Auth / sessions.
  jwtSecret:
    process.env.JWT_SECRET ||
    (isProd
      ? (() => {
          throw new Error(
            'JWT_SECRET must be set in production. Add it to your .env file.'
          );
        })()
      : 'dev-only-insecure-secret-change-me'),
  sessionHours: Number(process.env.SESSION_HOURS) || 12,
  cookieName: 'tr_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, isProd),

  // First-run admin account (only created if the users table is empty).
  seedAdmin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'thoddoo123',
    name: process.env.ADMIN_NAME || 'Owner',
  },

  // Uploads.
  upload: {
    maxBytes: Number(process.env.UPLOAD_MAX_BYTES) || 8 * 1024 * 1024, // 8 MB
    allowedMime: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif',
      'application/pdf',
    ],
  },

  // Business defaults (also stored in the settings table, editable at runtime).
  business: {
    dailyRateMvr: Number(process.env.DAILY_RATE_MVR) || 300,
    mvrPerUsd: Number(process.env.MVR_PER_USD) || 15.42,
    whatsapp: process.env.WHATSAPP_NUMBER || '9607770000',
    phone: process.env.PHONE_NUMBER || '+9607770000',
    fleetSize: Number(process.env.FLEET_SIZE) || 4,
  },
};

module.exports = config;

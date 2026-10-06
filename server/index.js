'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');

const config = require('./config');
const { attachUser } = require('./auth');
const { ensureSeed } = require('./seed');

const publicRoutes = require('./routes/public');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

// Create the first-run admin + seed the fleet/reviews/settings if empty.
ensureSeed();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind a proxy (rate limiting)

// Security headers. CSP is left off by default so the existing design (Google
// Fonts, unpkg React/Babel, inline styles) renders unchanged; see the README
// for how to enable a stricter policy once the front-end is finalised.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(attachUser);

// API.
app.use('/api', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Unknown API routes -> JSON 404 (don't fall through to the SPA/static).
app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

// Friendly route for the staff portal.
app.get(['/staff', '/staff-portal'], (_req, res) => {
  res.sendFile(path.join(config.paths.public, 'staff-portal.html'));
});

// Static site (index.html served at "/").
app.use(
  express.static(config.paths.public, {
    extensions: ['html'],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  })
);

// Centralised error handler.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'server_error' });
});

const server = app.listen(config.port, () => {
  console.log(`\n  Thoddoo Ride is running`);
  console.log(`  → Site:   http://localhost:${config.port}/`);
  console.log(`  → Staff:  http://localhost:${config.port}/staff`);
  console.log(`  → API:    http://localhost:${config.port}/api/health\n`);
  if (!config.isProd) {
    console.log(
      `  Staff login: ${config.seedAdmin.username} / ${config.seedAdmin.password}  (change in production)\n`
    );
  }
});

function shutdown(signal) {
  console.log(`\n${signal} received, shutting down.`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

module.exports = app;

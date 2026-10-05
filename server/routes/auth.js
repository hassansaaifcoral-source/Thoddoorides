'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const { db } = require('../db');
const {
  verifyPassword,
  issueToken,
  setSessionCookie,
  clearSessionCookie,
  requireAuth,
} = require('../auth');

const router = express.Router();

const findUser = db.prepare('SELECT * FROM users WHERE username = ?');

// Throttle credential stuffing: 10 attempts / 15 min / IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_attempts' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials' });
  }

  const user = findUser.get(String(username).trim());
  if (!user || !verifyPassword(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = issueToken(user);
  setSessionCookie(res, token);
  res.json({
    user: { username: user.username, name: user.name, role: user.role },
  });
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
    },
  });
});

module.exports = router;

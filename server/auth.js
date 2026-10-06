'use strict';

/**
 * Authentication helpers: password hashing, JWT issuing/verification, and
 * Express middleware that gates the /api/admin routes. The token lives in an
 * httpOnly cookie so it is never exposed to page JavaScript.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('./config');

function hashPassword(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch {
    return false;
  }
}

function issueToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.name },
    config.jwtSecret,
    { expiresIn: `${config.sessionHours}h` }
  );
}

function setSessionCookie(res, token) {
  res.cookie(config.cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.cookieSecure,
    maxAge: config.sessionHours * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(config.cookieName, { path: '/' });
}

function readUser(req) {
  const token = req.cookies && req.cookies[config.cookieName];
  if (!token) return null;
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch {
    return null;
  }
}

// Attaches req.user when a valid session exists (does not block).
function attachUser(req, _res, next) {
  req.user = readUser(req);
  next();
}

// Blocks the request with 401 unless a valid session exists.
function requireAuth(req, res, next) {
  const user = req.user || readUser(req);
  if (!user) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = user;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  issueToken,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
};

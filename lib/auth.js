'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const { sql } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = '12h';

function hashPassword(plain) { return bcrypt.hashSync(plain, 10); }
function verifyPassword(plain, hash) { return bcrypt.compareSync(plain, hash); }

function signToken(admin) {
  return jwt.sign(
    { id: admin.id, username: admin.username, role: admin.role, name: admin.full_name },
    JWT_SECRET, { expiresIn: TOKEN_TTL }
  );
}

function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', cookie.serialize('token', token, {
    httpOnly: true, sameSite: 'lax', secure: true,
    path: '/', maxAge: 12 * 60 * 60,
  }));
}

function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize('token', '', {
    httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 0,
  }));
}

// Returns the signed-in admin (fresh from DB) or null.
async function getUser(req) {
  let token = null;
  const cookies = cookie.parse(req.headers.cookie || '');
  if (cookies.token) token = cookies.token;
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts[0] === 'Bearer') token = parts[1];
  }
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const rows = await sql`
      SELECT id, username, full_name, role, active FROM admins WHERE id = ${payload.id}`;
    const admin = rows[0];
    if (!admin || !admin.active) return null;
    return admin;
  } catch (_) {
    return null;
  }
}

// Gate helper: returns the user if signed in and allowed, else writes an error and returns null.
async function requireUser(req, res, roles) {
  const user = await getUser(req);
  if (!user) {
    res.status(401).json({ error: 'Please sign in.' });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    res.status(403).json({ error: 'You do not have permission for this.' });
    return null;
  }
  return user;
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

// Read + parse JSON body (Vercel usually parses it, but be safe).
async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (_) { resolve({}); }
    });
  });
}

module.exports = {
  hashPassword, verifyPassword, signToken,
  setAuthCookie, clearAuthCookie, getUser, requireUser,
  getClientIp, readBody, JWT_SECRET,
};

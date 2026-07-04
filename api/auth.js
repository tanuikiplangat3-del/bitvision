'use strict';

const { sql, ensureSchema, logActivity } = require('../lib/db');
const {
  hashPassword, verifyPassword, signToken,
  setAuthCookie, clearAuthCookie, getUser, readBody,
} = require('../lib/auth');

module.exports = async function handler(req, res) {
  await ensureSchema();
  const action = req.query.action;

  // ---- One-time setup: create the first super admin if none exist ----
  if (action === 'setup' && req.method === 'POST') {
    const count = (await sql`SELECT COUNT(*)::int AS c FROM admins`)[0].c;
    if (count > 0) {
      return res.status(409).json({ error: 'Setup already completed. Please sign in.' });
    }
    const { username, full_name, password } = await readBody(req);
    if (!username || !full_name || !password) {
      return res.status(400).json({ error: 'Fill in every field.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const rows = await sql`
      INSERT INTO admins (username, full_name, password_hash, role)
      VALUES (${username.trim()}, ${full_name.trim()}, ${hashPassword(password)}, 'super')
      RETURNING id, username, full_name, role`;
    const admin = rows[0];
    await logActivity(admin.id, admin.username, 'setup', 'First super admin created.');
    const token = signToken(admin);
    setAuthCookie(res, token);
    return res.status(201).json({ user: admin });
  }

  // ---- Tells the frontend whether setup is needed ----
  if (action === 'status' && req.method === 'GET') {
    const count = (await sql`SELECT COUNT(*)::int AS c FROM admins`)[0].c;
    return res.status(200).json({ needsSetup: count === 0 });
  }

  // ---- Login ----
  if (action === 'login' && req.method === 'POST') {
    const { username, password } = await readBody(req);
    if (!username || !password) {
      return res.status(400).json({ error: 'Enter your username and password.' });
    }
    const rows = await sql`SELECT * FROM admins WHERE username = ${String(username).trim()}`;
    const admin = rows[0];
    if (!admin || !verifyPassword(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Username or password is incorrect.' });
    }
    if (!admin.active) {
      return res.status(403).json({ error: 'This account has been disabled.' });
    }
    await sql`UPDATE admins SET last_login = now() WHERE id = ${admin.id}`;
    await logActivity(admin.id, admin.username, 'login', null);
    setAuthCookie(res, signToken(admin));
    return res.status(200).json({
      user: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role },
    });
  }

  // ---- Logout ----
  if (action === 'logout' && req.method === 'POST') {
    const user = await getUser(req);
    if (user) await logActivity(user.id, user.username, 'logout', null);
    clearAuthCookie(res);
    return res.status(200).json({ ok: true });
  }

  // ---- Who am I ----
  if (action === 'me' && req.method === 'GET') {
    const user = await getUser(req);
    if (!user) return res.status(401).json({ error: 'Not signed in.' });
    return res.status(200).json({
      user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role },
    });
  }

  return res.status(404).json({ error: 'Unknown request.' });
};

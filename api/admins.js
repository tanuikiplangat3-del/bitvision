'use strict';

const { sql, ensureSchema, logActivity } = require('../lib/db');
const { requireUser, hashPassword, readBody } = require('../lib/auth');

module.exports = async function handler(req, res) {
  await ensureSchema();
  const id = req.query.id;

  if (req.method === 'GET') {
    const user = await requireUser(req, res, ['super']);
    if (!user) return;
    const rows = await sql`
      SELECT id, username, full_name, role, active, created_at, last_login
      FROM admins ORDER BY id`;
    return res.status(200).json({ admins: rows });
  }

  if (req.method === 'POST') {
    const user = await requireUser(req, res, ['super']);
    if (!user) return;
    const b = await readBody(req);
    if (!b.username || !b.full_name || !b.password || !b.role) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    if (!['super', 'manager', 'viewer'].includes(b.role)) {
      return res.status(400).json({ error: 'Pick a valid role.' });
    }
    if (String(b.password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    const exists = await sql`SELECT id FROM admins WHERE username = ${b.username.trim()}`;
    if (exists[0]) return res.status(409).json({ error: 'That username is taken.' });

    const rows = await sql`
      INSERT INTO admins (username, full_name, password_hash, role)
      VALUES (${b.username.trim()}, ${b.full_name.trim()}, ${hashPassword(b.password)}, ${b.role})
      RETURNING id, username, full_name, role, active`;
    await logActivity(user.id, user.username, 'create_admin',
      `Created ${b.role} account "${b.username.trim()}".`);
    return res.status(201).json({ admin: rows[0] });
  }

  if (req.method === 'PATCH') {
    const user = await requireUser(req, res, ['super']);
    if (!user) return;
    const target = (await sql`SELECT * FROM admins WHERE id = ${id}`)[0];
    if (!target) return res.status(404).json({ error: 'Admin not found.' });
    const b = await readBody(req);

    if (target.id === user.id && ((b.role && b.role !== 'super') || b.active === 0 || b.active === false)) {
      return res.status(400).json({ error: 'You cannot demote or disable your own account.' });
    }
    if (b.role && ['super', 'manager', 'viewer'].includes(b.role)) {
      await sql`UPDATE admins SET role = ${b.role} WHERE id = ${id}`;
    }
    if (b.active === 0 || b.active === 1 || b.active === true || b.active === false) {
      await sql`UPDATE admins SET active = ${!!b.active && b.active !== 0} WHERE id = ${id}`;
    }
    if (b.full_name) {
      await sql`UPDATE admins SET full_name = ${b.full_name.trim()} WHERE id = ${id}`;
    }
    if (b.password) {
      if (String(b.password).length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
      }
      await sql`UPDATE admins SET password_hash = ${hashPassword(b.password)} WHERE id = ${id}`;
    }
    await logActivity(user.id, user.username, 'update_admin', `Updated account "${target.username}".`);
    const rows = await sql`
      SELECT id, username, full_name, role, active, created_at, last_login
      FROM admins WHERE id = ${id}`;
    return res.status(200).json({ admin: rows[0] });
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, ['super']);
    if (!user) return;
    const target = (await sql`SELECT * FROM admins WHERE id = ${id}`)[0];
    if (!target) return res.status(404).json({ error: 'Admin not found.' });
    if (target.id === user.id) {
      return res.status(400).json({ error: 'You cannot delete your own account.' });
    }
    await sql`DELETE FROM admins WHERE id = ${id}`;
    await logActivity(user.id, user.username, 'delete_admin', `Deleted account "${target.username}".`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

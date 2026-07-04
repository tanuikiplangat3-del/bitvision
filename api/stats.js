'use strict';

const { sql, ensureSchema, sweepExpired } = require('../lib/db');
const { requireUser, getClientIp } = require('../lib/auth');

module.exports = async function handler(req, res) {
  await ensureSchema();
  const action = req.query.action;

  if (action === 'whoami') {
    return res.status(200).json({ ip: getClientIp(req) });
  }

  if (action === 'summary') {
    const user = await requireUser(req, res, ['super', 'manager', 'viewer']);
    if (!user) return;
    await sweepExpired('system');
    const active = (await sql`SELECT COUNT(*)::int c FROM clients WHERE status='active'`)[0].c;
    const suspended = (await sql`SELECT COUNT(*)::int c FROM clients WHERE status='suspended'`)[0].c;
    const expiringSoon = (await sql`
      SELECT COUNT(*)::int c FROM clients
      WHERE status='active' AND expires_at <= now() + interval '3 days'`)[0].c;
    const revenue = (await sql`
      SELECT COALESCE(SUM(amount),0)::float s FROM payments
      WHERE created_at >= now() - interval '30 days'`)[0].s;
    return res.status(200).json({ active, suspended, total: active + suspended, expiringSoon, revenue });
  }

  if (action === 'activity') {
    const user = await requireUser(req, res, ['super', 'manager']);
    if (!user) return;
    const rows = await sql`SELECT * FROM activity_log ORDER BY id DESC LIMIT 100`;
    return res.status(200).json({ activity: rows });
  }

  return res.status(404).json({ error: 'Unknown request.' });
};

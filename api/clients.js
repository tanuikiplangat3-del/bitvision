'use strict';

const { sql, ensureSchema, logActivity, sweepExpired, decorate } = require('../lib/db');
const { requireUser, getClientIp, readBody } = require('../lib/auth');

module.exports = async function handler(req, res) {
  await ensureSchema();
  await sweepExpired('system');

  const id = req.query.id;
  const action = req.query.action;

  // ===== Reads: any signed-in role =====
  if (req.method === 'GET') {
    const user = await requireUser(req, res, ['super', 'manager', 'viewer']);
    if (!user) return;

    if (id) {
      const rows = await sql`SELECT * FROM clients WHERE id = ${id}`;
      if (!rows[0]) return res.status(404).json({ error: 'Client not found.' });
      const payments = await sql`
        SELECT * FROM payments WHERE client_id = ${id} ORDER BY created_at DESC`;
      return res.status(200).json({ client: decorate(rows[0]), payments });
    }

    const status = req.query.status;
    const q = req.query.q;
    let rows;
    if (status && q) {
      const like = `%${q}%`;
      rows = await sql`
        SELECT * FROM clients
        WHERE status = ${status}
          AND (full_name ILIKE ${like} OR phone ILIKE ${like}
               OR ip_address ILIKE ${like} OR device_label ILIKE ${like})
        ORDER BY status ASC, expires_at ASC`;
    } else if (status) {
      rows = await sql`
        SELECT * FROM clients WHERE status = ${status}
        ORDER BY status ASC, expires_at ASC`;
    } else if (q) {
      const like = `%${q}%`;
      rows = await sql`
        SELECT * FROM clients
        WHERE full_name ILIKE ${like} OR phone ILIKE ${like}
           OR ip_address ILIKE ${like} OR device_label ILIKE ${like}
        ORDER BY status ASC, expires_at ASC`;
    } else {
      rows = await sql`SELECT * FROM clients ORDER BY status ASC, expires_at ASC`;
    }
    return res.status(200).json({ clients: rows.map(decorate) });
  }

  // ===== Writes =====
  if (req.method === 'POST') {
    // --- Create (grant access): manager + super ---
    if (!id) {
      const user = await requireUser(req, res, ['manager', 'super']);
      if (!user) return;
      const b = await readBody(req);
      if (!b.full_name || !b.full_name.trim()) {
        return res.status(400).json({ error: 'A client name is required.' });
      }
      const ip = (b.ip_address && b.ip_address.trim()) || getClientIp(req);
      const days = Number.isFinite(+b.plan_days) && +b.plan_days > 0 ? Math.floor(+b.plan_days) : 30;
      const amount = +b.amount || 0;

      const rows = await sql`
        INSERT INTO clients
          (full_name, phone, device_label, ip_address, mac_address, status,
           activated_at, expires_at, plan_days, amount, notes, created_by)
        VALUES
          (${b.full_name.trim()}, ${b.phone || null}, ${b.device_label || null},
           ${ip}, ${b.mac_address || null}, 'active',
           now(), now() + (${days} || ' days')::interval, ${days}, ${amount},
           ${b.notes || null}, ${user.id})
        RETURNING *`;
      const client = rows[0];

      if (amount > 0) {
        await sql`
          INSERT INTO payments (client_id, amount, days_added, new_expiry, method, recorded_by)
          VALUES (${client.id}, ${amount}, ${days}, ${client.expires_at}, 'initial', ${user.id})`;
      }
      await logActivity(user.id, user.username, 'grant_access',
        `Granted ${days}-day access to "${client.full_name}" at ${ip}.`);
      return res.status(201).json({ client: decorate(client) });
    }

    // --- Actions on an existing client ---
    const existing = (await sql`SELECT * FROM clients WHERE id = ${id}`)[0];
    if (!existing) return res.status(404).json({ error: 'Client not found.' });

    if (action === 'renew') {
      const user = await requireUser(req, res, ['manager', 'super']);
      if (!user) return;
      const b = await readBody(req);
      const addDays = Number.isFinite(+b.days) && +b.days > 0 ? Math.floor(+b.days)
        : (existing.plan_days || 30);
      // extend from now if suspended, else from current expiry
      const rows = existing.status === 'suspended'
        ? await sql`UPDATE clients SET expires_at = now() + (${addDays} || ' days')::interval,
                    status = 'active' WHERE id = ${id} RETURNING *`
        : await sql`UPDATE clients SET expires_at = expires_at + (${addDays} || ' days')::interval,
                    status = 'active' WHERE id = ${id} RETURNING *`;
      const client = rows[0];
      await sql`
        INSERT INTO payments (client_id, amount, days_added, new_expiry, method, reference, recorded_by)
        VALUES (${id}, ${+b.amount || 0}, ${addDays}, ${client.expires_at},
                ${b.method || 'renewal'}, ${b.reference || null}, ${user.id})`;
      await logActivity(user.id, user.username, 'renew',
        `Renewed "${client.full_name}" for ${addDays} days.`);
      return res.status(200).json({ client: decorate(client) });
    }

    if (action === 'restore') {
      const user = await requireUser(req, res, ['manager', 'super']);
      if (!user) return;
      const b = await readBody(req);
      const days = Number.isFinite(+b.days) && +b.days > 0 ? Math.floor(+b.days)
        : (existing.plan_days || 30);
      const rows = await sql`
        UPDATE clients SET status = 'active',
          expires_at = now() + (${days} || ' days')::interval
        WHERE id = ${id} RETURNING *`;
      const client = rows[0];
      if (+b.amount > 0) {
        await sql`
          INSERT INTO payments (client_id, amount, days_added, new_expiry, method, recorded_by)
          VALUES (${id}, ${+b.amount}, ${days}, ${client.expires_at}, 'restore', ${user.id})`;
      }
      await logActivity(user.id, user.username, 'restore',
        `Restored access for "${client.full_name}" (${days} days).`);
      return res.status(200).json({ client: decorate(client) });
    }

    if (action === 'suspend') {
      const user = await requireUser(req, res, ['manager', 'super']);
      if (!user) return;
      const rows = await sql`
        UPDATE clients SET status = 'suspended' WHERE id = ${id} RETURNING *`;
      await logActivity(user.id, user.username, 'suspend',
        `Manually suspended "${existing.full_name}".`);
      return res.status(200).json({ client: decorate(rows[0]) });
    }

    return res.status(400).json({ error: 'Unknown action.' });
  }

  if (req.method === 'DELETE') {
    const user = await requireUser(req, res, ['super']);
    if (!user) return;
    const existing = (await sql`SELECT * FROM clients WHERE id = ${id}`)[0];
    if (!existing) return res.status(404).json({ error: 'Client not found.' });
    await sql`DELETE FROM clients WHERE id = ${id}`;
    await logActivity(user.id, user.username, 'delete_client',
      `Deleted client "${existing.full_name}".`);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed.' });
};

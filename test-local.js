'use strict';
// Local test: run the REAL api handlers against a tiny in-memory SQL shim.
// This validates routing, auth, roles, and the access lifecycle without a DB server.

const bcrypt = require('bcryptjs');

// ---- In-memory tables ----
const tables = { admins: [], clients: [], payments: [], activity_log: [] };
const seq = { admins: 0, clients: 0, payments: 0, activity_log: 0 };
const now = () => new Date();

// Extremely small tagged-template SQL interpreter covering just what our code uses.
function makeSql() {
  function run(strings, values) {
    const q = strings.join('\uFFFF').toLowerCase(); // join with sentinel to find gaps
    const text = strings.join(' ? ').replace(/\s+/g, ' ').trim().toLowerCase();

    // ---- CREATE TABLE / anything idempotent ----
    if (text.startsWith('create table')) return [];

    // ---- COUNT admins ----
    if (text.includes('count(*)') && text.includes('from admins')) {
      return [{ c: tables.admins.length }];
    }

    // ---- INSERT admins ----
    if (text.startsWith('insert into admins')) {
      // setup: values = [username, full_name, password_hash], role literal 'super'
      // create: values = [username, full_name, password_hash, role]
      const username = values[0], full_name = values[1], password_hash = values[2];
      const role = values.length >= 4 ? values[3] : (text.includes("'super'") ? 'super' : 'viewer');
      const row = {
        id: ++seq.admins, username, full_name, password_hash, role,
        active: true, created_at: now(), last_login: null,
      };
      tables.admins.push(row);
      return [{ id: row.id, username, full_name, role, active: true }];
    }
    // ---- SELECT * FROM admins WHERE id = ? ----
    if (text.includes('from admins where id =')) {
      const a = tables.admins.find((r) => r.id == values[0]);
      if (!a) return [];
      if (text.includes('select id, username, full_name, role, active, created_at, last_login'))
        return [{ ...a }];
      if (text.includes('select id, username, full_name, role, active from admins'))
        return [{ id: a.id, username: a.username, full_name: a.full_name, role: a.role, active: a.active }];
      return [{ ...a }];
    }
    // ---- SELECT * FROM admins WHERE username = ? ----
    if (text.includes('from admins where username =')) {
      const a = tables.admins.find((r) => r.username === values[0]);
      if (!a) return [];
      if (text.includes('select id from admins')) return [{ id: a.id }];
      return [{ ...a }];
    }
    // ---- SELECT ... FROM admins ORDER BY id ----
    if (text.includes('from admins order by id')) {
      return tables.admins.map((a) => ({
        id: a.id, username: a.username, full_name: a.full_name,
        role: a.role, active: a.active, created_at: a.created_at, last_login: a.last_login,
      }));
    }
    // ---- UPDATE admins ----
    if (text.startsWith('update admins set last_login')) {
      const a = tables.admins.find((r) => r.id == values[0]); if (a) a.last_login = now(); return [];
    }
    if (text.startsWith('update admins set role')) {
      const a = tables.admins.find((r) => r.id == values[1]); if (a) a.role = values[0]; return [];
    }
    if (text.startsWith('update admins set active')) {
      const a = tables.admins.find((r) => r.id == values[1]); if (a) a.active = !!values[0]; return [];
    }
    if (text.startsWith('update admins set full_name')) {
      const a = tables.admins.find((r) => r.id == values[1]); if (a) a.full_name = values[0]; return [];
    }
    if (text.startsWith('update admins set password_hash')) {
      const a = tables.admins.find((r) => r.id == values[1]); if (a) a.password_hash = values[0]; return [];
    }
    if (text.startsWith('delete from admins')) {
      const i = tables.admins.findIndex((r) => r.id == values[0]); if (i >= 0) tables.admins.splice(i, 1); return [];
    }

    // ---- clients ----
    if (text.startsWith('update clients') && text.includes("status = 'suspended'") && text.includes('expires_at <= now()')) {
      const expired = tables.clients.filter((c) => c.status === 'active' && c.expires_at <= now());
      expired.forEach((c) => (c.status = 'suspended'));
      return expired.map((c) => ({ id: c.id, full_name: c.full_name }));
    }
    if (text.startsWith('insert into clients')) {
      // values: full_name, phone, device_label, ip, mac, days, days, amount, notes, created_by
      const full_name = values[0], phone = values[1], device_label = values[2],
            ip_address = values[3], mac_address = values[4], days = values[5],
            amount = values[7], notes = values[8], created_by = values[9];
      const expires = new Date(now().getTime() + days * 86400000);
      const row = {
        id: ++seq.clients, full_name, phone, device_label, ip_address, mac_address,
        status: 'active', activated_at: now(), expires_at: expires,
        plan_days: days, amount, notes, created_by, created_at: now(),
      };
      tables.clients.push(row);
      return [{ ...row }];
    }
    if (text.includes('from clients where id =')) {
      const c = tables.clients.find((r) => r.id == values[0]);
      return c ? [{ ...c }] : [];
    }
    if (text.startsWith('update clients set expires_at') && text.includes('now() +')) {
      const c = tables.clients.find((r) => r.id == values[1]);
      if (c) { c.expires_at = new Date(now().getTime() + values[0] * 86400000); c.status = 'active'; }
      return c ? [{ ...c }] : [];
    }
    if (text.startsWith('update clients set expires_at') && text.includes('expires_at +')) {
      const c = tables.clients.find((r) => r.id == values[1]);
      if (c) { c.expires_at = new Date(c.expires_at.getTime() + values[0] * 86400000); c.status = 'active'; }
      return c ? [{ ...c }] : [];
    }
    if (text.startsWith("update clients set status = 'active'")) {
      const c = tables.clients.find((r) => r.id == values[1]);
      if (c) { c.status = 'active'; c.expires_at = new Date(now().getTime() + values[0] * 86400000); }
      return c ? [{ ...c }] : [];
    }
    if (text.startsWith("update clients set status = 'suspended' where id =")) {
      const c = tables.clients.find((r) => r.id == values[0]);
      if (c) c.status = 'suspended';
      return c ? [{ ...c }] : [];
    }
    if (text.startsWith('delete from clients')) {
      const i = tables.clients.findIndex((r) => r.id == values[0]); if (i >= 0) tables.clients.splice(i, 1); return [];
    }
    if (text.includes('from clients')) {
      let rows = tables.clients.slice();
      if (text.includes("status='active'") || (text.includes('status =') && values.includes('active')))
        rows = rows.filter((c) => c.status === 'active');
      if (text.includes("status='suspended'") || (text.includes('status =') && values.includes('suspended')))
        rows = rows.filter((c) => c.status === 'suspended');
      if (text.includes('count(*)')) {
        if (text.includes("status='active'") && text.includes("interval '3 days'")) {
          const soon = tables.clients.filter((c) => c.status === 'active' && c.expires_at <= new Date(now().getTime() + 3 * 86400000));
          return [{ c: soon.length }];
        }
        return [{ c: rows.length }];
      }
      rows.sort((a, b) => a.expires_at - b.expires_at);
      return rows.map((c) => ({ ...c }));
    }

    // ---- payments ----
    if (text.startsWith('insert into payments')) {
      tables.payments.push({ id: ++seq.payments, created_at: now() }); return [];
    }
    if (text.includes('from payments') && text.includes('sum(amount)')) {
      return [{ s: 0 }];
    }
    if (text.includes('from payments where client_id =')) {
      return [];
    }

    // ---- activity ----
    if (text.startsWith('insert into activity_log')) {
      tables.activity_log.push({ id: ++seq.activity_log, actor: values[1], action: values[2], detail: values[3], created_at: now() });
      return [];
    }
    if (text.includes('from activity_log')) {
      return tables.activity_log.slice().reverse();
    }

    throw new Error('SHIM: unhandled query -> ' + text);
  }

  // Neon's sql`` returns a promise; support both tagged-template and normal call
  const fn = (strings, ...values) => Promise.resolve(run(strings, values));
  return fn;
}

// Wire the shim into the db module before requiring handlers
const Module = require('module');
const origRequire = Module.prototype.require;
const shimSql = makeSql();
Module.prototype.require = function (p) {
  if (p === '@neondatabase/serverless') return { neon: () => shimSql };
  return origRequire.apply(this, arguments);
};

process.env.DATABASE_URL = 'postgres://shim';
process.env.JWT_SECRET = 'test-secret';

// ---- Fake req/res ----
function mockRes() {
  const res = { statusCode: 200, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (o) => { res.body = o; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return res;
}
function mockReq(method, query = {}, body = null, cookie = '') {
  return { method, query, body, headers: { cookie, 'x-forwarded-for': '10.0.0.5' }, on: () => {}, socket: {} };
}
function cookieFrom(res) {
  const sc = res.headers['Set-Cookie'];
  if (!sc) return '';
  return sc.split(';')[0];
}

const auth = require('./api/auth');
const clients = require('./api/clients');
const admins = require('./api/admins');
const stats = require('./api/stats');

let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗ FAIL:', name); } }

(async () => {
  // 1) Setup status -> needs setup
  let res = mockRes();
  await auth(mockReq('GET', { action: 'status' }), res);
  check('fresh install needs setup', res.body.needsSetup === true);

  // 2) Create first super admin
  res = mockRes();
  await auth(mockReq('POST', { action: 'setup' }, { username: 'owner', full_name: 'The Owner', password: 'secret123' }), res);
  check('setup creates super admin', res.statusCode === 201 && res.body.user.role === 'super');
  const superCookie = cookieFrom(res);

  // 3) Setup again -> blocked
  res = mockRes();
  await auth(mockReq('POST', { action: 'setup' }, { username: 'x', full_name: 'x', password: 'secret123' }), res);
  check('second setup is blocked', res.statusCode === 409);

  // 4) Super creates a manager and a viewer
  res = mockRes();
  await admins(mockReq('POST', {}, { username: 'mgr', full_name: 'Manager', password: 'secret123', role: 'manager' }, superCookie), res);
  check('super creates manager', res.statusCode === 201);
  res = mockRes();
  await admins(mockReq('POST', {}, { username: 'viewer', full_name: 'Viewer', password: 'secret123', role: 'viewer' }, superCookie), res);
  check('super creates viewer', res.statusCode === 201);

  // 5) Login as manager & viewer
  res = mockRes();
  await auth(mockReq('POST', { action: 'login' }, { username: 'mgr', password: 'secret123' }), res);
  const mgrCookie = cookieFrom(res);
  check('manager can log in', res.statusCode === 200);
  res = mockRes();
  await auth(mockReq('POST', { action: 'login' }, { username: 'viewer', password: 'secret123' }), res);
  const viewerCookie = cookieFrom(res);
  check('viewer can log in', res.statusCode === 200);

  // 6) Manager grants access (creates client)
  res = mockRes();
  await clients(mockReq('POST', {}, { full_name: 'Jane', ip_address: '192.168.1.20', plan_days: 30, amount: 500 }, mgrCookie), res);
  check('manager grants access', res.statusCode === 201 && res.body.client.status === 'active');
  const clientId = res.body.client.id;
  check('new client has 30 days left', res.body.client.days_left === 30);

  // 7) Viewer can VIEW but NOT grant
  res = mockRes();
  await clients(mockReq('GET', {}, null, viewerCookie), res);
  check('viewer can view clients', res.statusCode === 200 && res.body.clients.length === 1);
  res = mockRes();
  await clients(mockReq('POST', {}, { full_name: 'X', ip_address: '1.1.1.1' }, viewerCookie), res);
  check('viewer CANNOT grant (403)', res.statusCode === 403);

  // 8) Viewer cannot see admin panel
  res = mockRes();
  await admins(mockReq('GET', {}, null, viewerCookie), res);
  check('viewer CANNOT list admins (403)', res.statusCode === 403);

  // 9) Manager cannot manage admins or delete clients
  res = mockRes();
  await admins(mockReq('GET', {}, null, mgrCookie), res);
  check('manager CANNOT list admins (403)', res.statusCode === 403);
  res = mockRes();
  await clients(mockReq('DELETE', { id: clientId }, null, mgrCookie), res);
  check('manager CANNOT delete client (403)', res.statusCode === 403);

  // 10) Suspend then restore
  res = mockRes();
  await clients(mockReq('POST', { id: clientId, action: 'suspend' }, {}, mgrCookie), res);
  check('manager suspends client', res.body.client.status === 'suspended');
  res = mockRes();
  await clients(mockReq('POST', { id: clientId, action: 'restore' }, { days: 30, amount: 500 }, mgrCookie), res);
  check('manager restores client (back online)', res.body.client.status === 'active' && res.body.client.days_left === 30);

  // 11) Auto-expiry: make client expire in the past, then a read should suspend it
  tables.clients[0].expires_at = new Date(Date.now() - 86400000); // yesterday
  tables.clients[0].status = 'active';
  res = mockRes();
  await clients(mockReq('GET', {}, null, superCookie), res);
  check('expired client auto-suspends on read', res.body.clients[0].status === 'suspended');

  // 12) Super can delete
  res = mockRes();
  await clients(mockReq('DELETE', { id: clientId }, null, superCookie), res);
  check('super CAN delete client', res.statusCode === 200);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST CRASH:', e); process.exit(1); });

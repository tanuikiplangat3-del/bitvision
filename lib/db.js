'use strict';

const { neon } = require('@neondatabase/serverless');

// Vercel injects DATABASE_URL from the Neon integration.
const sql = neon(process.env.DATABASE_URL);

let schemaReady = false;

// Creates tables on first use. Runs once per warm serverless instance.
async function ensureSchema() {
  if (schemaReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS admins (
      id            SERIAL PRIMARY KEY,
      username      TEXT NOT NULL UNIQUE,
      full_name     TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL CHECK (role IN ('super','manager','viewer')),
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login    TIMESTAMPTZ
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS clients (
      id            SERIAL PRIMARY KEY,
      full_name     TEXT NOT NULL,
      phone         TEXT,
      device_label  TEXT,
      ip_address    TEXT NOT NULL,
      mac_address   TEXT,
      status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
      activated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at    TIMESTAMPTZ NOT NULL,
      plan_days     INTEGER NOT NULL DEFAULT 30,
      amount        NUMERIC NOT NULL DEFAULT 0,
      notes         TEXT,
      created_by    INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS payments (
      id          SERIAL PRIMARY KEY,
      client_id   INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      amount      NUMERIC NOT NULL,
      days_added  INTEGER NOT NULL,
      new_expiry  TIMESTAMPTZ NOT NULL,
      method      TEXT,
      reference   TEXT,
      recorded_by INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id         SERIAL PRIMARY KEY,
      admin_id   INTEGER REFERENCES admins(id) ON DELETE SET NULL,
      actor      TEXT,
      action     TEXT NOT NULL,
      detail     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`;

  schemaReady = true;
}

async function logActivity(adminId, actor, action, detail) {
  await sql`
    INSERT INTO activity_log (admin_id, actor, action, detail)
    VALUES (${adminId ?? null}, ${actor ?? null}, ${action}, ${detail ?? null})`;
}

// Suspend every active client whose term has passed. Returns count.
async function sweepExpired(actor) {
  const rows = await sql`
    UPDATE clients
    SET status = 'suspended'
    WHERE status = 'active' AND expires_at <= now()
    RETURNING id, full_name`;
  for (const c of rows) {
    await logActivity(null, actor || 'system', 'auto_suspend',
      `Client "${c.full_name}" (#${c.id}) suspended: term expired.`);
  }
  return rows.length;
}

// Add computed fields to a client row.
function decorate(c) {
  if (!c) return c;
  const expiry = new Date(c.expires_at);
  const msLeft = expiry.getTime() - Date.now();
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
  return {
    ...c,
    amount: Number(c.amount),
    days_left: c.status === 'active' ? daysLeft : 0,
    expired: msLeft <= 0,
  };
}

module.exports = { sql, ensureSchema, logActivity, sweepExpired, decorate };

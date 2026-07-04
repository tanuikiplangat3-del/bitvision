'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, 'public');
const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

// In-memory demo state for the preview
const state = {
  user: { id: 1, username: 'owner', full_name: 'The Owner', role: 'super' },
  clients: [
    { id: 1, full_name: 'Jane Mwangi', phone: '0712000001', device_label: 'Jane iPhone', ip_address: '192.168.1.21', status: 'active', expires_at: new Date(Date.now()+30*864e5).toISOString(), plan_days: 30, amount: 500, days_left: 30 },
    { id: 2, full_name: 'Peter Otieno', phone: '0712000002', device_label: 'Peter Laptop', ip_address: '192.168.1.22', status: 'active', expires_at: new Date(Date.now()+2*864e5).toISOString(), plan_days: 30, amount: 500, days_left: 2 },
    { id: 3, full_name: 'Aisha Ali', phone: '0712000003', device_label: 'Aisha Redmi', ip_address: '192.168.1.23', status: 'active', expires_at: new Date(Date.now()+12*864e5).toISOString(), plan_days: 30, amount: 500, days_left: 12 },
    { id: 4, full_name: 'John Kamau', phone: '0712000004', device_label: 'John Tecno', ip_address: '192.168.1.24', status: 'suspended', expires_at: new Date(Date.now()-3*864e5).toISOString(), plan_days: 30, amount: 500, days_left: 0 },
  ],
  admins: [
    { id: 1, username: 'owner', full_name: 'The Owner', role: 'super', active: true, last_login: new Date().toISOString() },
    { id: 2, username: 'mary', full_name: 'Mary Manager', role: 'manager', active: true, last_login: new Date(Date.now()-3600e3).toISOString() },
    { id: 3, username: 'vince', full_name: 'Vince Viewer', role: 'viewer', active: true, last_login: null },
  ],
};

function json(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;

  if (p === '/api/auth/me') return json(res, 200, { user: state.user });
  if (p === '/api/auth/status') return json(res, 200, { needsSetup: false });
  if (p === '/api/stats/summary') return json(res, 200, { active: 3, suspended: 1, total: 4, expiringSoon: 1, revenue: 1500 });
  if (p === '/api/stats/whoami') return json(res, 200, { ip: '192.168.1.50' });
  if (p === '/api/stats/activity') return json(res, 200, { activity: [] });
  if (p === '/api/clients') {
    const status = u.searchParams.get('status');
    let c = state.clients;
    if (status) c = c.filter((x) => x.status === status);
    return json(res, 200, { clients: c });
  }
  if (p === '/api/admins') return json(res, 200, { admins: state.admins });

  // static
  let file = p === '/' ? '/index.html' : p;
  const full = path.join(pub, file);
  if (fs.existsSync(full) && fs.statSync(full).isFile()) {
    res.writeHead(200, { 'Content-Type': mime[path.extname(full)] || 'text/plain' });
    return res.end(fs.readFileSync(full));
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(fs.readFileSync(path.join(pub, 'index.html')));
});

server.listen(4000, () => console.log('preview on 4000'));

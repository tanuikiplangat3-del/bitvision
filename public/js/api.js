'use strict';

const API = {
  // Token-based auth (no reliance on cookies surviving a reload).
  token: (function () {
    try { return localStorage.getItem('bv_token') || null; } catch (_) { return null; }
  })(),

  setToken(t) {
    this.token = t || null;
    try {
      if (t) localStorage.setItem('bv_token', t);
      else localStorage.removeItem('bv_token');
    } catch (_) {}
  },

  async request(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
    const opts = { method, headers, credentials: 'same-origin' };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong.');
      err.status = res.status;
      throw err;
    }
    return data;
  },
  get(u) { return this.request('GET', u); },
  post(u, b) { return this.request('POST', u, b); },
  patch(u, b) { return this.request('PATCH', u, b); },
  del(u) { return this.request('DELETE', u); },

  authStatus() { return this.get('/api/auth/status'); },
  async setup(data) {
    const r = await this.post('/api/auth/setup', data);
    if (r.token) this.setToken(r.token);
    return r;
  },
  async login(username, password) {
    const r = await this.post('/api/auth/login', { username, password });
    if (r.token) this.setToken(r.token);
    return r;
  },
  async logout() {
    try { await this.post('/api/auth/logout'); } catch (_) {}
    this.setToken(null);
    return { ok: true };
  },
  me() { return this.get('/api/auth/me'); },

  clients(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/api/clients' + (q ? '?' + q : ''));
  },
  client(id) { return this.get('/api/clients/' + id); },
  createClient(data) { return this.post('/api/clients', data); },
  renewClient(id, data) { return this.post(`/api/clients/${id}/renew`, data); },
  restoreClient(id, data) { return this.post(`/api/clients/${id}/restore`, data); },
  suspendClient(id) { return this.post(`/api/clients/${id}/suspend`); },
  deleteClient(id) { return this.del('/api/clients/' + id); },

  admins() { return this.get('/api/admins'); },
  createAdmin(data) { return this.post('/api/admins', data); },
  updateAdmin(id, data) { return this.patch('/api/admins/' + id, data); },
  deleteAdmin(id) { return this.del('/api/admins/' + id); },

  summary() { return this.get('/api/stats/summary'); },
  activity() { return this.get('/api/stats/activity'); },
  whoami() { return this.get('/api/stats/whoami'); },
};

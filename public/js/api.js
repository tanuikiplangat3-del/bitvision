'use strict';

const API = {
  async request(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' };
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
  setup(data) { return this.post('/api/auth/setup', data); },
  login(username, password) { return this.post('/api/auth/login', { username, password }); },
  logout() { return this.post('/api/auth/logout'); },
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

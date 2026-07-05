'use strict';

const App = {
  user: null,
  route: 'dashboard',

  ACCESS: {
    dashboard: ['super', 'manager', 'viewer'],
    clients:   ['super', 'manager', 'viewer'],
    activity:  ['super', 'manager'],
    admins:    ['super'],
  },

  can(perm) {
    const r = this.user && this.user.role;
    if (perm === 'manage_clients') return r === 'super' || r === 'manager';
    if (perm === 'delete') return r === 'super';
    return false;
  },

  async init() {
    document.getElementById('setup-form').addEventListener('submit', (e) => this.doSetup(e));
    document.getElementById('login-form').addEventListener('submit', (e) => this.doLogin(e));
    document.getElementById('logout-btn').addEventListener('click', () => this.doLogout());
    document.getElementById('menu-toggle').addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
    // Sign in / Sign up tab switching
    document.getElementById('tab-signin').addEventListener('click', () => this.showTab('signin'));
    document.getElementById('tab-signup').addEventListener('click', () => this.showTab('signup'));
    window.addEventListener('hashchange', () => this.handleRoute());

    // Already signed in? (retry once in case of a cold database start)
    for (let attempt = 0; attempt < 2; attempt++) {
      // If the user has logged in via the form while this loop was waiting,
      // stop immediately — never overwrite an active session.
      if (this.user) return;
      try {
        const { user } = await API.me();
        if (this.user) return; // logged in during the await
        this.user = user;
        return this.showApp();
      } catch (err) {
        if (this.user) return;
        if (err && err.status === 401) break; // genuinely not signed in
        await new Promise((r) => setTimeout(r, 700)); // cold start, retry
      }
    }

    // Still not signed in after checks. Show the auth screen.
    if (this.user) return; // final guard
    this.show('auth-screen');
    let needsSetup = false;
    try { needsSetup = !!(await API.authStatus()).needsSetup; } catch (_) {}
    if (this.user) return;
    this.showTab(needsSetup ? 'signup' : 'signin');
  },

  // Toggle between the Sign in and Sign up panels.
  showTab(which) {
    const signin = which === 'signin';
    document.getElementById('tab-signin').classList.toggle('active', signin);
    document.getElementById('tab-signup').classList.toggle('active', !signin);
    document.getElementById('login-form').hidden = !signin;
    document.getElementById('setup-form').hidden = signin;
    document.getElementById('login-error').hidden = true;
    document.getElementById('setup-error').hidden = true;
  },

  show(id) {
    ['auth-screen', 'app'].forEach((s) => {
      document.getElementById(s).hidden = (s !== id);
    });
  },

  showApp() {
    this.show('app');
    document.getElementById('me-name').textContent = this.user.full_name;
    document.getElementById('me-role').textContent = this.user.role;
    this.buildNav();
    this.handleRoute();
  },

  buildNav() {
    const items = [
      { key: 'dashboard', label: 'Dashboard', ic: '▤' },
      { key: 'clients',   label: 'Connected users', ic: '⦿' },
      { key: 'activity',  label: 'Activity', ic: '≣' },
      { key: 'admins',    label: 'Team & roles', ic: '☗' },
    ];
    document.getElementById('nav').innerHTML = items
      .filter((i) => this.ACCESS[i.key].includes(this.user.role))
      .map((i) => `<a href="#${i.key}" data-key="${i.key}"><span class="ic">${i.ic}</span>${i.label}</a>`)
      .join('');
  },

  async doSetup(e) {
    e.preventDefault();
    const errBox = document.getElementById('setup-error');
    errBox.hidden = true;
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating…'; }
    try {
      const { user } = await API.setup({
        full_name: document.getElementById('setup-name').value.trim(),
        username: document.getElementById('setup-username').value.trim(),
        password: document.getElementById('setup-password').value,
      });
      this.user = user;
      // Token stored by API.setup(). Go straight to the app — no reload.
      location.hash = '#dashboard';
      this.showApp();
    } catch (err) {
      // Setup already done: switch to the Sign in tab so they can log in.
      if (err.status === 409) {
        this.showTab('signin');
        const prefill = document.getElementById('setup-username').value.trim();
        if (prefill) document.getElementById('login-username').value = prefill;
        const li = document.getElementById('login-error');
        li.textContent = 'Your account already exists — please sign in.';
        li.hidden = false;
        return;
      }
      errBox.textContent = err.message; errBox.hidden = false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Create account & sign in'; }
    }
  },

  async doLogin(e) {
    e.preventDefault();
    const errBox = document.getElementById('login-error');
    errBox.hidden = true;
    const btn = e.target.querySelector('button[type=submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    try {
      const { user } = await API.login(
        document.getElementById('login-username').value.trim(),
        document.getElementById('login-password').value
      );
      this.user = user;
      // Token is now stored by API.login(). Go straight to the app — no reload.
      location.hash = '#dashboard';
      this.showApp();
    } catch (err) {
      errBox.textContent = err.message; errBox.hidden = false;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  },

  async doLogout() {
    try { await API.logout(); } catch (_) {}
    this.user = null;
    location.hash = '';
    this.show('auth-screen');
    this.showTab('signin');
  },

  handleRoute() {
    // Guard: if we're not signed in, do nothing. A hashchange event can fire
    // before this.user is set; without this guard, this.user.role throws and
    // the whole render aborts — leaving the user stuck on the login screen.
    if (!this.user) return;
    // Guard: only route when the app screen is actually showing.
    if (document.getElementById('app').hidden) return;

    let key = (location.hash || '#dashboard').slice(1);
    if (!this.ACCESS[key] || !this.ACCESS[key].includes(this.user.role)) key = 'dashboard';
    this.route = key;
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.key === key));
    document.querySelector('.sidebar').classList.remove('open');
    const titles = { dashboard: 'Dashboard', clients: 'Connected users', admins: 'Team & roles', activity: 'Activity' };
    document.getElementById('page-title').textContent = titles[key];
    document.getElementById('topbar-action').innerHTML = '';
    if (key === 'dashboard') this.viewDashboard();
    else if (key === 'clients') this.viewClients();
    else if (key === 'admins') this.viewAdmins();
    else if (key === 'activity') this.viewActivity();
  },

  // ---------------- Dashboard ----------------
  async viewDashboard() {
    const view = document.getElementById('view');
    view.innerHTML = '<p class="empty">Loading…</p>';
    try {
      const s = await API.summary();
      view.innerHTML = `
        <div class="stat-grid">
          <div class="stat accent"><div class="k">Online now</div><div class="v">${s.active}</div></div>
          <div class="stat danger"><div class="k">Suspended</div><div class="v">${s.suspended}</div></div>
          <div class="stat warn"><div class="k">Expiring ≤ 3 days</div><div class="v">${s.expiringSoon}</div></div>
          <div class="stat"><div class="k">Total users</div><div class="v">${s.total}</div></div>
          <div class="stat"><div class="k">Revenue (30d)</div><div class="v" style="font-size:24px">${UI.money(s.revenue)}</div></div>
        </div>
        <div class="panel">
          <div class="panel-head"><h3>Expiring soon</h3></div>
          <div id="dash-expiring"></div>
        </div>`;
      const { clients } = await API.clients({ status: 'active' });
      const soon = clients.filter((c) => c.days_left <= 3).sort((a, b) => a.days_left - b.days_left);
      const box = document.getElementById('dash-expiring');
      if (!soon.length) box.innerHTML = '<div class="empty">No users are close to expiry. All good.</div>';
      else { box.innerHTML = this.clientTable(soon, false); this.wireClientActions(box); }
    } catch (err) {
      view.innerHTML = `<div class="empty"><h3>Could not load dashboard</h3><p>${UI.esc(err.message)}</p></div>`;
    }
  },

  // ---------------- Clients ----------------
  async viewClients() {
    if (this.can('manage_clients')) {
      const action = document.getElementById('topbar-action');
      action.innerHTML = '<button class="btn btn-primary" id="add-client">+ Grant access</button>';
      action.querySelector('#add-client').onclick = () => this.grantModal();
    }
    const view = document.getElementById('view');
    view.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <div class="filters" id="status-filters">
            <button class="chip active" data-status="">All</button>
            <button class="chip" data-status="active">Online</button>
            <button class="chip" data-status="suspended">Suspended</button>
          </div>
          <input type="search" id="client-search" placeholder="Search name, phone, IP…" />
        </div>
        <div id="client-list"><p class="empty">Loading…</p></div>
      </div>`;
    const state = { status: '', q: '' };
    const reload = async () => {
      const box = document.getElementById('client-list');
      try {
        const params = {};
        if (state.status) params.status = state.status;
        if (state.q) params.q = state.q;
        const { clients } = await API.clients(params);
        if (!clients.length) {
          box.innerHTML = '<div class="empty"><h3>No users here</h3><p>Grant access to add your first connected user.</p></div>';
          return;
        }
        box.innerHTML = this.clientTable(clients, true);
        this.wireClientActions(box);
      } catch (err) { box.innerHTML = `<div class="empty">${UI.esc(err.message)}</div>`; }
    };
    view.querySelectorAll('#status-filters .chip').forEach((chip) => {
      chip.onclick = () => {
        view.querySelectorAll('#status-filters .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        state.status = chip.dataset.status;
        reload();
      };
    });
    let t;
    document.getElementById('client-search').oninput = (e) => {
      clearTimeout(t); state.q = e.target.value.trim(); t = setTimeout(reload, 250);
    };
    reload();
  },

  clientTable(clients, showActions) {
    const rows = clients.map((c) => {
      const dl = c.status === 'active'
        ? `<span class="days-left ${c.days_left <= 0 ? 'zero' : c.days_left <= 3 ? 'low' : ''}">${c.days_left} day${c.days_left === 1 ? '' : 's'}</span>`
        : '<span class="days-left zero">—</span>';
      const badge = c.status === 'active'
        ? (c.days_left <= 3 ? '<span class="badge warn">Expiring</span>' : '<span class="badge active">Online</span>')
        : '<span class="badge suspended">Suspended</span>';
      let actions = '';
      if (showActions && this.can('manage_clients')) {
        if (c.status === 'suspended') {
          actions += `<button class="btn btn-primary btn-sm" data-act="restore" data-id="${c.id}">Restore access</button>`;
        } else {
          actions += `<button class="btn btn-sm" data-act="renew" data-id="${c.id}">Renew</button>`;
          actions += `<button class="btn btn-ghost btn-sm" data-act="suspend" data-id="${c.id}">Suspend</button>`;
        }
        if (this.can('delete')) actions += `<button class="btn btn-danger btn-sm" data-act="delete" data-id="${c.id}">Delete</button>`;
      }
      return `<tr>
        <td class="name-cell">${UI.esc(c.full_name)}<span class="sub">${UI.esc(c.device_label || '')}${c.phone ? ' · ' + UI.esc(c.phone) : ''}</span></td>
        <td class="mono">${UI.esc(c.ip_address)}</td>
        <td>${badge}</td>
        <td>${dl}</td>
        <td class="mono">${UI.fmtDay(c.expires_at)}</td>
        ${showActions ? `<td><div class="row-actions">${actions}</div></td>` : ''}
      </tr>`;
    }).join('');
    return `<table><thead><tr>
      <th>User & device</th><th>IP address</th><th>Status</th><th>Time left</th><th>Expires</th>${showActions ? '<th></th>' : ''}
      </tr></thead><tbody>${rows}</tbody></table>`;
  },

  wireClientActions(scope) {
    scope.querySelectorAll('[data-act]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.id, act = btn.dataset.act;
        if (act === 'restore') this.restoreModal(id);
        else if (act === 'renew') this.renewModal(id);
        else if (act === 'suspend') this.suspendClient(id);
        else if (act === 'delete') this.deleteClient(id);
      };
    });
  },

  async grantModal() {
    let capturedIp = '';
    try { capturedIp = (await API.whoami()).ip; } catch (_) {}
    UI.modal({
      title: 'Grant WiFi access',
      body: `
        <label>Full name <input id="g-name" placeholder="e.g. Jane Mwangi" required /></label>
        <div class="form-row">
          <label>Phone <input id="g-phone" placeholder="0712 000 000" /></label>
          <label>Device label <input id="g-device" placeholder="Jane iPhone" /></label>
        </div>
        <div class="form-row">
          <label>IP address <input id="g-ip" value="${UI.esc(capturedIp)}" placeholder="192.168.1.20" /></label>
          <label>MAC (optional) <input id="g-mac" placeholder="AA:BB:CC:DD:EE:FF" /></label>
        </div>
        <p class="hint">IP is auto-filled from the device opening this page. Edit it if you are registering someone else's device.</p>
        <div class="form-row">
          <label>Plan length (days) <input id="g-days" type="number" value="30" min="1" /></label>
          <label>Amount paid <input id="g-amount" type="number" value="0" min="0" step="any" /></label>
        </div>`,
      buttons: [
        { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
        { label: 'Grant access', className: 'btn-primary', onClick: async (close, m) => {
          const data = {
            full_name: m.querySelector('#g-name').value.trim(),
            phone: m.querySelector('#g-phone').value.trim(),
            device_label: m.querySelector('#g-device').value.trim(),
            ip_address: m.querySelector('#g-ip').value.trim(),
            mac_address: m.querySelector('#g-mac').value.trim(),
            plan_days: +m.querySelector('#g-days').value || 30,
            amount: +m.querySelector('#g-amount').value || 0,
          };
          if (!data.full_name) { UI.toast('Enter a name.', 'error'); return; }
          try { await API.createClient(data); close(); UI.toast('Access granted.'); this.handleRoute(); }
          catch (err) { UI.toast(err.message, 'error'); }
        } },
      ],
    });
  },

  async renewModal(id) {
    const { client } = await API.client(id);
    UI.modal({
      title: `Renew — ${UI.esc(client.full_name)}`,
      body: `
        <p class="hint">Current expiry: ${UI.fmtDate(client.expires_at)} · ${client.days_left} day(s) left.</p>
        <div class="form-row">
          <label>Add days <input id="r-days" type="number" value="${client.plan_days || 30}" min="1" /></label>
          <label>Amount paid <input id="r-amount" type="number" value="0" min="0" step="any" /></label>
        </div>
        <label>Payment method <select id="r-method">
          <option value="mpesa">M-Pesa</option><option value="cash">Cash</option>
          <option value="bank">Bank</option><option value="other">Other</option>
        </select></label>
        <label>Reference (optional) <input id="r-ref" placeholder="M-Pesa code / note" /></label>`,
      buttons: [
        { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
        { label: 'Save renewal', className: 'btn-primary', onClick: async (close, m) => {
          try {
            await API.renewClient(id, {
              days: +m.querySelector('#r-days').value || 30,
              amount: +m.querySelector('#r-amount').value || 0,
              method: m.querySelector('#r-method').value,
              reference: m.querySelector('#r-ref').value.trim(),
            });
            close(); UI.toast('Renewed.'); this.handleRoute();
          } catch (err) { UI.toast(err.message, 'error'); }
        } },
      ],
    });
  },

  async restoreModal(id) {
    const { client } = await API.client(id);
    UI.modal({
      title: `Restore access — ${UI.esc(client.full_name)}`,
      body: `
        <p class="hint">This puts the user back online immediately and starts a fresh term.</p>
        <div class="form-row">
          <label>Days <input id="x-days" type="number" value="${client.plan_days || 30}" min="1" /></label>
          <label>Amount paid <input id="x-amount" type="number" value="0" min="0" step="any" /></label>
        </div>`,
      buttons: [
        { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
        { label: 'Restore now', className: 'btn-primary', onClick: async (close, m) => {
          try {
            await API.restoreClient(id, {
              days: +m.querySelector('#x-days').value || 30,
              amount: +m.querySelector('#x-amount').value || 0,
            });
            close(); UI.toast('Access restored.'); this.handleRoute();
          } catch (err) { UI.toast(err.message, 'error'); }
        } },
      ],
    });
  },

  async suspendClient(id) {
    if (!await UI.confirm('Suspend user', 'This cuts the user off immediately. Continue?', 'Suspend', true)) return;
    try { await API.suspendClient(id); UI.toast('User suspended.'); this.handleRoute(); }
    catch (err) { UI.toast(err.message, 'error'); }
  },

  async deleteClient(id) {
    if (!await UI.confirm('Delete user', 'This permanently removes the user and their payment history.', 'Delete', true)) return;
    try { await API.deleteClient(id); UI.toast('User deleted.'); this.handleRoute(); }
    catch (err) { UI.toast(err.message, 'error'); }
  },

  // ---------------- Admins ----------------
  async viewAdmins() {
    const action = document.getElementById('topbar-action');
    action.innerHTML = '<button class="btn btn-primary" id="add-admin">+ Add team member</button>';
    action.querySelector('#add-admin').onclick = () => this.adminModal();
    const view = document.getElementById('view');
    view.innerHTML = '<div class="panel"><div id="admin-list"><p class="empty">Loading…</p></div></div>';
    try {
      const { admins } = await API.admins();
      const rows = admins.map((a) => `
        <tr>
          <td class="name-cell">${UI.esc(a.full_name)}<span class="sub">@${UI.esc(a.username)}</span></td>
          <td><span class="role-tag role-${a.role}">${a.role}</span></td>
          <td>${a.active ? '<span class="badge active">Active</span>' : '<span class="badge suspended">Disabled</span>'}</td>
          <td class="mono">${a.last_login ? UI.fmtDate(a.last_login) : 'never'}</td>
          <td><div class="row-actions">
            <button class="btn btn-sm" data-act="edit" data-id="${a.id}">Edit</button>
            ${a.id !== this.user.id ? `<button class="btn btn-danger btn-sm" data-act="del" data-id="${a.id}">Remove</button>` : ''}
          </div></td>
        </tr>`).join('');
      document.getElementById('admin-list').innerHTML = `<table><thead><tr>
        <th>Member</th><th>Role</th><th>Status</th><th>Last sign-in</th><th></th>
        </tr></thead><tbody>${rows}</tbody></table>`;
      document.querySelectorAll('#admin-list [data-act]').forEach((btn) => {
        btn.onclick = () => {
          const a = admins.find((x) => x.id == btn.dataset.id);
          if (btn.dataset.act === 'edit') this.adminModal(a); else this.deleteAdmin(a);
        };
      });
    } catch (err) {
      document.getElementById('admin-list').innerHTML = `<div class="empty">${UI.esc(err.message)}</div>`;
    }
  },

  adminModal(admin) {
    const editing = !!admin;
    UI.modal({
      title: editing ? `Edit — ${UI.esc(admin.full_name)}` : 'Add team member',
      body: `
        <label>Full name <input id="a-name" value="${editing ? UI.esc(admin.full_name) : ''}" required /></label>
        <label>Username <input id="a-user" value="${editing ? UI.esc(admin.username) : ''}" ${editing ? 'readonly' : ''} required /></label>
        <label>Role <select id="a-role">
          <option value="viewer" ${editing && admin.role === 'viewer' ? 'selected' : ''}>Viewer — sees who is connected</option>
          <option value="manager" ${editing && admin.role === 'manager' ? 'selected' : ''}>Manager — grants & renews access</option>
          <option value="super" ${editing && admin.role === 'super' ? 'selected' : ''}>Super admin — full control</option>
        </select></label>
        <label>${editing ? 'New password (leave blank to keep)' : 'Password'}
          <input id="a-pass" type="password" placeholder="${editing ? '••••••' : 'At least 6 characters'}" /></label>
        ${editing ? `<label>Account status <select id="a-active">
          <option value="1" ${admin.active ? 'selected' : ''}>Active</option>
          <option value="0" ${!admin.active ? 'selected' : ''}>Disabled</option>
        </select></label>` : ''}`,
      buttons: [
        { label: 'Cancel', className: 'btn-ghost', onClick: (c) => c() },
        { label: editing ? 'Save changes' : 'Create account', className: 'btn-primary', onClick: async (close, m) => {
          const name = m.querySelector('#a-name').value.trim();
          const role = m.querySelector('#a-role').value;
          const pass = m.querySelector('#a-pass').value;
          try {
            if (editing) {
              const patch = { full_name: name, role, active: +m.querySelector('#a-active').value };
              if (pass) patch.password = pass;
              await API.updateAdmin(admin.id, patch);
              UI.toast('Account updated.');
            } else {
              const user = m.querySelector('#a-user').value.trim();
              if (!user || !name || !pass) { UI.toast('Fill in all fields.', 'error'); return; }
              await API.createAdmin({ username: user, full_name: name, password: pass, role });
              UI.toast('Team member added.');
            }
            close(); this.viewAdmins();
          } catch (err) { UI.toast(err.message, 'error'); }
        } },
      ],
    });
  },

  async deleteAdmin(admin) {
    if (!await UI.confirm('Remove member', `Remove ${admin.full_name}'s account?`, 'Remove', true)) return;
    try { await API.deleteAdmin(admin.id); UI.toast('Member removed.'); this.viewAdmins(); }
    catch (err) { UI.toast(err.message, 'error'); }
  },

  // ---------------- Activity ----------------
  async viewActivity() {
    const view = document.getElementById('view');
    view.innerHTML = '<div class="panel"><div class="panel-head"><h3>Recent activity</h3></div><div id="feed"><p class="empty">Loading…</p></div></div>';
    try {
      const { activity } = await API.activity();
      if (!activity.length) { document.getElementById('feed').innerHTML = '<div class="empty">Nothing logged yet.</div>'; return; }
      document.getElementById('feed').innerHTML = '<ul class="feed">' + activity.map((a) => `
        <li><span class="when">${UI.fmtDate(a.created_at)}</span>
        <span><span class="who">${UI.esc(a.actor || 'system')}</span> — ${UI.esc(a.detail || a.action)}</span></li>`).join('') + '</ul>';
    } catch (err) {
      document.getElementById('feed').innerHTML = `<div class="empty">${UI.esc(err.message)}</div>`;
    }
  },
};

document.addEventListener('DOMContentLoaded', () => App.init());

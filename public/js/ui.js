'use strict';

const UI = {
  esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  toast(msg, type = 'ok') {
    const root = document.getElementById('toast-root');
    const el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' error' : '');
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateX(20px)';
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  // Opens a modal. content = HTML string for body. Returns the modal element.
  // buttons: [{ label, className, onClick(closeFn, modalEl) }]
  modal({ title, body, buttons = [] }) {
    const root = document.getElementById('modal-root');
    const back = document.createElement('div');
    back.className = 'modal-backdrop';
    const close = () => back.remove();

    back.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head">
          <h3>${this.esc(title)}</h3>
          <button class="modal-close" aria-label="Close">&times;</button>
        </div>
        <div class="modal-body">${body}</div>
        <div class="modal-foot"></div>
      </div>`;

    back.querySelector('.modal-close').onclick = close;
    back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
    });

    const foot = back.querySelector('.modal-foot');
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'btn ' + (b.className || 'btn-ghost');
      btn.textContent = b.label;
      btn.onclick = () => b.onClick(close, back);
      foot.appendChild(btn);
    }
    root.appendChild(back);
    const firstInput = back.querySelector('input, select, textarea');
    if (firstInput) firstInput.focus();
    return back;
  },

  confirm(title, message, confirmLabel = 'Confirm', danger = false) {
    return new Promise((resolve) => {
      this.modal({
        title,
        body: `<p style="color:var(--muted);line-height:1.5;margin:0">${this.esc(message)}</p>`,
        buttons: [
          { label: 'Cancel', className: 'btn-ghost', onClick: (c) => { c(); resolve(false); } },
          {
            label: confirmLabel,
            className: danger ? 'btn-danger' : 'btn-primary',
            onClick: (c) => { c(); resolve(true); },
          },
        ],
      });
    });
  },

  fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso.includes('Z') ? iso : iso + 'Z');
    return d.toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  fmtDay(iso) {
    if (!iso) return '—';
    const d = new Date(iso.includes('Z') ? iso : iso + 'Z');
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  },

  money(n) { return 'KES ' + Number(n || 0).toLocaleString(); },
};

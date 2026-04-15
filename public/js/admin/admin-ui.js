// public/js/admin/admin-ui.js
(function () {
  'use strict';

  const { esc } = window.AdminUtils;

  // ── Skeleton Loader ──────────────────────────────────
  function showSkeleton(container, { rows = 5, cols = 4 } = {}) {
    const colWidths = { 1: '20%', 2: '40%', 3: '60%', 4: '80%', 5: '100%' };
    container.innerHTML = Array.from({ length: rows }, (_, i) =>
      `<div class="skeleton" style="height:48px;margin-bottom:8px;width:${colWidths[cols] || '80%'}"></div>`
    ).join('');
  }

  // ── Toast ─────────────────────────────────────────────
  let toastTimer = null;
  function toast(message, type = 'info') {
    const existing = document.getElementById('admin-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'admin-toast';
    // Fix: use CSS var() properly with valid fallback
    const bgColor = type === 'error' ? 'var(--color-danger, #dc3545)' : type === 'success' ? 'var(--color-success, #28a745)' : 'var(--color-info, #17a2b8)';
    el.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      padding: 12px 20px; border-radius: 8px;
      background: ${bgColor};
      color: #fff; font-size: 14px; max-width: 320px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: toast-in 0.2s ease;
    `;
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 4000);
  }

  // ── Confirm Action Dialog ─────────────────────────────
  function confirmAction({ title, message, requiredPhrase, confirmText = '确认', danger = false }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:420px">
          <div class="modal__header">${esc(title)}</div>
          <div class="modal__body">
            <p>${esc(message)}</p>
            ${requiredPhrase ? `
              <label style="margin-top:12px;display:block;font-size:13px;color:var(--color-text-muted)">
                请输入 <strong>${esc(requiredPhrase)}</strong> 确认：
              </label>
              <input type="text" id="confirm-input" class="form-control" style="margin-top:6px" autocomplete="off" spellcheck="false">
            ` : ''}
          </div>
          <div class="modal__footer" style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn--secondary" id="confirm-cancel">取消</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok" ${requiredPhrase ? 'disabled' : ''}>${esc(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const okBtn = overlay.querySelector('#confirm-ok');
      const input = overlay.querySelector('#confirm-input');

      if (input) {
        input.addEventListener('input', () => {
          okBtn.disabled = input.value.trim() !== requiredPhrase;
        });
        input.focus();
      }

      const cleanup = (result) => {
        overlay.classList.add('modal-overlay--fade-out');
        setTimeout(() => { overlay.remove(); resolve(result); }, 200);
      };

      okBtn.onclick = () => cleanup(true);
      overlay.querySelector('#confirm-cancel').onclick = () => cleanup(false);
      overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
  }

  // ── Pagination ─────────────────────────────────────────
  function renderPagination(container, { page, totalPages, onChange }) {
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="pagination" style="display:flex;align-items:center;gap:4px">';

    html += `<button class="btn btn--small" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹</button>`;

    const max = 7;
    let start = Math.max(1, page - 3);
    let end = Math.min(totalPages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);

    if (start > 1) {
      html += `<button class="btn btn--small" data-page="1">1</button>`;
      if (start > 2) html += '<span style="padding:0 4px;color:var(--color-text-muted)">…</span>';
    }
    for (let i = start; i <= end; i++) {
      html += `<button class="btn btn--small ${i === page ? 'btn--primary' : ''}" data-page="${i}">${i}</button>`;
    }
    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span style="padding:0 4px;color:var(--color-text-muted)">…</span>';
      html += `<button class="btn btn--small" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button class="btn btn--small" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">›</button>`;
    html += `<span style="margin-left:8px;font-size:13px;color:var(--color-text-muted)">第 ${page}/${totalPages} 页</span>`;
    html += '</div>';

    container.innerHTML = html;
    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages) onChange(p);
      });
    });
  }

  window.AdminUI = { showSkeleton, toast, confirmAction, renderPagination };
})();

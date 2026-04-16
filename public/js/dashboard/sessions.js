/**
 * Dashboard JS — 会话管理模块
 */
(function () {
  'use strict';

  async function loadSessions() {
    try {
      window.showSkeleton('sessions');
      var data = await window.api('GET', '/auth/sessions');
      window.hideSkeleton('sessions');
      renderSessions(data.sessions || []);
    } catch (err) {
      window.hideSkeleton('sessions');
      console.error('Load sessions error:', err);
    }
  }

  function renderSessions(sessions) {
    var list = document.getElementById('sessions-list');
    var empty = document.getElementById('sessions-empty');
    var escapeHtml = window.escapeHtml || function (value) { return value == null ? '' : String(value); };
    list.innerHTML = '';
    var others = sessions.filter(function (s) { return !s.is_current; });
    if (others.length === 0) {
      empty.style.display = 'flex';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = 'flex';
    others.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'session-item';
      item.innerHTML = [
        '<div class="session-item__icon">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        '</div>',
        '<div class="session-item__info">',
          '<strong>' + escapeHtml(s.browser || '未知浏览器') + '</strong>',
          '<span>' + escapeHtml(s.os || '未知系统') + ' · ' + escapeHtml(s.device_type || '未知设备') + ' · ' + new Date(s.created_at).toLocaleDateString('zh-CN') + '</span>',
        '</div>',
        '<button class="btn btn-ghost btn-sm" type="button" data-session-id="' + s.id + '" style="color:var(--error);">吊销</button>',
      ].join('');
      list.appendChild(item);
    });
  }

  function bindSessionActions() {
    var list = document.getElementById('sessions-list');
    if (!list || list.dataset.bound === 'true') return;
    list.dataset.bound = 'true';
    list.addEventListener('click', function (event) {
      var button = event.target.closest('[data-session-id]');
      if (!button) return;
      var id = parseInt(button.getAttribute('data-session-id'), 10);
      if (id) revokeSession(id);
    });
  }

  async function revokeSession(id) {
    try {
      await window.api('DELETE', '/auth/sessions/' + id);
      window.toast('会话已吊销', 'success');
      await loadSessions();
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  async function revokeAllSessions() {
    if (!confirm('确定要吊销所有其他会话吗？这不会影响当前登录。')) return;
    try {
      await window.api('DELETE', '/auth/sessions');
      window.toast('所有其他会话已吊销', 'success');
      await loadSessions();
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  window.loadSessions = loadSessions;
  window.renderSessions = renderSessions;
  window.revokeSession = revokeSession;
  window.revokeAllSessions = revokeAllSessions;
  bindSessionActions();
})();

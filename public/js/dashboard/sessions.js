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
    var SafeDom = window.SafeDom;
    var setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };
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

      var iconDiv = document.createElement('div');
      iconDiv.className = 'session-item__icon';
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '2');
      svg.setAttribute('width', '20');
      svg.setAttribute('height', '20');
      svg.innerHTML = '<rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>';
      iconDiv.appendChild(svg);
      item.appendChild(iconDiv);

      var infoDiv = document.createElement('div');
      infoDiv.className = 'session-item__info';

      var strong = document.createElement('strong');
      setText(strong, s.browser || '未知浏览器');
      infoDiv.appendChild(strong);

      var span = document.createElement('span');
      var dateStr = new Date(s.created_at).toLocaleDateString('zh-CN');
      setText(span, (s.os || '未知系统') + ' · ' + (s.device_type || '未知设备') + ' · ' + dateStr);
      infoDiv.appendChild(span);

      item.appendChild(infoDiv);

      var revokeBtn = document.createElement('button');
      revokeBtn.className = 'btn btn-ghost btn-sm';
      revokeBtn.type = 'button';
      revokeBtn.dataset.sessionId = s.id;
      revokeBtn.style.cssText = 'color:var(--error);';
      setText(revokeBtn, '吊销');
      item.appendChild(revokeBtn);

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

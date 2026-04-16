// public/js/admin/admin-stats.js
(function () {
  'use strict';

  let container = null;
  const { apiFetch } = window.AdminApi;
  const { esc, formatDate } = window.AdminUtils;
  const { toast } = window.AdminUI;

  function init(el) {
    container = el;
    const refreshBtn = document.getElementById('refresh-stats-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', refresh);
    refresh();
  }

  function refresh() {
    Promise.allSettled([
      loadStatsCards(),
      loadGrowth(),
      loadRecentUsers(),
      loadRecentActivity(),
    ]).then(([cards, growth, users, activity]) => {
      if (cards.status === 'fulfilled') renderStatsCards(cards.value);
      if (growth.status === 'fulfilled') renderGrowth(growth.value);
      if (users.status === 'fulfilled') renderRecentUsers(users.value);
      if (activity.status === 'fulfilled') renderRecentActivity(activity.value);
    }).catch(() => {
      toast('刷新统计失败', 'error');
    });
  }

  async function loadStatsCards() {
    return await apiFetch('/api/admin/stats');
  }

  async function loadRecentUsers() {
    return await apiFetch('/api/admin/users?limit=10');
  }

  async function loadGrowth() {
    return await apiFetch('/api/admin/stats/registrations?days=7');
  }

  async function loadRecentActivity() {
    return await apiFetch('/api/admin/activities?limit=20');
  }

  function renderStatsCards(data) {
    if (!data || data.__unauthorized || !data.users) return;
    const setText = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(value);
    };

    setText('stat-total-users', data.users?.total || 0);
    setText('stat-active-users', data.users?.active || 0);
    setText('stat-suspended-users', data.users?.suspended || 0);
    setText('stat-verified-users', data.users?.verified || 0);
    setText('stat-today-users', data.users?.today || 0);
    setText('stat-total-dl', data.downloads || 0);
    setText('stat-presets', data.presets || 0);
  }

  function renderGrowth(data) {
    const barsEl = document.getElementById('growth-bars');
    const descriptionEl = document.getElementById('growth-chart-description');
    if (!barsEl) return;
    if (!data || data.__unauthorized) return;

    const rows = data.registrations || [];
    if (!rows.length) {
      if (descriptionEl) descriptionEl.textContent = '最近 7 天暂无注册数据。';
      barsEl.innerHTML = '<div class="growth-chart__loading">暂无数据</div>';
      return;
    }

    const max = Math.max(...rows.map(r => Number(r.count) || 0), 1);
    if (descriptionEl) {
      descriptionEl.textContent = `最近 7 天注册趋势：${rows.map((row) => `${String(row.date).slice(5)} 注册 ${row.count} 人`).join('，')}。`;
    }
    barsEl.innerHTML = rows.map((row) => {
      const count = Number(row.count) || 0;
      const height = Math.max(12, Math.round((count / max) * 120));
      return `
        <div style="display:flex;flex-direction:column;align-items:center;gap:8px;flex:1" aria-hidden="true">
          <div style="font-size:12px;color:var(--color-text-muted)">${esc(String(count))}</div>
          <div style="width:100%;max-width:36px;height:${height}px;border-radius:12px 12px 6px 6px;background:linear-gradient(180deg,var(--accent),rgba(0,113,227,0.35));"></div>
          <div style="font-size:12px;color:var(--color-text-muted)">${esc(String(row.date).slice(5))}</div>
        </div>
      `;
    }).join('');
  }

  function renderRecentUsers(data) {
    const el = document.getElementById('recent-users-body');
    if (!el) return;
    if (!data || data.__unauthorized) return;
    const users = data.users || [];
    if (!users.length) {
      el.innerHTML = '<tr><td colspan="5" class="table-empty">暂无数据</td></tr>';
      return;
    }
    el.innerHTML = users.map(u => `
      <tr>
        <td>${esc(u.username)}</td>
        <td>${esc(u.email)}</td>
        <td>${esc(u.role)}</td>
        <td>${esc(u.status)}</td>
        <td>${esc(formatDate(u.created_at))}</td>
      </tr>
    `).join('');
  }

  function renderRecentActivity(data) {
    const el = container.querySelector('[data-widget="recent-activity"]');
    if (!el) return;
    if (!data || data.__unauthorized) return;
    const activities = data.activities || [];
    if (!activities.length) { el.innerHTML = '<p style="color:var(--color-text-muted)">暂无数据</p>'; return; }
    el.innerHTML = activities.map(a => `
      <div style="padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px">
        <strong>${esc(a.username || '系统')}</strong> · ${esc(a.event_type)} · ${esc(a.description)} <span style="color:var(--color-text-muted)">${esc(formatDate(a.created_at))}</span>
      </div>
    `).join('');
  }

  window.AdminStats = { init, refresh };
})();

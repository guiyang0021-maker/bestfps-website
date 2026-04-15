// public/js/admin/admin-stats.js
(function () {
  'use strict';

  let container = null;
  const { apiFetch } = window.AdminApi;
  const { esc, formatDate } = window.AdminUtils;
  const { toast } = window.AdminUI;

  function init(el) {
    container = el;
    // 各 widget 独立请求，失败互不影响
    Promise.allSettled([
      loadStatsCards(),
      loadRecentUsers(),
      loadRecentActivity(),
    ]).then(([cards, users, activity]) => {
      if (cards.status === 'fulfilled') renderStatsCards(cards.value);
      if (users.status === 'fulfilled') renderRecentUsers(users.value);
      if (activity.status === 'fulfilled') renderRecentActivity(activity.value);
    });
  }

  async function loadStatsCards() {
    return await apiFetch('/api/admin/stats');
  }

  async function loadRecentUsers() {
    return await apiFetch('/api/admin/users?limit=10');
  }

  async function loadRecentActivity() {
    return await apiFetch('/api/admin/activities?limit=20');
  }

  function renderStatsCards(data) {
    const el = container.querySelector('[data-widget="cards"]');
    if (!el) return;
    el.innerHTML = `
      <div class="stat-card">
        <div class="stat-card__label">总用户数</div>
        <div class="stat-card__value">${esc(String(data.users?.total || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">活跃用户</div>
        <div class="stat-card__value">${esc(String(data.users?.active || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">今日注册</div>
        <div class="stat-card__value">${esc(String(data.users?.today || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">总下载量</div>
        <div class="stat-card__value">${esc(String(data.downloads || 0))}</div>
      </div>
    `;
  }

  function renderRecentUsers(data) {
    const el = container.querySelector('[data-widget="recent-users"]');
    if (!el) return;
    const users = data.users || [];
    if (!users.length) { el.innerHTML = '<p style="color:var(--color-text-muted)">暂无数据</p>'; return; }
    el.innerHTML = `
      <table class="table">
        <thead><tr><th>用户</th><th>角色</th><th>注册时间</th></tr></thead>
        <tbody>
          ${users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${esc(formatDate(u.created_at))}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function renderRecentActivity(data) {
    const el = container.querySelector('[data-widget="recent-activity"]');
    if (!el) return;
    const activities = data.activities || [];
    if (!activities.length) { el.innerHTML = '<p style="color:var(--color-text-muted)">暂无数据</p>'; return; }
    el.innerHTML = activities.map(a => `
      <div style="padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px">
        <strong>${esc(a.event_type)}</strong> — ${esc(a.description)} <span style="color:var(--color-text-muted)">${esc(formatDate(a.created_at))}</span>
      </div>
    `).join('');
  }

  window.AdminStats = { init };
})();
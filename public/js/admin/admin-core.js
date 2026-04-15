// public/js/admin/admin-core.js
(function () {
  'use strict';

  const state = {
    currentUser: null,
    views: {},
  };

  function requireAdmin() {
    if (!state.currentUser || !['admin', 'superadmin'].includes(state.currentUser.role)) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  }

  function showView(viewName, pushState = true) {
    Object.values(state.views).forEach(v => { if (v) v.style.display = 'none'; });
    const target = state.views[viewName];
    if (target) target.style.display = '';
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewName);
    });
    if (pushState) {
      history.pushState({ view: viewName }, '', '/admin?view=' + viewName);
    }
  }

  function handlePopState(e) {
    const view = e.state?.view || new URLSearchParams(window.location.search).get('view') || 'stats';
    showView(view, false);
  }

  function init(container) {
    // 从当前页面 DOM 读取用户信息（由 server 注入的 data 属性）
    const userEl = document.getElementById('current-user-data');
    if (!userEl) { window.location.href = '/login'; return; }
    try {
      state.currentUser = JSON.parse(userEl.textContent);
    } catch (e) { window.location.href = '/login'; return; }

    if (!requireAdmin()) return;

    // 初始化各模块
    if (window.AdminUsers) {
      state.views.users = document.getElementById('users-view');
      if (state.views.users) window.AdminUsers.init(state.views.users);
    }
    if (window.AdminAnnouncements) {
      state.views.announcements = document.getElementById('announcements-view');
      if (state.views.announcements) window.AdminAnnouncements.init(state.views.announcements);
    }
    if (window.AdminStats) {
      state.views.stats = document.getElementById('stats-view');
      if (state.views.stats) window.AdminStats.init(state.views.stats);
    }

    // 读取 URL 中的 view 参数
    const urlView = new URLSearchParams(window.location.search).get('view') || 'stats';
    showView(urlView, false);

    // 监听浏览器前进/后退
    window.addEventListener('popstate', handlePopState);

    // 侧边栏导航切换
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        showView(view);
      });
    });
  }

  window.AdminCore = {
    init,
    requireAdmin,
    showView,
    getState: () => state,
    getCurrentUser: () => state.currentUser,
  };
})();

// public/js/admin/admin-core.js
(function () {
  'use strict';

  const state = {
    currentUser: null,
    views: {},
    activeModal: null,
    lastFocusedElement: null,
  };

  const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  async function loadCurrentUser() {
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return null;
      }

      if (res.status === 403) {
        window.location.href = '/dashboard';
        return null;
      }

      const data = await res.json().catch(() => null);
      if (res.ok && data && data.user) {
        return data.user;
      }

      console.error('[AdminCore] Failed to load current user:', res.status, data);
    } catch (err) {
      console.error('[AdminCore] Current user request failed:', err);
    }

    // /admin 页面已由服务端鉴权；这里降级处理，避免用户信息接口异常时整页功能停摆。
    return {
      username: '管理员',
      email: '—',
      role: 'admin',
    };
  }

  function syncCurrentUserUi() {
    const user = state.currentUser || {};
    const usernameEl = document.getElementById('admin-username');
    const emailEl = document.getElementById('admin-email');
    const roleEl = document.getElementById('admin-role-badge');

    if (usernameEl) usernameEl.textContent = user.username || '—';
    if (emailEl) emailEl.textContent = user.email || '—';
    if (roleEl) {
      roleEl.textContent = user.role === 'superadmin' ? '超级管理员' : '管理员';
      roleEl.className = `sidebar-badge ${user.role === 'superadmin' ? 'badge-superadmin' : 'badge-admin'}`;
    }
  }

  function syncThemeButtons(theme) {
    document.querySelectorAll('.theme-btn').forEach((btn) => {
      const isActive = btn.dataset.theme === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    syncThemeButtons(savedTheme);

    document.querySelectorAll('.theme-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme || 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        syncThemeButtons(theme);
      });
    });
  }

  function getModalElement(modalOrId) {
    if (!modalOrId) return null;
    return typeof modalOrId === 'string' ? document.getElementById(modalOrId) : modalOrId;
  }

  function getFocusableElements(modal) {
    return Array.from(modal.querySelectorAll(FOCUSABLE_SELECTOR))
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
  }

  function openModal(modalOrId, triggerEl) {
    const modal = getModalElement(modalOrId);
    if (!modal) return;

    state.lastFocusedElement = triggerEl || document.activeElement;
    state.activeModal = modal;
    modal.classList.add('modal-overlay--open');
    modal.setAttribute('aria-hidden', 'false');

    const modalPanel = modal.querySelector('.modal');
    const focusable = getFocusableElements(modal);
    const target = focusable[0] || modalPanel || modal;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function closeModal(modalOrId, restoreFocus = true) {
    const modal = getModalElement(modalOrId);
    if (!modal) return;

    modal.classList.remove('modal-overlay--open');
    modal.setAttribute('aria-hidden', 'true');

    if (state.activeModal === modal) {
      state.activeModal = null;
      const lastFocused = state.lastFocusedElement;
      state.lastFocusedElement = null;
      if (restoreFocus && lastFocused && document.contains(lastFocused) && typeof lastFocused.focus === 'function') {
        lastFocused.focus();
      }
    }
  }

  function handleModalKeyboard(event) {
    const modal = state.activeModal;
    if (!modal) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      if (modal.id === 'announcement-modal' && window.AdminAnnouncements) {
        window.AdminAnnouncements.closeModal();
      } else {
        closeModal(modal);
      }
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(modal);
    if (!focusable.length) {
      event.preventDefault();
      const modalPanel = modal.querySelector('.modal');
      if (modalPanel) modalPanel.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const activeInsideModal = modal.contains(document.activeElement);

    if (!activeInsideModal) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleModalFocusIn(event) {
    const modal = state.activeModal;
    if (!modal || modal.contains(event.target)) return;

    const focusable = getFocusableElements(modal);
    const modalPanel = modal.querySelector('.modal');
    const target = focusable[0] || modalPanel;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function requireAdmin() {
    if (!state.currentUser) {
      return true;
    }
    if (!['admin', 'superadmin'].includes(state.currentUser.role)) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  }

  function showView(viewName, pushState = true) {
    if (!state.views[viewName]) {
      viewName = 'stats';
    }
    Object.values(state.views).forEach(v => { if (v) v.style.display = 'none'; });
    const target = state.views[viewName];
    if (target) {
      target.style.display = '';
    }

    document.querySelectorAll('#dash-content .dash-section').forEach((section) => {
      section.classList.remove('active');
    });
    if (target) {
      const activeSection = target.querySelector('.dash-section');
      if (activeSection) {
        activeSection.classList.add('active');
      }
    }

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

  async function init(container) {
    initTheme();
    state.currentUser = await loadCurrentUser();
    if (!state.currentUser) return;
    syncCurrentUserUi();

    if (!requireAdmin()) return;

    state.views.users = document.getElementById('users-view');
    state.views.announcements = document.getElementById('announcements-view');
    state.views.invoices = document.getElementById('invoices-view');
    state.views.stats = document.getElementById('stats-view');

    // 初始化各模块
    if (window.AdminUsers) {
      try {
        if (state.views.users) window.AdminUsers.init(state.views.users);
      } catch (err) {
        console.error('[AdminCore] Users init error:', err);
      }
    }
    if (window.AdminAnnouncements) {
      try {
        if (state.views.announcements) window.AdminAnnouncements.init(state.views.announcements);
      } catch (err) {
        console.error('[AdminCore] Announcements init error:', err);
      }
    }
    if (window.AdminInvoices) {
      try {
        if (state.views.invoices) window.AdminInvoices.init(state.views.invoices);
      } catch (err) {
        console.error('[AdminCore] Invoices init error:', err);
      }
    }
    if (window.AdminStats) {
      try {
        if (state.views.stats) window.AdminStats.init(state.views.stats);
      } catch (err) {
        console.error('[AdminCore] Stats init error:', err);
      }
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

    const allUsersLink = document.getElementById('view-all-users-link');
    if (allUsersLink) {
      allUsersLink.addEventListener('click', (e) => {
        e.preventDefault();
        showView('users');
      });
    }

    document.addEventListener('keydown', handleModalKeyboard);
    document.addEventListener('focusin', handleModalFocusIn);
  }

  window.AdminCore = {
    init,
    requireAdmin,
    showView,
    openModal,
    closeModal,
    getState: () => state,
    getCurrentUser: () => state.currentUser,
  };
})();

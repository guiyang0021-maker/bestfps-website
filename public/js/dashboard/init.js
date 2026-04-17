/**
 * Dashboard JS — 初始化模块
 * 挂载所有模块后执行仪表盘初始化
 */
(function () {
  'use strict';

  async function loadCurrentUser() {
    var data = await window.api('GET', '/auth/me');
    return data && data.user ? data.user : null;
  }

  function syncUserUi(user) {
    var username = user && user.username ? user.username : '—';
    var email = user && user.email ? user.email : '—';

    document.getElementById('sidebar-username').textContent = username;
    document.getElementById('sidebar-email').textContent = email;
    document.getElementById('home-username').textContent = username;
    document.getElementById('profile-username').value = user && user.username ? user.username : '';
    document.getElementById('profile-email').value = user && user.email ? user.email : '';

    var img = document.getElementById('sidebar-avatar-img');
    var placeholder = document.getElementById('avatar-placeholder');
    if (user && user.avatar) {
      img.src = user.avatar;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.removeAttribute('src');
      img.style.display = 'none';
      placeholder.style.display = '';
    }

    var badge = document.getElementById('verified-badge');
    if (user && user.verified) {
      badge.className = 'sidebar-badge badge-verified';
      badge.textContent = '已验证';
    } else {
      badge.className = 'sidebar-badge badge-unverified';
      badge.textContent = '未验证';
    }

    var adminNav = document.getElementById('admin-nav-item');
    if (adminNav) {
      adminNav.style.display = user && (user.role === 'admin' || user.role === 'superadmin') ? '' : 'none';
    }
  }

  async function initDashboard() {
    var user;
    try {
      user = await loadCurrentUser();
    } catch (err) {
      console.error('Load current user error:', err);
      window.location.href = '/login';
      return;
    }

    if (!user) {
      window.location.href = '/login';
      return;
    }

    window.currentUser = user;
    syncUserUi(user);

    // Avatar upload
    var avatarRing = document.getElementById('avatar-ring');
    var avatarInput = document.getElementById('avatar-input');
    if (avatarRing && avatarInput) {
      avatarRing.addEventListener('click', function () {
        avatarInput.click();
      });
      avatarInput.addEventListener('change', window.uploadAvatar);
    }

    // Load all sections
    await window.loadProfile();
    await window.pullFromServer();
    await window.loadDownloads();
    await window.loadPresets();
    await window.loadShares();
    await window.loadAnnouncements();
    await window.loadStats();
    await window.loadActivities();
  }

  function bindDashboardActions() {
    var markUnsynced = function () {
      if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus(false);
    };

    document.getElementById('home-pull-btn')?.addEventListener('click', function () {
      if (typeof window.showSection === 'function') window.showSection('shaders');
      if (typeof window.pullFromServer === 'function') window.pullFromServer();
    });
    document.getElementById('home-push-btn')?.addEventListener('click', function () {
      if (typeof window.showSection === 'function') window.showSection('shaders');
      if (typeof window.pushToServer === 'function') window.pushToServer();
    });
    document.getElementById('quick-new-preset-btn')?.addEventListener('click', function () {
      if (typeof window.showSection === 'function') window.showSection('presets');
      if (typeof window.showNewPresetModal === 'function') window.showNewPresetModal();
    });
    document.getElementById('quick-share-btn')?.addEventListener('click', function () {
      if (typeof window.showSection === 'function') window.showSection('share');
    });
    document.getElementById('quick-add-resource-btn')?.addEventListener('click', function () {
      if (typeof window.showSection === 'function') window.showSection('resources');
      if (typeof window.addResource === 'function') window.addResource();
    });
    document.getElementById('quick-settings-btn')?.addEventListener('click', function () {
      window.location.href = '/settings#profile';
    });
    document.getElementById('quick-invoice-btn')?.addEventListener('click', function () {
      window.location.href = '/settings#invoices';
    });
    document.getElementById('quick-hwid-btn')?.addEventListener('click', function () {
      window.location.href = '/settings#hwid';
    });
    document.getElementById('quick-export-btn')?.addEventListener('click', function () {
      if (typeof window.exportConfig === 'function') window.exportConfig();
    });
    document.getElementById('quick-import-btn')?.addEventListener('click', function () {
      document.getElementById('import-file-input')?.click();
    });
    document.getElementById('import-file-input')?.addEventListener('change', function (event) {
      if (typeof window.importConfigFromFile === 'function') window.importConfigFromFile(event.target);
    });

    document.querySelectorAll('#section-shaders input[type="range"]').forEach(function (input) {
      var updateValue = function () {
        if (!input.nextElementSibling) return;
        if (input.id === 'shader-view-distance') {
          input.nextElementSibling.textContent = input.value + ' ch';
        } else {
          input.nextElementSibling.textContent = input.value + '%';
        }
      };
      input.addEventListener('input', updateValue);
      input.addEventListener('input', markUnsynced);
      updateValue();
    });

    document.querySelectorAll('#section-shaders input[type="checkbox"]').forEach(function (input) {
      input.addEventListener('change', markUnsynced);
    });

    document.getElementById('shader-pull-btn')?.addEventListener('click', function () {
      if (typeof window.pullFromServer === 'function') window.pullFromServer();
    });
    document.getElementById('shader-push-btn')?.addEventListener('click', function () {
      if (typeof window.pushToServer === 'function') window.pushToServer();
    });
    document.getElementById('resource-empty-add-btn')?.addEventListener('click', function () {
      if (typeof window.addResource === 'function') window.addResource();
    });
    document.getElementById('resource-add-btn')?.addEventListener('click', function () {
      if (typeof window.addResource === 'function') window.addResource();
    });
    document.getElementById('resource-pull-btn')?.addEventListener('click', function () {
      if (typeof window.pullFromServer === 'function') window.pullFromServer();
    });
    document.getElementById('resource-push-btn')?.addEventListener('click', function () {
      if (typeof window.pushToServer === 'function') window.pushToServer();
    });

    document.getElementById('preset-open-btn')?.addEventListener('click', function () {
      if (typeof window.showNewPresetModal === 'function') window.showNewPresetModal();
    });
    document.getElementById('preset-empty-open-btn')?.addEventListener('click', function () {
      if (typeof window.showNewPresetModal === 'function') window.showNewPresetModal();
    });
    document.getElementById('preset-close-btn')?.addEventListener('click', function () {
      if (typeof window.closePresetModal === 'function') window.closePresetModal();
    });
    document.getElementById('preset-cancel-btn')?.addEventListener('click', function () {
      if (typeof window.closePresetModal === 'function') window.closePresetModal();
    });
    document.getElementById('preset-create-btn')?.addEventListener('click', function () {
      if (typeof window.createPreset === 'function') window.createPreset();
    });

    document.getElementById('share-create-btn')?.addEventListener('click', function () {
      if (typeof window.createShare === 'function') window.createShare();
    });
    document.getElementById('share-empty-focus-btn')?.addEventListener('click', function () {
      if (typeof window.focusShareComposer === 'function') {
        window.focusShareComposer();
      }
    });

    document.getElementById('profile-save-btn')?.addEventListener('click', function () {
      if (typeof window.saveProfile === 'function') window.saveProfile();
    });
    document.getElementById('password-save-btn')?.addEventListener('click', function () {
      if (typeof window.changePassword === 'function') window.changePassword();
    });
    document.getElementById('email-save-btn')?.addEventListener('click', function () {
      if (typeof window.changeEmail === 'function') window.changeEmail();
    });

    document.getElementById('history-prev')?.addEventListener('click', function () {
      var page = typeof window.getDashboardHistoryPage === 'function' ? window.getDashboardHistoryPage() : 1;
      if (page > 1 && typeof window.loadHistory === 'function') window.loadHistory(page - 1);
    });
    document.getElementById('history-next')?.addEventListener('click', function () {
      var page = typeof window.getDashboardHistoryPage === 'function' ? window.getDashboardHistoryPage() : 1;
      var totalPages = typeof window.getDashboardHistoryTotalPages === 'function' ? window.getDashboardHistoryTotalPages() : page;
      if (page < totalPages && typeof window.loadHistory === 'function') window.loadHistory(page + 1);
    });

    document.getElementById('sessions-revoke-all-btn')?.addEventListener('click', function () {
      if (typeof window.revokeAllSessions === 'function') window.revokeAllSessions();
    });

    document.getElementById('snapshot-open-btn')?.addEventListener('click', function () {
      if (typeof window.showSaveSnapshotModal === 'function') window.showSaveSnapshotModal();
    });
    document.getElementById('snapshot-empty-open-btn')?.addEventListener('click', function () {
      if (typeof window.showSaveSnapshotModal === 'function') window.showSaveSnapshotModal();
    });
    document.getElementById('snapshot-close-btn')?.addEventListener('click', function () {
      if (typeof window.closeSnapshotModal === 'function') window.closeSnapshotModal();
    });
    document.getElementById('snapshot-cancel-btn')?.addEventListener('click', function () {
      if (typeof window.closeSnapshotModal === 'function') window.closeSnapshotModal();
    });
    document.getElementById('snapshot-save-btn')?.addEventListener('click', function () {
      if (typeof window.saveSnapshot === 'function') window.saveSnapshot();
    });
  }

  async function bootDashboard() {
    if (typeof window.initTheme === 'function') window.initTheme();
    if (typeof window.initSidebar === 'function') window.initSidebar();
    if (typeof window.initKeyboardShortcuts === 'function') window.initKeyboardShortcuts();
    if (typeof window.initNavigation === 'function') window.initNavigation();
    if (typeof window.initOnboardingControls === 'function') window.initOnboardingControls();
    if (typeof window.initSearch === 'function') window.initSearch();
    bindDashboardActions();

    await initDashboard();

    if (!localStorage.getItem('hasSeenOnboarding')) {
      setTimeout(window.showOnboardingModal, 800);
    }
  }

  window.initDashboard = initDashboard;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootDashboard, { once: true });
  } else {
    bootDashboard();
  }
})();

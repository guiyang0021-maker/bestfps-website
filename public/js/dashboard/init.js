/**
 * Dashboard JS — 初始化模块
 * 挂载所有模块后执行仪表盘初始化
 */
(function () {
  'use strict';

  async function initDashboard() {
    var user = JSON.parse(localStorage.getItem('user') || 'null');

    document.getElementById('sidebar-username').textContent = user.username;
    document.getElementById('sidebar-email').textContent = user.email;
    document.getElementById('home-username').textContent = user.username;
    document.getElementById('profile-username').value = user.username;
    document.getElementById('profile-email').value = user.email;

    if (user.avatar) {
      var img = document.getElementById('sidebar-avatar-img');
      img.src = user.avatar;
      img.style.display = 'block';
      document.getElementById('avatar-placeholder').style.display = 'none';
    }

    var badge = document.getElementById('verified-badge');
    if (user.verified) {
      badge.className = 'sidebar-badge badge-verified';
      badge.textContent = '已验证';
    }

    if (user.role === 'admin' || user.role === 'superadmin') {
      var adminNav = document.getElementById('admin-nav-item');
      if (adminNav) adminNav.style.display = '';
    }

    // Avatar upload
    document.getElementById('avatar-ring').addEventListener('click', function () {
      document.getElementById('avatar-input').click();
    });
    document.getElementById('avatar-input').addEventListener('change', window.uploadAvatar);

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

  window.initDashboard = initDashboard;
})();

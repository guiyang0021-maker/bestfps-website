/**
 * Dashboard JS — 主题管理模块
 */
(function () {
  'use strict';

  function syncThemeButtons(theme) {
    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      var isActive = btn.dataset.theme === theme;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function initTheme() {
    const savedTheme = localStorage.getItem('theme') || document.documentElement.getAttribute('data-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    syncThemeButtons(savedTheme);

    document.querySelectorAll('.theme-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const theme = btn.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        syncThemeButtons(theme);
      });
    });
  }

  window.initTheme = initTheme;
})();

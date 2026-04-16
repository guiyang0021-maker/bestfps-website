/**
 * Dashboard JS — 导航与侧边栏模块
 */
(function () {
  'use strict';

  function initSidebar() {
    document.getElementById('sidebar-toggle').addEventListener('click', function () {
      document.getElementById('dash-sidebar').classList.toggle('open');
      document.getElementById('sidebar-overlay').classList.toggle('open');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);
    document.getElementById('account-menu-toggle')?.addEventListener('click', toggleAccountMenu);
    document.getElementById('dashboard-logout-link')?.addEventListener('click', function (event) {
      event.preventDefault();
      if (typeof logout === 'function') logout();
    });

    document.querySelectorAll('.sidebar-nav__item[data-section], .sidebar-nav__subitem[data-section]').forEach(function (link) {
      link.addEventListener('click', function (event) {
        event.preventDefault();
        showSection(link.dataset.section);
      });
    });
  }

  function closeSidebar() {
    document.getElementById('dash-sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
  }

  function showSection(name) {
    document.querySelectorAll('.dash-section').forEach(function (s) { s.classList.remove('active'); });
    document.querySelectorAll('.sidebar-nav__item, .sidebar-nav__subitem').forEach(function (a) { a.classList.remove('active'); });
    document.getElementById('section-' + name).classList.add('active');

    var navLink = document.querySelector('.sidebar-nav__item[data-section="' + name + '"]');
    if (navLink) navLink.classList.add('active');
    var subLink = document.querySelector('.sidebar-nav__subitem[data-section="' + name + '"]');
    if (subLink) subLink.classList.add('active');

    closeSidebar();
  }

  function toggleAccountMenu() {
    var submenu = document.getElementById('account-submenu');
    var btn = document.querySelector('.sidebar-nav__group-title');
    var isOpen = submenu.style.display !== 'none';
    submenu.style.display = isOpen ? 'none' : 'flex';
    btn.setAttribute('aria-expanded', !isOpen);
  }

  function initNavigation() {
    // Patch showSection to also load section-specific data
    var origShowSection = showSection;
    window.showSection = function (name) {
      origShowSection(name);
      if (name === 'sessions' && typeof loadSessions === 'function') loadSessions();
      if (name === 'login-history' && typeof loadHistory === 'function') loadHistory(1);
      if (name === 'versions' && typeof loadVersions === 'function') loadVersions();
    };
  }

  window.initSidebar = initSidebar;
  window.closeSidebar = closeSidebar;
  window.showSection = showSection;
  window.toggleAccountMenu = toggleAccountMenu;
  window.initNavigation = initNavigation;
})();

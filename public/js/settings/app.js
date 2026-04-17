(function () {
  'use strict';

  const core = window.SettingsPage;
  if (!core) return;

  window.SettingsAccount?.init();
  window.SettingsInvoices?.init();
  window.SettingsHwid?.init();

  core.initBaseInteractions();
  core.initTheme();
  window.SettingsInvoices?.toggleInvoiceType();
  window.SettingsAccount?.loadProfile();

  let sectionName = (window.location.hash || '').slice(1) || 'profile';
  if (!document.getElementById('section-' + sectionName)) {
    sectionName = 'profile';
  }
  core.showSection(sectionName, { skipScroll: true });
})();

/**
 * Dashboard JS — 键盘快捷键模块
 */
(function () {
  'use strict';

  var gPressed = false;

  function openShortcutsModal() {
    document.getElementById('shortcuts-modal').classList.add('active');
  }

  function closeShortcutsModal() {
    document.getElementById('shortcuts-modal').classList.remove('active');
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
      var tag = document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      var key = e.key.toLowerCase();
      var ctrl = e.ctrlKey || e.metaKey;

      // Esc — close modals
      if (key === 'escape') {
        closeShortcutsModal();
        if (typeof closeSidebar === 'function') closeSidebar();
        var ob = document.getElementById('onboarding-modal');
        if (ob && ob.classList.contains('active') && typeof skipOnboarding === 'function') skipOnboarding();
        return;
      }

      // Onboarding keyboard nav
      var ob = document.getElementById('onboarding-modal');
      if (ob && ob.classList.contains('active')) {
        if (key === 'enter' || key === 'arrowright') { if (typeof nextOnboardingStep === 'function') nextOnboardingStep(); return; }
        if (key === 'arrowleft') { if (typeof prevOnboardingStep === 'function') prevOnboardingStep(); return; }
        return;
      }

      // ? — open shortcuts modal
      if (key === '?' || (key === '/' && !ctrl)) {
        e.preventDefault();
        openShortcutsModal();
        return;
      }

      // Ctrl/Cmd + S — sync to server
      if (ctrl && key === 's') {
        e.preventDefault();
        if (typeof pushToServer === 'function') pushToServer();
        return;
      }

      // Ctrl/Cmd + P — new preset
      if (ctrl && key === 'p') {
        e.preventDefault();
        if (typeof showNewPresetModal === 'function') showNewPresetModal();
        return;
      }

      // G + key navigation
      if (key === 'g' && !ctrl) {
        gPressed = true;
        setTimeout(function () { gPressed = false; }, 1000);
        return;
      }

      if (gPressed) {
        gPressed = false;
        if (typeof showSection === 'function') {
          switch (key) {
            case 'h': showSection('home'); break;
            case 's': showSection('shaders'); break;
            case 'p': showSection('presets'); break;
            case 'd': showSection('downloads'); break;
            case 'a': showSection('profile'); break;
          }
        }
      }
    });
  }

  window.openShortcutsModal = openShortcutsModal;
  window.closeShortcutsModal = closeShortcutsModal;
  window.initKeyboardShortcuts = initKeyboardShortcuts;
})();

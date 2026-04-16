/**
 * Dashboard JS — 键盘快捷键模块
 */
(function () {
  'use strict';

  var gPressed = false;
  var lastFocusedElement = null;
  var FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  function getShortcutsModal() {
    return document.getElementById('shortcuts-modal');
  }

  function getFocusableElements(modal) {
    return Array.prototype.slice.call(modal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(function (el) {
      return el.offsetParent !== null || el === document.activeElement;
    });
  }

  function openShortcutsModal(triggerEl) {
    var modal = getShortcutsModal();
    if (!modal) return;

    lastFocusedElement = triggerEl || document.activeElement;
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');

    var focusable = getFocusableElements(modal);
    var target = focusable[0] || modal.querySelector('.modal') || modal;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  function closeShortcutsModal() {
    var modal = getShortcutsModal();
    if (!modal) return;

    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');

    if (lastFocusedElement && document.contains(lastFocusedElement) && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
  }

  function trapShortcutsFocus(e) {
    var modal = getShortcutsModal();
    if (!modal || !modal.classList.contains('active') || e.key !== 'Tab') return;

    var focusable = getFocusableElements(modal);
    if (!focusable.length) {
      e.preventDefault();
      return;
    }

    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    var activeInsideModal = modal.contains(document.activeElement);

    if (!activeInsideModal) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
      return;
    }

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function initKeyboardShortcuts() {
    var shortcutsButton = document.getElementById('shortcuts-btn');
    var shortcutsModal = getShortcutsModal();

    if (shortcutsButton) {
      shortcutsButton.addEventListener('click', function () {
        openShortcutsModal(shortcutsButton);
      });
    }

    if (shortcutsModal) {
      shortcutsModal.addEventListener('click', function (e) {
        if (e.target === shortcutsModal) {
          closeShortcutsModal();
        }
      });
    }
    document.getElementById('shortcuts-close-btn')?.addEventListener('click', closeShortcutsModal);

    document.addEventListener('keydown', function (e) {
      trapShortcutsFocus(e);

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

    document.addEventListener('focusin', function (e) {
      var modal = getShortcutsModal();
      if (!modal || !modal.classList.contains('active') || modal.contains(e.target)) return;

      var focusable = getFocusableElements(modal);
      var target = focusable[0] || modal.querySelector('.modal');
      if (target && typeof target.focus === 'function') {
        target.focus();
      }
    });
  }

  window.openShortcutsModal = openShortcutsModal;
  window.closeShortcutsModal = closeShortcutsModal;
  window.initKeyboardShortcuts = initKeyboardShortcuts;
})();

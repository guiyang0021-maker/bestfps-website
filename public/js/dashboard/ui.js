/**
 * Dashboard JS — UI 辅助模块（Toast、骨架屏、Alert）
 */
(function () {
  'use strict';

  function toast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var icons = {
      success: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg>',
      error: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
      info: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/></svg>',
      warning: '<svg viewBox="0 0 20 20" fill="currentColor" width="20" height="20"><path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>',
    };
    var toastEl = document.createElement('div');
    toastEl.className = 'toast toast--' + type;
    toastEl.innerHTML = [
      '<span class="toast__icon">' + (icons[type] || icons.info) + '</span>',
      '<span class="toast__text">' + message + '</span>',
      '<button class="toast__close" onclick="this.parentElement.remove()">',
        '<svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>',
      '</button>',
    ].join('');
    container.appendChild(toastEl);
    setTimeout(function () {
      toastEl.classList.add('toast--exiting');
      setTimeout(function () { toastEl.remove(); }, 250);
    }, 4000);
  }

  function showSkeleton(section) {
    var map = {
      shader:    document.getElementById('shader-skeleton'),
      chart:     document.getElementById('chart-skeleton'),
      downloads: document.querySelectorAll('.downloads-skeleton'),
      presets:   document.querySelectorAll('.preset-skeleton'),
      shares:    document.getElementById('share-skeleton'),
      sessions:  document.getElementById('sessions-skeleton'),
      history:   document.querySelectorAll('.history-skeleton'),
    };
    var el = map[section];
    if (!el) return;
    if (Symbol.iterator in Object(el)) {
      el.forEach(function (e) { if (e) e.classList.add('show'); });
    } else {
      el.classList.add('show');
    }
  }

  function hideSkeleton(section) {
    var map = {
      shader:    document.getElementById('shader-skeleton'),
      chart:     document.getElementById('chart-skeleton'),
      downloads: document.querySelectorAll('.downloads-skeleton'),
      presets:   document.querySelectorAll('.preset-skeleton'),
      shares:    document.getElementById('share-skeleton'),
      sessions:  document.getElementById('sessions-skeleton'),
      history:   document.querySelectorAll('.history-skeleton'),
    };
    var el = map[section];
    if (!el) return;
    if (Symbol.iterator in Object(el)) {
      el.forEach(function (e) { if (e) e.classList.remove('show'); });
    } else {
      el.classList.remove('show');
    }
  }

  function showAlert(id, msg) {
    var successIds = ['shader-success', 'resource-success', 'profile-success', 'password-success', 'email-success', 'share-success', 'sessions-success'];
    var errorIds = ['shader-error', 'resource-error', 'profile-error', 'password-error', 'email-error', 'share-error', 'sessions-error'];

    [].concat(successIds).concat(errorIds).forEach(function (sid) {
      var el = document.getElementById(sid);
      if (el) el.style.display = 'none';
    });

    var el = document.getElementById(id);
    if (el) {
      el.textContent = msg;
      el.className = 'alert ' + (successIds.indexOf(id) !== -1 ? 'alert-success' : 'alert-error');
      el.style.display = 'flex';
      setTimeout(function () { el.style.display = 'none'; }, 5000);
    }
  }

  function logout() {
    // 调用服务器端 logout 接口清除 httpOnly Cookie
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .then(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      })
      .catch(() => {
        // 即使 API 调用失败，也清除本地状态并跳转
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
      });
  }

  window.toast = toast;
  window.showSkeleton = showSkeleton;
  window.hideSkeleton = hideSkeleton;
  window.showAlert = showAlert;
  window.logout = logout;
})();

// public/js/admin/admin-utils.js
(function () {
  'use strict';

  // ── 常量 ──────────────────────────────────────────────
  const ROLES = Object.freeze(['user', 'admin', 'superadmin']);
  const ACTIONS = Object.freeze(['suspend', 'unsuspend', 'ban']);
  const STATUSES = Object.freeze(['active', 'suspended', 'banned']);
  const ANNOUNCEMENT_TYPES = Object.freeze(['info', 'success', 'warning', 'error', 'feature', 'maintenance']);

  // ── 安全转义 ──────────────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function sanitizeRich(html) {
    if (!html) return '';
    // 富文本：只允许少量安全标签，净化 XSS
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
    });
  }

  // ── debounce 工厂 ────────────────────────────────────
  function createDebounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── 工具函数 ──────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
  }

  window.AdminUtils = { esc, sanitizeRich, createDebounce, formatDate, getCsrfToken, ROLES, ACTIONS, STATUSES, ANNOUNCEMENT_TYPES };
})();

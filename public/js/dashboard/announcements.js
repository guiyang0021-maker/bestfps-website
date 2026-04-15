/**
 * Dashboard JS — 公告模块
 */
(function () {
  'use strict';

  async function loadAnnouncements() {
    try {
      var data = await window.api('GET', '/announcements');
      renderAnnouncements(data.announcements || []);
    } catch (err) {
      console.error('Load announcements error:', err);
    }
  }

  function renderAnnouncements(announcements) {
    var container = document.getElementById('announcement-banners');
    container.innerHTML = '';
    announcements.forEach(function (a) {
      if (a.dismissed) return;
      var banner = document.createElement('div');
      banner.className = 'announcement-banner announcement-banner--' + (a.type || 'info');
      var textSpan = document.createElement('span');
      textSpan.className = 'announcement-banner__text';
      var titleText = document.createTextNode(a.title ? a.title + ': ' : '');
      textSpan.appendChild(titleText);
      var contentSpan = document.createElement('span');
      contentSpan.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(a.content || '', {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre'],
        ALLOWED_ATTR: ['href', 'target'],
      }) : (a.content || '');
      textSpan.appendChild(contentSpan);
      banner.appendChild(textSpan);
      var closeBtn = document.createElement('button');
      closeBtn.className = 'announcement-banner__close';
      closeBtn.setAttribute('aria-label', '关闭');
      closeBtn.onclick = function() { dismissAnnouncement(a.id, closeBtn); };
      closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
      banner.appendChild(closeBtn);
      container.appendChild(banner);
    });
  }

  async function dismissAnnouncement(id, btn) {
    try {
      await window.api('POST', '/announcements/' + id + '/dismiss');
      btn.closest('.announcement-banner').remove();
    } catch (err) {
      console.error('Dismiss error:', err);
    }
  }

  window.loadAnnouncements = loadAnnouncements;
  window.renderAnnouncements = renderAnnouncements;
  window.dismissAnnouncement = dismissAnnouncement;
})();

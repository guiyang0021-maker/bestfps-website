/**
 * Dashboard JS — 活动动态模块
 */
(function () {
  'use strict';

  async function loadActivities() {
    try {
      var skeleton = document.getElementById('activity-feed-skeleton');
      var list = document.getElementById('activity-feed-list');
      var empty = document.getElementById('activity-feed-empty');
      if (skeleton) skeleton.style.display = 'flex';
      var data = await window.api('GET', '/auth/activities?limit=10').catch(function () { return { activities: [] }; });
      if (skeleton) skeleton.style.display = 'none';
      renderActivities(data.activities || []);
    } catch (err) {
      console.error('Load activities error:', err);
    }
  }

  function renderActivities(activities) {
    var list = document.getElementById('activity-feed-list');
    var empty = document.getElementById('activity-feed-empty');
    if (!list) return;
    list.innerHTML = '';
    if (activities.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    var iconMap = {
      preset_create: { icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>', color: '#34c759' },
      preset_update: { icon: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>', color: '#0071e3' },
      preset_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: '#ff3b30' },
      preset_apply: { icon: '<polyline points="20 6 9 17 4 12"/>', color: '#34c759' },
      preset_default: { icon: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>', color: '#ff9500' },
      share_create: { icon: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>', color: '#5856d6' },
      share_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: '#ff3b30' },
      settings_export: { icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>', color: '#0071e3' },
      settings_import: { icon: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>', color: '#34c759' },
      settings_snapshot: { icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', color: '#ff9500' },
      settings_restore: { icon: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3"/>', color: '#5856d6' },
      settings_snapshot_delete: { icon: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>', color: '#ff3b30' },
      login: { icon: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>', color: '#34c759' },
    };

    var defaultIcon = { icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', color: '#8e8e93' };

    activities.forEach(function (a) {
      var meta = iconMap[a.event_type] || defaultIcon;
      var timeAgo = getTimeAgo(new Date(a.created_at));
      var item = document.createElement('div');
      item.className = 'activity-item';
      item.innerHTML = [
        '<div class="activity-item__icon" style="background: ' + meta.color + '1a; color: ' + meta.color + ';">',
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' + meta.icon + '</svg>',
        '</div>',
        '<div class="activity-item__content">',
          '<span class="activity-item__desc">' + a.description + '</span>',
          '<span class="activity-item__time">' + timeAgo + '</span>',
        '</div>',
      ].join('');
      list.appendChild(item);
    });
  }

  function getTimeAgo(date) {
    var seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return '刚刚';
    var minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + ' 分钟前';
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours + ' 小时前';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' 天前';
    return date.toLocaleDateString('zh-CN');
  }

  window.loadActivities = loadActivities;
  window.renderActivities = renderActivities;
  window.getTimeAgo = getTimeAgo;
})();

/**
 * Dashboard JS — 全局搜索模块
 */
(function () {
  'use strict';

  var searchTimeout = null;

  async function handleGlobalSearch(query) {
    var results = document.getElementById('global-search-results');
    if (!query || query.trim().length < 1) {
      results.style.display = 'none';
      results.innerHTML = '';
      return;
    }
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async function () {
      try {
        var presets = await window.api('GET', '/presets?name=' + encodeURIComponent(query)).catch(function () { return { presets: [] }; });
        var shares = await window.api('GET', '/share?name=' + encodeURIComponent(query)).catch(function () { return { shares: [] }; });
        var matchedPresets = (presets.presets || []).filter(function (p) { return p.name.toLowerCase().includes(query.toLowerCase()); });
        var matchedShares = (shares.shares || []).filter(function (s) { return !s.is_expired && s.name.toLowerCase().includes(query.toLowerCase()); });

        if (matchedPresets.length === 0 && matchedShares.length === 0) {
          results.innerHTML = '<div class="sidebar-search__no-results">没有找到匹配的结果</div>';
        } else {
          var html = '';
          if (matchedPresets.length > 0) {
            html += '<div class="sidebar-search__group"><div class="sidebar-search__group-label">预设</div>';
            matchedPresets.forEach(function (p) {
              html += '<a class="sidebar-search__result-item" href="#" onclick="event.preventDefault(); showSection(\'presets\'); applyPreset(' + p.id + '); document.getElementById(\'global-search\').value=\'\'; document.getElementById(\'global-search-results\').style.display=\'none\';">' + p.name + '</a>';
            });
            html += '</div>';
          }
          if (matchedShares.length > 0) {
            html += '<div class="sidebar-search__group"><div class="sidebar-search__group-label">分享链接</div>';
            matchedShares.forEach(function (s) {
              html += '<a class="sidebar-search__result-item" href="#" onclick="event.preventDefault(); showSection(\'share\'); copyShareLink(\'' + s.token + '\'); document.getElementById(\'global-search\').value=\'\'; document.getElementById(\'global-search-results\').style.display=\'none\';">' + s.name + '</a>';
            });
            html += '</div>';
          }
          results.innerHTML = html;
        }
        results.style.display = 'flex';
      } catch (err) {
        console.error('Search error:', err);
      }
    }, 300);
  }

  window.handleGlobalSearch = handleGlobalSearch;
})();

/**
 * Dashboard JS — 全局搜索模块
 */
(function () {
  'use strict';

  var searchTimeout = null;
  var searchInput = null;
  var resultsEl = null;

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function clearSearchUi() {
    if (!searchInput || !resultsEl) return;
    searchInput.value = '';
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
  }

  async function handleGlobalSearch(query) {
    var results = resultsEl || document.getElementById('global-search-results');
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
              html += '<a class="sidebar-search__result-item" href="#" data-search-type="preset" data-preset-id="' + p.id + '">' + escapeHtml(p.name) + '</a>';
            });
            html += '</div>';
          }
          if (matchedShares.length > 0) {
            html += '<div class="sidebar-search__group"><div class="sidebar-search__group-label">分享链接</div>';
            matchedShares.forEach(function (s) {
              html += '<a class="sidebar-search__result-item" href="#" data-search-type="share" data-share-token="' + s.token + '">' + escapeHtml(s.name) + '</a>';
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

  function initSearch() {
    searchInput = document.getElementById('global-search');
    resultsEl = document.getElementById('global-search-results');
    if (!searchInput || !resultsEl) return;

    searchInput.addEventListener('input', function (event) {
      handleGlobalSearch(event.target.value);
    });

    resultsEl.addEventListener('click', function (event) {
      var link = event.target.closest('[data-search-type]');
      if (!link) return;
      event.preventDefault();

      var type = link.dataset.searchType;
      if (type === 'preset') {
        if (typeof showSection === 'function') showSection('presets');
        if (typeof applyPreset === 'function') applyPreset(link.dataset.presetId);
      } else if (type === 'share') {
        if (typeof showSection === 'function') showSection('share');
        if (typeof copyShareLink === 'function') copyShareLink(link.dataset.shareToken);
      }

      clearSearchUi();
    });
  }

  window.handleGlobalSearch = handleGlobalSearch;
  window.initSearch = initSearch;
})();

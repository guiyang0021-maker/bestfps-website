/**
 * Dashboard JS — 下载记录模块
 */
(function () {
  'use strict';

  async function loadDownloads() {
    try {
      window.showSkeleton('downloads');
      var data = await window.api('GET', '/downloads');
      var tbody = document.getElementById('downloads-body');
      var table = document.getElementById('downloads-table');
      var empty = document.getElementById('downloads-empty');
      tbody.querySelectorAll('.downloads-skeleton').forEach(function (r) { r.remove(); });
      tbody.innerHTML = '';
      if (!data.downloads || data.downloads.length === 0) {
        table.style.display = 'none';
        empty.style.display = 'flex';
        return;
      }
      empty.style.display = 'none';
      table.style.display = 'table';
      data.downloads.forEach(function (dl) {
        var tr = document.createElement('tr');
        tr.innerHTML = [
          '<td>' + dl.version + '</td>',
          '<td><span class="os-badge os-' + dl.os + '">' + dl.os + '</span></td>',
          '<td>' + new Date(dl.downloaded_at).toLocaleString('zh-CN') + '</td>',
        ].join('');
        tbody.appendChild(tr);
      });
    } catch (err) {
      console.error('Load downloads error:', err);
    } finally {
      window.hideSkeleton('downloads');
    }
  }

  window.loadDownloads = loadDownloads;
})();

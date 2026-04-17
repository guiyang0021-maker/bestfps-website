/**
 * Dashboard JS — 登录历史模块
 */
(function () {
  'use strict';

  var currentPage = 1;
  var currentTotalPages = 1;

  async function loadHistory(page) {
    if (page === undefined) page = 1;
    currentPage = page;
    window.dashboardHistoryPage = currentPage;
    try {
      window.showSkeleton('history');
      var data = await window.api('GET', '/auth/login-history?page=' + page + '&limit=20');
      window.hideSkeleton('history');
      renderHistory(data.history || [], data.total || 0, data.page || 1, data.totalPages || 1);
    } catch (err) {
      window.hideSkeleton('history');
      console.error('Load history error:', err);
    }
  }

  function renderHistory(history, total, page, totalPages) {
    var tbody = document.getElementById('history-body');
    var table = document.getElementById('history-table');
    var empty = document.getElementById('history-empty');
    var pagination = document.getElementById('history-pagination');
    var SafeDom = window.SafeDom;
    var setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };

    currentPage = page;
    currentTotalPages = totalPages;
    window.dashboardHistoryPage = currentPage;
    window.dashboardHistoryTotalPages = currentTotalPages;

    tbody.innerHTML = '';
    if (history.length === 0) {
      table.style.display = 'none';
      empty.style.display = 'flex';
      pagination.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    table.style.display = 'table';
    pagination.style.display = 'flex';
    document.getElementById('history-page-info').textContent = '第 ' + page + ' / ' + totalPages + ' 页，共 ' + total + ' 条';

    history.forEach(function (h) {
      var tr = document.createElement('tr');

      var tdTime = document.createElement('td');
      setText(tdTime, new Date(h.created_at).toLocaleString('zh-CN'));
      tr.appendChild(tdTime);

      var tdIp = document.createElement('td');
      var code = document.createElement('code');
      code.style.fontSize = '0.8125rem';
      setText(code, h.ip || '—');
      tdIp.appendChild(code);
      tr.appendChild(tdIp);

      var tdDevice = document.createElement('td');
      var deviceSpan = document.createElement('span');
      deviceSpan.className = 'device-badge';
      setText(deviceSpan, h.device_type || '未知');
      tdDevice.appendChild(deviceSpan);
      tr.appendChild(tdDevice);

      var tdBrowser = document.createElement('td');
      setText(tdBrowser, h.browser || '未知');
      tr.appendChild(tdBrowser);

      var tdOs = document.createElement('td');
      setText(tdOs, h.os || '未知');
      tr.appendChild(tdOs);

      var tdStatus = document.createElement('td');
      var statusSpan = document.createElement('span');
      statusSpan.className = 'status-badge ' + (h.success ? 'status-badge--success' : 'status-badge--error');
      setText(statusSpan, h.success ? '成功' : '失败');
      tdStatus.appendChild(statusSpan);
      tr.appendChild(tdStatus);

      tbody.appendChild(tr);
    });

    document.getElementById('history-prev').disabled = page <= 1;
    document.getElementById('history-next').disabled = page >= totalPages;
  }

  window.loadHistory = loadHistory;
  window.renderHistory = renderHistory;
  window.getDashboardHistoryPage = function () { return currentPage; };
  window.getDashboardHistoryTotalPages = function () { return currentTotalPages; };
})();

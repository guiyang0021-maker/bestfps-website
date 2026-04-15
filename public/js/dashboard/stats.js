/**
 * Dashboard JS — 统计数据模块
 */
(function () {
  'use strict';

  var downloadsChart = null;

  async function loadStats() {
    try {
      window.showSkeleton('chart');
      var profileData = await window.api('GET', '/auth/profile').catch(function () { return {}; });
      var downloadsData = await window.api('GET', '/downloads').catch(function () { return { downloads: [] }; });
      var presetsData = await window.api('GET', '/presets').catch(function () { return { presets: [] }; });
      var sharesData = await window.api('GET', '/share').catch(function () { return { shares: [] }; });

      document.getElementById('stat-downloads').textContent = downloadsData.downloads ? downloadsData.downloads.length : '0';
      document.getElementById('stat-presets').textContent = presetsData.presets ? presetsData.presets.length : '0';
      document.getElementById('stat-shares').textContent = sharesData.shares ? sharesData.shares.filter(function (s) { return !s.is_expired; }).length : '0';

      var user = JSON.parse(localStorage.getItem('user') || 'null');
      if (user && user.created_at) {
        var days = Math.floor((Date.now() - new Date(user.created_at)) / 86400000);
        document.getElementById('stat-days').textContent = days + '天';
      }

      renderDownloadChart(downloadsData.downloads || []);
      window.hideSkeleton('chart');
    } catch (err) {
      window.hideSkeleton('chart');
      console.error('Load stats error:', err);
    }
  }

  function renderDownloadChart(downloads) {
    var ctx = document.getElementById('downloads-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (downloadsChart) { try { downloadsChart.destroy(); } catch (e) {} }

    var last30 = downloads.slice(0, 30).reverse();
    var labels = last30.map(function (d) { return new Date(d.downloaded_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }); });
    var counts = last30.map(function () { return 1; });

    downloadsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '下载次数',
          data: counts,
          borderColor: '#0071e3',
          backgroundColor: 'rgba(0,113,227,0.08)',
          fill: true,
          tension: 0.4,
          pointRadius: 3,
          pointBackgroundColor: '#0071e3',
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxTicksLimit: 7, color: 'var(--text-secondary)', font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1, color: 'var(--text-secondary)', font: { size: 11 } },
            grid: { color: 'var(--border-light)' },
          },
        },
      },
    });
  }

  window.loadStats = loadStats;
  window.renderDownloadChart = renderDownloadChart;
})();

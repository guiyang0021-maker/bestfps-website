/**
 * Dashboard JS — 统计数据模块
 */
(function () {
  'use strict';

  var downloadsChart = null;

  function getChartSeries(downloads) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var days = [];
    var countsByDay = {};
    for (var i = 29; i >= 0; i--) {
      var date = new Date(today);
      date.setDate(today.getDate() - i);
      var key = date.toISOString().slice(0, 10);
      countsByDay[key] = 0;
      days.push({ key: key, date: date });
    }

    downloads.forEach(function (download) {
      if (!download || !download.downloaded_at) return;
      var date = new Date(download.downloaded_at);
      if (isNaN(date.getTime())) return;
      date.setHours(0, 0, 0, 0);
      var key = date.toISOString().slice(0, 10);
      if (Object.prototype.hasOwnProperty.call(countsByDay, key)) {
        countsByDay[key] += 1;
      }
    });

    return {
      labels: days.map(function (day) {
        return day.date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      }),
      counts: days.map(function (day) {
        return countsByDay[day.key];
      }),
      days: days,
    };
  }

  function updateChartDescription(series) {
    var desc = document.getElementById('downloads-chart-description');
    if (!desc) return;

    var total = series.counts.reduce(function (sum, count) { return sum + count; }, 0);
    if (!total) {
      desc.textContent = '最近 30 天下载趋势图，暂无下载记录。';
      return;
    }

    var peakCount = Math.max.apply(null, series.counts);
    var peakIndex = series.counts.indexOf(peakCount);
    var peakLabel = peakIndex >= 0 ? series.labels[peakIndex] : '';
    var recent7 = series.counts.slice(-7).join('、');
    desc.textContent = '最近 30 天下载趋势图，总下载 ' + total + ' 次；最近 7 天每日下载分别为 ' + recent7 + '；峰值出现在 ' + peakLabel + '，为 ' + peakCount + ' 次。';
  }

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

      var user = window.currentUser || null;
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

    var series = getChartSeries(downloads);
    updateChartDescription(series);

    downloadsChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: series.labels,
        datasets: [{
          label: '下载次数',
          data: series.counts,
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

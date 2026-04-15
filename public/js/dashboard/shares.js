/**
 * Dashboard JS — 分享模块
 */
(function () {
  'use strict';

  async function loadShares() {
    try {
      window.showSkeleton('shares');
      var data = await window.api('GET', '/share');
      window.hideSkeleton('shares');
      renderShares(data.shares || []);
    } catch (err) {
      window.hideSkeleton('shares');
      console.error('Load shares error:', err);
    }
  }

  function renderShares(shares) {
    var list = document.getElementById('share-list');
    var empty = document.getElementById('share-empty');
    list.innerHTML = '';
    var active = shares.filter(function (s) { return !s.is_expired; });
    if (active.length === 0) {
      empty.style.display = 'flex';
      list.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    list.style.display = 'flex';
    active.forEach(function (s) {
      var item = document.createElement('div');
      item.className = 'share-item';
      item.innerHTML = [
        '<div class="share-item__info">',
          '<strong>' + s.name + '</strong>',
          '<span>' + (s.description || '无描述') + ' · ' + new Date(s.created_at).toLocaleDateString('zh-CN') + '</span>',
        '</div>',
        '<div class="share-item__actions">',
          '<button class="btn btn-secondary btn-sm" onclick="copyShareLink(\'' + s.token + '\')">复制链接</button>',
          '<button class="btn btn-ghost btn-sm" onclick="deleteShare(\'' + s.token + '\')" style="color:var(--error);">删除</button>',
        '</div>',
      ].join('');
      list.appendChild(item);
    });
  }

  async function createShare() {
    var name = document.getElementById('share-name').value.trim();
    if (!name) return window.toast('请输入分享名称', 'error');

    try {
      var settings = window.collectSettingsFromUI();
      var data = await window.api('POST', '/share', {
        name: name,
        description: document.getElementById('share-desc').value.trim(),
        shader_settings: settings.shader_settings,
        resource_packs: settings.resource_packs,
      });
      navigator.clipboard.writeText(window.location.origin + data.url);
      window.toast('分享链接已生成并复制到剪贴板！', 'success');
      document.getElementById('share-name').value = '';
      document.getElementById('share-desc').value = '';
      await loadShares();
      await window.loadStats();
    } catch (err) {
      window.toast(err.message, 'error');
    }
  }

  function copyShareLink(token) {
    navigator.clipboard.writeText(window.location.origin + '/share/' + token);
    window.toast('链接已复制到剪贴板', 'success');
  }

  async function deleteShare(token) {
    if (!confirm('确定要删除这个分享链接吗？')) return;
    try {
      await window.api('DELETE', '/share/' + token);
      await loadShares();
      await window.loadStats();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  window.loadShares = loadShares;
  window.renderShares = renderShares;
  window.createShare = createShare;
  window.copyShareLink = copyShareLink;
  window.deleteShare = deleteShare;
})();

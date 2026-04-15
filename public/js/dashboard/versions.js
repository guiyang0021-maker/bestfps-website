/**
 * Dashboard JS — 版本历史（快照）模块
 */
(function () {
  'use strict';

  async function loadVersions() {
    try {
      var skeleton = document.getElementById('versions-skeleton');
      var list = document.getElementById('versions-list');
      var empty = document.getElementById('versions-empty');
      if (skeleton) skeleton.style.display = 'flex';
      var data = await window.api('GET', '/settings/versions');
      if (skeleton) skeleton.style.display = 'none';
      renderVersions(data.versions || []);
    } catch (err) {
      if (skeleton) skeleton.style.display = 'none';
      console.error('Load versions error:', err);
    }
  }

  function renderVersions(versions) {
    var list = document.getElementById('versions-list');
    var empty = document.getElementById('versions-empty');
    if (!list) return;
    var skeleton = document.getElementById('versions-skeleton');
    if (skeleton) skeleton.style.display = 'none';
    list.querySelectorAll('.version-item').forEach(function (el) { el.remove(); });

    if (versions.length === 0) {
      if (empty) empty.style.display = 'flex';
      return;
    }
    if (empty) empty.style.display = 'none';

    versions.forEach(function (v) {
      var item = document.createElement('div');
      item.className = 'version-item';
      item.innerHTML = [
        '<div class="version-item__info">',
          '<strong class="version-item__name">' + v.name + '</strong>',
          '<span class="version-item__time">' + new Date(v.created_at).toLocaleString('zh-CN') + '</span>',
        '</div>',
        '<div class="version-item__actions">',
          '<button class="btn btn-primary btn-sm" onclick="restoreVersion(' + v.id + ')">恢复</button>',
          '<button class="btn btn-ghost btn-sm" onclick="deleteVersion(' + v.id + ')" style="color:var(--error);">删除</button>',
        '</div>',
      ].join('');
      list.appendChild(item);
    });
  }

  function showSaveSnapshotModal() {
    document.getElementById('snapshot-modal').classList.add('active');
    document.getElementById('snapshot-name').focus();
  }

  function closeSnapshotModal() {
    document.getElementById('snapshot-modal').classList.remove('active');
    document.getElementById('snapshot-name').value = '';
  }

  async function saveSnapshot() {
    var name = (document.getElementById('snapshot-name').value.trim() || '手动保存');
    if (name.length > 50) {
      window.toast('快照名称不能超过 50 个字符', 'error');
      return;
    }
    try {
      await window.api('POST', '/settings/versions', { name: name });
      closeSnapshotModal();
      window.toast('快照已保存', 'success');
      await loadVersions();
    } catch (err) {
      window.toast('保存失败: ' + err.message, 'error');
    }
  }

  async function restoreVersion(id) {
    if (!confirm('确定要恢复到该版本吗？当前配置将被覆盖。')) return;
    try {
      await window.api('POST', '/settings/versions/' + id + '/restore');
      await window.pullFromServer();
      window.toast('已恢复到指定版本', 'success');
    } catch (err) {
      window.toast('恢复失败: ' + err.message, 'error');
    }
  }

  async function deleteVersion(id) {
    if (!confirm('确定要删除这个快照吗？')) return;
    try {
      await window.api('DELETE', '/settings/versions/' + id);
      window.toast('快照已删除', 'success');
      await loadVersions();
    } catch (err) {
      window.toast('删除失败: ' + err.message, 'error');
    }
  }

  window.loadVersions = loadVersions;
  window.renderVersions = renderVersions;
  window.showSaveSnapshotModal = showSaveSnapshotModal;
  window.closeSnapshotModal = closeSnapshotModal;
  window.saveSnapshot = saveSnapshot;
  window.restoreVersion = restoreVersion;
  window.deleteVersion = deleteVersion;
})();

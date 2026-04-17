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
    var SafeDom = window.SafeDom;
    var setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };
    var sanitize = SafeDom && SafeDom.sanitize ? SafeDom.sanitize : function(val) { return val == null ? '' : String(val); };
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

      var infoDiv = document.createElement('div');
      infoDiv.className = 'version-item__info';

      var strong = document.createElement('strong');
      strong.className = 'version-item__name';
      setText(strong, sanitize(v.name));
      infoDiv.appendChild(strong);

      var timeSpan = document.createElement('span');
      timeSpan.className = 'version-item__time';
      setText(timeSpan, new Date(v.created_at).toLocaleString('zh-CN'));
      infoDiv.appendChild(timeSpan);

      item.appendChild(infoDiv);

      var actionsDiv = document.createElement('div');
      actionsDiv.className = 'version-item__actions';

      var restoreBtn = document.createElement('button');
      restoreBtn.className = 'btn btn-primary btn-sm';
      restoreBtn.type = 'button';
      restoreBtn.dataset.versionAction = 'restore';
      restoreBtn.dataset.versionId = v.id;
      setText(restoreBtn, '恢复');
      actionsDiv.appendChild(restoreBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-ghost btn-sm';
      deleteBtn.type = 'button';
      deleteBtn.dataset.versionAction = 'delete';
      deleteBtn.dataset.versionId = v.id;
      deleteBtn.style.cssText = 'color:var(--error);';
      setText(deleteBtn, '删除');
      actionsDiv.appendChild(deleteBtn);

      item.appendChild(actionsDiv);
      list.appendChild(item);
    });
  }

  function bindVersionActions() {
    var list = document.getElementById('versions-list');
    if (!list || list.dataset.bound === 'true') return;
    list.dataset.bound = 'true';
    list.addEventListener('click', function (event) {
      var button = event.target.closest('[data-version-action]');
      if (!button) return;
      var id = parseInt(button.getAttribute('data-version-id'), 10);
      var action = button.getAttribute('data-version-action');
      if (!id) return;
      if (action === 'restore') restoreVersion(id);
      if (action === 'delete') deleteVersion(id);
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
  bindVersionActions();
})();

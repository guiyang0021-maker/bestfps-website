/**
 * Dashboard JS — 同步与配置模块
 */
(function () {
  'use strict';

  async function pullFromServer() {
    try {
      window.showSkeleton('shader');
      var data = await window.api('GET', '/sync/pull');
      window.hideSkeleton('shader');
      loadSettingsToUI(data);
      updateSyncStatus(true);
    } catch (err) {
      window.hideSkeleton('shader');
      console.error('Pull error:', err);
    }
  }

  function loadSettingsToUI(data) {
    var ss = data.shader_settings || {};
    function set(id, val, isCheckbox) {
      var el = document.getElementById(id);
      if (!el) return;
      if (isCheckbox) {
        el.checked = val !== undefined ? val : el.checked;
      } else {
        if (val !== undefined) {
          el.value = val;
          var display = el.nextElementSibling;
          if (display) display.textContent = val + (id.includes('distance') ? ' ch' : '%');
        }
      }
    }
    set('shader-dynamic-light', ss.dynamic_light, true);
    set('shader-smooth-light', ss.smooth_light, true);
    set('shader-clouds', ss.clouds, true);
    set('shader-particles', ss.particles, false);
    set('shader-view-distance', ss.view_distance, false);

    loadResourceList(data.resource_packs || []);
  }

  function collectSettingsFromUI() {
    var shader_settings = {
      dynamic_light: document.getElementById('shader-dynamic-light').checked,
      smooth_light: document.getElementById('shader-smooth-light').checked,
      clouds: document.getElementById('shader-clouds').checked,
      particles: parseInt(document.getElementById('shader-particles').value),
      view_distance: parseInt(document.getElementById('shader-view-distance').value),
    };
    var packs = [];
    document.querySelectorAll('#resource-list .resource-item').forEach(function (item) {
      var name = item.querySelector('.resource-name').textContent.trim();
      var on = item.querySelector('.toggle input').checked;
      packs.push({ name: name, enabled: on });
    });
    return { shader_settings: shader_settings, resource_packs: packs };
  }

  async function pushToServer() {
    try {
      var settings = collectSettingsFromUI();
      await window.api('POST', '/sync/push', settings);
      updateSyncStatus(true);
      window.toast('配置已同步到服务器', 'success');
    } catch (err) {
      window.toast('同步失败: ' + err.message, 'error');
    }
  }

  function updateSyncStatus(synced) {
    var dot = document.getElementById('sync-dot');
    var text = document.getElementById('sync-text');
    if (dot) dot.classList.toggle('stale', !synced);
    if (text) text.textContent = synced ? '已同步' : '未同步';
  }

  // ---- Resource list ----
  function loadResourceList(packs) {
    var list = document.getElementById('resource-list');
    var empty = document.getElementById('resource-empty');
    list.innerHTML = '';
    if (!packs || packs.length === 0) {
      empty.style.display = 'flex';
      return;
    }
    empty.style.display = 'none';
    packs.forEach(function (pack) { list.appendChild(createResourceItem(pack.name, pack.enabled)); });
  }

  function createResourceItem(name, enabled) {
    enabled = enabled !== undefined ? enabled : true;
    var item = document.createElement('div');
    item.className = 'resource-item';
    item.innerHTML = [
      '<div class="resource-icon">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>',
      '</div>',
      '<span class="resource-name">' + name + '</span>',
      '<label class="toggle" title="启用/禁用">',
        '<input type="checkbox" ' + (enabled ? 'checked' : '') + ' />',
        '<span class="toggle-slider"></span>',
      '</label>',
      '<button class="resource-remove" onclick="this.closest(\'.resource-item\').remove()" title="移除">',
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      '</button>',
    ].join('');
    return item;
  }

  function addResource() {
    var name = prompt('输入资源包名称：');
    if (name && name.trim()) {
      document.getElementById('resource-list').appendChild(createResourceItem(name.trim(), true));
      document.getElementById('resource-empty').style.display = 'none';
    }
  }

  window.pullFromServer = pullFromServer;
  window.loadSettingsToUI = loadSettingsToUI;
  window.collectSettingsFromUI = collectSettingsFromUI;
  window.pushToServer = pushToServer;
  window.updateSyncStatus = updateSyncStatus;
  window.loadResourceList = loadResourceList;
  window.createResourceItem = createResourceItem;
  window.addResource = addResource;
})();

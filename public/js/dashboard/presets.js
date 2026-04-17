/**
 * Dashboard JS — 预设管理模块
 */
(function () {
  'use strict';

  async function loadPresets() {
    try {
      window.showSkeleton('presets');
      var data = await window.api('GET', '/presets');
      window.hideSkeleton('presets');
      renderPresets(data.presets || []);
    } catch (err) {
      window.hideSkeleton('presets');
      console.error('Load presets error:', err);
    }
  }

  function renderPresets(presets) {
    var grid = document.getElementById('presets-grid');
    var empty = document.getElementById('presets-empty');
    var SafeDom = window.SafeDom;
    var setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };
    grid.innerHTML = '';
    if (presets.length === 0) {
      empty.style.display = 'flex';
      grid.style.display = 'none';
      return;
    }
    empty.style.display = 'none';
    grid.style.display = 'grid';
    presets.forEach(function (p) {
      var card = document.createElement('div');
      card.className = 'preset-card' + (p.is_default ? ' preset-card--default' : '');

      var header = document.createElement('div');
      header.className = 'preset-card__header';

      var nameDiv = document.createElement('div');
      nameDiv.className = 'preset-card__name';
      setText(nameDiv, p.name);
      header.appendChild(nameDiv);

      if (p.is_default) {
        var badge = document.createElement('span');
        badge.className = 'preset-card__badge';
        setText(badge, '默认');
        header.appendChild(badge);
      }
      card.appendChild(header);

      var descP = document.createElement('p');
      descP.className = 'preset-card__desc';
      setText(descP, p.description || '无描述');
      card.appendChild(descP);

      var meta = document.createElement('div');
      meta.className = 'preset-card__meta';
      var metaSpan = document.createElement('span');
      setText(metaSpan, new Date(p.created_at).toLocaleDateString('zh-CN'));
      meta.appendChild(metaSpan);
      card.appendChild(meta);

      var actions = document.createElement('div');
      actions.className = 'preset-card__actions';

      var applyBtn = document.createElement('button');
      applyBtn.className = 'btn btn-primary btn-sm';
      applyBtn.type = 'button';
      applyBtn.dataset.presetAction = 'apply';
      applyBtn.dataset.presetId = p.id;
      setText(applyBtn, '应用');
      actions.appendChild(applyBtn);

      if (!p.is_default) {
        var defaultBtn = document.createElement('button');
        defaultBtn.className = 'btn btn-secondary btn-sm';
        defaultBtn.type = 'button';
        defaultBtn.dataset.presetAction = 'default';
        defaultBtn.dataset.presetId = p.id;
        setText(defaultBtn, '设为默认');
        actions.appendChild(defaultBtn);
      }

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'btn btn-ghost btn-sm';
      deleteBtn.type = 'button';
      deleteBtn.dataset.presetAction = 'delete';
      deleteBtn.dataset.presetId = p.id;
      deleteBtn.style.cssText = 'color:var(--error);';
      setText(deleteBtn, '删除');
      actions.appendChild(deleteBtn);

      card.appendChild(actions);
      grid.appendChild(card);
    });
  }

  function bindPresetActions() {
    var grid = document.getElementById('presets-grid');
    if (!grid || grid.dataset.bound === 'true') return;
    grid.dataset.bound = 'true';
    grid.addEventListener('click', function (event) {
      var button = event.target.closest('[data-preset-action]');
      if (!button) return;
      var id = parseInt(button.getAttribute('data-preset-id'), 10);
      var action = button.getAttribute('data-preset-action');
      if (!id) return;
      if (action === 'apply') applyPreset(id);
      if (action === 'default') setDefaultPreset(id);
      if (action === 'delete') deletePreset(id);
    });
  }

  function showNewPresetModal() {
    document.getElementById('preset-modal').classList.add('active');
    document.getElementById('preset-name').focus();
    // Update the preset preview with current settings
    updatePresetPreview();
  }

  function updatePresetPreview() {
    // Get shader settings from UI
    var settings = window.collectSettingsFromUI();
    var shaderItems = document.getElementById('preset-preview-shader');
    var packItems = document.getElementById('preset-preview-packs');
    var SafeDom = window.SafeDom;
    var setText = SafeDom && SafeDom.setText ? SafeDom.setText : function(el, val) { el.textContent = val || ''; };
    if (!shaderItems || !packItems) return;

    // Render shader settings
    var ss = settings.shader_settings || {};
    shaderItems.innerHTML = '';
    if (ss.dynamic_light) {
      var dl = document.createElement('span');
      dl.className = 'preset-preview__item enabled';
      setText(dl, '动态光照 ✓');
      shaderItems.appendChild(dl);
    }
    if (ss.smooth_light) {
      var sl = document.createElement('span');
      sl.className = 'preset-preview__item enabled';
      setText(sl, '平滑光照 ✓');
      shaderItems.appendChild(sl);
    }
    if (ss.clouds) {
      var cl = document.createElement('span');
      cl.className = 'preset-preview__item enabled';
      setText(cl, '云彩渲染 ✓');
      shaderItems.appendChild(cl);
    }
    var part = document.createElement('span');
    part.className = 'preset-preview__item';
    setText(part, '粒子 ' + (ss.particles || 0) + '%');
    shaderItems.appendChild(part);
    var dist = document.createElement('span');
    dist.className = 'preset-preview__item';
    setText(dist, '距离 ' + (ss.view_distance || 12) + ' ch');
    shaderItems.appendChild(dist);

    if (!shaderItems.children.length) {
      var noShader = document.createElement('span');
      noShader.className = 'preset-preview__item disabled';
      setText(noShader, '无');
      shaderItems.appendChild(noShader);
    }

    // Render resource packs
    var packs = settings.resource_packs || [];
    packItems.innerHTML = '';
    if (packs.length === 0) {
      var noPacks = document.createElement('span');
      noPacks.className = 'preset-preview__item disabled';
      setText(noPacks, '暂无');
      packItems.appendChild(noPacks);
    } else {
      packs.forEach(function(p) {
        var packSpan = document.createElement('span');
        packSpan.className = 'preset-preview__item ' + (p.enabled ? 'enabled' : 'disabled');
        setText(packSpan, p.name + (p.enabled ? ' ✓' : ''));
        packItems.appendChild(packSpan);
      });
    }
  }

  function closePresetModal() {
    document.getElementById('preset-modal').classList.remove('active');
    document.getElementById('preset-name').value = '';
    document.getElementById('preset-desc').value = '';
  }

  async function createPreset() {
    var name = document.getElementById('preset-name').value.trim();
    var description = document.getElementById('preset-desc').value.trim();
    if (!name) return;

    try {
      var settings = window.collectSettingsFromUI();
      await window.api('POST', '/presets', {
        name: name,
        description: description,
        shader_settings: settings.shader_settings,
        resource_packs: settings.resource_packs,
      });
      closePresetModal();
      await loadPresets();
    } catch (err) {
      alert('创建失败: ' + err.message);
    }
  }

  async function applyPreset(id) {
    try {
      await window.api('POST', '/presets/' + id + '/apply');
      await window.pullFromServer();
      window.toast('预设已应用', 'success');
    } catch (err) {
      window.toast('应用失败: ' + err.message, 'error');
    }
  }

  async function setDefaultPreset(id) {
    try {
      await window.api('PUT', '/presets/' + id + '/default');
      await loadPresets();
    } catch (err) {
      alert('设置失败: ' + err.message);
    }
  }

  async function deletePreset(id) {
    if (!confirm('确定要删除这个预设吗？')) return;
    try {
      await window.api('DELETE', '/presets/' + id);
      await loadPresets();
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  }

  window.loadPresets = loadPresets;
  window.renderPresets = renderPresets;
  window.showNewPresetModal = showNewPresetModal;
  window.closePresetModal = closePresetModal;
  window.createPreset = createPreset;
  window.applyPreset = applyPreset;
  window.setDefaultPreset = setDefaultPreset;
  window.deletePreset = deletePreset;
  bindPresetActions();
})();

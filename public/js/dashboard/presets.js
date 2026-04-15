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
      card.innerHTML = [
        '<div class="preset-card__header">',
          '<div class="preset-card__name">' + p.name + '</div>',
          (p.is_default ? '<span class="preset-card__badge">默认</span>' : ''),
        '</div>',
        '<p class="preset-card__desc">' + (p.description || '无描述') + '</p>',
        '<div class="preset-card__meta">',
          '<span>' + new Date(p.created_at).toLocaleDateString('zh-CN') + '</span>',
        '</div>',
        '<div class="preset-card__actions">',
          '<button class="btn btn-primary btn-sm" onclick="applyPreset(' + p.id + ')">应用</button>',
          (!p.is_default ? '<button class="btn btn-secondary btn-sm" onclick="setDefaultPreset(' + p.id + ')">设为默认</button>' : ''),
          '<button class="btn btn-ghost btn-sm" onclick="deletePreset(' + p.id + ')" style="color:var(--error);">删除</button>',
        '</div>',
      ].join('');
      grid.appendChild(card);
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
    if (!shaderItems || !packItems) return;

    // Render shader settings
    var ss = settings.shader_settings || {};
    var shaderHtml = '';
    if (ss.dynamic_light) shaderHtml += '<span class="preset-preview__item enabled">动态光照 ✓</span>';
    if (ss.smooth_light) shaderHtml += '<span class="preset-preview__item enabled">平滑光照 ✓</span>';
    if (ss.clouds) shaderHtml += '<span class="preset-preview__item enabled">云彩渲染 ✓</span>';
    shaderHtml += '<span class="preset-preview__item">粒子 ' + (ss.particles || 0) + '%</span>';
    shaderHtml += '<span class="preset-preview__item">距离 ' + (ss.view_distance || 12) + ' ch</span>';
    shaderItems.innerHTML = shaderHtml || '<span class="preset-preview__item disabled">无</span>';

    // Render resource packs
    var packs = settings.resource_packs || [];
    if (packs.length === 0) {
      packItems.innerHTML = '<span class="preset-preview__item disabled">暂无</span>';
    } else {
      var packHtml = '';
      packs.forEach(function(p) {
        packHtml += '<span class="preset-preview__item ' + (p.enabled ? 'enabled' : 'disabled') + '">' + p.name + (p.enabled ? ' ✓' : '') + '</span>';
      });
      packItems.innerHTML = packHtml;
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
})();

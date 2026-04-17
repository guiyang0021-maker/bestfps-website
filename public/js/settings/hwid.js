(function () {
  'use strict';

  const core = window.SettingsPage;
  if (!core) return;

  let lastAgentFormat = '';

  function hwidApi(method, path, body) {
    return core.requestJson('/api/hwid' + path, {
      method: method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': core.getCsrfToken(),
      },
      body: body ? JSON.stringify(body) : undefined,
    }, 'HWID 接口');
  }

  function updateBindButtonLabel(agentFormat) {
    lastAgentFormat = agentFormat || lastAgentFormat || '';
    const button = document.getElementById('hwid-bind-btn');
    if (!button) return;
    button.textContent = lastAgentFormat === 'exe' ? '下载 hwid.exe 并绑定' : '下载并绑定 HWID 工具';
  }

  async function loadHwidSection() {
    const container = document.getElementById('hwid-status-container');
    core.setContainerMessage(container, '加载中...', 'loading');

    try {
      const data = await hwidApi('GET', '/status');
      renderHwidStatus(data);
    } catch (err) {
      core.setContainerMessage(container, '加载失败：' + err.message, 'error');
    }
  }

  function renderHwidStatus(data) {
    const container = document.getElementById('hwid-status-container');
    const button = document.getElementById('hwid-bind-btn');
    if (!container || !button) return;

    const bindings = Array.isArray(data.bindings) ? data.bindings : [];
    updateBindButtonLabel(data.agent_format);

    if (!bindings.length) {
      container.innerHTML = [
        '<div style="padding:16px;border:1px solid var(--border);border-radius:12px;background:var(--surface-2);">',
        '<div style="font-size:0.9375rem;font-weight:600;margin-bottom:6px;">当前还没有绑定设备</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);">',
        '点击上方按钮后，浏览器会下载绑定工具和一次性令牌文件。运行工具后会自动把当前设备绑定到账号。',
        '</div>',
        '</div>',
      ].join('');
      return;
    }

    container.innerHTML = bindings.map(function (binding) {
      const active = binding.status === 'active';
      const lastSeen = binding.last_seen_at ? new Date(binding.last_seen_at).toLocaleString('zh-CN') : '—';
      const createdAt = binding.created_at ? new Date(binding.created_at).toLocaleString('zh-CN') : '—';
      return [
        '<div style="padding:16px 0;border-bottom:1px solid var(--border-light);">',
        '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;">',
        '<div>',
        '<div style="font-size:0.95rem;font-weight:600;">', core.escapeHtml(binding.device_name || 'Unknown Device'), '</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:4px;">',
        'HWID: ', core.escapeHtml(binding.hwid_preview || '—'), ' · ', core.escapeHtml(binding.os_name || 'Unknown OS'),
        '</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:4px;">',
        '绑定时间：', core.escapeHtml(createdAt), ' · 最近上报：', core.escapeHtml(lastSeen),
        '</div>',
        '<div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:4px;">',
        '最近 IP：', core.escapeHtml(binding.last_ip || '—'), ' · Agent：', core.escapeHtml(binding.agent_version || '—'),
        '</div>',
        '</div>',
        '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">',
        '<span class="badge ', active ? 'badge-success' : 'badge-warning', '">', active ? '已绑定' : '已解绑', '</span>',
        active
          ? '<button class="btn btn-secondary" type="button" data-hwid-revoke-id="' + core.escapeHtml(binding.id) + '" style="padding:6px 14px;font-size:0.8125rem;">解绑</button>'
          : '',
        '</div>',
        '</div>',
        '</div>',
      ].join('');
    }).join('');
  }

  async function prepareHwidBinding() {
    const button = document.getElementById('hwid-bind-btn');
    if (!button) return;

    core.hide('alert-success');
    core.hide('alert-error');
    core.hide('alert-info');
    button.disabled = true;
    button.textContent = '准备中...';

    try {
      const data = await hwidApi('POST', '/prepare');
      if (!data.agent_ready) {
        throw new Error(data.error || '服务器暂未提供 HWID 工具下载');
      }
      if (!data.agent_download_url || !data.token_file) {
        throw new Error('HWID 绑定包准备失败');
      }

      core.downloadTextFile(
        data.token_filename || 'bestfps-hwid-token.json',
        JSON.stringify(data.token_file, null, 2),
        'application/json'
      );

      const agentLink = document.createElement('a');
      agentLink.href = data.agent_download_url;
      agentLink.download = data.agent_filename || '';
      agentLink.click();

      core.show('alert-success', '✅ 已开始下载 HWID 工具和令牌文件，运行工具后会自动绑定到当前账号。');
      updateBindButtonLabel(data.agent_format);
      loadHwidSection();
    } catch (err) {
      core.show('alert-error', '❌ ' + err.message);
    }

    button.disabled = false;
    updateBindButtonLabel(lastAgentFormat);
  }

  async function revokeHwidBinding(id) {
    core.hide('alert-success');
    core.hide('alert-error');

    try {
      const data = await hwidApi('DELETE', '/bindings/' + id);
      core.show('alert-success', '✅ ' + (data.message || 'HWID 绑定已解绑'));
      loadHwidSection();
    } catch (err) {
      core.show('alert-error', '❌ ' + err.message);
    }
  }

  function init() {
    document.getElementById('hwid-bind-btn')?.addEventListener('click', prepareHwidBinding);

    const hwidContainer = document.getElementById('hwid-status-container');
    if (hwidContainer) {
      hwidContainer.addEventListener('click', function (event) {
        const button = event.target.closest('[data-hwid-revoke-id]');
        if (!button) return;
        revokeHwidBinding(button.dataset.hwidRevokeId);
      });
    }

    core.registerSectionLoader('hwid', loadHwidSection);
  }

  window.SettingsHwid = {
    init: init,
    loadHwidSection: loadHwidSection,
  };
})();

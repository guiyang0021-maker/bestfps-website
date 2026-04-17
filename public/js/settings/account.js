(function () {
  'use strict';

  const core = window.SettingsPage;
  if (!core) return;

  const api = core.api;
  const getCsrfToken = core.getCsrfToken;
  const hide = core.hide;
  const requestJson = core.requestJson;
  const setContainerMessage = core.setContainerMessage;
  const setCurrentUser = core.setCurrentUser;
  const show = core.show;

  function formatDate(value) {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('zh-CN');
  }

  async function loadProfile() {
    try {
      const data = await api('GET', '/profile');
      const profile = data.user || data;
      setCurrentUser(profile);

      document.getElementById('username').value = profile.username || '';
      document.getElementById('display_name').value = profile.display_name || '';
      document.getElementById('bio').value = profile.bio || '';
      document.getElementById('website').value = profile.website || '';
      document.getElementById('social_discord').value = profile.social_discord || '';
      document.getElementById('social_twitter').value = profile.social_twitter || '';
      document.getElementById('current-email').value = profile.email || '';
      document.getElementById('invoice-email').value = profile.email || '';
      document.getElementById('invoice-title').value = profile.username || '';

      if (profile.avatar_url || profile.avatar) {
        document.getElementById('avatar-img').src = profile.avatar_url || profile.avatar;
        document.getElementById('avatar-img').style.display = 'block';
        document.getElementById('avatar-initial').style.display = 'none';
      } else {
        document.getElementById('avatar-img').style.display = 'none';
        document.getElementById('avatar-initial').style.display = 'block';
        document.getElementById('avatar-initial').textContent = (profile.username || 'U').charAt(0).toUpperCase();
      }
    } catch (err) {
      if (err.message.includes('登录') || err.message.includes('401')) {
        window.location.href = '/login';
      }
    }
  }

  async function saveProfile() {
    const btn = document.getElementById('save-profile-btn');
    btn.disabled = true;
    btn.textContent = '保存中...';
    hide('alert-success');
    hide('alert-error');

    try {
      const data = await api('PUT', '/profile', {
        username: document.getElementById('username').value.trim(),
        display_name: document.getElementById('display_name').value.trim(),
        bio: document.getElementById('bio').value.trim(),
        website: document.getElementById('website').value.trim(),
        social_discord: document.getElementById('social_discord').value.trim(),
        social_twitter: document.getElementById('social_twitter').value.trim(),
      });
      setCurrentUser(data.user || core.getCurrentUser());
      show('alert-success', '✅ 个人资料已保存！');
      setTimeout(function () { hide('alert-success'); }, 4000);
    } catch (err) {
      show('alert-error', '❌ ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '保存更改';
  }

  async function handleAvatarChange(event) {
    const file = event.target.files[0];
    if (!file) return;

    const validMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!validMimes.includes(file.type)) {
      show('alert-error', '❌ 仅支持 JPG/PNG/GIF/WebP 格式');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      show('alert-error', '❌ 图片大小不能超过 2MB');
      event.target.value = '';
      return;
    }

    const dims = await new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () { resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = function () { resolve(null); };
      img.src = URL.createObjectURL(file);
    });

    if (!dims) {
      show('alert-error', '❌ 无法读取图片，请选择有效的图片文件');
      event.target.value = '';
      return;
    }
    if (dims.w < 100 || dims.h < 100) {
      show('alert-error', '❌ 图片太小了，至少需要 100x100 像素');
      event.target.value = '';
      return;
    }
    if (dims.w > 2048 || dims.h > 2048) {
      show('alert-error', '❌ 图片太大了，最大支持 2048x2048 像素');
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const data = await requestJson('/api/auth/avatar', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'X-CSRF-Token': getCsrfToken(),
        },
        body: formData,
      }, '头像接口');

      document.getElementById('avatar-img').src = data.avatar_url || data.avatar;
      document.getElementById('avatar-img').style.display = 'block';
      document.getElementById('avatar-initial').style.display = 'none';

      const currentUser = core.getCurrentUser() || {};
      currentUser.avatar = data.avatar_url || data.avatar;
      setCurrentUser(currentUser);

      show('alert-success', '✅ 头像已更新！');
      setTimeout(function () { hide('alert-success'); }, 3000);
    } catch (err) {
      show('alert-error', '❌ ' + (err.message || '上传失败'));
    }

    event.target.value = '';
  }

  async function changePassword() {
    hide('alert-success');
    hide('alert-error');

    const oldPwd = document.getElementById('old-password').value;
    const newPwd = document.getElementById('new-password').value;
    const confirmPwd = document.getElementById('confirm-password').value;

    if (!oldPwd || !newPwd || !confirmPwd) {
      show('alert-error', '请填写所有字段');
      return;
    }
    if (newPwd.length < 8) {
      show('alert-error', '新密码至少需要 8 个字符');
      return;
    }
    if (newPwd !== confirmPwd) {
      show('alert-error', '两次输入的密码不一致');
      return;
    }

    const btn = document.getElementById('change-password-btn');
    btn.disabled = true;
    btn.textContent = '修改中...';

    try {
      await api('POST', '/change-password', { old_password: oldPwd, new_password: newPwd });
      show('alert-success', '✅ 密码修改成功！请使用新密码登录。');
      document.getElementById('old-password').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('confirm-password').value = '';
    } catch (err) {
      show('alert-error', '❌ ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '修改密码';
  }

  async function changeEmail() {
    hide('alert-success');
    hide('alert-error');

    const newEmail = document.getElementById('new-email').value.trim();
    const password = document.getElementById('email-password').value;

    if (!newEmail || !password) {
      show('alert-error', '请填写所有字段');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      show('alert-error', '请输入有效的邮箱地址');
      return;
    }

    const btn = document.getElementById('change-email-btn');
    btn.disabled = true;
    btn.textContent = '发送中...';

    try {
      await api('POST', '/change-email', { new_email: newEmail, password: password });
      show('alert-success', '✅ 验证邮件已发送至 ' + newEmail + '，请查收。');
      document.getElementById('new-email').value = '';
      document.getElementById('email-password').value = '';
    } catch (err) {
      show('alert-error', '❌ ' + err.message);
    }

    btn.disabled = false;
    btn.textContent = '发送验证邮件';
  }

  async function loadSessionsSection() {
    const container = document.getElementById('sessions-container');
    setContainerMessage(container, '加载中...', 'loading');

    try {
      const data = await api('GET', '/sessions');
      renderSessions(data.sessions || []);
    } catch (err) {
      setContainerMessage(container, '加载失败：' + err.message, 'error');
    }
  }

  function renderSessions(sessions) {
    const container = document.getElementById('sessions-container');
    if (!container) return;
    if (!sessions.length) {
      setContainerMessage(container, '暂无会话数据', 'info');
      return;
    }

    container.innerHTML = '';
    sessions.forEach(function (session) {
      const isMobile = /mobile/i.test(String(session.device_type || ''));
      const item = document.createElement('div');
      item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light);';

      const icon = document.createElement('div');
      icon.style.fontSize = '1.5rem';
      icon.textContent = isMobile ? '📱' : '💻';
      item.appendChild(icon);

      const info = document.createElement('div');
      info.style.flex = '1';

      const osBrowser = document.createElement('div');
      osBrowser.style.fontSize = '0.9375rem';
      osBrowser.style.fontWeight = '600';
      osBrowser.textContent = (session.os || 'Unknown') + ' / ' + (session.browser || 'Unknown');
      info.appendChild(osBrowser);

      const meta = document.createElement('div');
      meta.style.fontSize = '0.8125rem';
      meta.style.color = 'var(--text-secondary)';
      meta.textContent = (session.device_type || '未知设备') + ' · ' + (session.ip || 'Unknown IP') + ' · ' + formatDate(session.created_at);
      info.appendChild(meta);

      item.appendChild(info);

      if (session.is_current) {
        const badge = document.createElement('span');
        badge.className = 'badge badge-success';
        badge.textContent = '当前';
        item.appendChild(badge);
      } else {
        const revokeBtn = document.createElement('button');
        revokeBtn.className = 'btn btn-danger';
        revokeBtn.type = 'button';
        revokeBtn.dataset.revokeSessionId = session.id;
        revokeBtn.style.cssText = 'padding:6px 14px;font-size:0.8125rem;';
        revokeBtn.textContent = '吊销';
        item.appendChild(revokeBtn);
      }

      container.appendChild(item);
    });
  }

  async function revokeSession(id) {
    try {
      await api('DELETE', '/sessions/' + id);
      show('alert-success', '✅ 会话已吊销');
      loadSessionsSection();
    } catch (err) {
      show('alert-error', '❌ ' + err.message);
    }
  }

  async function loadHistorySection() {
    const container = document.getElementById('history-container');
    setContainerMessage(container, '加载中...', 'loading');

    try {
      const data = await api('GET', '/login-history');
      renderHistory(data.history || []);
    } catch (err) {
      setContainerMessage(container, '加载失败：' + err.message, 'error');
    }
  }

  function renderHistory(history) {
    const container = document.getElementById('history-container');
    if (!container) return;
    if (!history.length) {
      setContainerMessage(container, '暂无登录记录', 'info');
      return;
    }

    container.innerHTML = '';
    history.forEach(function (item) {
      const isMobile = /mobile/i.test(String(item.device_type || ''));
      const entry = document.createElement('div');
      entry.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border-light);';

      const icon = document.createElement('div');
      icon.style.fontSize = '1.25rem';
      icon.textContent = isMobile ? '📱' : '💻';
      entry.appendChild(icon);

      const info = document.createElement('div');
      info.style.flex = '1';

      const device = document.createElement('div');
      device.style.fontSize = '0.9375rem';
      device.style.fontWeight = '600';
      device.textContent = (item.browser || 'Unknown') + ' on ' + (item.os || 'Unknown');
      info.appendChild(device);

      const meta = document.createElement('div');
      meta.style.fontSize = '0.8125rem';
      meta.style.color = 'var(--text-secondary)';
      meta.textContent = (item.device_type || '未知设备') + ' · ' + (item.ip || 'Unknown IP') + ' · ' + formatDate(item.created_at);
      info.appendChild(meta);

      entry.appendChild(info);

      const statusBadge = document.createElement('span');
      statusBadge.className = 'badge ' + (item.success ? 'badge-success' : 'badge-error');
      statusBadge.textContent = item.success ? '成功' : '失败';
      entry.appendChild(statusBadge);

      container.appendChild(entry);
    });
  }

  async function exportData(format) {
    try {
      const results = await Promise.all([
        requestJson('/api/presets', { credentials: 'include' }, '预设接口'),
        requestJson('/api/share', { credentials: 'include' }, '分享接口'),
        requestJson('/api/auth/me', { credentials: 'include' }, '账号接口'),
      ]);
      const presets = results[0];
      const shares = results[1];
      const me = results[2];
      const user = me.user || core.getCurrentUser() || {};
      const data = { user: user, presets: presets.presets || [], shares: shares.shares || [] };

      if (format === 'json') {
        core.downloadTextFile('bestfps-export.json', JSON.stringify(data, null, 2), 'application/json');
      } else {
        let csv = 'type,name,created_at\n';
        (data.presets || []).forEach(function (preset) {
          csv += 'preset,' + JSON.stringify(preset.name || '') + ',' + JSON.stringify(preset.created_at || '') + '\n';
        });
        (data.shares || []).forEach(function (share) {
          csv += 'share,' + JSON.stringify(share.title || share.token || '') + ',' + JSON.stringify(share.created_at || '') + '\n';
        });
        core.downloadTextFile('bestfps-export.csv', csv, 'text/csv');
      }

      show('alert-success', '✅ 数据已导出！');
      setTimeout(function () { hide('alert-success'); }, 3000);
    } catch (err) {
      show('alert-error', '❌ 导出失败: ' + err.message);
    }
  }

  async function deleteAccount() {
    hide('alert-error');

    const password = document.getElementById('delete-password').value;
    const confirmation = document.getElementById('delete-confirm').value.trim();
    if (confirmation !== 'DELETE MY ACCOUNT') {
      show('alert-error', '请准确输入 "DELETE MY ACCOUNT" 以确认');
      return;
    }

    if (!window.confirm('⚠️ 警告：此操作将永久删除你的账号和所有数据，无法恢复！确定继续吗？')) {
      return;
    }

    const btn = document.getElementById('delete-btn');
    btn.disabled = true;
    btn.textContent = '注销中...';

    try {
      await api('DELETE', '/account', { password: password, confirmation: confirmation });
      alert('账号已注销。再见！');
      window.location.href = '/';
    } catch (err) {
      show('alert-error', '❌ ' + err.message);
      btn.disabled = false;
      btn.textContent = '永久注销账号';
    }
  }

  function init() {
    const avatarInput = document.getElementById('avatar-input');
    const avatarPreview = document.getElementById('avatar-preview');
    const avatarTrigger = document.getElementById('avatar-upload-trigger');
    const sessionsContainer = document.getElementById('sessions-container');

    if (avatarInput) avatarInput.addEventListener('change', handleAvatarChange);
    if (avatarPreview) {
      avatarPreview.addEventListener('click', function () {
        if (avatarInput) avatarInput.click();
      });
    }
    if (avatarTrigger) {
      avatarTrigger.addEventListener('click', function () {
        if (avatarInput) avatarInput.click();
      });
    }

    document.getElementById('save-profile-btn')?.addEventListener('click', saveProfile);
    document.getElementById('change-password-btn')?.addEventListener('click', changePassword);
    document.getElementById('change-email-btn')?.addEventListener('click', changeEmail);
    document.getElementById('delete-btn')?.addEventListener('click', deleteAccount);
    document.getElementById('export-json-btn')?.addEventListener('click', function () { exportData('json'); });
    document.getElementById('export-csv-btn')?.addEventListener('click', function () { exportData('csv'); });

    if (sessionsContainer) {
      sessionsContainer.addEventListener('click', function (event) {
        const button = event.target.closest('[data-revoke-session-id]');
        if (!button) return;
        revokeSession(button.dataset.revokeSessionId);
      });
    }

    core.registerSectionLoader('sessions', loadSessionsSection);
    core.registerSectionLoader('history', loadHistorySection);
  }

  window.SettingsAccount = {
    init: init,
    loadProfile: loadProfile,
    loadSessionsSection: loadSessionsSection,
    loadHistorySection: loadHistorySection,
  };
})();

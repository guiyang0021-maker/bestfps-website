// public/js/admin/admin-users.js
(function () {
  'use strict';

  // ── 依赖检查 ────────────────────────────────────────────
  if (typeof SafeDom === 'undefined') {
    console.error('[AdminUsers] SafeDom not loaded');
  }

  // ── 模块状态 ─────────────────────────────────────────
  let currentPage = 1;
  let searchQuery = '';
  let statusFilter = '';
  let roleFilter = '';
  let controller = null; // AbortController
  let debouncedSearch = null;

  const { apiFetch } = window.AdminApi;
  const { esc, createDebounce, formatDate } = window.AdminUtils;
  const { showSkeleton, toast, renderPagination } = window.AdminUI;

  // ── 容器引用 ──────────────────────────────────────────
  let container = null;
  let tableEl = null;
  let paginationEl = null;

  // ── URL 参数同步 ──────────────────────────────────────
  function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    currentPage = parseInt(params.get('page')) || 1;
    searchQuery = params.get('search') || '';
    statusFilter = params.get('status') || '';
    roleFilter = params.get('role') || '';

    // 同步回表单控件
    const searchInput = container?.querySelector('#user-search');
    if (searchInput) searchInput.value = searchQuery;
    const roleSelect = container?.querySelector('#user-role-filter');
    if (roleSelect) roleSelect.value = roleFilter;
    const statusSelect = container?.querySelector('#user-status-filter');
    if (statusSelect) statusSelect.value = statusFilter;
  }

  function writeUrlParams(page, search, role, status) {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', page);
    if (search) params.set('search', search);
    if (role) params.set('role', role);
    if (status) params.set('status', status);
    const qs = params.toString();
    history.replaceState(null, '', qs ? '/admin?view=users&' + qs : '/admin?view=users');
  }

  // ── 初始化 ───────────────────────────────────────────
  function init(el) {
    container = el;
    tableEl = container.querySelector('[data-table="users"]');
    paginationEl = container.querySelector('[data-pagination="users"]');
    if (!tableEl || !paginationEl) {
      console.error('[AdminUsers] Missing required DOM nodes');
      return;
    }
    debouncedSearch = createDebounce(search, 300);

    // 事件委托：表格操作按钮
    tableEl.addEventListener('click', handleTableClick);

    // 搜索/筛选事件
    const searchInput = container.querySelector('#user-search');
    if (searchInput) searchInput.addEventListener('input', (e) => debouncedSearch(e.target.value));

    const roleSelect = container.querySelector('#user-role-filter');
    if (roleSelect) roleSelect.addEventListener('change', (e) => {
      roleFilter = e.target.value;
      loadUsers(1);
    });

    const statusSelect = container.querySelector('#user-status-filter');
    if (statusSelect) statusSelect.addEventListener('change', (e) => {
      statusFilter = e.target.value;
      loadUsers(1);
    });

    readUrlParams();
    loadUsers(currentPage);
  }

  // ── 搜索 ──────────────────────────────────────────────
  function search(query) {
    searchQuery = query;
    loadUsers(1);
  }

  // ── 表格按钮事件委托 ──────────────────────────────────
  function handleTableClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const userId = parseInt(btn.dataset.userId);
    const row = btn.closest('tr');
    const username = row?.querySelector('strong')?.textContent || '';
    const userRole = row?.querySelector('.badge')?.textContent?.trim() || 'user';
    const userStatus = row?.querySelectorAll('.badge')[1]?.textContent?.trim() || 'active';

    switch (action) {
      case 'detail':
        openUserDetail(userId, btn);
        break;
      case 'role':
        openRoleModal(userId, userRole, btn);
        break;
      case 'suspend':
        openSuspendModal(userId, username, userStatus, btn);
        break;
      case 'delete':
        openDeleteModal(userId, username, btn);
        break;
    }
  }

  // ── 加载用户（可 abort）───────────────────────────────
  async function loadUsers(page) {
    if (controller) controller.abort();
    controller = new AbortController();

    showSkeleton(tableEl, { rows: 8, cols: 8 });
    paginationEl.innerHTML = '';

    const params = new URLSearchParams({ page, search: searchQuery });
    if (statusFilter) params.set('status', statusFilter);
    if (roleFilter) params.set('role', roleFilter);

    // 同步 URL
    writeUrlParams(page, searchQuery, roleFilter, statusFilter);
    currentPage = page;

    try {
      const data = await apiFetch(`/api/admin/users?${params}`, { signal: controller.signal });
      if (data.__aborted || data.__unauthorized) return;
      if (!data || !Array.isArray(data.users)) {
        throw new Error('用户数据格式无效');
      }
      currentPage = data.page;
      renderTable(data.users, data.total, data.page, data.limit);
    } catch (err) {
      if (err.name !== 'AbortError') {
        tableEl.innerHTML = `
          <tr>
            <td colspan="8" style="text-align:center;padding:40px;color:var(--color-text-muted)">
              <div style="display:flex;flex-direction:column;align-items:center;gap:12px">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" style="opacity:0.4">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <span>加载失败: ${esc(err.message)}</span>
                <button class="btn btn--small" id="users-retry-btn">重试</button>
              </div>
            </td>
          </tr>
        `;
        const retryBtn = document.getElementById('users-retry-btn');
        if (retryBtn) retryBtn.addEventListener('click', () => loadUsers(page));
      }
    }
  }

  // ── 渲染表格 ──────────────────────────────────────────
  function renderTable(users, total, page, limit) {
    const safeLimit = Math.max(1, Number(limit) || 20);
    const totalPages = Math.max(1, Math.ceil((Number(total) || 0) / safeLimit));
    const badgeTotal = total > 0 ? `共 ${total} 个用户` : '';

    // 更新总数字 badge
    const badge = container?.querySelector('#users-total-badge');
    if (badge) SafeDom.setText(badge, badgeTotal);

    if (!users.length) {
      tableEl.innerHTML = '';
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.style.cssText = 'text-align:center;padding:40px;color:var(--color-text-muted)';
      SafeDom.setText(td, '暂无用户');
      tr.appendChild(td);
      tableEl.appendChild(tr);
    } else {
      tableEl.innerHTML = '';
      users.forEach(u => {
        const tr = document.createElement('tr');
        tr.dataset.userId = u.id;

        // ID
        const tdId = document.createElement('td');
        const idSpan = document.createElement('span');
        idSpan.style.cssText = 'color:var(--color-text-muted);font-size:13px';
        SafeDom.setText(idSpan, String(u.id));
        tdId.appendChild(idSpan);
        tr.appendChild(tdId);

        // Username
        const tdUsername = document.createElement('td');
        const usernameStrong = document.createElement('strong');
        SafeDom.setText(usernameStrong, u.username);
        tdUsername.appendChild(usernameStrong);
        tr.appendChild(tdUsername);

        // Email
        const tdEmail = document.createElement('td');
        SafeDom.setText(tdEmail, u.email);
        tr.appendChild(tdEmail);

        // Role badge
        const tdRole = document.createElement('td');
        const roleBadge = document.createElement('span');
        roleBadge.className = 'badge badge--' + (u.role || 'user');
        SafeDom.setText(roleBadge, u.role);
        tdRole.appendChild(roleBadge);
        tr.appendChild(tdRole);

        // Status badge
        const tdStatus = document.createElement('td');
        const statusBadge = document.createElement('span');
        statusBadge.className = 'badge badge--' + (u.status || 'active');
        SafeDom.setText(statusBadge, u.status);
        tdStatus.appendChild(statusBadge);
        tr.appendChild(tdStatus);

        // Last login IP
        const tdIp = document.createElement('td');
        SafeDom.setText(tdIp, u.last_login_ip || '—');
        tr.appendChild(tdIp);

        // Created at
        const tdCreated = document.createElement('td');
        SafeDom.setText(tdCreated, formatDate(u.created_at));
        tr.appendChild(tdCreated);

        // Actions
        const tdActions = document.createElement('td');
        const divActions = document.createElement('div');
        divActions.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap';

        const detailBtn = document.createElement('button');
        detailBtn.className = 'btn btn--small';
        detailBtn.dataset.action = 'detail';
        detailBtn.dataset.userId = u.id;
        detailBtn.title = '查看详情';
        SafeDom.setText(detailBtn, '详情');
        divActions.appendChild(detailBtn);

        const roleBtn = document.createElement('button');
        roleBtn.className = 'btn btn--small';
        roleBtn.dataset.action = 'role';
        roleBtn.dataset.userId = u.id;
        roleBtn.title = '修改角色';
        SafeDom.setText(roleBtn, '角色');
        divActions.appendChild(roleBtn);

        const suspendBtn = document.createElement('button');
        const isSuspended = u.status === 'suspended' || u.status === 'banned';
        suspendBtn.className = 'btn btn--small ' + (isSuspended ? 'btn--success' : 'btn--warning');
        suspendBtn.dataset.action = 'suspend';
        suspendBtn.dataset.userId = u.id;
        suspendBtn.title = isSuspended ? '解封' : '封禁';
        SafeDom.setText(suspendBtn, isSuspended ? '解封' : '封禁');
        divActions.appendChild(suspendBtn);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn--small btn--danger';
        deleteBtn.dataset.action = 'delete';
        deleteBtn.dataset.userId = u.id;
        deleteBtn.title = '删除用户';
        SafeDom.setText(deleteBtn, '删除');
        divActions.appendChild(deleteBtn);

        tdActions.appendChild(divActions);
        tr.appendChild(tdActions);

        tableEl.appendChild(tr);
      });
    }

    renderPagination(paginationEl, {
      page: Math.max(1, Number(page) || 1), totalPages,
      onChange: (p) => loadUsers(p),
    });
  }

  function renderSessionList(sessions) {
    if (!Array.isArray(sessions) || !sessions.length) {
      return '<div class="detail-row"><span class="detail-label">活跃会话</span><span class="detail-value">暂无</span></div>';
    }
    return `
      <div style="margin-top:16px">
        <div style="font-weight:600;margin-bottom:8px">活跃会话</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${sessions.map((session) => `
            <div style="padding:10px 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-2)">
              <div style="font-size:13px;font-weight:600">${esc(session.browser || '未知浏览器')} / ${esc(session.os || '未知系统')}</div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">${esc(session.device_type || '未知设备')} · ${esc(session.ip || '未知 IP')}</div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">创建于 ${esc(formatDate(session.created_at))}，过期于 ${esc(formatDate(session.expires_at))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderLoginHistory(history) {
    if (!Array.isArray(history) || !history.length) {
      return '<div style="margin-top:16px"><div style="font-weight:600;margin-bottom:8px">最近登录记录</div><div style="color:var(--color-text-muted);font-size:13px">暂无</div></div>';
    }
    return `
      <div style="margin-top:16px">
        <div style="font-weight:600;margin-bottom:8px">最近登录记录</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${history.map((item) => `
            <div style="padding:10px 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface-2)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
                <div style="font-size:13px;font-weight:600">${esc(item.browser || '未知浏览器')} / ${esc(item.os || '未知系统')}</div>
                <span class="badge ${item.success ? 'badge-success' : 'badge-error'}">${item.success ? '成功' : '失败'}</span>
              </div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">${esc(item.device_type || '未知设备')} · ${esc(item.ip || '未知 IP')}</div>
              <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">${esc(formatDate(item.created_at))}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // ── 用户详情 ──────────────────────────────────────────
  async function openUserDetail(userId, triggerEl) {
    const modal = document.getElementById('user-modal');
    const body = document.getElementById('modal-user-body');
    const title = document.getElementById('modal-user-title');
    body.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-muted)">加载中...</p>';
    if (title) title.textContent = '用户详情';
    if (modal && window.AdminCore) window.AdminCore.openModal(modal, triggerEl);

    try {
      const [userResult, historyResult, sessionsResult] = await Promise.allSettled([
        apiFetch(`/api/admin/users/${userId}`),
        apiFetch(`/api/admin/login-history/${userId}?limit=5`),
        apiFetch(`/api/admin/sessions/${userId}?limit=5`),
      ]);
      if (userResult.status !== 'fulfilled') {
        throw userResult.reason || new Error('用户详情加载失败');
      }
      const data = userResult.value;
      const historyData = historyResult.status === 'fulfilled' ? historyResult.value : { history: [] };
      const sessionsData = sessionsResult.status === 'fulfilled' ? sessionsResult.value : { sessions: [] };
      const user = data.user;
      const stats = data.stats || {};
      const history = Array.isArray(historyData.history) ? historyData.history : [];
      const sessions = Array.isArray(sessionsData.sessions) ? sessionsData.sessions : [];
      if (!user || !user.id) throw new Error('用户不存在');

      body.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
            <div style="width:48px;height:48px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:20px">${esc(user.username[0].toUpperCase())}</div>
            <div>
              <div style="font-weight:600;font-size:16px">${esc(user.username)}</div>
              <div style="font-size:13px;color:var(--color-text-muted)">ID: ${user.id}</div>
            </div>
          </div>
          <div class="detail-row"><span class="detail-label">邮箱</span><span class="detail-value">${esc(user.email)}</span></div>
          <div class="detail-row"><span class="detail-label">角色</span><span class="detail-value"><span class="badge badge--${esc(user.role)}">${esc(user.role)}</span></span></div>
          <div class="detail-row"><span class="detail-label">状态</span><span class="detail-value"><span class="badge badge--${esc(user.status)}">${esc(user.status)}</span></span></div>
          <div class="detail-row"><span class="detail-label">邮箱验证</span><span class="detail-value">${user.verified ? '✓ 已验证' : '✗ 未验证'}</span></div>
          <div class="detail-row"><span class="detail-label">注册时间</span><span class="detail-value">${esc(formatDate(user.created_at))}</span></div>
          <div class="detail-row"><span class="detail-label">最近登录 IP</span><span class="detail-value">${esc(user.last_login_ip || '—')}</span></div>
          <div class="detail-row"><span class="detail-label">最近登录时间</span><span class="detail-value">${esc(user.last_login_at ? formatDate(user.last_login_at) : '—')}</span></div>
          <div class="detail-row"><span class="detail-label">最近登录设备</span><span class="detail-value">${esc([user.last_login_browser || '未知浏览器', user.last_login_os || '未知系统', user.last_login_device_type || '未知设备'].join(' / '))}</span></div>
          <div class="detail-row"><span class="detail-label">最近会话 IP</span><span class="detail-value">${esc(user.last_session_ip || '—')}</span></div>
          <div class="detail-row"><span class="detail-label">下载次数</span><span class="detail-value">${esc(String(stats.downloads || 0))}</span></div>
          <div class="detail-row"><span class="detail-label">预设数量</span><span class="detail-value">${esc(String(stats.presets || 0))}</span></div>
          <div class="detail-row"><span class="detail-label">会话数量</span><span class="detail-value">${esc(String(stats.sessions || 0))}</span></div>
          <div class="detail-row"><span class="detail-label">活动数量</span><span class="detail-value">${esc(String(stats.activities || 0))}</span></div>
          ${user.suspended_at ? `<div class="detail-row"><span class="detail-label">封禁时间</span><span class="detail-value">${esc(formatDate(user.suspended_at))}</span></div>` : ''}
          ${user.suspend_reason ? `<div class="detail-row"><span class="detail-label">封禁原因</span><span class="detail-value" style="color:var(--color-danger)">${esc(user.suspend_reason)}</span></div>` : ''}
          ${renderSessionList(sessions)}
          ${renderLoginHistory(history)}
        </div>
      `;
    } catch (e) {
      body.innerHTML = '<p style="text-align:center;padding:20px;color:var(--color-danger)">加载失败: ' + esc(e.message) + '</p>';
    }
  }

  // ── 角色修改 ──────────────────────────────────────────
  function openRoleModal(userId, currentRole, triggerEl) {
    // Populate static modal fields and open static modal
    document.getElementById('role-user-id').value = userId;
    document.getElementById('role-new-role').value = currentRole;
    if (window.AdminCore) window.AdminCore.openModal('role-modal', triggerEl);
  }

  // ── 封禁/解封 ──────────────────────────────────────────
  function openSuspendModal(userId, username, currentStatus, triggerEl) {
    const action = (currentStatus === 'suspended' || currentStatus === 'banned') ? 'unsuspend' : 'suspend';
    document.getElementById('suspend-user-id').value = userId;
    document.getElementById('suspend-action').value = action;
    document.getElementById('suspend-modal-title').textContent = action === 'suspend' ? '封禁用户' : '解封用户';
    document.getElementById('suspend-modal-desc').textContent = action === 'suspend'
      ? `确定要封禁用户 "${username}" 吗？`
      : `确定要解封用户 "${username}" 吗？`;
    document.getElementById('suspend-reason-label').textContent = action === 'suspend' ? '封禁原因（可选）' : '解封原因（可选）';
    document.getElementById('suspend-reason').value = '';
    const confirmBtn = document.getElementById('suspend-confirm-btn');
    if (confirmBtn) {
      confirmBtn.textContent = action === 'suspend' ? '确认封禁' : '确认解封';
      confirmBtn.className = action === 'suspend' ? 'btn btn-danger' : 'btn btn-warning';
    }
    if (window.AdminCore) window.AdminCore.openModal('suspend-modal', triggerEl);
  }

  // ── 删除用户 ──────────────────────────────────────────
  function openDeleteModal(userId, username, triggerEl) {
    document.getElementById('delete-user-id').value = userId;
    if (window.AdminCore) window.AdminCore.openModal('delete-modal', triggerEl);
  }

  // ── 关闭详情弹窗 ──────────────────────────────────────
  function closeUserModal() {
    if (window.AdminCore) window.AdminCore.closeModal('user-modal');
  }

  // ── 暴露到 window ─────────────────────────────────────
  window.AdminUsers = {
    init,
    loadUsers,
    search,
    openUserDetail,
    closeUserModal,
    openSuspendModal,
    openRoleModal,
    openDeleteModal,
    confirmDelete: openDeleteModal,
    getCurrentPage: () => currentPage,
  };
})();

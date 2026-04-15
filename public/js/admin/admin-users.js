// public/js/admin/admin-users.js
(function () {
  'use strict';

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
        openUserDetail(userId);
        break;
      case 'role':
        openRoleModal(userId, userRole);
        break;
      case 'suspend':
        openSuspendModal(userId, username, userStatus);
        break;
      case 'delete':
        openDeleteModal(userId, username);
        break;
    }
  }

  // ── 加载用户（可 abort）───────────────────────────────
  async function loadUsers(page) {
    if (controller) controller.abort();
    controller = new AbortController();

    showSkeleton(tableEl, { rows: 8, cols: 7 });
    paginationEl.innerHTML = '';

    const params = new URLSearchParams({ page, search: searchQuery });
    if (statusFilter) params.set('status', statusFilter);
    if (roleFilter) params.set('role', roleFilter);

    // 同步 URL
    writeUrlParams(page, searchQuery, roleFilter, statusFilter);
    currentPage = page;

    try {
      const data = await apiFetch(`/api/admin/users?${params}`, { signal: controller.signal });
      if (data.__aborted) return;
      currentPage = data.page;
      renderTable(data.users, data.total, data.page, data.limit);
    } catch (err) {
      if (err.name !== 'AbortError') {
        tableEl.innerHTML = `
          <tr>
            <td colspan="7" style="text-align:center;padding:40px;color:var(--color-text-muted)">
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
    const totalPages = Math.ceil(total / limit);
    const badgeTotal = total > 0 ? `共 ${total} 个用户` : '';

    // 更新总数字 badge
    const badge = container?.querySelector('#users-total-badge');
    if (badge) badge.textContent = badgeTotal;

    if (!users.length) {
      tableEl.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--color-text-muted)">暂无用户</td></tr>';
    } else {
      tableEl.innerHTML = users.map(u => `
        <tr data-user-id="${u.id}">
          <td><span style="color:var(--color-text-muted);font-size:13px">${u.id}</span></td>
          <td><strong>${esc(u.username)}</strong></td>
          <td>${esc(u.email)}</td>
          <td><span class="badge badge--${u.role}">${esc(u.role)}</span></td>
          <td><span class="badge badge--${u.status}">${esc(u.status)}</span></td>
          <td>${esc(formatDate(u.created_at))}</td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn--small" data-action="detail" data-user-id="${u.id}" title="查看详情">详情</button>
              <button class="btn btn--small" data-action="role" data-user-id="${u.id}" title="修改角色">角色</button>
              <button class="btn btn--small ${u.status === 'suspended' || u.status === 'banned' ? 'btn--success' : 'btn--warning'}" data-action="suspend" data-user-id="${u.id}" title="${u.status === 'suspended' || u.status === 'banned' ? '解封' : '封禁'}">${u.status === 'suspended' || u.status === 'banned' ? '解封' : '封禁'}</button>
              <button class="btn btn--small btn--danger" data-action="delete" data-user-id="${u.id}" title="删除用户">删除</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    renderPagination(paginationEl, {
      page, totalPages,
      onChange: (p) => loadUsers(p),
    });
  }

  // ── 用户详情 ──────────────────────────────────────────
  async function openUserDetail(userId) {
    const modal = document.getElementById('user-modal');
    const body = document.getElementById('modal-user-body');
    const title = document.getElementById('modal-user-title');
    body.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-muted)">加载中...</p>';
    if (title) title.textContent = '用户详情';
    if (modal) modal.classList.add('modal-overlay--open');

    try {
      const user = await apiFetch(`/api/admin/users/${userId}`);
      if (!user.id) throw new Error('用户不存在');

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
          ${user.suspended_at ? `<div class="detail-row"><span class="detail-label">封禁时间</span><span class="detail-value">${esc(formatDate(user.suspended_at))}</span></div>` : ''}
          ${user.suspend_reason ? `<div class="detail-row"><span class="detail-label">封禁原因</span><span class="detail-value" style="color:var(--color-danger)">${esc(user.suspend_reason)}</span></div>` : ''}
        </div>
      `;
    } catch (e) {
      body.innerHTML = '<p style="text-align:center;padding:20px;color:var(--color-danger)">加载失败: ' + esc(e.message) + '</p>';
    }
  }

  // ── 角色修改 ──────────────────────────────────────────
  function openRoleModal(userId, currentRole) {
    // Populate static modal fields and open static modal
    document.getElementById('role-user-id').value = userId;
    document.getElementById('role-new-role').value = currentRole;
    document.getElementById('role-modal').classList.add('modal-overlay--open');
  }

  // ── 封禁/解封 ──────────────────────────────────────────
  function openSuspendModal(userId, username, currentStatus) {
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
    document.getElementById('suspend-modal').classList.add('modal-overlay--open');
  }

  // ── 删除用户 ──────────────────────────────────────────
  function openDeleteModal(userId, username) {
    document.getElementById('delete-user-id').value = userId;
    document.getElementById('delete-modal').classList.add('modal-overlay--open');
  }

  // ── 关闭详情弹窗 ──────────────────────────────────────
  function closeUserModal() {
    const modal = document.getElementById('user-modal');
    if (modal) modal.classList.remove('modal-overlay--open');
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

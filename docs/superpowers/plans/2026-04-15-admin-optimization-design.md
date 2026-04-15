# Admin 管理后台优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `public/admin.html` 从 ~1000 行单文件重构为 7 个模块化 IIFE，修复 12 个安全与 UX 问题

**Architecture:** IIFE 模块 + 闭包状态，AdminCore 中心状态中枢，AbortController 并发控制，CSRF double-submit cookie 保护

**Tech Stack:** Vanilla JS IIFE, Fetch API, DOMPurify, CSS components.css

---

## File Structure

```
public/js/admin/
├── admin-utils.js         # esc, sanitizeRich, createDebounce, ROLES/ACTIONS 常量
├── admin-api.js          # CSRF fetch 封装、请求去重、错误处理
├── admin-ui.js           # confirmAction, renderPagination, showSkeleton, toast
├── admin-core.js         # 权限守卫、初始化、跨模块状态
├── admin-users.js        # 用户管理：列表/搜索/角色修改/封禁/删除
├── admin-announcements.js # 公告管理：列表/创建/编辑/删除
└── admin-stats.js        # 统计概览：卡片/用户/活动/图表（独立请求）

middleware/
└── csrf.js               # CSRF 验证中间件（double-submit cookie）
```

---

## Phase 1: 基础模块

### Task 1: 创建 `public/js/admin/admin-utils.js`

**Files:**
- Create: `public/js/admin/admin-utils.js`

- [ ] **Step 1: 创建目录结构**

Run: `mkdir -p public/js/admin`

- [ ] **Step 2: 写入 admin-utils.js**

```javascript
// public/js/admin/admin-utils.js
(function () {
  'use strict';

  // ── 常量 ──────────────────────────────────────────────
  const ROLES = Object.freeze(['user', 'admin', 'superadmin']);
  const ACTIONS = Object.freeze(['suspend', 'unsuspend', 'ban']);
  const STATUSES = Object.freeze(['active', 'suspended', 'banned']);
  const ANNOUNCEMENT_TYPES = Object.freeze(['info', 'success', 'warning', 'error', 'feature', 'maintenance']);

  // ── 安全转义 ──────────────────────────────────────────
  function esc(str) {
    if (str == null) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }

  function sanitizeRich(html) {
    if (!html) return '';
    // 富文本：只允许少量安全标签，净化 XSS
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre', 'ul', 'ol', 'li'],
      ALLOWED_ATTR: ['href', 'target'],
    });
  }

  // ── debounce 工厂 ────────────────────────────────────
  function createDebounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // ── 工具函数 ──────────────────────────────────────────
  function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function getCsrfToken() {
    const match = document.cookie.match(/csrf_token=([^;]+)/);
    return match ? match[1] : '';
  }

  window.AdminUtils = { esc, sanitizeRich, createDebounce, formatDate, getCsrfToken, ROLES, ACTIONS, STATUSES, ANNOUNCEMENT_TYPES };
})();
```

- [ ] **Step 3: 提交**

```bash
git add public/js/admin/admin-utils.js
git commit -m "feat(admin): add admin-utils.js - esc, sanitizeRich, createDebounce, constants

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: 创建 `public/js/admin/admin-api.js`

**Files:**
- Create: `public/js/admin/admin-api.js`

- [ ] **Step 1: 写入 admin-api.js**

```javascript
// public/js/admin/admin-api.js
(function () {
  'use strict';

  const { getCsrfToken } = window.AdminUtils;

  // 正在进行的请求（用于去重）
  const inflight = new Map();

  async function apiFetch(url, options = {}) {
    const token = getCsrfToken();
    const defaultOpts = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRF-Token': token || '',
      },
    };
    const merged = { ...defaultOpts, ...options };
    // 避免重复请求（同一 URL + method 在 3s 内）
    const cacheKey = url + (merged.method || 'GET');
    const existing = inflight.get(cacheKey);
    if (existing && Date.now() - existing.start < 3000) {
      existing.controller.abort();
    }
    const controller = new AbortController();
    inflight.set(cacheKey, { controller, start: Date.now() });
    merged.signal = controller.signal;

    let res;
    try {
      res = await fetch(url, merged);
    } catch (err) {
      if (err.name === 'AbortError') return { __aborted: true };
      throw err;
    } finally {
      inflight.delete(cacheKey);
    }

    const data = await res.json().catch(() => ({ error: '响应解析失败' }));
    if (!res.ok) {
      if (res.status === 403) {
        // CSRF 失败，跳转登录
        window.location.href = '/login';
        return { __aborted: true };
      }
      throw Object.assign(new Error(data.error || '请求失败'), { status: res.status });
    }
    return data;
  }

  async function request(method, url, body) {
    return apiFetch(url, body ? { method, body: JSON.stringify(body) } : { method });
  }

  const get    = (url)              => request('GET', url);
  const post   = (url, body)        => request('POST', url, body);
  const put    = (url, body)        => request('PUT', url, body);
  const del    = (url)              => request('DELETE', url);

  window.AdminApi = { apiFetch, request, get, post, put, del };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-api.js
git commit -m "feat(admin): add admin-api.js - CSRF fetch, request deduplication, error handling

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: 后端安全层

### Task 3: 创建 `middleware/csrf.js`

**Files:**
- Create: `middleware/csrf.js`

- [ ] **Step 1: 写入 middleware/csrf.js**

```javascript
// middleware/csrf.js
const csrfMiddleware = (req, res, next) => {
  // 安全方法跳过检查
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies['csrf_token'];

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token 无效' });
  }

  next();
};

module.exports = { csrfMiddleware };
```

- [ ] **Step 2: 提交**

```bash
git add middleware/csrf.js
git commit -m "feat(security): add CSRF middleware - double-submit cookie validation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: 更新 `middleware/auth.js` — 登录时设置 CSRF cookie

**Files:**
- Modify: `middleware/auth.js:140-150`（找到登录成功响应处，加 `res.cookie`）

先读取文件确认精确位置：
Run: `grep -n "res.json\|res.status.*200\|JWT_ISSUED" middleware/auth.js`

- [ ] **Step 1: 读取 auth.js 确认登录响应位置**

Run: `grep -n "res.json\|res.status.*200\|login.*success\|generateToken" middleware/auth.js | head -20`

- [ ] **Step 2: 添加 CSRF cookie 设置到登录成功响应**

在 `res.json({ token, ... })` 前添加：
```javascript
const csrfToken = require('crypto').randomBytes(32).toString('hex');
res.cookie('csrf_token', csrfToken, {
  httpOnly: false,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
  secure: process.env.NODE_ENV === 'production',
});
```

- [ ] **Step 3: 提交**

```bash
git add middleware/auth.js
git commit -m "feat(auth): set CSRF cookie on login - double-submit token pattern

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: 更新 `routes/admin.js` — 使用 ROLES/ACTIONS 常量

**Files:**
- Modify: `routes/admin.js:1-20`（顶部导入处）+ `routes/admin.js:175-210`（角色和操作校验处）

- [ ] **Step 1: 读取 routes/admin.js 确认需要改动的位置**

Run: `grep -n "user\|admin\|superadmin\|suspend\|unsuspend\|ban\|ROLES\|ACTIONS" routes/admin.js | head -30`

- [ ] **Step 2: 在文件顶部添加常量定义，替换硬编码字面量**

在文件顶部（require 之后）添加：
```javascript
const ROLES = ['user', 'admin', 'superadmin'];
const ACTIONS = ['suspend', 'unsuspend', 'ban'];
```

替换 `!['user', 'admin', 'superadmin'].includes(role)` 为 `!ROLES.includes(role)`
替换 `!['suspend', 'unsuspend', 'ban'].includes(action)` 为 `!ACTIONS.includes(action)`

- [ ] **Step 3: 提交**

```bash
git add routes/admin.js
git commit -m "refactor(admin): replace hardcoded role/action literals with constants

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: 更新 `routes/announcements.js` — 使用 ANNOUNCEMENT_TYPES 常量

**Files:**
- Modify: `routes/announcements.js`

- [ ] **Step 1: 读取 announcements.js**

Run: `grep -n "info\|success\|warning\|error\|feature\|maintenance\|allowedTypes\|type" routes/announcements.js | head -20`

- [ ] **Step 2: 添加常量，替换硬编码字面量**

在文件顶部添加：
```javascript
const ANNOUNCEMENT_TYPES = ['info', 'success', 'warning', 'error', 'feature', 'maintenance'];
```

替换 `const allowedTypes = [...]` 为使用 `ANNOUNCEMENT_TYPES`

- [ ] **Step 3: 提交**

```bash
git add routes/announcements.js
git commit -m "refactor(announcements): use ANNOUNCEMENT_TYPES constant

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: 更新 `server.js` — 挂载 CSRF 中间件

**Files:**
- Modify: `server.js`

- [ ] **Step 1: 读取 server.js 确认路由注册位置**

Run: `grep -n "app.use.*router\|require.*routes\|adminRouter\|announcementsRouter" server.js`

- [ ] **Step 2: 添加 CSRF 中间件引入和挂载**

在 `announcementsRouter` 引入后添加：
```javascript
const { csrfMiddleware } = require('./middleware/csrf');
```

在需要 CSRF 保护的非安全方法路由前应用中间件：
```javascript
app.use('/api/admin', csrfMiddleware, adminRouter);
```

注意： announcements 路由已有 requireAdmin，内部可能也需要 CSRF 验证，视设计决定。

- [ ] **Step 3: 提交**

```bash
git add server.js
git commit -m "feat(server): mount CSRF middleware on admin routes

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: UI 组件与核心

### Task 8: 创建 `public/js/admin/admin-ui.js`

**Files:**
- Create: `public/js/admin/admin-ui.js`

- [ ] **Step 1: 写入 admin-ui.js — confirmAction, renderPagination, showSkeleton, toast**

```javascript
// public/js/admin/admin-ui.js
(function () {
  'use strict';

  const { esc } = window.AdminUtils;

  // ── Skeleton Loader ──────────────────────────────────
  function showSkeleton(container, { rows = 5, cols = 4 } = {}) {
    const colWidths = { 1: '20%', 2: '40%', 3: '60%', 4: '80%', 5: '100%' };
    container.innerHTML = Array.from({ length: rows }, (_, i) =>
      `<div class="skeleton" style="height:48px;margin-bottom:8px;width:${colWidths[cols] || '80%'}"></div>`
    ).join('');
  }

  // ── Toast ─────────────────────────────────────────────
  let toastTimer = null;
  function toast(message, type = 'info') {
    const existing = document.getElementById('admin-toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'admin-toast';
    el.style.cssText = `
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      padding: 12px 20px; border-radius: 8px;
      background: var(--color-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'}, #333);
      color: #fff; font-size: 14px; max-width: 320px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: toast-in 0.2s ease;
    `;
    el.textContent = message;
    document.body.appendChild(el);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 4000);
  }

  // ── Confirm Action Dialog ─────────────────────────────
  function confirmAction({ title, message, requiredPhrase, confirmText = '确认', danger = false }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal" style="max-width:420px">
          <div class="modal__header">${esc(title)}</div>
          <div class="modal__body">
            <p>${esc(message)}</p>
            ${requiredPhrase ? `
              <label style="margin-top:12px;display:block;font-size:13px;color:var(--color-text-muted)">
                请输入 <strong>${esc(requiredPhrase)}</strong> 确认：
              </label>
              <input type="text" id="confirm-input" class="form-control" style="margin-top:6px" autocomplete="off" spellcheck="false">
            ` : ''}
          </div>
          <div class="modal__footer" style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn--secondary" id="confirm-cancel">取消</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok" ${requiredPhrase ? 'disabled' : ''}>${esc(confirmText)}</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      const okBtn = overlay.querySelector('#confirm-ok');
      const input = overlay.querySelector('#confirm-input');

      if (input) {
        input.addEventListener('input', () => {
          okBtn.disabled = input.value.trim() !== requiredPhrase;
        });
        input.focus();
      }

      const cleanup = (result) => {
        overlay.classList.add('modal-overlay--fade-out');
        setTimeout(() => { overlay.remove(); resolve(result); }, 200);
      };

      okBtn.onclick = () => cleanup(true);
      overlay.querySelector('#confirm-cancel').onclick = () => cleanup(false);
      overlay.onclick = (e) => { if (e.target === overlay) cleanup(false); };
    });
  }

  // ── Pagination ─────────────────────────────────────────
  function renderPagination(container, { page, totalPages, onChange }) {
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="pagination" style="display:flex;align-items:center;gap:4px">';

    html += `<button class="btn btn--small" ${page <= 1 ? 'disabled' : ''} data-page="${page - 1}">‹</button>`;

    const max = 7;
    let start = Math.max(1, page - 3);
    let end = Math.min(totalPages, start + max - 1);
    if (end - start < max - 1) start = Math.max(1, end - max + 1);

    if (start > 1) {
      html += `<button class="btn btn--small" data-page="1">1</button>`;
      if (start > 2) html += '<span style="padding:0 4px;color:var(--color-text-muted)">…</span>';
    }
    for (let i = start; i <= end; i++) {
      html += `<button class="btn btn--small ${i === page ? 'btn--primary' : ''}" data-page="${i}">${i}</button>`;
    }
    if (end < totalPages) {
      if (end < totalPages - 1) html += '<span style="padding:0 4px;color:var(--color-text-muted)">…</span>';
      html += `<button class="btn btn--small" data-page="${totalPages}">${totalPages}</button>`;
    }

    html += `<button class="btn btn--small" ${page >= totalPages ? 'disabled' : ''} data-page="${page + 1}">›</button>`;
    html += `<span style="margin-left:8px;font-size:13px;color:var(--color-text-muted)">第 ${page}/${totalPages} 页</span>`;
    html += '</div>';

    container.innerHTML = html;
    container.querySelectorAll('[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = parseInt(btn.dataset.page);
        if (p >= 1 && p <= totalPages) onChange(p);
      });
    });
  }

  window.AdminUI = { showSkeleton, toast, confirmAction, renderPagination };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-ui.js
git commit -m "feat(admin): add admin-ui.js - confirmAction, renderPagination, showSkeleton, toast

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: 创建 `public/js/admin/admin-core.js`

**Files:**
- Create: `public/js/admin/admin-core.js`

- [ ] **Step 1: 写入 admin-core.js — 权限守卫、初始化、跨模块状态**

```javascript
// public/js/admin/admin-core.js
(function () {
  'use strict';

  const state = {
    currentUser: null,
    views: {},
  };

  function requireAdmin() {
    if (!state.currentUser || !['admin', 'superadmin'].includes(state.currentUser.role)) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  }

  function init(container) {
    // 从当前页面 DOM 读取用户信息（由 server 注入的 data 属性）
    const userEl = document.getElementById('current-user-data');
    if (!userEl) { window.location.href = '/login'; return; }
    try {
      state.currentUser = JSON.parse(userEl.textContent);
    } catch (e) { window.location.href = '/login'; return; }

    if (!requireAdmin()) return;

    // 初始化各模块
    if (window.AdminUsers) {
      state.views.users = document.getElementById('users-view');
      window.AdminUsers.init(state.views.users);
    }
    if (window.AdminAnnouncements) {
      state.views.announcements = document.getElementById('announcements-view');
      window.AdminAnnouncements.init(state.views.announcements);
    }
    if (window.AdminStats) {
      state.views.stats = document.getElementById('stats-view');
      window.AdminStats.init(state.views.stats);
    }

    // 侧边栏导航切换
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        showView(view);
      });
    });
  }

  function showView(viewName) {
    Object.values(state.views).forEach(v => { if (v) v.style.display = 'none'; });
    const target = state.views[viewName];
    if (target) target.style.display = '';
    document.querySelectorAll('.nav-item').forEach(n => {
      n.classList.toggle('active', n.dataset.view === viewName);
    });
  }

  window.AdminCore = {
    init,
    requireAdmin,
    showView,
    getState: () => state,
    getCurrentUser: () => state.currentUser,
  };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-core.js
git commit -m "feat(admin): add admin-core.js - permission guard, view routing, cross-module state

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: 功能模块

### Task 10: 创建 `public/js/admin/admin-users.js`

**Files:**
- Create: `public/js/admin/admin-users.js`

- [ ] **Step 1: 写入 admin-users.js — 完整用户管理逻辑**

```javascript
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
  const { showSkeleton, toast, confirmAction, renderPagination } = window.AdminUI;

  // ── 容器引用 ──────────────────────────────────────────
  let container = null;
  let tableEl = null;
  let paginationEl = null;

  // ── 初始化 ───────────────────────────────────────────
  function init(el) {
    container = el;
    tableEl = container.querySelector('[data-table="users"]');
    paginationEl = container.querySelector('[data-pagination="users"]');
    debouncedSearch = createDebounce(loadUsers, 300);
    loadUsers(1);
  }

  // ── 搜索 ──────────────────────────────────────────────
  function search(query) {
    searchQuery = query;
    loadUsers(1);
  }

  // ── 加载用户（可 abort）───────────────────────────────
  async function loadUsers(page) {
    if (controller) controller.abort();
    controller = new AbortController();

    showSkeleton(tableEl, { rows: 8, cols: 5 });
    paginationEl.innerHTML = '';

    const params = new URLSearchParams({ page, search: searchQuery });
    if (statusFilter) params.set('status', statusFilter);
    if (roleFilter) params.set('role', roleFilter);

    try {
      const data = await apiFetch(`/api/admin/users?${params}`, { signal: controller.signal });
      if (data.__aborted) return;
      currentPage = data.page;
      renderTable(data.users, data.total, data.page, data.limit);
    } catch (err) {
      if (err.name !== 'AbortError') {
        toast('加载用户失败: ' + err.message, 'error');
      }
    }
  }

  // ── 渲染表格 ──────────────────────────────────────────
  function renderTable(users, total, page, limit) {
    const totalPages = Math.ceil(total / limit);
    const { ROLES, STATUSES } = window.AdminUtils;

    if (!users.length) {
      tableEl.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--color-text-muted)">暂无用户</td></tr>';
    } else {
      tableEl.innerHTML = users.map(u => `
        <tr data-user-id="${u.id}">
          <td><strong>${esc(u.username)}</strong></td>
          <td>${esc(u.email)}</td>
          <td><span class="badge badge--${u.role}">${esc(u.role)}</span></td>
          <td><span class="badge badge--${u.status}">${esc(u.status)}</span></td>
          <td>${esc(formatDate(u.created_at))}</td>
          <td>
            <div style="display:flex;gap:4px;flex-wrap:wrap">
              <button class="btn btn--small" onclick="AdminUsers.openRoleModal(${u.id}, '${esc(u.role)}')">角色</button>
              <button class="btn btn--small btn--warning" onclick="AdminUsers.openSuspendModal(${u.id}, '${esc(u.username)}', '${u.status}')">${u.status === 'suspended' || u.status === 'banned' ? '解封' : '封禁'}</button>
              <button class="btn btn--small btn--danger" onclick="AdminUsers.confirmDelete(${u.id}, '${esc(u.username)}')">删除</button>
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

  // ── 角色修改 ──────────────────────────────────────────
  function openRoleModal(userId, currentRole) {
    const { ROLES } = window.AdminUtils;
    const html = `
      <div style="display:flex;flex-direction:column;gap:12px">
        <label style="font-size:13px;color:var(--color-text-muted)">选择角色</label>
        ${ROLES.map(r => `
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
            <input type="radio" name="role" value="${r}" ${r === currentRole ? 'checked' : ''}> ${esc(r)}
          </label>
        `).join('')}
      </div>
    `;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:320px">
        <div class="modal__header">修改用户角色</div>
        <div class="modal__body">${html}</div>
        <div class="modal__footer" style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn--secondary" id="cancel">取消</button>
          <button class="btn btn--primary" id="ok">保存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#ok').onclick = async () => {
      const newRole = overlay.querySelector('input[name="role"]:checked')?.value;
      if (!newRole) return;
      overlay.remove();
      try {
        await apiFetch(`/api/admin/users/${userId}/role`, { method: 'PUT', body: JSON.stringify({ role: newRole }) });
        toast('角色已更新', 'success');
        loadUsers(currentPage);
      } catch (e) { toast('更新失败: ' + e.message, 'error'); }
    };
    overlay.querySelector('#cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ── 封禁/解封 ──────────────────────────────────────────
  function openSuspendModal(userId, username, currentStatus) {
    const action = (currentStatus === 'suspended' || currentStatus === 'banned') ? 'unsuspend' : 'suspend';
    const html = action === 'suspend' ? `
      <div style="display:flex;flex-direction:column;gap:8px">
        <label style="font-size:13px;color:var(--color-text-muted)">封禁原因（可选）</label>
        <input type="text" id="suspend-reason" class="form-control" placeholder="输入封禁原因...">
      </div>
    ` : '<p>确定要解封此用户吗？</p>';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:380px">
        <div class="modal__header">${action === 'suspend' ? '封禁用户' : '解封用户'}</div>
        <div class="modal__body">${html}</div>
        <div class="modal__footer" style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn--secondary" id="cancel">取消</button>
          <button class="btn btn--warning" id="ok">${action === 'suspend' ? '封禁' : '解封'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#ok').onclick = async () => {
      const reason = overlay.querySelector('#suspend-reason')?.value || '';
      overlay.remove();
      try {
        await apiFetch(`/api/admin/users/${userId}/suspend`, {
          method: 'PUT',
          body: JSON.stringify({ action, reason }),
        });
        toast(action === 'suspend' ? '用户已封禁' : '用户已解封', 'success');
        loadUsers(currentPage);
      } catch (e) { toast('操作失败: ' + e.message, 'error'); }
    };
    overlay.querySelector('#cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  }

  // ── 删除用户 ──────────────────────────────────────────
  async function confirmDelete(userId, username) {
    const confirmed = await confirmAction({
      title: '删除用户',
      message: `确定永久删除用户 "${username}" 吗？此操作不可撤销。`,
      requiredPhrase: 'DELETE USER',
      confirmText: '永久删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      toast('用户已删除', 'success');
      loadUsers(currentPage);
    } catch (e) { toast('删除失败: ' + e.message, 'error'); }
  }

  window.AdminUsers = { init, loadUsers, search, openRoleModal, openSuspendModal, confirmDelete };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-users.js
git commit -m "feat(admin): add admin-users.js - user management with abort, confirm dialogs

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: 创建 `public/js/admin/admin-announcements.js`

**Files:**
- Create: `public/js/admin/admin-announcements.js`

- [ ] **Step 1: 写入 admin-announcements.js — 公告管理，含表单完整重置**

```javascript
// public/js/admin/admin-announcements.js
(function () {
  'use strict';

  // ── 模块状态 ─────────────────────────────────────────
  let editingId = null;
  let isDirty = false;
  let controller = null;
  let container = null;

  const { apiFetch } = window.AdminApi;
  const { esc, sanitizeRich, formatDate } = window.AdminUtils;
  const { showSkeleton, toast, confirmAction } = window.AdminUI;

  // ── 初始化 ───────────────────────────────────────────
  function init(el) {
    container = el;
    loadAnnouncements();

    const form = document.getElementById('announcement-form');
    form.addEventListener('input', () => { isDirty = true; form.dataset.dirty = 'true'; });

    document.getElementById('add-announcement-btn').addEventListener('click', openCreateModal);
    document.getElementById('close-announcement-modal').addEventListener('click', closeModal);
  }

  // ── 加载公告列表 ──────────────────────────────────────
  async function loadAnnouncements() {
    const listEl = container.querySelector('[data-list="announcements"]');
    showSkeleton(listEl, { rows: 5, cols: 4 });
    try {
      const data = await apiFetch('/api/announcements');
      renderList(data.announcements || []);
    } catch (e) { toast('加载公告失败', 'error'); }
  }

  // ── 渲染列表 ──────────────────────────────────────────
  function renderList(announcements) {
    const listEl = container.querySelector('[data-list="announcements"]');
    const { ANNOUNCEMENT_TYPES } = window.AdminUtils;
    if (!announcements.length) {
      listEl.innerHTML = '<p style="text-align:center;padding:40px;color:var(--color-text-muted)">暂无公告</p>';
      return;
    }
    listEl.innerHTML = announcements.map(a => `
      <div class="announcement-card" data-id="${a.id}">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">
          <div>
            <span class="badge badge--${esc(a.type)}">${esc(a.type)}</span>
            <strong style="margin-left:8px">${esc(a.title)}</strong>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn--small" onclick="AdminAnnouncements.openEditModal(${a.id})">编辑</button>
            <button class="btn btn--small btn--danger" onclick="AdminAnnouncements.confirmDelete(${a.id}, '${esc(a.title)}')">删除</button>
          </div>
        </div>
        <div style="font-size:13px;color:var(--color-text-muted)">${esc(formatDate(a.created_at))}</div>
      </div>
    `).join('');
  }

  // ── 创建模态框 ────────────────────────────────────────
  function openCreateModal() {
    editingId = null;
    isDirty = false;
    const form = document.getElementById('announcement-form');
    form.reset();
    form.dataset.editingId = '';
    form.dataset.dirty = 'false';
    document.getElementById('announcement-modal').classList.add('modal-overlay--open');
  }

  // ── 编辑模态框 ────────────────────────────────────────
  async function openEditModal(id) {
    try {
      const data = await apiFetch(`/api/announcements/${id}`);
      const a = data.announcement;
      document.getElementById('ann-title').value = esc(a.title) || '';
      document.getElementById('ann-type').value = a.type || 'info';
      document.getElementById('ann-content').value = a.content || '';
      editingId = id;
      isDirty = false;
      const form = document.getElementById('announcement-form');
      form.dataset.editingId = String(id);
      form.dataset.dirty = 'false';
      document.getElementById('announcement-modal').classList.add('modal-overlay--open');
    } catch (e) { toast('加载公告失败', 'error'); }
  }

  // ── 关闭模态框（含脏状态检查）───────────────────────
  async function closeModal() {
    if (isDirty) {
      const leave = await confirmAction({
        title: '离开此页面？',
        message: '你有未保存的更改，确定要离开吗？',
        requiredPhrase: 'LEAVE',
        danger: false,
      });
      if (!leave) return;
    }
    resetForm();
    document.getElementById('announcement-modal').classList.remove('modal-overlay--open');
  }

  // ── 表单重置 ──────────────────────────────────────────
  function resetForm() {
    const form = document.getElementById('announcement-form');
    form.reset();
    document.getElementById('ann-title').value = '';
    document.getElementById('ann-type').value = 'info';
    document.getElementById('ann-content').value = '';
    editingId = null;
    isDirty = false;
    form.dataset.editingId = '';
    form.dataset.dirty = 'false';
  }

  // ── 保存公告 ─────────────────────────────────────────
  async function saveAnnouncement() {
    const title = document.getElementById('ann-title').value.trim();
    const type = document.getElementById('ann-type').value;
    const content = document.getElementById('ann-content').value;

    if (!title || !content) { toast('标题和内容不能为空', 'error'); return; }
    if (content.length > 10000) { toast('内容过长', 'error'); return; }

    const payload = { title, type, content: sanitizeRich(content) };
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/announcements/${editingId}` : '/api/announcements';

    try {
      await apiFetch(url, { method, body: JSON.stringify(payload) });
      toast(editingId ? '公告已更新' : '公告已创建', 'success');
      document.getElementById('announcement-modal').classList.remove('modal-overlay--open');
      resetForm();
      loadAnnouncements();
    } catch (e) { toast('保存失败: ' + e.message, 'error'); }
  }

  // ── 删除公告 ─────────────────────────────────────────
  async function confirmDelete(id, title) {
    const confirmed = await confirmAction({
      title: '删除公告',
      message: `确定删除公告 "${title}" 吗？`,
      requiredPhrase: 'DELETE ANNOUNCEMENT',
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await apiFetch(`/api/announcements/${id}`, { method: 'DELETE' });
      toast('公告已删除', 'success');
      loadAnnouncements();
    } catch (e) { toast('删除失败: ' + e.message, 'error'); }
  }

  window.AdminAnnouncements = { init, loadAnnouncements, openCreateModal, openEditModal, closeModal, saveAnnouncement, confirmDelete };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-announcements.js
git commit -m "feat(admin): add admin-announcements.js - CRUD with form reset and dirty check

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: 创建 `public/js/admin/admin-stats.js`

**Files:**
- Create: `public/js/admin/admin-stats.js`

- [ ] **Step 1: 写入 admin-stats.js — 统计概览，Promise.allSettled 独立请求**

```javascript
// public/js/admin/admin-stats.js
(function () {
  'use strict';

  let container = null;
  const { apiFetch } = window.AdminApi;
  const { esc, formatDate } = window.AdminUtils;
  const { toast } = window.AdminUI;

  function init(el) {
    container = el;
    // 各 widget 独立请求，失败互不影响
    Promise.allSettled([
      loadStatsCards(),
      loadRecentUsers(),
      loadRecentActivity(),
    ]).then(([cards, users, activity]) => {
      if (cards.status === 'fulfilled') renderStatsCards(cards.value);
      if (users.status === 'fulfilled') renderRecentUsers(users.value);
      if (activity.status === 'fulfilled') renderRecentActivity(activity.value);
    });
  }

  async function loadStatsCards() {
    return await apiFetch('/api/admin/stats');
  }

  async function loadRecentUsers() {
    return await apiFetch('/api/admin/users?limit=10');
  }

  async function loadRecentActivity() {
    return await apiFetch('/api/admin/activities?limit=20');
  }

  function renderStatsCards(data) {
    const el = container.querySelector('[data-widget="cards"]');
    el.innerHTML = `
      <div class="stat-card">
        <div class="stat-card__label">总用户数</div>
        <div class="stat-card__value">${esc(String(data.users?.total || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">活跃用户</div>
        <div class="stat-card__value">${esc(String(data.users?.active || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">今日注册</div>
        <div class="stat-card__value">${esc(String(data.users?.today || 0))}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">总下载量</div>
        <div class="stat-card__value">${esc(String(data.downloads || 0))}</div>
      </div>
    `;
  }

  function renderRecentUsers(data) {
    const el = container.querySelector('[data-widget="recent-users"]');
    const users = data.users || [];
    if (!users.length) { el.innerHTML = '<p style="color:var(--color-text-muted)">暂无数据</p>'; return; }
    el.innerHTML = `
      <table class="table">
        <thead><tr><th>用户</th><th>角色</th><th>注册时间</th></tr></thead>
        <tbody>
          ${users.map(u => `<tr><td>${esc(u.username)}</td><td>${esc(u.role)}</td><td>${esc(formatDate(u.created_at))}</td></tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  function renderRecentActivity(data) {
    const el = container.querySelector('[data-widget="recent-activity"]');
    const activities = data.activities || [];
    if (!activities.length) { el.innerHTML = '<p style="color:var(--color-text-muted)">暂无数据</p>'; return; }
    el.innerHTML = activities.map(a => `
      <div style="padding:8px 0;border-bottom:1px solid var(--color-border);font-size:13px">
        <strong>${esc(a.event_type)}</strong> — ${esc(a.description)} <span style="color:var(--color-text-muted)">${esc(formatDate(a.created_at))}</span>
      </div>
    `).join('');
  }

  window.AdminStats = { init };
})();
```

- [ ] **Step 2: 提交**

```bash
git add public/js/admin/admin-stats.js
git commit -m "feat(admin): add admin-stats.js - independent widget loading with Promise.allSettled

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: 重构 admin.html

### Task 13: 重构 `public/admin.html`

**Files:**
- Modify: `public/admin.html` — 移除全部内联 JS，保留 HTML 结构，加载模块脚本，添加视图容器

- [ ] **Step 1: 读取 admin.html 确认各 section 位置**

Run: `grep -n "<script\|function \|async function\|const \|let \|// ─\|window\." public/admin.html | head -80`

- [ ] **Step 2: 替换 script 标签内容**

保留 `<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>`
将整个 `<script>` 标签（约 930 行）替换为模块加载代码：

```html
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"></script>
<script src="/js/admin/admin-utils.js"></script>
<script src="/js/admin/admin-api.js"></script>
<script src="/js/admin/admin-ui.js"></script>
<script src="/js/admin/admin-core.js"></script>
<script src="/js/admin/admin-users.js"></script>
<script src="/js/admin/admin-announcements.js"></script>
<script src="/js/admin/admin-stats.js"></script>
<script>
  document.addEventListener('DOMContentLoaded', () => {
    AdminCore.init(document.getElementById('admin-app'));
  });
</script>
```

- [ ] **Step 3: 添加用户信息 data 属性**

在 `<body>` 或 `<div id="admin-app">` 内添加（由后端模板注入或在页面直接内联）：
```html
<script id="current-user-data" type="application/json">
  {"id":1,"username":"admin","role":"admin"}
</script>
```

- [ ] **Step 4: 替换硬编码的 onclick 为事件委托**

将 `<button onclick="openRoleModal(...)">` 替换为 `data-action="role-modal" data-user-id="..."`，
在 AdminCore init 时通过事件委托绑定：
```javascript
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'role-modal') AdminUsers.openRoleModal(parseInt(btn.dataset.userId), btn.dataset.role);
  if (action === 'suspend-modal') AdminUsers.openSuspendModal(parseInt(btn.dataset.userId), btn.dataset.username, btn.dataset.status);
  if (action === 'delete-user') AdminUsers.confirmDelete(parseInt(btn.dataset.userId), btn.dataset.username);
});
```

- [ ] **Step 5: 替换 confirm 确认框**

将所有 `if (confirm('...'))` 替换为 `await AdminUI.confirmAction(...)`
将 `alert('...')` 替换为 `AdminUI.toast(...)`

- [ ] **Step 6: 修复 XSS 风险点**

替换 `innerHTML = esc(val)` 的拼接模板为 `textContent` 或结构化 DOM 操作：
```javascript
// 替换前（有风险）
td.innerHTML = `<strong>${esc(u.username)}</strong>`;

// 替换后（安全）
td.textContent = u.username;
```

- [ ] **Step 7: 提交**

```bash
git add public/admin.html
git commit -m "refactor(admin): split admin.html into modules - remove 930 inline JS lines

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 验证清单

### 安全测试
- [ ] XSS payload `<img src=x onerror=alert(1)>` 输入到公告内容 → 应被 DOMPurify 净化
- [ ] 手动构造无 CSRF token 的 DELETE 请求 → 403 Forbidden
- [ ] 登录后刷新，CSRF cookie 存在且与请求 header 匹配
- [ ] 非 admin 用户访问 `/admin` → 重定向到 `/dashboard`

### UX 测试
- [ ] 连续快速搜索 → 只触发一次请求（旧请求被 AbortController 取消）
- [ ] 加载用户列表时 → 显示 skeleton；响应后替换为表格
- [ ] 删除用户不输入确认短语 → 确认按钮禁用
- [ ] 公告表单填写后点关闭 → 弹出离开确认

### 回归测试
- [ ] 用户列表搜索/分页/角色修改/封禁/删除
- [ ] 公告创建/编辑/删除
- [ ] 统计概览各 widget 独立加载（一个失败不影响其他）
# Admin 管理后台优化设计文档

> **日期:** 2026-04-15
> **目标:** 将 `public/admin.html` 从 ~1000 行单文件 + 全局函数重构为模块化架构，同时修复 12 个安全问题与 UX 缺陷

---

## 一、问题清单与根因分析

| # | 问题 | 根因 | 修复方案 |
|---|------|------|----------|
| 1 | XSS 风险 — `esc()` 函数不充分 | 直接用 `innerHTML = esc(x)` 无法防护 DOM clobbering；富文本内容未净化 | DOMPurify 净化、全部改用 `textContent` 或 `esc()` + `innerHTML` |
| 2 | 公告编辑 XSS 隐患 | 用户提交的 content 含 HTML 时直接渲染 | 富文本内容经 DOMPurify 过滤后输出 |
| 3 | CSRF 保护缺失 | 无 CSRF token 机制 | SameSite cookie + X-CSRF-Token header |
| 4 | 敏感操作无二次确认 | delete/suspend 等直接执行 | typed phrase 确认对话框 |
| 5 | 用户角色枚举硬编码 | `role === 'admin'` 等字面量散布多处 | 集中常量 + 后端白名单校验 |
| 6 | 全局函数污染 | 所有 JS 函数在 window 作用域 | IIFE 模块 + 闭包封装 |
| 7 | 状态管理散乱 | 数十个全局变量散布文件 | 模块级闭包状态 + 中心状态共享 |
| 8 | debounce 实现不健壮 | 单一共享 timer，全局 `t` 变量 | 每处 debounce 创建独立实例 |
| 9 | 缺少加载状态与并发控制 | 请求无 loading、无 abort | Skeleton loader + AbortController |
| 10 | 公告表单重置逻辑不完整 | 关闭时未清空富文本编辑器和脏状态 | `form.reset()` + 手动清空编辑器 + 离开确认 |
| 11 | 图表数据请求阻塞全量刷新 | `Promise.all([loadStats(), loadChart()])` | 各模块独立请求、独立渲染 |
| 12 | 分页组件不可复用 | `renderPagination()` 在 admin.html 内联 | 抽取为 `AdminUI.renderPagination()` |

---

## 二、模块架构

### 2.1 文件结构

```
public/js/admin/
├── admin-core.js          # 入口：权限守卫、初始化、路由分发、跨模块状态
├── admin-api.js          # API 层：fetch 封装、CSRF header、请求去重
├── admin-utils.js         # 工具：esc(), createDebounce(), DOMPurify 封装
├── admin-users.js         # 用户管理：列表、搜索、角色修改、封禁/解封、删除
├── admin-announcements.js  # 公告管理：列表、创建、编辑、删除
├── admin-stats.js         # 统计概览：卡片数据、用户列表、活动记录、图表
└── admin-ui.js            # 通用 UI：确认对话框、分页、Toast 封装、Skeleton
```

### 2.2 模块格式

每个模块为 IIFE，状态封装在闭包内，通过 `window.AdminXxx` 暴露有限接口：

```javascript
// admin-users.js
(function() {
  'use strict';

  // --- 模块状态（不泄漏到 window） ---
  let currentPage = 1;
  let searchQuery = '';
  let controller = null; // AbortController for request deduplication
  const { apiFetch } = window.AdminApi;

  // --- 渲染 ---
  function render(container) {
    container.innerHTML = '<div class="skeleton" style="height:300px"></div>';
    loadUsers(currentPage).then(renderTable);
  }

  // --- 数据加载（可 abort） ---
  async function loadUsers(page) {
    if (controller) controller.abort();
    controller = new AbortController();
    const data = await apiFetch(`/api/admin/users?page=${page}&search=${encodeURIComponent(searchQuery)}`, {
      signal: controller.signal,
    });
    return data;
  }

  // --- 公开接口 ---
  window.AdminUsers = { init, loadUsers, search };
})();
```

### 2.3 模块间通信

`AdminCore` 作为跨模块状态中枢：

```javascript
// admin-core.js
(function() {
  'use strict';

  const state = {
    currentUser: null,  // { id, username, role }
    csrfToken: null,
    views: {},          // 视图引用
  };

  function requireAdmin() {
    if (!state.currentUser || !['admin', 'superadmin'].includes(state.currentUser.role)) {
      window.location.href = '/dashboard';
      return false;
    }
    return true;
  }

  function init(user) {
    state.currentUser = user;
    if (!requireAdmin()) return;

    // 初始化各模块
    AdminUsers.init(document.getElementById('users-view'));
    AdminAnnouncements.init(document.getElementById('announcements-view'));
    AdminStats.init(document.getElementById('stats-view'));
  }

  window.AdminCore = { init, requireAdmin, getState: () => state };
})();
```

---

## 三、安全修复

### 3.1 XSS 防护

**`admin-utils.js` — 安全的转义函数：**

```javascript
function esc(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function sanitizeRich(html) {
  // 公告富文本：只允许少量安全标签
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target'],
  });
}
```

**使用规范：**
- 纯文本内容（用户名、邮箱、时间）：`textContent = esc(value)` 或 `innerHTML = esc(value)`
- 富文本内容（公告 body）：`innerHTML = sanitizeRich(userHtml)`
- 禁止模式：`<div class="${cls}">${val}</div>` — 必须用 `esc(val)`

### 3.2 CSRF 保护

**后端 `middleware/csrf.js`（新建）：**

```javascript
function csrfMiddleware(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const token = req.headers['x-csrf-token'];
  const cookie = req.cookies['csrf_token'];
  if (!token || !cookie || token !== cookie) {
    return res.status(403).json({ error: 'CSRF token 无效' });
  }
  next();
}
```

**`routes/auth.js` — 登录时设置 CSRF cookie：**

```javascript
// 登录成功响应中
res.cookie('csrf_token', generateCsrfToken(), {
  httpOnly: false, // 前端 JS 需要读取
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
  secure: process.env.NODE_ENV === 'production',
});
```

**`admin-api.js` — 统一附加 CSRF header：**

```javascript
function apiFetch(url, options = {}) {
  const token = getCsrfToken();
  return fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': token || '',
      ...options.headers,
    },
  });
}
```

### 3.3 角色枚举集中化

**`admin-utils.js` — 导出常量：**

```javascript
const ROLES = Object.freeze(['user', 'admin', 'superadmin']);
const ACTIONS = Object.freeze(['suspend', 'unsuspend', 'ban']);
const STATUSES = Object.freeze(['active', 'suspended', 'banned']);
```

**`routes/admin.js` — 后端校验：**

```javascript
const ROLES = ['user', 'admin', 'superadmin'];
const ACTIONS = ['suspend', 'unsuspend', 'ban'];

// GET /api/admin/users — role 过滤校验
const role = req.query.role;
if (role && !ROLES.includes(role)) return res.status(400).json({ error: '无效的角色' });

// PUT /api/admin/users/:id/suspend — action 校验
if (!ACTIONS.includes(action)) return res.status(400).json({ error: '无效的操作' });
```

---

## 四、UX 改进

### 4.1 加载状态 — Skeleton Loader

使用 `components.css` 已有类：

```javascript
// admin-ui.js
function showSkeleton(container, { rows = 5, cols = 4 } = {}) {
  const colWidths = { 1: '20%', 2: '40%', 3: '60%', 4: '80%', 5: '100%' };
  container.innerHTML = Array.from({ length: rows }, () =>
    `<div class="skeleton" style="height:48px;margin-bottom:8px;width:${colWidths[cols]}"></div>`
  ).join('');
}
```

### 4.2 并发控制 — AbortController

每个数据加载函数管理自己的 controller：

```javascript
async function loadUsers(page) {
  if (controller) controller.abort();
  controller = new AbortController();
  try {
    const res = await fetch(`/api/admin/users?page=${page}`, {
      signal: controller.signal,
      credentials: 'include',
    });
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') return null; // 忽略主动取消
    throw e;
  }
}
```

### 4.3 图表独立请求

`AdminStats` 内部各 widget 独立请求、独立渲染，失败不影响其他：

```javascript
// admin-stats.js
async function init(container) {
  Promise.allSettled([
    loadStats().then(renderStatsCards),
    loadRecentUsers().then(renderRecentUsers),
    loadActivity().then(renderActivity),
    loadGrowthData().then(renderGrowthChart),
  ]);
}
```

`Promise.allSettled` 确保任意一个失败不影响其他 widget 的展示。

### 4.4 二次确认对话框

```javascript
// admin-ui.js
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
            <input type="text" id="confirm-input" class="form-control" style="margin-top:6px" autocomplete="off">
          ` : ''}
        </div>
        <div class="modal__footer" style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn--secondary" id="confirm-cancel">取消</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" id="confirm-ok" disabled>${esc(confirmText)}</button>
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
    } else {
      okBtn.disabled = false;
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
```

调用示例：
```javascript
const confirmed = await AdminUI.confirmAction({
  title: '删除用户',
  message: `确定永久删除用户 "${user.username}" 吗？此操作不可撤销。`,
  requiredPhrase: 'DELETE USER',
  confirmText: '永久删除',
  danger: true,
});
if (!confirmed) return;
await AdminApi.request('DELETE', `/api/admin/users/${userId}`);
```

### 4.5 公告表单完整重置

```javascript
// admin-announcements.js
function resetForm() {
  const form = document.getElementById('announcement-form');
  form.reset();
  const editor = form.querySelector('[data-editor]');
  if (editor) editor.innerHTML = '';
  form.dataset.editingId = '';
  form.dataset.dirty = 'false';
}

function closeAnnouncementModal() {
  const form = document.getElementById('announcement-form');
  if (form.dataset.dirty === 'true') {
    const leave = await AdminUI.confirmAction({
      title: '离开此页面？',
      message: '你有未保存的更改，确定要离开吗？',
      requiredPhrase: 'LEAVE',
    });
    if (!leave) return;
  }
  resetForm();
  document.getElementById('announcement-modal').classList.remove('modal-overlay--open');
}
```

### 4.6 重构后的 debounce

```javascript
// admin-utils.js
function createDebounce(fn, ms) {
  let t = null;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

// 使用：每个场景创建独立实例
const debouncedSearch = createDebounce(searchUsers, 300);
const debouncedResize = createDebounce(resizeCharts, 250);
```

---

## 五、后端改动

### 5.1 新建 `middleware/csrf.js`

验证 `X-CSRF-Token` header 与 cookie 匹配，用于所有非安全 HTTP 方法。

### 5.2 `routes/auth.js`

登录成功后设置 `csrf_token` cookie（httpOnly: false，sameSite: lax）。

### 5.3 `routes/admin.js`

使用 `ROLES` 和 `ACTIONS` 常量替代硬编码字面量。

### 5.4 `routes/announcements.js`

将 POST/PUT/DELETE 路由的 `requireAuth` 替换为 `requireAdmin`（admin.js 中的中间件或 admin.js 路由中加检查）。

---

## 六、文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `public/admin.html` | 修改 | 移除所有内联 JS，保留 HTML 结构，添加模块 script 引入，添加视图容器 |
| `public/js/admin/admin-core.js` | 新建 | 权限守卫、初始化、跨模块状态 |
| `public/js/admin/admin-api.js` | 新建 | CSRF fetch 封装、请求去重、错误处理 |
| `public/js/admin/admin-utils.js` | 新建 | esc, sanitizeRich, createDebounce, ROLES/ACTIONS 常量 |
| `public/js/admin/admin-users.js` | 新建 | 用户管理完整逻辑 |
| `public/js/admin/admin-announcements.js` | 新建 | 公告管理完整逻辑，含表单完整重置 |
| `public/js/admin/admin-stats.js` | 新建 | 统计概览，各 widget 独立请求 |
| `public/js/admin/admin-ui.js` | 新建 | confirmAction, renderPagination, showSkeleton, Toast 封装 |
| `middleware/csrf.js` | 新建 | CSRF 验证中间件 |
| `middleware/auth.js` | 修改 | 登录时设置 CSRF cookie |
| `routes/admin.js` | 修改 | 使用 ROLES/ACTIONS 常量 |
| `routes/announcements.js` | 修改 | admin 路由加权限检查 |
| `server.js` | 修改 | 挂载 CSRF 中间件 |

---

## 七、CSP 策略

`server.js` 当前 CSP 包含 `'unsafe-inline'`，建议在引入 DOMPurify 后逐步收紧：

- 短期：移除 `unsafe-inline` 对 scriptSrc 的影响（改用 nonce 或 hash）
- 或者：引入 DOMPurify CDN 后，保持现有 CSP，因为 DOMPurify 本身可净化 XSS

---

## 八、测试验证

1. **安全测试：**
   - [ ] XSS payload `<img src=x onerror=alert(1)>` 输入到公告内容 → 应被净化
   - [ ] 手动构造无 CSRF token 的 DELETE 请求 → 403
   - [ ] 登录后刷新，CSRF cookie 应存在且与请求 header 匹配
   - [ ] 非 admin 用户访问 `/admin` → 重定向到 `/dashboard`

2. **UX 测试：**
   - [ ] 连续快速搜索 → 只触发一次请求（旧请求被 abort）
   - [ ] 加载用户列表时 → 显示 skeleton；响应后替换为表格
   - [ ] 删除用户不输入确认短语 → 确认按钮禁用
   - [ ] 公告表单填写后点关闭 → 弹出离开确认

3. **回归测试：**
   - [ ] 用户列表搜索/分页/角色修改/封禁/删除
   - [ ] 公告创建/编辑/删除/dismiss
   - [ ] 统计概览各 widget 独立加载（关掉图表服务器时其他 widget 不受影响）

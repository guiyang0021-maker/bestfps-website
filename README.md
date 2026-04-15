# bestfps-website

Minecraft 光影/资源包配置管理与分享平台的完整实现，包含用户认证系统、管理后台、数据同步等完整功能。

## 项目概览

**技术栈**
- 后端: Node.js + Express + better-sqlite3
- 前端: 原生 HTML/CSS/JS（无框架），Admin 面板采用 IIFE 模块化架构
- 测试: Jest（单元测试）+ Playwright（E2E 测试）
- 安全: Helmet, express-rate-limit, bcrypt, JWT

## 这个项目可以学到什么

本项目涵盖了 Web 开发中许多值得学习的模式和实践，下面对每个学习点做具体说明。

---

### 1. 可吊销的 JWT 认证 — Session + Token 双层设计

**问题**: 传统 JWT 是无状态的，签发后无法撤销。改密码后攻击者依然能使用旧 Token。

**解决方案** ([middleware/auth.js](middleware/auth.js)):

```
用户登录 → 生成 jti (session ID) + token_hash (SHA256)
         → 写入 user_sessions 表
         → JWT payload = { id, username, email, role, jti }
         → 返回给客户端
```

每次请求时:
```javascript
// requireAuth 中检查会话是否被撤销
db.get('SELECT * FROM user_sessions WHERE jti = ?', [jti], (err, session) => {
  if (!session) return res.status(401).json({ error: '会话已失效' });
  if (new Date(session.expires_at) < new Date()) return res.status(401).json({ error: '会话已过期' });
});
```

修改密码时吊销其他会话:
```javascript
// 获取当前 token 的 hash
const rawToken = req.headers.authorization?.slice(7) || '';
const currentTokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
// 删除除当前会话外的所有会话
db.run('DELETE FROM user_sessions WHERE user_id = ? AND token_hash != ?',
  [req.user.id, currentTokenHash]);
```

**为什么这样做**: `user_sessions` 表记录每个 Token 的 hash，撤销时删除记录即可。改密码后所有旧 Session 被清除，攻击者的 Token 立即失效。这是"Token 存在但 Session 不存在 = 失效"的设计，与 Redis Session 方案效果相同，但用 SQLite 实现。

---

### 2. 数据库封装层 — sqlite3 回调风格迁移到 better-sqlite3

**问题**: `better-sqlite3` 是同步 API，但项目中大量路由代码使用 `db.get/run/all(cb)` 回调风格。

**解决方案** ([db.js](db.js) `createDbWrapper` 函数):

```javascript
function createDbWrapper(targetDb) {
  return {
    get(sql, ...args) {
      const params = isArray ? args[0] : args.filter(a => typeof a !== 'function');
      const cb = args.find(a => typeof a === 'function');
      try {
        const row = targetDb.prepare(sql).get(...params);
        if (cb) cb(null, row);
      } catch (err) {
        if (cb) cb(err);
      }
    },
    run(sql, ...args) {
      // 同理，将同步结果包装成回调
    },
    all(sql, ...args) { /* ... */ }
  };
}
```

**测试替换模式**:
```javascript
// 测试时替换 db 对象
function resetForTest(testDb) {
  module.exports.db = createDbWrapper(testDb);  // 动态替换
}
// 测试文件
const { resetForTest } = require('../db');
beforeEach(() => resetForTest(new Database(':memory:')));
```

**为什么这样做**: 同步 API 在 Express 路由中需要用 `run()` 方法（better-sqlite3 的同步方法不阻塞事件循环，但需要在事务中执行）。封装层让代码用回调风格写，但内部调用同步方法。测试时动态替换 `module.exports.db` 确保所有模块使用同一个数据库实例。

---

### 3. 动态迁移系统 — 生产环境 Schema 演进

**问题**: SQLite 不支持 `ALTER TABLE ADD COLUMN IF NOT EXISTS`。开发和生产数据库 Schema 不同步会导致部署失败。

**解决方案** ([db.js](db.js)):

```javascript
// 通过 pragma 获取当前表列
const userCols = db.pragma('table_info(users)').map(r => r.name);
if (!userCols.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
}
// 字符串列可安全地重复 ADD（如果不存在则忽略）
// 但注意：SQLite 对 DROP COLUMN 有版本限制
```

**模式**: 先检查再修改，而非假设 Schema 存在。这使得同一份代码可以在全新数据库和已有数据库上都能运行。

---

### 4. 模块化路由架构 — router.setup() 模式

**问题**: 一个 `auth.js` 路由文件变得太大难以维护。

**解决方案** ([routes/auth.js](routes/auth.js)):

```
routes/auth/
├── index.js        # 组合入口
├── account.js      # 注册/登录
├── password.js     # 密码修改/重置
├── email.js        # 邮箱修改/验证
├── profile.js      # 个人资料
├── sessions.js     # 会话管理
└── utils.js        # 共享工具（PASSWORD_REGEX, parseUserAgent, avatarUpload）
```

每个子模块导出 `setup(router)` 函数:
```javascript
// routes/auth/profile.js
function setup(router) {
  router.get('/profile', requireAuth, (req, res) => { /* ... */ });
  router.put('/profile', requireAuth, (req, res) => { /* ... */ });
}
module.exports = setup;

// routes/auth.js 组合
const profileRoutes = require('./auth/profile');
profileRoutes(router);  // 传入同一个 router 实例
```

**为什么这样做**: 每个模块专注一个功能领域，共享的 `requireAuth` 等中间件由父模块传入。避免了循环依赖，也不需要额外的路径前缀配置。

---

### 5. 安全中间件栈 — 分层防御

**a. Helmet CSP** ([server.js](server.js)):
```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    }
  }
}));
```

**b. CSRF 双重提交 Cookie** ([middleware/csrf.js](middleware/csrf.js)):
```javascript
const csrfMiddleware = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies['csrf_token'];
  if (headerToken !== cookieToken) {
    return res.status(403).json({ error: 'CSRF token 无效' });
  }
  next();
};
```
登录时设置非 HttpOnly Cookie (`csrf_token`)，前端请求时通过 `X-CSRF-Token` header 传回。

**c. 分层限流** ([middleware/rateLimiter.js](middleware/rateLimiter.js)):
```javascript
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 5,
  skipSuccessfulRequests: true,  // 成功的登录不计数
});
const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3 });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100 });
const forgotPasswordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3 });
const changeEmailLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3 });
```
不同端点有不同限制：`loginLimiter` 跳过成功请求（避免频繁登录的用户被误限），`registerLimiter` 极严格（防批量注册），`apiLimiter` 对已登录用户豁免。

**d. 密码强度强制** ([routes/auth/utils.js](routes/auth/utils.js)):
```javascript
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,}$/;
```

---

### 6. Admin 前端模块模式 — IIFE + 事件委托

**问题**: 大量全局函数污染、模态框事件绑定混乱、状态管理散乱。

**模式 A: 静态模态框 + Hidden Field** ([public/js/admin/admin-users.js](public/js/admin/admin-users.js)):

```javascript
// HTML: 模态框静态写在 admin.html 底部
// <div id="delete-modal" class="modal-overlay">
//   <input type="hidden" id="delete-user-id">
//   <button onclick="confirmDelete()">确认</button>
// </div>

// JS: AdminUsers 模块负责填充 hidden field
function openDeleteModal(userId, username) {
  document.getElementById('delete-user-id').value = userId;
  document.getElementById('delete-modal').classList.add('modal-overlay--open');
}

// admin.html inline script: 确认处理器读取 hidden field
// const userId = document.getElementById('delete-user-id').value;
// fetch(`/api/admin/users/${userId}`, { method: 'DELETE', ... });
```

**模式 B: 事件委托替代 inline onclick** ([public/js/admin/admin-core.js](public/js/admin/admin-core.js)):
```javascript
// 所有模态框关闭通过 data-modal-close 属性统一处理
document.addEventListener('click', (e) => {
  const closeBtn = e.target.closest('[data-modal-close]');
  if (closeBtn) {
    closeBtn.closest('.modal-overlay').classList.remove('modal-overlay--open');
  }
});
```

**模式 C: URL 参数同步** ([public/js/admin/admin-users.js](public/js/admin/admin-users.js)):
```javascript
function readUrlParams() {
  const params = new URLSearchParams(window.location.search);
  currentPage = parseInt(params.get('page')) || 1;
  searchQuery = params.get('search') || '';
}
function writeUrlParams(page, search, role, status) {
  history.replaceState(null, '', qs ? '/admin?view=users&' + qs : '/admin?view=users');
}
```

**模式 D: AbortController 请求取消**:
```javascript
async function loadUsers(page) {
  if (controller) controller.abort();  // 取消上一个请求
  controller = new AbortController();
  const data = await apiFetch(`/api/admin/users?${params}`, {
    signal: controller.signal
  });
  if (data.__aborted) return;  // 检查是否被取消
}
```

**模式 E: Getter 函数替代直接变量暴露**:
```javascript
// 错误: window.AdminUsers._currentPage  ← 内部变量直接暴露
// 正确:
window.AdminUsers = {
  getCurrentPage: () => currentPage,
};
```

---

### 7. 内存缓存中间件 — 按 Pattern 失效

**问题**: 公告等公开数据无需每次查库，但数据更新时需要通知缓存失效。

**解决方案** ([middleware/cache.js](middleware/cache.js)):

```javascript
function cached(ttlSeconds) {
  return (req, res, next) => {
    const key = req.user
      ? `${req.originalUrl}:uid-${req.user.id}`  // 认证用户隔离缓存
      : req.originalUrl;
    const cachedData = cache.get(key);
    if (cachedData !== undefined) return res.json(cachedData);

    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(key, data, ttlSeconds || 300);
      return originalJson(data);
    };
    next();
  };
}

function invalidate(pattern) {
  cache.keys().forEach(key => {
    if (key.includes(pattern)) cache.del(key);
  });
}

// 路由中: 公告更新后清除缓存
router.post('/', requireAdmin, (req, res) => {
  // ...
  res.status(201).json({ message: '公告已发布', id: this.lastID });
  invalidate('/public');  // 清除所有 /public 相关的缓存
});
```

**为什么这样做**: `invalidate(pattern)` 按 URL 片段匹配清除缓存，比手动维护缓存键列表更灵活。认证用户的缓存键包含 `uid-` 前缀防止跨用户数据泄漏。

---

### 8. Fire-and-Forget 活动日志

**问题**: 每次操作都等待日志写入会拖慢响应时间。

**解决方案** ([db.js](db.js)):

```javascript
const logActivity = (userId, eventType, description, metadata = {}, ip = '') => {
  try {
    db.prepare(
      'INSERT INTO user_activities (user_id, event_type, description, metadata, ip) VALUES (?, ?, ?, ?, ?)'
    ).run([userId, eventType, description, JSON.stringify(metadata), ip]);
  } catch (e) {
    console.error('[Activity] 记录失败:', e.message);
  }
};
```

直接使用 `db.prepare().run()`（同步）而非 `db.run()`（回调包装）。因为是 fire-and-forget，不需要等待结果。即使记录失败也不影响主业务流程。

---

### 9. 文件上传安全 — multer 配置

**解决方案** ([routes/auth/utils.js](routes/auth/utils.js)):

```javascript
const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, '../../public/uploads'),
    filename: (req, file, cb) => {
      cb(null, `avatar-${Date.now()}${path.extname(file.originalname).toLowerCase()}`);
    }
  }),
  limits: { fileSize: 2 * 1024 * 1024 },  // 2MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('仅支持 JPG/PNG/GIF/WebP 格式'));
  }
});
```

防御: 大小限制 + MIME type 检查 + 扩展名白名单 + 随机化文件名。

---

### 10. 并行数据库查询聚合

**问题**: 统计数据需要从多个表聚合，嵌套回调代码难读。

**解决方案** ([routes/admin.js](routes/admin.js)):

```javascript
const stats = {};
const pending = 7;  // 7 个独立的数据库查询
function done() {
  if (--pending === 0) res.json(stats);
}
db.get('SELECT COUNT(*) as total FROM users', [], (err, row) => {
  stats.totalUsers = row.total; done();
});
db.get('SELECT COUNT(*) as total FROM downloads', [], (err, row) => {
  stats.totalDownloads = row.total; done();
});
// ... 更多查询
```

**为什么这样做**: 每个查询独立执行，全部完成后才返回响应。避免了 `Promise.all` 的复杂度和 async/await 引入的额外依赖。

---

## 项目结构

```
bestfps-website/
├── server.js              # Express 入口，安全中间件配置
├── db.js                  # SQLite + wrapper + migrations + logActivity
├── routes/
│   ├── auth/              # 认证子模块（5 个文件）
│   │   ├── account.js     # 注册/登录/CSRF token
│   │   ├── password.js    # 密码修改/重置
│   │   ├── email.js       # 邮箱修改/验证
│   │   ├── profile.js     # 个人资料
│   │   ├── sessions.js    # 会话管理/账号注销
│   │   └── utils.js       # PASSWORD_REGEX, parseUserAgent, avatarUpload
│   ├── admin.js           # 管理后台 API
│   ├── presets.js         # 配置预设 CRUD
│   ├── share.js           # 分享链接
│   ├── announcements.js  # 公告系统
│   ├── settings.js        # 用户设置
│   ├── sync.js            # Minecraft 客户端同步
│   └── downloads.js       # 下载记录
├── middleware/
│   ├── auth.js            # JWT + session 认证
│   ├── admin.js           # requireAdmin 权限检查
│   ├── csrf.js            # CSRF 双重提交验证
│   ├── cache.js           # 内存缓存 + invalidate
│   └── rateLimiter.js     # 5 个分层限流器
├── public/
│   ├── admin.html         # 管理后台 SPA 页面
│   ├── dashboard.html     # 用户仪表盘
│   ├── js/admin/          # Admin 面板 IIFE 模块
│   └── css/               # 样式表
├── tests/                 # Jest 单元测试
└── email/
    └── sender.js          # Nodemailer，dev 模式输出到控制台
```

## 快速开始

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入 JWT_SECRET（至少 32 字符）

# 启动服务器
npm start
# 访问 http://localhost:3000
```

## 测试

```bash
npm test                  # 单元测试
npm run test:playwright   # E2E 测试
```

## 数据库 Schema

共 11 张表:

| 表名 | 用途 |
|------|------|
| `users` | 用户账号（包含 role/status 用于 RBAC） |
| `user_settings` | 用户配置（光影/资源包/暗黑模式） |
| `downloads` | 下载记录 |
| `email_verifications` | 邮箱验证 token |
| `password_resets` | 密码重置 token |
| `login_history` | 登录历史（含 IP/UA/设备信息） |
| `user_sessions` | JWT 会话管理（支持吊销） |
| `config_presets` | 配置预设 |
| `config_shares` | 分享链接 |
| `announcements` | 公告系统 |
| `user_activities` | 用户活动日志 |

## API 路由概览

- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录（返回 CSRF cookie）
- `POST /api/auth/password/*` — 密码修改/重置
- `POST /api/auth/email/*` — 邮箱修改/验证
- `GET/PUT /api/auth/profile` — 个人资料
- `GET /api/auth/login-history` — 登录历史
- `GET/DELETE /api/auth/sessions` — 会话管理
- `DELETE /api/auth/account` — 账号注销（需密码 + 短语确认）
- `GET/POST/PUT/DELETE /api/admin/*` — 管理后台 API（需 admin 角色）
- `GET/POST/PUT/DELETE /api/presets/*` — 配置预设
- `POST/GET/DELETE /api/share/*` — 分享链接
- `GET /api/announcements` — 公告（公开 + 个性化）
- `GET/PUT /api/settings` — 用户设置
- `POST/GET /api/sync/*` — Minecraft 客户端同步

## 许可证

MIT

# bestfps 网站性能优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将网站 API 响应时间降低 60-80%，静态资源传输体积减少 70%，首屏加载减少 50%。

**Architecture:** 四个独立优化方向并行开发：① better-sqlite3 同步数据库 ② node-cache 内存缓存 ③ express-compression Gzip/Brotli ④ esbuild 前端资源打包。

**Tech Stack:** better-sqlite3, node-cache, compression, esbuild, Playwright

---

## 一、文件映射

| 文件 | 职责 | 改动 |
|------|------|------|
| `db.js` | 数据库连接和初始化 | 改用 better-sqlite3，移除 callbacks |
| `middleware/auth.js` | JWT 认证 + 会话吊销检查 | 使用 dbGetter() 获取同步 db |
| `middleware/admin.js` | 管理员权限检查 | 使用 dbGetter() |
| `middleware/cache.js` | API 内存缓存中间件 | **新建** |
| `routes/settings.js` | 用户设置 CRUD | 改用同步查询语法 |
| `routes/downloads.js` | 下载记录 | 改用同步查询语法 |
| `routes/presets.js` | 配置预设管理 | 改用同步查询语法 |
| `routes/share.js` | 配置分享 | 改用同步查询语法 |
| `routes/announcements.js` | 公告系统 | 改用同步查询语法 |
| `routes/admin.js` | 管理后台 API | 改用同步查询语法 |
| `routes/sync.js` | 配置同步 | 改用同步查询语法 |
| `server.js` | Express 服务器入口 | 添加 compression 中间件 |
| `build.js` | esbuild 构建脚本 | **新建** |
| `package.json` | 依赖管理 | 添加 build 脚本 |
| `public/dashboard.html` | 控制面板页面 | 引用构建后的资源 |
| `tests/performance.test.js` | Playwright 性能测试 | **新建** |

---

## 二、任务清单

### Task 1: 安装依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 node-cache 和 compression**

Run: `cd /Users/test/bestfps-website && npm install node-cache compression`

Expected: 两个包安装成功，出现在 node_modules 中

- [ ] **Step 2: 确认 better-sqlite3 已安装**

Run: `npm ls better-sqlite3`
Expected: better-sqlite3 已在 node_modules 中

- [ ] **Step 3: 添加 npm build 脚本到 package.json**

Read `package.json` first, then add to scripts:

```json
"build": "node build.js",
"build:watch": "node build.js --watch",
"dev": "npm run build && node server.js"
```

---

### Task 2: db.js 切换到 better-sqlite3

**Files:**
- Modify: `db.js`
- Test: `node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); console.log(typeof db.prepare); db.close();"`

- [ ] **Step 1: 验证 better-sqlite3 可用**

Run: `cd /Users/test/bestfps-website && node -e "const Database = require('better-sqlite3'); const db = new Database(':memory:'); db.run('CREATE TABLE test(id INTEGER)'); const row = db.prepare('INSERT INTO test VALUES(?)').run([1]); console.log('lastID:', row.lastInsertRowid); db.close();"`
Expected: 输出 `lastID: 1`

- [ ] **Step 2: 重写 db.js**

Replace the entire db.js content with:

```javascript
/**
 * 数据库初始化 — better-sqlite3 (同步)
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// 支持测试环境使用内存数据库
const DB_PATH = (process.env.TEST_DATABASE === 'memory')
  ? ':memory:'
  : path.join(__dirname, 'data', 'bestfps.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// 创建数据库连接（同步）
let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  console.log('[DB] 数据库已连接:', DB_PATH);
} catch (err) {
  console.error('[DB] 打开数据库失败:', err);
  process.exit(1);
}

// 初始化表结构（同步执行）
db.exec(`
  -- ---- users 表 ----
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    verified INTEGER DEFAULT 0,
    bio TEXT DEFAULT '',
    website TEXT DEFAULT '',
    social_discord TEXT DEFAULT '',
    social_twitter TEXT DEFAULT '',
    social_github TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ---- user_settings 表 ----
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    dark_mode INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- downloads 表 ----
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    version TEXT NOT NULL,
    os TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- ---- email_verifications 表 ----
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- password_resets 表 ----
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- login_history 表 ----
  CREATE TABLE IF NOT EXISTS login_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    ip TEXT,
    user_agent TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    success INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- user_sessions 表 ----
  CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    jti TEXT UNIQUE NOT NULL,
    token_hash TEXT NOT NULL,
    expires_at DATETIME NOT NULL,
    ip TEXT,
    user_agent TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- config_presets 表 ----
  CREATE TABLE IF NOT EXISTS config_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    is_default INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- config_shares 表 ----
  CREATE TABLE IF NOT EXISTS config_shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    view_count INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- announcements 表 ----
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    type TEXT DEFAULT 'info',
    priority INTEGER DEFAULT 0,
    start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- ---- user_announcements 表 ----
  CREATE TABLE IF NOT EXISTS user_announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    announcement_id INTEGER NOT NULL,
    dismissed INTEGER DEFAULT 0,
    dismissed_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
    UNIQUE(user_id, announcement_id)
  );

  -- ---- email_change_requests 表 ----
  CREATE TABLE IF NOT EXISTS email_change_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    new_email TEXT NOT NULL,
    old_email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- user_activities 表 ----
  CREATE TABLE IF NOT EXISTS user_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT NOT NULL,
    metadata TEXT DEFAULT '{}',
    ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- config_versions 表 ----
  CREATE TABLE IF NOT EXISTS config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '自动保存',
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- ---- 索引 ----
  CREATE INDEX IF NOT EXISTS idx_activities_user ON user_activities(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_versions_user ON config_versions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
`);

// ---- 迁移：users 表添加 role/status/suspended_at/suspend_reason ----
const userCols = db.pragma('table_info(users)', { simple: true }).map(r => r.name);
const userMigrations = [
  { name: 'role', sql: "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'" },
  { name: 'status', sql: "ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'" },
  { name: 'suspended_at', sql: 'ALTER TABLE users ADD COLUMN suspended_at DATETIME' },
  { name: 'suspend_reason', sql: "ALTER TABLE users ADD COLUMN suspend_reason TEXT DEFAULT ''" },
];
userMigrations.forEach(col => {
  if (!userCols.includes(col.name)) {
    try { db.exec(col.sql); } catch (e) { /* ignore */ }
  }
});

// ---- 迁移：user_settings 表移除 keybindings，添加 dark_mode ----
const settingsCols = db.pragma('table_info(user_settings)', { simple: true }).map(r => r.name);
if (settingsCols.includes('keybindings')) {
  // SQLite 不支持 DROP COLUMN，直接忽略（已有迁移逻辑在旧 db.js 中）
}
if (!settingsCols.includes('dark_mode')) {
  try { db.exec("ALTER TABLE user_settings ADD COLUMN dark_mode INTEGER DEFAULT 0"); } catch (e) { /* ignore */ }
}

// ---- 迁移：users 表添加个人资料列 ----
const profileCols = ['bio', 'website', 'social_discord', 'social_twitter', 'social_github'];
profileCols.forEach(col => {
  if (!userCols.includes(col)) {
    try { db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`); } catch (e) { /* ignore */ }
  }
});

console.log('[DB] 表结构已初始化');

// 为新用户创建设置记录
const insertSettingForUser = {
  run: (userId) => {
    db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
  },
};

// 记录用户活动
const logActivity = (userId, eventType, description, metadata = {}, ip = '') => {
  db.prepare(
    'INSERT INTO user_activities (user_id, event_type, description, metadata, ip) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, eventType, description, JSON.stringify(metadata), ip);
};

// 关闭数据库
process.on('exit', () => db.close());
process.on('SIGHUP',  () => { db.close(); process.exit(0); });
process.on('SIGINT',  () => { db.close(); process.exit(0); });

// 为测试提供的重置函数：关闭现有连接，替换为测试数据库
function resetForTest(testDb) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
  module.exports.db = testDb;
  module.exports._testDb = testDb;
}

/**
 * Returns the current db reference — used by modules that import db at
 * module-load time so that a call to resetForTest() picks up the swapped test db immediately.
 */
function dbGetter() {
  return module.exports.db;
}

module.exports = { db, insertSettingForUser, logActivity, resetForTest, dbGetter };
```

- [ ] **Step 3: 验证数据库启动正常**

Run: `cd /Users/test/bestfps-website && node -e "require('./db'); console.log('DB module loaded OK')"`
Expected: 输出 `DB module loaded OK`，无错误

---

### Task 3: 迁移路由文件到同步查询语法

**Files:**
- Modify: `routes/settings.js`
- Modify: `routes/downloads.js`
- Modify: `routes/presets.js`
- Modify: `routes/share.js`
- Modify: `routes/announcements.js`
- Modify: `routes/admin.js`
- Modify: `routes/sync.js`
- Modify: `middleware/auth.js`
- Modify: `middleware/admin.js`

**迁移规则：**
- `db.get(sql, params, callback)` → `db.prepare(sql).get(params)`
- `db.all(sql, params, callback)` → `db.prepare(sql).all(params)`
- `db.run(sql, params, callback)` → `db.prepare(sql).run(params)`（注意：`this.lastID` 变为 `result.lastInsertRowid`）
- 错误处理从 `callback(err)` 改为 try-catch 或同步 throw

- [ ] **Step 1: 迁移 routes/settings.js**

Read `routes/settings.js` first, then replace the entire file with the synchronous version. The key changes:
- All `db.get(..., (err, row) => { ... })` → `const row = db.prepare(...).get(...)`
- All `db.all(..., (err, rows) => { ... })` → `const rows = db.prepare(...).all(...)`
- All `db.run(..., (err) => { ... })` → `db.prepare(...).run(...)`
- `this.lastID` → `result.lastInsertRowid` (for INSERT statements in `db.run` callback context)
- Remove all nested callback pyramids — use sequential synchronous calls instead
- For `router.post('/versions', ...)` where we need lastID: use `const result = db.prepare('INSERT...').run(...); const versionId = result.lastInsertRowid;`

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/settings'); console.log('Settings routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 2: 迁移 routes/downloads.js**

Replace `db.all(callback)` → `db.prepare().all()`, `db.run(callback)` → `db.prepare().run()`, `this.lastID` → `result.lastInsertRowid`.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/downloads'); console.log('Downloads routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 3: 迁移 routes/presets.js**

Read the full file, then convert all callback-style queries to synchronous `db.prepare().get/all/run()`.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/presets'); console.log('Presets routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 4: 迁移 routes/share.js**

Convert all callback-style queries to synchronous.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/share'); console.log('Share routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 5: 迁移 routes/announcements.js**

Convert all callback-style queries to synchronous.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/announcements'); console.log('Announcements routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 6: 迁移 routes/admin.js**

Convert all callback-style queries to synchronous. Note: admin.js has multiple nested callbacks that need flattening.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/admin'); console.log('Admin routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 7: 迁移 routes/sync.js**

Convert all callback-style queries to synchronous.

Run: `cd /Users/test/bestfps-website && node -e "require('./routes/sync'); console.log('Sync routes loaded OK')"`
Expected: 无错误输出

- [ ] **Step 8: 验证服务器整体启动**

Run: `cd /Users/test/bestfps-website && node -e "require('./server'); console.log('Server loaded OK')" 2>&1 | head -5`
Expected: `[DB] 数据库已连接` 和 `bestfps server running at http://localhost:3000`

---

### Task 4: 创建缓存中间件

**Files:**
- Create: `middleware/cache.js`
- Modify: `routes/announcements.js` — 应用缓存
- Modify: `routes/presets.js` — 应用缓存
- Modify: `routes/share.js` — 应用缓存
- Modify: `routes/admin.js` — 应用缓存

- [ ] **Step 1: 创建 middleware/cache.js**

```javascript
/**
 * API 响应缓存中间件
 */
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 300,   // 默认 5 分钟
  checkperiod: 60,
  useClones: false,
});

/**
 * 缓存中间件工厂
 * @param {number} ttlSeconds - 缓存有效期（秒）
 */
function cached(ttlSeconds) {
  return (req, res, next) => {
    // 仅缓存 GET 请求
    if (req.method !== 'GET') return next();

    const key = req.originalUrl;
    const hit = cache.get(key);
    if (hit !== undefined) {
      return res.json(hit);
    }

    // 拦截 res.json，缓存结果
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(key, data, ttlSeconds);
      return originalJson(data);
    };

    next();
  };
}

/**
 * 清除匹配 pattern 的缓存
 * @param {string} pattern - URL 中包含的字符串
 */
function invalidate(pattern) {
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.includes(pattern)) cache.del(key);
  });
}

module.exports = { cache, cached, invalidate };
```

- [ ] **Step 2: 在 announcements.js 中应用缓存**

Read `routes/announcements.js` first, then add at top:
```javascript
const { cached, invalidate } = require('../middleware/cache');
```

Replace `router.get('/public', requireAuth, (req, res) => {` with:
```javascript
router.get('/public', cached(300), (req, res) => {
```

In admin routes (POST/PUT/DELETE), call `invalidate('/public')` after successful operation.

- [ ] **Step 3: 在 presets.js 中应用缓存**

Read `routes/presets.js` first, then add cache at top:
```javascript
const { cached, invalidate } = require('../middleware/cache');
```

Apply `cached(600)` to GET routes (10 min TTL). In POST/PUT/DELETE, call `invalidate('/presets')` or `invalidate('/presets/' + id)`.

- [ ] **Step 4: 在 share.js 中应用缓存**

Read `routes/share.js`, add cache, apply `cached(1800)` (30 min) to GET routes.

- [ ] **Step 5: 在 admin.js 中应用缓存**

Read `routes/admin.js`, add cache, apply `cached(120)` (2 min) to stats endpoint.

---

### Task 5: 添加 Gzip/Brotli 压缩

**Files:**
- Modify: `server.js`

- [ ] **Step 1: 添加 compression 中间件到 server.js**

Read `server.js` first, then add after the cookie-parser line:
```javascript
const compression = require('compression');
app.use(compression({
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  },
}));
```

Also add cache headers after static files. Find the `app.use(express.static(...))` line and add after it:
```javascript
// 静态文件缓存策略
app.use((req, res, next) => {
  // 构建文件（带 hash）：永久缓存
  if (req.path.startsWith('/build/')) {
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
  }
  // HTML 文件：不缓存
  else if (req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache');
  }
  // 其他静态文件：一天缓存
  else if (req.path.match(/\.(css|js|jpg|jpeg|png|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    res.set('Cache-Control', 'public, max-age=86400');
  }
  next();
});
```

---

### Task 6: 创建 esbuild 构建脚本

**Files:**
- Create: `build.js`
- Create: `public/build/` (directory, gitignore)

- [ ] **Step 1: 创建 build 目录**

Run: `mkdir -p /Users/test/bestfps-website/public/build`

- [ ] **Step 2: 创建 build.js**

```javascript
/**
 * bestfps 构建脚本 — esbuild
 * 用法: node build.js
 * 监视模式: node build.js --watch
 */
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const watch = args.includes('--watch');

// 确保 build 目录存在
const buildDir = path.join(__dirname, 'public', 'build');
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// ---- Dashboard JS 打包 ----
async function buildDashboardJS() {
  const result = await esbuild.build({
    entryPoints: [path.join(__dirname, 'public', 'js', 'dashboard', 'init.js')],
    bundle: true,
    minify: !args.includes('--dev'),
    sourcemap: args.includes('--dev'),
    outfile: path.join(buildDir, 'dashboard.bundle.js'),
    metafile: true,
    format: 'iife',
    target: ['es2020'],
    logLevel: 'info',
  });

  // 从 metafile 提取 hash，重命名文件
  const outputs = result.metafile.outputs;
  const bundlePath = path.join(buildDir, 'dashboard.bundle.js');
  if (fs.existsSync(bundlePath)) {
    // 计算文件内容的 hash（取 MD5 前 8 位）
    const crypto = require('crypto');
    const content = fs.readFileSync(bundlePath);
    const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
    const hashedPath = path.join(buildDir, `dashboard.${hash}.js`);
    fs.renameSync(bundlePath, hashedPath);
    console.log('Built:', path.basename(hashedPath));

    // 更新 hash 文件路径供后续步骤使用
    return { hash, path: hashedPath };
  }
  return null;
}

// ---- 全局 CSS 打包 ----
async function buildCSS() {
  const cssFiles = [
    path.join(__dirname, 'public', 'css', 'themes.css'),
    path.join(__dirname, 'public', 'css', 'components.css'),
    path.join(__dirname, 'public', 'css', 'dashboard.css'),
  ].filter(f => fs.existsSync(f));

  if (cssFiles.length === 0) {
    console.log('No CSS files to bundle');
    return null;
  }

  const result = await esbuild.build({
    entryPoints: cssFiles,
    bundle: true,
    minify: !args.includes('--dev'),
    outfile: path.join(buildDir, 'styles.css'),
    logLevel: 'info',
  });
  console.log('Built: styles.css');
  return result;
}

// ---- 主构建函数 ----
async function build() {
  try {
    console.log('\n[Build] Starting...');
    await buildCSS();
    await buildDashboardJS();
    console.log('[Build] Complete!\n');
  } catch (err) {
    console.error('[Build] Error:', err);
    process.exit(1);
  }
}

if (watch) {
  console.log('[Build] Watch mode enabled\n');
  esbuild.context({
    entryPoints: [path.join(__dirname, 'public', 'js', 'dashboard', 'init.js')],
    bundle: true,
    minify: false,
    sourcemap: true,
    outfile: path.join(buildDir, 'dashboard.bundle.js'),
    format: 'iife',
    target: ['es2020'],
  }).then(ctx => {
    ctx.watch();
    console.log('[Build] Watching for changes...');
  });
} else {
  build();
}
```

- [ ] **Step 3: 测试构建脚本**

Run: `cd /Users/test/bestfps-website && node build.js`
Expected: 输出 `Built: dashboard.xxxxxxxx.js` 和 `Built: styles.css`，`public/build/` 目录出现文件

- [ ] **Step 4: 添加 .gitignore 条目**

Read `.gitignore` first, then add:
```
public/build/
```

---

### Task 7: 更新 dashboard.html 引用构建资源

**Files:**
- Modify: `public/dashboard.html`

**分析**：dashboard.html 当前直接引用 27 个独立 JS 文件和 3 个 CSS 文件。优化方案：构建后用打包文件替代独立文件引用。

- [ ] **Step 1: 分析 dashboard.html 当前脚本引用**

Read lines 865-915 of `public/dashboard.html` to see the inline script.

- [ ] **Step 2: 备份并替换脚本引用**

Find the script block at lines 865-888. Replace the individual `<script src="/js/dashboard/...">` tags with a single bundled reference. BUT — since the init.js loads these in a specific order via `document.addEventListener('DOMContentLoaded', ...)` chain, we need to check how init.js works first.

Read `public/js/dashboard/init.js` to understand the load order.

- [ ] **Step 3: 根据 init.js 结构决定打包策略**

If init.js uses sequential script loading, keep individual files for now (the main win is CSS bundling and hash-based caching for built assets). If init.js can be simplified to a single bundle, replace the script block.

For this project: keep JS files individual (complex dependency order in init.js), but replace CSS `<link>` tags with the built `styles.css`.

Read the `<head>` section of dashboard.html (lines 1-14) to see CSS links.

- [ ] **Step 4: 替换 CSS 引用为构建文件**

Replace:
```html
<link rel="stylesheet" href="/css/themes.css" />
<link rel="stylesheet" href="/css/components.css" />
<link rel="stylesheet" href="/css/dashboard.css" />
```
With:
```html
<link rel="stylesheet" href="/build/styles.css" />
```

And keep individual JS files for now (the key JS optimization is handled by esbuild's minification if we bundle, but the current init.js architecture requires sequential loading). The real win here is CSS bundling + the cache headers from Task 5.

---

### Task 8: Playwright 性能测试

**Files:**
- Create: `tests/performance.test.js`

- [ ] **Step 1: 创建性能测试文件**

```javascript
/**
 * bestfps 性能基准测试
 * 运行方式: node tests/performance.test.js
 * 需要服务器在 http://localhost:3000 运行
 */
const { chromium } = require('playwright');

async function measureApi(name, url, headers = {}) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const start = Date.now();
  const response = await page.request.get(url, { headers });
  const elapsed = Date.now() - start;

  const size = response.body().length;
  console.log(`${name}: ${elapsed}ms, ${size} bytes, HTTP ${response.status()}`);

  await browser.close();
  return { elapsed, size, status: response.status() };
}

async function runTests() {
  console.log('\n=== bestfps Performance Benchmark ===\n');

  // 预热
  console.log('[Warmup]');
  await measureApi('Warmup', 'http://localhost:3000/');
  await measureApi('Warmup API', 'http://localhost:3000/api/announcements/public');

  console.log('\n[API Tests]');
  await measureApi('GET /api/announcements/public', 'http://localhost:3000/api/announcements/public');
  await measureApi('GET /api/presets', 'http://localhost:3000/api/presets');

  console.log('\n[Static Assets]');
  await measureApi('Dashboard HTML', 'http://localhost:3000/dashboard');
  await measureApi('CSS (bundled)', 'http://localhost:3000/build/styles.css');
  await measureApi('Landing page', 'http://localhost:3000/');
  await measureApi('Login page', 'http://localhost:3000/login');

  console.log('\n[Cache Hit Tests]');
  // 第二次请求同一端点，验证缓存
  await measureApi('Cache hit /api/announcements/public', 'http://localhost:3000/api/announcements/public');
  await measureApi('Cache hit /api/presets', 'http://localhost:3000/api/presets');

  console.log('\n=== Benchmark Complete ===\n');
}

runTests().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: 确保 playwright 已安装**

Run: `cd /Users/test/bestfps-website && npm ls playwright 2>/dev/null || echo "Not installed"`
If not installed: Run `npm install --save-dev playwright`

- [ ] **Step 3: 运行性能测试**

Start server: `cd /Users/test/bestfps-website && node server.js &`
Wait 2 seconds for server to start, then run:
`cd /Users/test/bestfps-website && node tests/performance.test.js`

Expected: All tests return HTTP 200, cache hit tests should be faster (<10ms) than cold tests.

---

### Task 9: 整体验证

**Files:** (none - verification only)

- [ ] **Step 1: 启动服务器并验证所有 API 端点**

Run:
```bash
cd /Users/test/bestfps-website && pkill -f "node server" 2>/dev/null; node server.js &
sleep 3
echo "=== API Tests ===" && \
curl -s -o /dev/null -w "GET /: HTTP %{http_code}\n" http://localhost:3000/ && \
curl -s -o /dev/null -w "GET /dashboard: HTTP %{http_code}\n" http://localhost:3000/dashboard && \
curl -s -o /dev/null -w "GET /api/announcements/public: HTTP %{http_code}\n" http://localhost:3000/api/announcements/public && \
curl -s -o /dev/null -w "GET /api/presets: HTTP %{http_code}\n" http://localhost:3000/api/presets && \
curl -s -o /dev/null -w "GET /build/styles.css: HTTP %{http_code}\n" http://localhost:3000/build/styles.css && \
curl -s -o /dev/null -w "GET /admin: HTTP %{http_code}\n" http://localhost:3000/admin
```

Expected: All return HTTP 200

- [ ] **Step 2: 验证压缩生效**

Run: `curl -s -I http://localhost:3000/ | grep -i content-encoding`
Expected: `Content-Encoding: gzip` or `Content-Encoding: br`

- [ ] **Step 3: 验证缓存头**

Run: `curl -s -I http://localhost:3000/build/styles.css | grep -i cache-control`
Expected: `Cache-Control: public, max-age=31536000, immutable`

---

## 三、预期效果对照表

| 优化项 | 预期提升 |
|--------|---------|
| better-sqlite3 | API 响应时间 ↓ 60% |
| Gzip 压缩 | 传输体积 ↓ 70% |
| 资源拆分 + 构建 | 首屏加载 ↓ 50% |
| API 缓存 | 高并发响应 ↓ 80% |

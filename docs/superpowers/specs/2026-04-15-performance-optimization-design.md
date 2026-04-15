# bestfps 网站性能优化设计方案

**日期**: 2026-04-15
**范围**: 性能优化 (Phase A)

---

## 背景

bestfps 网站当前使用异步 sqlite3、静态资源无压缩、大文件含内联代码、无缓存层。目标是通过四个方向的优化全面提升响应速度和并发能力。

---

## 一、数据库查询优化

### 方案：better-sqlite3 替代 sqlite3

**现状**: 使用 `sqlite3`（异步回调风格），每次查询有 V8 → libuv → C++ 的跨线程开销。

**改动**:
- `db.js`: 改用 `require('better-sqlite3')`，移除 `.verbose()`
- 所有路由文件: `db.get(callback)` → `db.prepare(sql).get(params)`
- `db.run(callback)` → `db.prepare(sql).run(params)`
- `db.all(callback)` → `db.prepare(sql).all(params)`
- 迁移：保留 `dbGetter()` 函数，确保测试环境可替换

**关键文件**:
- `db.js` — 数据库初始化
- 所有 `routes/*.js` — 查询调用
- `middleware/auth.js` — 会话查询
- `middleware/admin.js` — 管理查询

**风险**: better-sqlite3 是同步的，会阻塞事件循环。优化策略：
- 复杂查询（分页、搜索）使用 `db.prepare().all()` 带 `LIMIT`
- 启动时预编译所有高频 SQL 语句
- 文件锁由 SQLite 自动管理（读操作并发无锁）

---

## 二、静态资源压缩

### 方案：express-compression + 智能缓存策略

**现状**: 静态文件无压缩，直接传输原始文件。

**安装依赖**: `npm install compression`

**改动**:
```javascript
// server.js
const compression = require('compression');
app.use(compression({
  level: 6,
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

**缓存策略**:
- 带 hash 的构建文件（`dashboard.bundle.a3f2.js`）: `Cache-Control: public, max-age=31536000, immutable`
- HTML 文件: `Cache-Control: no-cache` + `ETag`
- 无 hash 的静态文件: `Cache-Control: public, max-age=86400`

---

## 三、前端资源优化

### 方案：esbuild 构建 + 资源拆分

**现状**: dashboard.html 约 60KB，含大量内联 CSS/JS，无法被浏览器缓存。

**安装依赖**: `npm install --save-dev esbuild`

**目录结构**:
```
build/                    # 构建输出（gitignore）
public/js/bundle/        # 打包后的 JS
public/css/bundle/        # 打包后的 CSS
src/                      # 源代码（可选）
```

**构建脚本** `build.js`:
```javascript
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

// Dashboard JS 打包
esbuild.build({
  entryPoints: ['public/js/dashboard/main.js'],
  bundle: true,
  minify: true,
  outfile: 'build/dashboard.bundle.js',
  metafile: true,
}).then(result => {
  const hash = result.metafile.outputs['build/dashboard.bundle.js'].hash;
  const outPath = `build/dashboard.${hash.slice(0,8)}.js`;
  // 重命名带 hash 的文件
  fs.renameSync('build/dashboard.bundle.js', outPath);
  console.log('Built:', outPath);
});

// 全局 CSS 打包
esbuild.build({
  entryPoints: ['public/css/components.css', 'public/css/dashboard.css'],
  bundle: true,
  minify: true,
  outfile: 'build/styles.css',
});
```

**npm scripts**:
```json
"build": "node build.js",
"build:watch": "node build.js --watch",
"dev": "node build.js && node server.js"
```

**HTML 更新**:
- dashboard.html 中提取内联 `<script>` 到 `public/js/dashboard/main.js`
- 提取内联 `<style>` 到 `public/css/dashboard.css`
- 引用构建后的文件: `<script src="/build/dashboard.${hash}.js"></script>`

**图片优化**:
- 添加 `loading="lazy"` 到所有 `<img>` 标签
- 静态图片使用 WebP 格式（提供 fallback）

---

## 四、API 响应缓存

### 方案：node-cache 内存缓存

**安装依赖**: `npm install node-cache`

**新建 `middleware/cache.js`**:
```javascript
const NodeCache = require('node-cache');

const cache = new NodeCache({
  stdTTL: 300,   // 默认 5 分钟
  checkperiod: 60,
  useClones: false,
});

function cached(ttlSeconds) {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = cache.get(key);
    if (cached !== undefined) {
      return res.json(cached);
    }
    const originalJson = res.json.bind(res);
    res.json = (data) => {
      cache.set(key, data, ttlSeconds);
      return originalJson(data);
    };
    next();
  };
}

function invalidate(pattern) {
  const keys = cache.keys();
  keys.forEach(key => {
    if (key.includes(pattern)) cache.del(key);
  });
}

module.exports = { cache, cached, invalidate };
```

**缓存策略**:

| 接口 | TTL | 失效触发 |
|------|-----|---------|
| `GET /api/announcements/public` | 5 分钟 | 公告创建/更新/删除 |
| `GET /api/presets` | 10 分钟 | 预设创建/更新/删除 |
| `GET /api/presets/:id` | 30 分钟 | 预设更新/删除 |
| `GET /api/share/:token` | 30 分钟 | 分享删除 |
| `GET /api/admin/stats` | 2 分钟 | 用户操作时清除 |

**路由应用示例**:
```javascript
// routes/announcements.js
const { cached } = require('../middleware/cache');

router.get('/public', cached(300), (req, res) => { ... });

// routes/announcements.js — 清除缓存
router.post('/', requireAdmin, (req, res) => {
  // 创建公告后
  invalidate('/public');
});
```

---

## 实施顺序

1. **数据库优化** — 风险最高，先做
2. **API 缓存** — 风险低，立即见效
3. **静态压缩** — 风险低，立即见效
4. **前端构建** — 工作量最大，最后做

---

## 测试计划（使用 webapp-testing）

使用 Playwright 进行性能基准测试：

```python
import time
from playwright.sync_api import sync_playwright

def measure_api(name, url, headers={}):
    start = time.time()
    response = page.request.get(url, headers=headers)
    elapsed = (time.time() - start) * 1000
    print(f"{name}: {elapsed:.1f}ms, size: {len(response.body())} bytes")
    return elapsed

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()

    # 测量优化前基准
    measure_api("/api/announcements/public", "http://localhost:3000/api/announcements/public")
    measure_api("/api/presets", "http://localhost:3000/api/presets")
    measure_api("Dashboard HTML", "http://localhost:3000/dashboard")

    # 测量优化后
    # ... 对比差异

    browser.close()
```

---

## 依赖清单

| 包 | 用途 | 安装命令 |
|----|------|---------|
| better-sqlite3 | 数据库 | `npm install better-sqlite3` |
| node-cache | 内存缓存 | `npm install node-cache` |
| compression | Gzip/Brotli | `npm install compression` |
| esbuild | 构建打包 | `npm install --save-dev esbuild` |

---

## 关键文件改动清单

| 文件 | 操作 |
|------|------|
| db.js | 改用 better-sqlite3 |
| routes/*.js | 同步查询语法 |
| middleware/auth.js | 同步查询语法 |
| middleware/admin.js | 同步查询语法 |
| middleware/cache.js | 新建：缓存中间件 |
| server.js | 添加 compression 中间件 |
| build.js | 新建：esbuild 构建脚本 |
| package.json | 添加 build 脚本和依赖 |
| public/dashboard.html | 提取内联代码 |
| public/js/dashboard/main.js | 新建：入口文件 |
| public/css/dashboard.css | 提取内联样式 |

---

## 预期效果

| 优化项 | 预期提升 |
|--------|---------|
| better-sqlite3 | API 响应时间 ↓ 60% |
| Gzip 压缩 | 传输体积 ↓ 70% |
| 资源拆分 + 构建 | 首屏加载 ↓ 50% |
| API 缓存 | 高并发响应 ↓ 80% |

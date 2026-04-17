# bestfps-website

Minecraft 光影 / 资源包配置管理与分享平台，包含完整的用户认证、配置同步、分享、公告、开票、HWID 绑定和管理后台功能。

## 项目概览

**技术栈**
- 后端: Node.js + Express
- 数据库: better-sqlite3 + SQLite
- 前端: 原生 HTML / CSS / JS
- 测试: Jest + Supertest + Playwright
- 安全: Helmet、CORS、CSRF、JWT、Session 吊销、Rate Limit

**当前前端模块**
- `public/js/admin/`: 管理后台模块
- `public/js/dashboard/`: 用户控制台模块
- `public/js/settings/`: 设置页模块

## 当前功能

- 用户注册、登录、退出、头像上传
- JWT + `user_sessions` 会话管理，可吊销、可保留当前会话修改密码
- 登录历史、活动日志、会话列表
- 个人资料编辑，支持 `display_name`
- 邮箱验证、修改邮箱、确认邮箱变更
- 忘记密码 / 重置密码
- 配置预设 CRUD、应用默认预设
- 配置分享、导入分享配置
- 用户设置导入 / 导出、配置版本快照与恢复
- 公告系统，含管理员发布与用户忽略
- 开票系统，含用户申请与管理员处理
- HWID 绑定系统，含工具下载、令牌准备、绑定、解绑
- 管理后台统计、用户管理、封禁 / 角色变更 / 删除、活动查询

## 关键实现

### 1. 可吊销 JWT 会话

登录时签发 JWT，同时把 `jti` 和 `token_hash` 写入 `user_sessions`。  
鉴权时不仅验签，还会检查数据库里的会话状态，因此可以做到：

- 删除当前会话
- 删除其他会话
- 改密码后保留当前会话、吊销其余会话
- 用户状态变更后立即阻断访问

相关文件：
- [middleware/auth.js](middleware/auth.js)
- [routes/auth/account.js](routes/auth/account.js)
- [routes/auth/sessions.js](routes/auth/sessions.js)

### 2. sqlite3 风格兼容层

项目历史代码大量使用 `db.get/run/all(sql, params, callback)` 形式。  
[db.js](db.js) 通过 wrapper 把 `better-sqlite3` 的同步调用包装成 sqlite3 风格回调接口，同时保留：

- `_prepare()` 给内部同步语句使用
- `_rawDb.transaction()` 给事务使用
- `pragma()` 给迁移和测试使用

这样路由层基本不用重写。

### 3. 动态 Schema 迁移

[db.js](db.js) 在启动时：

- 创建缺失表
- 检查缺失列并补齐
- 创建索引
- 兼容旧字段和旧数据

适合直接在已有 SQLite 数据库上滚动升级。

### 4. Cookie Session + CSRF

登录成功后会同时设置：

- `bfps_token`: `httpOnly` 登录 Cookie
- `csrf_token`: 前端可读的 CSRF Cookie

写操作默认通过 `X-CSRF-Token` + Cookie 双重提交校验。  
少数必须匿名使用的接口会做白名单放行，例如：

- `/api/auth/login`
- `/api/auth/register`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`
- `/api/auth/confirm-email-change`
- `/api/hwid/bind`

相关文件：
- [server.js](server.js)
- [middleware/csrf.js](middleware/csrf.js)

### 5. 受保护页面访问控制

除了 API 鉴权，页面级访问也已补上：

- `/dashboard`
- `/settings`
- `/sessions`
- `/admin`

未登录访问会跳转到 `/login`。  
同时阻止直接访问：

- `/dashboard.html`
- `/settings.html`
- `/sessions.html`
- `/admin.html`

相关文件：
- [server.js](server.js)
- [tests/server-pages.test.js](tests/server-pages.test.js)

### 6. 设置页模块化

设置页已经从单个大内联脚本拆成模块：

- [public/js/settings/core.js](public/js/settings/core.js)
- [public/js/settings/account.js](public/js/settings/account.js)
- [public/js/settings/invoices.js](public/js/settings/invoices.js)
- [public/js/settings/hwid.js](public/js/settings/hwid.js)
- [public/js/settings/app.js](public/js/settings/app.js)

好处：

- 降低维护成本
- 避免全局函数污染
- 更容易继续拆测试或独立迁移

### 7. 开票系统

当前支持票种：

- `personal_normal` 个人普通发票
- `company_normal` 企业普通发票
- `company_special_vat` 企业增值税专用发票
- `company_electronic` 企业电子发票

能力包括：

- 用户提交申请
- 用户取消待处理申请
- 管理员分页查询、筛选、详情查看
- 管理员更新状态、发票号、下载地址、备注

相关文件：
- [routes/invoices.js](routes/invoices.js)
- [public/js/settings/invoices.js](public/js/settings/invoices.js)
- [public/js/admin/admin-invoices.js](public/js/admin/admin-invoices.js)

### 8. HWID 绑定

支持的流程：

1. 登录用户在设置页点击准备绑定
2. 服务端生成一次性绑定令牌
3. 浏览器下载令牌文件和 HWID 工具
4. 工具把 HWID 哈希、设备名、系统信息提交到 `/api/hwid/bind`
5. 用户可在设置页查看绑定状态并解绑

安全限制：

- 绑定令牌有过期时间
- 同一令牌只能使用一次
- 令牌签发 IP 与绑定请求 IP 可做一致性校验
- 单账号仅允许一个活跃 HWID 绑定

**HWID 工具：**
- [tools/hwid-agent-cpp/](tools/hwid-agent-cpp/) - C++ 实现（推荐）
  - 纯 Windows API，无外部依赖
  - SHA-256 硬件指纹
  - 彩色控制台 UI + ASCII art
  - WinHTTP 网络通信，默认启用 TLS 证书验证
  - 通过 GitHub Actions CI/CD 构建
- [tools/hwid-agent/](tools/hwid-agent/) - Node.js 实现（旧版）

相关文件：
- [routes/hwid.js](routes/hwid.js)
- [public/js/settings/hwid.js](public/js/settings/hwid.js)
- [tools/hwid-agent/ACCEPTANCE.md](tools/hwid-agent/ACCEPTANCE.md)

## 项目结构

```text
bestfps-website/
├── server.js
├── db.js
├── routes/
│   ├── auth.js
│   ├── auth/
│   │   ├── account.js
│   │   ├── email.js
│   │   ├── password.js
│   │   ├── profile.js
│   │   ├── sessions.js
│   │   └── utils.js
│   ├── admin.js
│   ├── announcements.js
│   ├── downloads.js
│   ├── hwid.js
│   ├── invoices.js
│   ├── presets.js
│   ├── settings.js
│   ├── share.js
│   └── sync.js
├── middleware/
│   ├── admin.js
│   ├── auth.js
│   ├── cache.js
│   ├── csrf.js
│   └── rateLimiter.js
├── public/
│   ├── admin.html
│   ├── dashboard.html
│   ├── settings.html
│   ├── sessions.html
│   ├── change-email.html
│   ├── js/
│   │   ├── admin/
│   │   ├── dashboard/
│   │   └── settings/
│   └── css/
├── tools/
│   ├── hwid-agent/          # Node.js HWID agent (旧版)
│   └── hwid-agent-cpp/     # C++ HWID agent (新版，推荐)
├── tests/
├── email/
│   └── sender.js
└── docs/
```

## 快速开始

```bash
npm install
cp .env.example .env
```

至少配置：

```env
JWT_SECRET=replace-with-a-long-random-secret
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000
```

启动：

```bash
npm start
```

开发：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

## 构建与测试

```bash
npm run build
npm run build:watch
npm run build:prod

npm test
npm run test:playwright
```

## 数据库 Schema

当前主表共 17 张：

| 表名 | 用途 |
|------|------|
| `users` | 用户账号、角色、状态、公开资料 |
| `user_settings` | 用户配置与主题偏好 |
| `downloads` | 下载记录 |
| `email_verifications` | 注册邮箱验证 |
| `password_resets` | 密码重置令牌 |
| `login_history` | 登录记录与设备信息 |
| `user_sessions` | JWT 会话管理 |
| `config_presets` | 配置预设 |
| `config_shares` | 配置分享 |
| `announcements` | 公告内容 |
| `user_announcements` | 用户公告状态 |
| `email_change_requests` | 邮箱变更确认 |
| `user_activities` | 用户活动日志 |
| `config_versions` | 设置快照与历史版本 |
| `invoice_requests` | 开票申请 |
| `hwid_bindings` | HWID 绑定记录 |
| `hwid_bind_tokens` | HWID 一次性绑定令牌 |

## API 概览

### 认证与账号

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/profile`
- `PUT /api/auth/profile`
- `POST /api/auth/avatar`
- `GET /api/auth/verify`
- `POST /api/auth/send-verify-email`
- `POST /api/auth/change-email`
- `GET /api/auth/confirm-email-change`
- `POST /api/auth/confirm-email-change`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/change-password`
- `GET /api/auth/login-history`
- `GET /api/auth/activities`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/:id`
- `DELETE /api/auth/sessions`
- `DELETE /api/auth/account`

### 配置与分享

- `GET /api/settings`
- `PUT /api/settings`
- `GET /api/settings/export`
- `POST /api/settings/import`
- `GET /api/settings/versions`
- `GET /api/settings/versions/:id`
- `POST /api/settings/versions`
- `POST /api/settings/versions/:id/restore`
- `DELETE /api/settings/versions/:id`
- `GET /api/presets`
- `POST /api/presets`
- `GET /api/presets/:id`
- `PUT /api/presets/:id`
- `DELETE /api/presets/:id`
- `POST /api/presets/:id/apply`
- `PUT /api/presets/:id/default`
- `POST /api/share`
- `GET /api/share`
- `GET /api/share/my-links`
- `GET /api/share/:token`
- `POST /api/share/:token/import`
- `DELETE /api/share/:token`
- `POST /api/sync/push`
- `GET /api/sync/pull`

### 公告、下载、开票、HWID

- `GET /api/announcements`
- `GET /api/announcements/public`
- `POST /api/announcements/:id/dismiss`
- `GET /api/downloads`
- `POST /api/downloads`
- `GET /api/invoices`
- `POST /api/invoices`
- `PUT /api/invoices/:id/cancel`
- `GET /api/hwid/agent/windows`
- `GET /api/hwid/status`
- `POST /api/hwid/prepare`
- `POST /api/hwid/bind`
- `DELETE /api/hwid/bindings/:id`

### 管理后台

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/admin/users/:id`
- `PUT /api/admin/users/:id/role`
- `PUT /api/admin/users/:id/suspend`
- `DELETE /api/admin/users/:id`
- `GET /api/admin/login-history/:userId`
- `GET /api/admin/sessions/:userId`
- `GET /api/admin/activities/:userId`
- `GET /api/admin/stats/registrations`
- `GET /api/admin/activities`
- `GET /api/announcements/all`
- `GET /api/announcements/:id`
- `POST /api/announcements`
- `PUT /api/announcements/:id`
- `DELETE /api/announcements/:id`
- `GET /api/invoices/admin/list`
- `GET /api/invoices/admin/:id`
- `PUT /api/invoices/admin/:id`

## 安全说明

- 使用 `httpOnly` Cookie 保存主会话，同时兼容旧客户端返回 JSON token
- 所有写接口默认要求 CSRF Token
- 使用 `Helmet` 设置 CSP，并额外启用一份更严格的 Report-Only CSP
- 登录、注册、找回密码、改邮箱均有专用限流器
- 受保护页面存在页面级鉴权，不只依赖前端跳转
- 上传头像限制类型、大小和图片尺寸
- 开票下载地址会校验，只允许相对路径或 `http/https`
- HWID 绑定使用一次性令牌和事务处理

## 测试

当前仓库包含：

- Jest + Supertest 接口测试
- 页面与安全回归测试
- Playwright E2E 测试入口

常用命令：

```bash
npm test -- --runInBand
npm test -- --runInBand tests/auth.test.js tests/settings.test.js
```

## 许可证

MIT

/**
 * 数据库初始化 — better-sqlite3 (同步 API)
 *
 * 导出 db 对象，提供 sqlite3 风格的回调接口，内部使用 better-sqlite3 同步调用。
 * 这样现有路由代码 (db.get/run/all) 无需修改即可运行。
 * 测试通过 resetForTest() 替换 db 对象时，wrapper 内部通过 module.exports.db
 * 动态访问，确保始终指向正确的数据库实例。
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠️ 内部方法（仅限测试和内部使用，绕过 wrapper 错误处理）：
 *   - _prepare(sql)  → 返回 better-sqlite3 Statement
 *   - _rawDb         → 原始 Database 实例，仅用于 pragma/exec
 *   - pragma(info)   → 公共的 pragma 访问（推荐替代 _rawDb）
 * ═══════════════════════════════════════════════════════════════════════════
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = (process.env.TEST_DATABASE === 'memory') ? ':memory:' : path.join(__dirname, 'data', 'bestfps.db');

const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
console.log('[DB] 数据库已连接:', DB_PATH);

db.exec(`
  -- users 表
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
    role TEXT DEFAULT 'user',
    status TEXT DEFAULT 'active',
    suspended_at DATETIME,
    suspend_reason TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- user_settings 表
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    dark_mode INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- downloads 表
  CREATE TABLE IF NOT EXISTS downloads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    version TEXT NOT NULL,
    os TEXT NOT NULL,
    downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  );

  -- email_verifications 表
  CREATE TABLE IF NOT EXISTS email_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- password_resets 表
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- login_history 表
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

  -- user_sessions 表
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

  -- config_presets 表
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

  -- config_shares 表
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

  -- announcements 表
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

  -- user_announcements 表
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

  -- email_change_requests 表
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

  -- user_activities 表
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

  -- config_versions 表
  CREATE TABLE IF NOT EXISTS config_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL DEFAULT '自动保存',
    shader_settings TEXT DEFAULT '{}',
    resource_packs TEXT DEFAULT '[]',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_activities_user ON user_activities(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_versions_user ON config_versions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
`);

// 迁移
db.transaction(() => {
  const settingsCols = db.pragma('table_info(user_settings)').map(r => r.name);
  if (settingsCols.includes('keybindings')) {
    db.exec('ALTER TABLE user_settings DROP COLUMN keybindings');
  }
  if (!settingsCols.includes('dark_mode')) {
    db.exec('ALTER TABLE user_settings ADD COLUMN dark_mode INTEGER DEFAULT 0');
  }

  const userCols = db.pragma('table_info(users)').map(r => r.name);
  if (!userCols.includes('role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'");
  }
  if (!userCols.includes('status')) {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'");
  }
  if (!userCols.includes('suspended_at')) {
    db.exec('ALTER TABLE users ADD COLUMN suspended_at DATETIME');
  }
  if (!userCols.includes('suspend_reason')) {
    db.exec("ALTER TABLE users ADD COLUMN suspend_reason TEXT DEFAULT ''");
  }
  ['bio', 'website', 'social_discord', 'social_twitter', 'social_github'].forEach(col => {
    if (!userCols.includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT DEFAULT ''`);
    }
  });
})();

console.log('[DB] 表结构已初始化');

// 为新用户创建设置记录（通过 module.exports.db 访问，确保测试环境正确）
const insertSettingForUser = {
  run: (userId) => {
    module.exports.db.prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run([userId]);
  },
};

// 记录用户活动（fire-and-forget）
const logActivity = (userId, eventType, description, metadata = {}, ip = '') => {
  try {
    db.prepare(
      'INSERT INTO user_activities (user_id, event_type, description, metadata, ip) VALUES (?, ?, ?, ?, ?)'
    ).run([userId, eventType, description, JSON.stringify(metadata), ip]);
  } catch (e) {
    console.error('[Activity] 记录失败:', e.message);
  }
};

// 关闭数据库
['exit', 'SIGHUP', 'SIGINT'].forEach(signal => {
  process.removeAllListeners(signal);
});
process.on('exit',  () => db.close());
process.on('SIGHUP', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });

// 为测试提供的重置函数
function resetForTest(testDb) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
  module.exports.db = testDb;
  module.exports._testDb = testDb;
}

// sqlite3 风格回调接口
function createDbWrapper(targetDb) {
  const wrapper = {
    get(sql, ...args) {
      const isArray = Array.isArray(args[0]);
      const params = isArray ? args[0] : (typeof args[0] !== 'function' ? args : []);
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      try {
        const row = targetDb.prepare(sql).get(...(params.length ? params : []));
        if (cb) cb(null, row);
      } catch (err) {
        console.error('[DB] get error:', err.message);
        if (cb) cb(err);
      }
    },

    run(sql, ...args) {
      const isArray = Array.isArray(args[0]);
      const params = isArray ? args[0] : (typeof args[0] !== 'function' ? args : []);
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      try {
        const result = targetDb.prepare(sql).run(...(params.length ? params : []));
        const ctx = { lastID: result.lastInsertRowid, changes: result.changes };
        if (cb) cb.call(ctx, null);
      } catch (err) {
        console.error('[DB] run error:', err.message);
        if (cb) cb.call({ changes: 0, lastID: 0 }, err);
      }
    },

    all(sql, ...args) {
      const isArray = Array.isArray(args[0]);
      const params = isArray ? args[0] : (typeof args[0] !== 'function' ? args : []);
      const cb = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      try {
        const rows = targetDb.prepare(sql).all(...(params.length ? params : []));
        if (cb) cb(null, rows);
      } catch (err) {
        console.error('[DB] all error:', err.message);
        if (cb) cb(err);
      }
    },

    exec(sql, cb) {
      try {
        targetDb.exec(sql);
        if (cb) cb(null);
      } catch (err) {
        console.error('[DB] exec error:', err.message);
        if (cb) cb(err);
      }
    },

    close(cb) {
      try {
        targetDb.close();
        if (cb) cb();
      } catch (err) {
        console.error('[DB] close error:', err.message);
        if (cb) cb(err);
      }
    },

    // 公共 prepare 访问（供内部模块使用，绕过 callback 包装）
    _prepare(sql) {
      return targetDb.prepare(sql);
    },

    prepare(sql) {
      return targetDb.prepare(sql);
    },

    pragma(info) {
      return targetDb.pragma(info);
    },

    _rawDb: targetDb,
  };
  return wrapper;
}

module.exports = {
  createDbWrapper,
  db: createDbWrapper(db),
  insertSettingForUser,
  logActivity,
  resetForTest,
};

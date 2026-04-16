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
const IS_MEMORY_DB = DB_PATH === ':memory:';

if (!IS_MEMORY_DB) {
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function failInitialization(stage, err) {
  console.error(`[DB] ${stage}失败:`, err.message);
  if (process.env.NODE_ENV === 'test') {
    throw err;
  }
  process.exit(1);
}

const db = (() => {
  try {
    const instance = new Database(DB_PATH);
    instance.pragma('foreign_keys = ON');
    instance.pragma('busy_timeout = 5000');
    instance.pragma('synchronous = NORMAL');
    instance.pragma('temp_store = MEMORY');
    instance.pragma('cache_size = -16000');
    if (!IS_MEMORY_DB) {
      instance.pragma('journal_mode = WAL');
    }
    console.log('[DB] 数据库已连接:', DB_PATH);
    return instance;
  } catch (err) {
    failInitialization('打开数据库', err);
  }
})();

try {
  db.exec(`
  -- users 表
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT DEFAULT '',
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
    user_id INTEGER,
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

  -- invoice_requests 表
  CREATE TABLE IF NOT EXISTS invoice_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    order_no TEXT NOT NULL,
    invoice_type TEXT NOT NULL DEFAULT 'personal',
    title TEXT NOT NULL,
    tax_no TEXT DEFAULT '',
    email TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    notes TEXT DEFAULT '',
    invoice_no TEXT DEFAULT '',
    download_url TEXT DEFAULT '',
    admin_note TEXT DEFAULT '',
    issued_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- hwid_bindings 表
  CREATE TABLE IF NOT EXISTS hwid_bindings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hwid_hash TEXT NOT NULL,
    hwid_preview TEXT DEFAULT '',
    device_name TEXT DEFAULT '',
    os_name TEXT DEFAULT '',
    agent_version TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    bind_source TEXT DEFAULT 'agent',
    last_ip TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- hwid_bind_tokens 表
  CREATE TABLE IF NOT EXISTS hwid_bind_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT NOT NULL UNIQUE,
    requested_ip TEXT DEFAULT '',
    requested_user_agent TEXT DEFAULT '',
    expires_at DATETIME NOT NULL,
    used_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  -- 索引
  CREATE INDEX IF NOT EXISTS idx_activities_user ON user_activities(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_versions_user ON config_versions(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
  CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
  CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_user ON invoice_requests(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoice_requests(status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hwid_bindings_user ON hwid_bindings(user_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hwid_bindings_hash ON hwid_bindings(hwid_hash);
  CREATE INDEX IF NOT EXISTS idx_hwid_bind_tokens_user ON hwid_bind_tokens(user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hwid_bind_tokens_token ON hwid_bind_tokens(token);
`);
} catch (err) {
  failInitialization('初始化表结构', err);
}

try {
  db.transaction(() => {
    const settingsCols = db.pragma('table_info(user_settings)').map(r => r.name);
    if (settingsCols.includes('keybindings')) {
      db.exec('ALTER TABLE user_settings DROP COLUMN keybindings');
    }
    if (!settingsCols.includes('dark_mode')) {
      db.exec('ALTER TABLE user_settings ADD COLUMN dark_mode INTEGER DEFAULT 0');
    }

    const userCols = db.pragma('table_info(users)').map(r => r.name);
    if (!userCols.includes('display_name')) {
      db.exec("ALTER TABLE users ADD COLUMN display_name TEXT DEFAULT ''");
    }
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

    const loginHistoryCols = db.pragma('table_info(login_history)');
    const loginHistoryUserIdCol = loginHistoryCols.find(r => r.name === 'user_id');
    if (loginHistoryUserIdCol && loginHistoryUserIdCol.notnull) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS login_history_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          ip TEXT,
          user_agent TEXT,
          device_type TEXT,
          browser TEXT,
          os TEXT,
          success INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        INSERT INTO login_history_new (id, user_id, ip, user_agent, device_type, browser, os, success, created_at)
        SELECT
          id,
          CASE
            WHEN user_id IS NOT NULL AND EXISTS (SELECT 1 FROM users WHERE users.id = login_history.user_id)
            THEN user_id
            ELSE NULL
          END,
          ip,
          user_agent,
          device_type,
          browser,
          os,
          success,
          created_at
        FROM login_history;
        DROP TABLE login_history;
        ALTER TABLE login_history_new RENAME TO login_history;
        CREATE INDEX IF NOT EXISTS idx_login_history_user ON login_history(user_id, created_at DESC);
      `);
    }

    const invoiceCols = db.pragma('table_info(invoice_requests)').map(r => r.name);
    if (invoiceCols.length > 0) {
      const invoiceColumnDefaults = {
        invoice_type: "TEXT NOT NULL DEFAULT 'personal'",
        tax_no: "TEXT DEFAULT ''",
        status: "TEXT NOT NULL DEFAULT 'pending'",
        notes: "TEXT DEFAULT ''",
        invoice_no: "TEXT DEFAULT ''",
        download_url: "TEXT DEFAULT ''",
        admin_note: "TEXT DEFAULT ''",
        issued_at: 'DATETIME',
        updated_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
      };

      Object.entries(invoiceColumnDefaults).forEach(([col, def]) => {
        if (!invoiceCols.includes(col)) {
          db.exec(`ALTER TABLE invoice_requests ADD COLUMN ${col} ${def}`);
        }
      });
    }

    const hwidBindingCols = db.pragma('table_info(hwid_bindings)').map(r => r.name);
    if (hwidBindingCols.length > 0) {
      const hwidBindingDefaults = {
        hwid_preview: "TEXT DEFAULT ''",
        device_name: "TEXT DEFAULT ''",
        os_name: "TEXT DEFAULT ''",
        agent_version: "TEXT DEFAULT ''",
        status: "TEXT NOT NULL DEFAULT 'active'",
        bind_source: "TEXT DEFAULT 'agent'",
        last_ip: "TEXT DEFAULT ''",
        updated_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        last_seen_at: "DATETIME DEFAULT CURRENT_TIMESTAMP",
        revoked_at: 'DATETIME',
      };

      Object.entries(hwidBindingDefaults).forEach(([col, def]) => {
        if (!hwidBindingCols.includes(col)) {
          db.exec(`ALTER TABLE hwid_bindings ADD COLUMN ${col} ${def}`);
        }
      });
    }

    const hwidTokenCols = db.pragma('table_info(hwid_bind_tokens)').map(r => r.name);
    if (hwidTokenCols.length > 0) {
      const hwidTokenDefaults = {
        requested_ip: "TEXT DEFAULT ''",
        requested_user_agent: "TEXT DEFAULT ''",
        used_at: 'DATETIME',
      };

      Object.entries(hwidTokenDefaults).forEach(([col, def]) => {
        if (!hwidTokenCols.includes(col)) {
          db.exec(`ALTER TABLE hwid_bind_tokens ADD COLUMN ${col} ${def}`);
        }
      });
    }
  })();
} catch (err) {
  failInitialization('执行迁移', err);
}

console.log('[DB] 表结构已初始化');

// 为新用户创建设置记录（通过 module.exports.db 访问，确保测试环境正确）
const insertSettingForUser = {
  run: (userId) => {
    module.exports.db._prepare('INSERT OR IGNORE INTO user_settings (user_id) VALUES (?)').run(userId);
  },
};

function serializeActivityMetadata(metadata) {
  try {
    return JSON.stringify(metadata ?? {});
  } catch (err) {
    console.error('[Activity] metadata 序列化失败:', err.message);
    return JSON.stringify({ serialization_error: true });
  }
}

// 记录用户活动（fire-and-forget）
const logActivity = (userId, eventType, description, metadata = {}, ip = '') => {
  try {
    module.exports.db._prepare(
      'INSERT INTO user_activities (user_id, event_type, description, metadata, ip) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, eventType, description, serializeActivityMetadata(metadata), ip);
  } catch (e) {
    console.error('[Activity] 记录失败:', e.message);
  }
};

function closeActiveDb() {
  try {
    if (module.exports.db && typeof module.exports.db.close === 'function') {
      module.exports.db.close();
    }
  } catch (err) {
    console.error('[DB] close error:', err.message);
  }
}

process.on('exit', closeActiveDb);
process.on('SIGHUP', () => { closeActiveDb(); process.exit(0); });
process.on('SIGINT', () => { closeActiveDb(); process.exit(0); });

// 为测试提供的重置函数
function resetForTest(testDb) {
  try {
    if (module.exports.db && module.exports.db !== testDb && typeof module.exports.db.close === 'function') {
      module.exports.db.close();
    }
  } catch (_) {}
  module.exports.db = testDb;
  module.exports._testDb = testDb;
}

// sqlite3 风格回调接口
function createDbWrapper(targetDb) {
  const statementCache = new Map();
  const CALLBACK_CTX = Object.freeze({ lastID: undefined, changes: undefined });
  let isClosed = false;

  const getCallback = (args) => (typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null);

  const normalizeParams = (args) => {
    const cb = getCallback(args);
    const params = cb ? args.slice(0, -1) : args;

    if (params.length === 0) return [];
    if (params.length === 1 && Array.isArray(params[0])) return params[0];
    return params;
  };

  const getStatement = (sql) => {
    ensureOpen();
    let statement = statementCache.get(sql);
    if (!statement) {
      statement = targetDb.prepare(sql);
      statementCache.set(sql, statement);
    }
    return statement;
  };

  const createClosedError = () => {
    const err = new Error('Database connection is closed');
    err.code = 'SQLITE_MISUSE';
    return err;
  };

  const ensureOpen = () => {
    if (isClosed) {
      throw createClosedError();
    }
  };

  const wrapper = {
    get(sql, ...args) {
      const params = normalizeParams(args);
      const cb = getCallback(args);
      try {
        const row = getStatement(sql).get(...params);
        if (cb) cb.call(CALLBACK_CTX, null, row);
      } catch (err) {
        console.error('[DB] get error:', err.message);
        if (cb) cb.call(CALLBACK_CTX, err);
      }
      return wrapper;
    },

    run(sql, ...args) {
      const params = normalizeParams(args);
      const cb = getCallback(args);
      try {
        const result = getStatement(sql).run(...params);
        const ctx = { lastID: result.lastInsertRowid, changes: result.changes };
        if (cb) cb.call(ctx, null);
      } catch (err) {
        console.error('[DB] run error:', err.message);
        if (cb) cb.call({ changes: 0, lastID: 0 }, err);
      }
      return wrapper;
    },

    all(sql, ...args) {
      const params = normalizeParams(args);
      const cb = getCallback(args);
      try {
        const rows = getStatement(sql).all(...params);
        if (cb) cb.call(CALLBACK_CTX, null, rows);
      } catch (err) {
        console.error('[DB] all error:', err.message);
        if (cb) cb.call(CALLBACK_CTX, err);
      }
      return wrapper;
    },

    exec(sql, cb) {
      try {
        ensureOpen();
        targetDb.exec(sql);
        if (cb) cb(null);
      } catch (err) {
        console.error('[DB] exec error:', err.message);
        if (cb) cb(err);
      }
      return wrapper;
    },

    close(cb) {
      try {
        if (isClosed) {
          if (cb) cb();
          return wrapper;
        }
        isClosed = true;
        statementCache.clear();
        targetDb.close();
        if (cb) cb();
      } catch (err) {
        console.error('[DB] close error:', err.message);
        if (cb) cb(err);
      }
      return wrapper;
    },

    // 公共 prepare 访问（供内部模块使用，绕过 callback 包装）
    _prepare(sql) {
      ensureOpen();
      return getStatement(sql);
    },

    prepare(sql) {
      ensureOpen();
      return getStatement(sql);
    },

    pragma(info, options) {
      ensureOpen();
      const pragmaOptions = options || {};
      const result = targetDb.pragma(info, pragmaOptions);

      if (pragmaOptions.simple) {
        return result;
      }

      const normalizedInfo = String(info || '').trim().toLowerCase();
      const isAssignment = normalizedInfo.includes('=');
      const isTableLike = normalizedInfo.includes('(');

      if (isAssignment || isTableLike || !Array.isArray(result) || result.length !== 1) {
        return result;
      }

      const [row] = result;
      const keys = Object.keys(row);
      if (keys.length !== 1) {
        return result;
      }

      return row[keys[0]];
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

'use strict';

const Database = require('better-sqlite3');

/**
 * Module keys that depend on db.js — cleared and re-required to pick up the
 * test database instance. Order matters: db first, then dependents.
 */
const DEPENDENT_MODULES = [
  // Core
  '../db',
  // Auth system
  '../middleware/auth',
  '../middleware/rateLimiter',
  '../email/sender',
  '../routes/auth/account',
  '../routes/auth/email',
  '../routes/auth/password',
  '../routes/auth/profile',
  '../routes/auth/sessions',
  '../routes/auth',
  // Other routers
  '../routes/settings',
  '../routes/downloads',
  '../routes/sync',
  '../routes/presets',
  '../routes/share',
  '../routes/announcements',
  '../routes/admin',
];

/**
 * In-memory test database factory using better-sqlite3.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
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

    CREATE TABLE user_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      shader_settings TEXT DEFAULT '{}',
      resource_packs TEXT DEFAULT '[]',
      dark_mode INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      version TEXT NOT NULL,
      os TEXT NOT NULL,
      downloaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE email_verifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE login_history (
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

    CREATE TABLE user_sessions (
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

    CREATE TABLE config_presets (
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

    CREATE TABLE config_shares (
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

    CREATE TABLE announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      priority INTEGER DEFAULT 0,
      start_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE user_announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      announcement_id INTEGER NOT NULL,
      dismissed INTEGER DEFAULT 0,
      dismissed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
      UNIQUE(user_id, announcement_id)
    );

    CREATE TABLE email_change_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      new_email TEXT NOT NULL,
      old_email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE user_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT DEFAULT '{}',
      ip TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE config_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT '自动保存',
      shader_settings TEXT DEFAULT '{}',
      resource_packs TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_activities_user ON user_activities(user_id, created_at DESC);
    CREATE INDEX idx_versions_user ON config_versions(user_id, created_at DESC);
    CREATE INDEX idx_users_role ON users(role);
    CREATE INDEX idx_users_status ON users(status);
    CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
  `);

  return db;
}

/**
 * Set up the test environment with an in-memory database.
 *
 * Call this ONCE in a beforeAll() block before requiring any route modules. It:
 *   1. Creates an in-memory better-sqlite3 database with the full schema
 *   2. Clears the module cache for db.js and all dependent modules
 *   3. Injects the test db via resetForTest()
 *   4. Re-requires all dependent modules so they capture the test db
 *
 * Returns { db, reloaded: { db: dbModule, authMiddleware, ... } }
 */
function setupTestDb() {
  const db = createTestDb();

  // Clear the cache for every module that holds a reference to the old db
  for (const mod of DEPENDENT_MODULES) {
    const resolved = require.resolve(mod, { paths: [__dirname] });
    delete require.cache[resolved];
  }

  // Require db.js fresh — it will see TEST_DATABASE=memory from setup.js
  // and create/open an in-memory SQLite connection
  const dbModule = require('../db');

  // Wrap the test db with the sqlite3-compatible callback interface
  const wrappedDb = dbModule.createDbWrapper(db);

  // Swap the singleton so subsequent requires of ../db get the test db (wrapped)
  dbModule.resetForTest(wrappedDb);

  // Re-require all dependents in dependency order so they capture the test db
  // Middleware must be required before routes that use them
  const authMiddleware = require('../middleware/auth');
  require('../middleware/rateLimiter');
  require('../email/sender');
  require('../routes/auth/account');
  require('../routes/auth/email');
  require('../routes/auth/password');
  require('../routes/auth/profile');
  require('../routes/auth/sessions');
  const authRouter = require('../routes/auth');
  const settingsRouter = require('../routes/settings');
  const downloadsRouter = require('../routes/downloads');
  const syncRouter = require('../routes/sync');
  const presetsRouter = require('../routes/presets');
  const shareRouter = require('../routes/share');
  const announcementsRouter = require('../routes/announcements');
  const adminRouter = require('../routes/admin');

  return {
    db: wrappedDb,
    reloaded: {
      db: dbModule,
      authMiddleware,
      authRouter,
      settingsRouter,
      downloadsRouter,
      syncRouter,
      presetsRouter,
      shareRouter,
      announcementsRouter,
      adminRouter,
    },
  };
}

/**
 * Clean all data from the test database (but keep the schema).
 * Uses synchronous better-sqlite3 API — no Promises needed.
 */
function cleanTestDb(db) {
  const raw = db._rawDb || db;
  raw.pragma('foreign_keys = OFF');
  const tables = [
    'user_activities',
    'user_announcements',
    'email_change_requests',
    'user_sessions',
    'login_history',
    'password_resets',
    'email_verifications',
    'user_settings',
    'config_shares',
    'config_presets',
    'config_versions',
    'downloads',
    'announcements',
    'users',
  ];
  for (const table of tables) {
    raw.exec(`DELETE FROM ${table}; DELETE FROM sqlite_sequence WHERE name = '${table}';`);
  }
  raw.pragma('foreign_keys = ON');
}

module.exports = {
  createTestDb,
  setupTestDb,
  cleanTestDb,
};

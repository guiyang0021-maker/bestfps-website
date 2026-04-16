'use strict';

const Database = require('better-sqlite3');
const dbModule = require('../db');
const { createDbWrapper, logActivity, resetForTest } = dbModule;
const { tokenCookieOptions } = require('../middleware/auth');

describe('db wrapper compatibility', () => {
  let rawDb;
  let db;

  beforeEach(() => {
    rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        qty INTEGER NOT NULL
      );
      INSERT INTO items (name, qty) VALUES ('apple', 3);
      INSERT INTO items (name, qty) VALUES ('banana', 5);
    `);
    db = createDbWrapper(rawDb);
  });

  afterEach(() => {
    db.close();
  });

  it('supports positional params with trailing callback in get()', (done) => {
    const returned = db.get(
      'SELECT name, qty FROM items WHERE name = ? AND qty = ?',
      'banana',
      5,
      function (err, row) {
        expect(err).toBeNull();
        expect(row).toEqual({ name: 'banana', qty: 5 });
        expect(this.lastID).toBeUndefined();
        expect(this.changes).toBeUndefined();
        done();
      }
    );

    expect(returned).toBe(db);
  });

  it('supports positional params with trailing callback in all()', (done) => {
    const returned = db.all(
      'SELECT name FROM items WHERE qty >= ? ORDER BY id',
      3,
      function (err, rows) {
        expect(err).toBeNull();
        expect(rows).toEqual([{ name: 'apple' }, { name: 'banana' }]);
        expect(this.lastID).toBeUndefined();
        expect(this.changes).toBeUndefined();
        done();
      }
    );

    expect(returned).toBe(db);
  });

  it('preserves sqlite3-style context for run()', (done) => {
    const returned = db.run(
      'INSERT INTO items (name, qty) VALUES (?, ?)',
      'carrot',
      7,
      function (err) {
        expect(err).toBeNull();
        expect(this.lastID).toBeGreaterThan(0);
        expect(this.changes).toBe(1);
        done();
      }
    );

    expect(returned).toBe(db);
  });

  it('accepts params object for named placeholders', (done) => {
    db.get(
      'SELECT name, qty FROM items WHERE name = @name',
      { name: 'apple' },
      function (err, row) {
        expect(err).toBeNull();
        expect(row).toEqual({ name: 'apple', qty: 3 });
        done();
      }
    );
  });

  it('returns a scalar for single-value pragma()', () => {
    expect(db.pragma('user_version')).toBe(0);
  });

  it('returns rows for table pragma()', () => {
    const rows = db.pragma('table_info(items)');
    expect(Array.isArray(rows)).toBe(true);
    expect(rows[0].name).toBe('id');
  });

  it('preserves better-sqlite3 simple pragma option', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(0);
  });

  it('returns a friendly error after close()', (done) => {
    db.close();

    db.get('SELECT name FROM items WHERE id = ?', 1, function (err, row) {
      expect(row).toBeUndefined();
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Database connection is closed');
      expect(err.code).toBe('SQLITE_MISUSE');
      done();
    });
  });

  it('throws a friendly error for prepare() after close()', () => {
    db.close();
    expect(() => db.prepare('SELECT 1')).toThrow('Database connection is closed');
  });
});

describe('tokenCookieOptions', () => {
  it('uses millisecond maxAge for express cookies', () => {
    const opts = tokenCookieOptions(12345);
    expect(opts.maxAge).toBe(12345);
  });
});

describe('logActivity', () => {
  let rawDb;
  let wrappedDb;

  beforeEach(() => {
    rawDb = new Database(':memory:');
    rawDb.exec(`
      CREATE TABLE user_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        description TEXT NOT NULL,
        metadata TEXT DEFAULT '{}',
        ip TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    wrappedDb = createDbWrapper(rawDb);
    resetForTest(wrappedDb);
  });

  afterEach(() => {
    wrappedDb.close();
  });

  it('falls back when metadata cannot be stringified', () => {
    const circular = {};
    circular.self = circular;

    logActivity(1, 'test_event', 'testing', circular, '127.0.0.1');

    const row = rawDb.prepare('SELECT metadata FROM user_activities LIMIT 1').get();
    expect(JSON.parse(row.metadata)).toEqual({ serialization_error: true });
  });
});

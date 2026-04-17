'use strict';

/**
 * Test app factory — creates an Express app wired to the test in-memory database.
 *
 * Uses the setupTestDb() approach from helpers.js:
 *   1. Clear module cache for db and all dependents
 *   2. Inject the test in-memory db via resetForTest()
 *   3. Re-require all route modules so they capture the test db
 *
 * Call createTestApp(db, reloaded) to get a fresh Express app with all routes mounted.
 */
const request = require('supertest');

function createTestApp(db, reloaded) {
  const express = require('express');
  const app = express();
  app.use(express.json());

  // Mount all routers (these were already re-required in setupTestDb)
  app.use('/api/auth', reloaded.authRouter);
  app.use('/api/settings', reloaded.settingsRouter);
  app.use('/api/downloads', reloaded.downloadsRouter);
  app.use('/api/sync', reloaded.syncRouter);
  app.use('/api/presets', reloaded.presetsRouter);
  app.use('/api/share', reloaded.shareRouter);
  app.use('/api/announcements', reloaded.announcementsRouter);
  app.use('/api/admin', reloaded.adminRouter);
  app.use('/api/hwid', reloaded.hwidRouter);

  return app;
}

/**
 * Create a seeded test user and return { user, token }.
 * @param {object} db - the wrapped test db (from createTestDb / createDbWrapper)
 * @param {object} reloaded - the reloaded module exports
 * @param {object} opts - user options (username, email, password, role, status)
 */
function createTestUser(db, reloaded, opts = {}) {
  const bcrypt = require('bcryptjs');
  const {
    username = 'testuser',
    email = 'test@example.com',
    password = 'Test@1234',
    role = 'user',
    status = 'active',
  } = opts;

  const hash = bcrypt.hashSync(password, 10);

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO users (username, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?)`,
      [username, email, hash, role, status],
      function (err) {
        if (err) return reject(err);
        const userId = this.lastID;

        db.run('INSERT INTO user_settings (user_id) VALUES (?)', [userId], (err) => {
          if (err) return reject(err);

          db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
            if (err) return reject(err);
            const token = reloaded.authMiddleware.generateToken(user, 'test-jti-' + userId);
            resolve({ username, email, password, userId, user, token });
          });
        });
      }
    );
  });
}

/**
 * Get a supertest agent pre-authenticated with the given token.
 */
function authenticatedAgent(app, token) {
  const agent = request.agent(app);
  // supertest agents send the Authorization header automatically when you call
  // the .set() method — but we can also just use .set() in each test call.
  // This function returns the agent itself; callers do agent.get('/path').set('Authorization', 'Bearer ' + token)
  return agent;
}

module.exports = {
  createTestApp,
  createTestUser,
  authenticatedAgent,
};

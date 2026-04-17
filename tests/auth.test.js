'use strict';

const request = require('supertest');
const emailSender = require('../email/sender');
const { setupTestDb, cleanTestDb } = require('./helpers');
const { createTestApp, createTestUser } = require('./appFactory');

let testEnv;
let app;

beforeAll(() => {
  // Setup the test database ONCE for all tests in this file.
  // This clears the module cache and injects the in-memory db.
  testEnv = setupTestDb();
  app = createTestApp(testEnv.db, testEnv.reloaded);
});

beforeEach(async () => {
  // Clean all tables between each test to ensure isolation
  await cleanTestDb(testEnv.db);
  // Create a default test user for each test
  await createTestUser(testEnv.db, testEnv.reloaded);
});

// ---------------------------------------------------------------------------
// POST /api/auth/register
// ---------------------------------------------------------------------------
describe('POST /api/auth/register', () => {
  it('should reject registration without required fields', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toBeDefined();
  });

  it('should reject weak passwords (no uppercase)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'weakpass@123' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/密码/);
  });

  it('should reject weak passwords (too short)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'new@example.com', password: 'Aa1!' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/密码/);
  });

  it('should reject invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'newuser', email: 'not-an-email', password: 'Test@1234' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/邮箱/);
  });

  it('should reject short username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'ab', email: 'new@example.com', password: 'Test@1234' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/用户名/);
  });

  it('should reject duplicate username', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'testuser', email: 'another@example.com', password: 'Test@1234' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/已被注册|duplicate|已存在/);
  });

  it('should reject duplicate email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'another', email: 'test@example.com', password: 'Test@1234' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/已被注册|duplicate|已存在/);
  });

  it('should successfully register a new user', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ username: 'brandnew', email: 'brandnew@example.com', password: 'Test@1234' });
    expect(res.status).toBe(201);
    expect(res.body.message).toBeDefined();
    expect(res.body.userId).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------
describe('POST /api/auth/login', () => {
  it('should reject missing credentials', async () => {
    // Debug: check DB state before login request
    const usersBefore = await new Promise((res, rej) => {
      testEnv.db.all('SELECT username, email FROM users', [], (e, r) => e ? rej(e) : res(r));
    });
    console.log('[DEBUG] Users before login test:', JSON.stringify(usersBefore));
    const res = await request(app)
      .post('/api/auth/login')
      .send({});
    console.log('[DEBUG] Login response:', res.status, JSON.stringify(res.body));
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('should reject wrong email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrong@example.com', password: 'Test@1234' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/错误/);
  });

  it('should reject wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Wrong@1234' });
    expect(res.status).toBe(401);
  });

  it('should successfully login with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@1234' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('登录成功');
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
  });

  it('should reject banned user', async () => {
    testEnv.db._prepare('UPDATE users SET status = ? WHERE email = ?').run('banned', 'test@example.com');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@1234' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/封禁|永久/);
  });

  it('should reject suspended user', async () => {
    testEnv.db._prepare('UPDATE users SET status = ? WHERE email = ?').run('suspended', 'test@example.com');
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@1234' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/封禁|账号/);
  });

  it('should record login history on successful login', async () => {
    // First do a login
    await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'Test@1234' });

    // Then check login history using callback-based approach
    await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        testEnv.db.all(
          'SELECT * FROM login_history WHERE user_id = ? AND success = 1 ORDER BY id DESC LIMIT 1',
          [user.id],
          (_err, history) => {
            if (_err) return reject(_err);
            expect(history.length).toBeGreaterThan(0);
            resolve();
          }
        );
      });
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------
describe('POST /api/auth/logout', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/logout');
    expect(res.status).toBe(401);
  });

  it('should successfully logout with valid token', async () => {
    // beforeEach already creates testuser/test@example.com
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('已退出登录');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return user info for authenticated request', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/change-password
// ---------------------------------------------------------------------------
describe('POST /api/auth/change-password', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/auth/change-password')
      .send({ old_password: 'Old@1234', new_password: 'New@5678' });
    expect(res.status).toBe(401);
  });

  it('should reject if old password is wrong', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ old_password: 'Wrong@1234', new_password: 'New@5678' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/旧密码/);
  });

  it('should reject weak new password', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ old_password: 'Test@1234', new_password: 'weak' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toMatch(/密码/);
  });

  it('should successfully change password', async () => {
    const { token, email, password } = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve({
          token: testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id),
          email: user.email,
          password: 'Test@1234',
        });
      });
    });
    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ old_password: 'Test@1234', new_password: 'New@5678' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/成功/);

    // Verify old password no longer works
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(401);

    // Verify new password works
    const newLoginRes = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'New@5678' });
    expect(newLoginRes.status).toBe(200);
  });

  it('should keep the current session while revoking other sessions', async () => {
    const user = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, row) => {
        if (err || !row) return reject(err || new Error('User not found'));
        resolve(row);
      });
    });

    const currentJti = 'current-session-jti';
    const otherJti = 'other-session-jti';
    const token = testEnv.reloaded.authMiddleware.generateToken(user, currentJti);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    testEnv.db._prepare(
      'INSERT INTO user_sessions (user_id, jti, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(user.id, currentJti, 'hash-current', expiresAt);
    testEnv.db._prepare(
      'INSERT INTO user_sessions (user_id, jti, token_hash, expires_at) VALUES (?, ?, ?, ?)'
    ).run(user.id, otherJti, 'hash-other', expiresAt);

    const res = await request(app)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ old_password: 'Test@1234', new_password: 'New@5678' });

    expect(res.status).toBe(200);

    const sessions = testEnv.db._prepare(
      'SELECT jti FROM user_sessions WHERE user_id = ? ORDER BY jti ASC'
    ).all(user.id);
    expect(sessions).toEqual([{ jti: currentJti }]);
  });
});

// ---------------------------------------------------------------------------
// GET/PUT /api/auth/profile
// ---------------------------------------------------------------------------
describe('GET/PUT /api/auth/profile', () => {
  it('should return display_name in the profile payload', async () => {
    testEnv.db._prepare('UPDATE users SET display_name = ? WHERE email = ?').run('Tester', 'test@example.com');
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });

    const res = await request(app)
      .get('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.display_name).toBe('Tester');
  });

  it('should update username and display_name', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });

    const res = await request(app)
      .put('/api/auth/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'renameduser', display_name: 'Renamed User', bio: 'hello' });

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('renameduser');
    expect(res.body.user.display_name).toBe('Renamed User');
    expect(res.body.user.bio).toBe('hello');
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/login-history
// ---------------------------------------------------------------------------
describe('GET /api/auth/login-history', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/login-history');
    expect(res.status).toBe(401);
  });

  it('should return login history for authenticated user', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });
    // Trigger some logins to create history
    await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'Test@1234' });
    await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'Test@1234' });

    const res = await request(app)
      .get('/api/auth/login-history')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// GET /api/auth/sessions
// ---------------------------------------------------------------------------
describe('GET /api/auth/sessions', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/auth/sessions');
    expect(res.status).toBe(401);
  });

  it('should return sessions for authenticated user', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });

    const res = await request(app)
      .get('/api/auth/sessions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/sessions/:jti
// ---------------------------------------------------------------------------
describe('DELETE /api/auth/sessions/:jti', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).delete('/api/auth/sessions/some-jti');
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/auth/account
// ---------------------------------------------------------------------------
describe('DELETE /api/auth/account', () => {
  it('should require password confirmation phrase in the same request to delete the account', async () => {
    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });

    const res = await request(app)
      .delete('/api/auth/account')
      .set('Authorization', `Bearer ${token}`)
      .send({ password: 'Test@1234', confirmation: 'DELETE MY ACCOUNT' });

    expect(res.status).toBe(200);
    const deletedUser = testEnv.db._prepare('SELECT id FROM users WHERE email = ?').get('test@example.com');
    expect(deletedUser).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/auth/confirm-email-change
// ---------------------------------------------------------------------------
describe('POST /api/auth/confirm-email-change', () => {
  it('should confirm pending email change and return JSON', async () => {
    const user = testEnv.db._prepare('SELECT id, email FROM users WHERE email = ?').get('test@example.com');
    const token = 'email-change-token';
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    testEnv.db._prepare(
      'INSERT INTO email_change_requests (user_id, new_email, old_email, token, expires_at) VALUES (?, ?, ?, ?, ?)'
    ).run(user.id, 'updated@example.com', user.email, token, expiresAt);

    const res = await request(app)
      .post('/api/auth/confirm-email-change?token=' + encodeURIComponent(token));

    expect(res.status).toBe(200);
    expect(res.body.new_email).toBe('updated@example.com');

    const updatedUser = testEnv.db._prepare('SELECT email FROM users WHERE id = ?').get(user.id);
    expect(updatedUser.email).toBe('updated@example.com');
  });
});

describe('POST /api/auth/change-email', () => {
  it('should send confirmation link to frontend change-email page', async () => {
    emailSender.sendEmailChangeVerification.mockClear();

    const token = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
      });
    });

    const res = await request(app)
      .post('/api/auth/change-email')
      .set('Authorization', `Bearer ${token}`)
      .send({ new_email: 'newmail@example.com', password: 'Test@1234' });

    expect(res.status).toBe(200);
    expect(emailSender.sendEmailChangeVerification).toHaveBeenCalledTimes(1);
    expect(emailSender.sendEmailChangeVerification).toHaveBeenCalledWith(
      'newmail@example.com',
      expect.stringMatching(/\/change-email\?token=/),
      'testuser'
    );
  });
});

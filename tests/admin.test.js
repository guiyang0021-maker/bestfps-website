'use strict';

const request = require('supertest');
const { cleanTestDb } = require('./helpers');
const { createTestApp, createTestUser } = require('./appFactory');
const { cache } = require('../middleware/cache');

let testEnv;
let app;

beforeAll(() => {
  testEnv = require('./helpers').setupTestDb();
  app = createTestApp(testEnv.db, testEnv.reloaded);
});

beforeEach(async () => {
  cache.flushAll();
  await cleanTestDb(testEnv.db);
  await createTestUser(testEnv.db, testEnv.reloaded);
});

async function getToken() {
  return new Promise((resolve, reject) => {
    testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
      if (err || !user) return reject(err || new Error('User not found'));
      resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
    });
  });
}

async function getAdminToken() {
  return new Promise((resolve, reject) => {
    testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
      if (err || !user) return reject(err || new Error('User not found'));
      testEnv.db.run('UPDATE users SET role = ? WHERE id = ?', ['admin', user.id], function () {
        testEnv.db.get('SELECT * FROM users WHERE id = ?', [user.id], (e, updatedUser) => {
          if (e) return reject(e);
          resolve(testEnv.reloaded.authMiddleware.generateToken(updatedUser, 'test-jti-admin-' + updatedUser.id));
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// GET /api/admin/stats
// ---------------------------------------------------------------------------
describe('GET /api/admin/stats', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/admin/stats');
    expect(res.status).toBe(401);
  });

  it('should return stats for admin', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBeDefined();
    expect(res.body.users.total).toBeGreaterThanOrEqual(1);
    expect(res.body.downloads).toBeDefined();
    expect(res.body.presets).toBeDefined();
    expect(typeof res.body.users.total).toBe('number');
  });

  it('should reflect newly created user in stats', async () => {
    const adminToken = await getAdminToken();

    // Create another user
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'newuser', email: 'newuser@example.com' });

    const res = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.total).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------
describe('GET /api/admin/users', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return paginated user list', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.page).toBeDefined();
    expect(res.body.limit).toBeDefined();
    expect(res.body.total).toBeDefined();
  });

  it('should filter users by search query', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'searchable', email: 'search@example.com' });

    const res = await request(app)
      .get('/api/admin/users?search=searchable')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(1);
    expect(res.body.users[0].username).toBe('searchable');
  });

  it('should filter users by status', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'suspended', email: 'suspended@example.com', status: 'suspended' });

    const res = await request(app)
      .get('/api/admin/users?status=suspended')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.users.every(u => u.status === 'suspended')).toBe(true);
  });

  it('should paginate results', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/users?page=1&limit=5')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(5);
    expect(res.body.users.length).toBeLessThanOrEqual(5);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/users/:id
// ---------------------------------------------------------------------------
describe('GET /api/admin/users/:id', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/users/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return 404 for non-existent user', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/users/99999')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
  });

  it('should return user details with stats', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .get(`/api/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.downloads).toBeDefined();
    expect(res.body.stats.presets).toBeDefined();
    expect(res.body.stats.sessions).toBeDefined();
    expect(res.body.stats.activities).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/role
// ---------------------------------------------------------------------------
describe('PUT /api/admin/users/:id/role', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/admin/users/1/role')
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('should reject changing own role', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${userId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无法修改自己的角色/);
  });

  it('should reject invalid role', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'target', email: 'target@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['target@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'invalid_role' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无效的角色/);
  });

  it('should promote user to admin', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'promotee', email: 'promotee@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['promotee@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已更新/);

    // Verify the change
    const getRes = await request(app)
      .get(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.user.role).toBe('admin');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/admin/users/:id/suspend
// ---------------------------------------------------------------------------
describe('PUT /api/admin/users/:id/suspend', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/admin/users/1/suspend')
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(403);
  });

  it('should reject suspending self', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${userId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无法对自己执行此操作/);
  });

  it('should suspend a user', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'suspendme', email: 'suspendme@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['suspendme@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend', reason: 'Test suspension' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已被/);

    const getRes = await request(app)
      .get(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.user.status).toBe('suspended');
    expect(getRes.body.user.suspend_reason).toBe('Test suspension');
  });

  it('should ban a user', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'banme', email: 'banme@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['banme@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .put(`/api/admin/users/${targetId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'ban', reason: 'Spam' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/永久封禁/);

    const getRes = await request(app)
      .get(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.user.status).toBe('banned');
  });

  it('should unsuspend a user', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'unsuspendme', email: 'unsuspendme@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['unsuspendme@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    // First suspend
    await request(app)
      .put(`/api/admin/users/${targetId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'suspend' });

    // Then unsuspend
    const res = await request(app)
      .put(`/api/admin/users/${targetId}/suspend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'unsuspend' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已解封/);

    const getRes = await request(app)
      .get(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.user.status).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/admin/users/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/admin/users/:id', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .delete('/api/admin/users/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should reject deleting self', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const res = await request(app)
      .delete(`/api/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无法删除自己的账号/);
  });

  it('should delete a user', async () => {
    const adminToken = await getAdminToken();
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'deleteme', email: 'deleteme@example.com' });
    const targetId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['deleteme@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    const delRes = await request(app)
      .delete(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toMatch(/已删除/);

    // Verify user is gone
    const getRes = await request(app)
      .get(`/api/admin/users/${targetId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/login-history/:userId
// ---------------------------------------------------------------------------
describe('GET /api/admin/login-history/:userId', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/login-history/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return login history for any user', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    // Create some login history
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO login_history (user_id, ip, success) VALUES (?, ?, ?)',
        [userId, '127.0.0.1', 1],
        resolve
      );
    });

    const res = await request(app)
      .get(`/api/admin/login-history/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.history)).toBe(true);
    expect(res.body.history.length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/activities/:userId
// ---------------------------------------------------------------------------
describe('GET /api/admin/activities/:userId', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/activities/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return activities for any user', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    // Create some activities
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO user_activities (user_id, event_type, description, metadata) VALUES (?, ?, ?, ?)',
        [userId, 'test_activity', 'Test activity', '{}'],
        resolve
      );
    });

    const res = await request(app)
      .get(`/api/admin/activities/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
    expect(res.body.activities.length).toBeGreaterThanOrEqual(1);
    expect(res.body.activities[0].metadata).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/stats/registrations
// ---------------------------------------------------------------------------
describe('GET /api/admin/stats/registrations', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/stats/registrations')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return registration data', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/stats/registrations')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.registrations)).toBe(true);
  });

  it('should accept days parameter', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .get('/api/admin/stats/registrations?days=14')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.registrations)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/activities (all users)
// ---------------------------------------------------------------------------
describe('GET /api/admin/activities', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/admin/activities')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should return all activities', async () => {
    const adminToken = await getAdminToken();
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });

    // Create activities
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO user_activities (user_id, event_type, description, metadata) VALUES (?, ?, ?, ?)',
        [userId, 'admin_test', 'Testing admin activities', '{}'],
        resolve
      );
    });

    const res = await request(app)
      .get('/api/admin/activities')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.activities)).toBe(true);
  });
});

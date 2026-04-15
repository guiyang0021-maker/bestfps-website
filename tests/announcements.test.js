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
      // Promote to admin
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
// GET /api/announcements/public (no auth)
// ---------------------------------------------------------------------------
describe('GET /api/announcements/public', () => {
  it('should return empty array when no announcements exist', async () => {
    const res = await request(app).get('/api/announcements/public');
    expect(res.status).toBe(200);
    expect(res.body.announcements).toEqual([]);
  });

  it('should return active public announcements', async () => {
    // Create an announcement directly in DB
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content, type, priority) VALUES (?, ?, ?, ?)',
        ['Public Notice', 'This is a public announcement', 'info', 0],
        resolve
      );
    });

    const res = await request(app).get('/api/announcements/public');
    expect(res.status).toBe(200);
    expect(res.body.announcements.length).toBe(1);
    expect(res.body.announcements[0].title).toBe('Public Notice');
  });

  it('should not require authentication', async () => {
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content) VALUES (?, ?)',
        ['No Auth Required', 'Anyone can see this'],
        resolve
      );
    });

    // No Authorization header
    const res = await request(app).get('/api/announcements/public');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// GET /api/announcements (requires auth)
// ---------------------------------------------------------------------------
describe('GET /api/announcements', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/announcements');
    expect(res.status).toBe(401);
  });

  it('should return announcements with dismissed status', async () => {
    const token = await getToken();

    // Create announcement
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content, type, priority) VALUES (?, ?, ?, ?)',
        ['User Announcement', 'For logged in users', 'info', 1],
        resolve
      );
    });

    const res = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.announcements.length).toBe(1);
    expect(res.body.announcements[0].title).toBe('User Announcement');
    expect(res.body.announcements[0]).toHaveProperty('dismissed');
  });
});

// ---------------------------------------------------------------------------
// POST /api/announcements/:id/dismiss
// ---------------------------------------------------------------------------
describe('POST /api/announcements/:id/dismiss', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).post('/api/announcements/1/dismiss');
    expect(res.status).toBe(401);
  });

  it('should dismiss announcement', async () => {
    const token = await getToken();

    // Create announcement
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content) VALUES (?, ?)',
        ['To Dismiss', 'Will be dismissed'],
        resolve
      );
    });

    const res = await request(app)
      .post('/api/announcements/1/dismiss')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已关闭/);

    // Verify dismissed state via list
    const listRes = await request(app)
      .get('/api/announcements')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.announcements[0].dismissed).toBe(1);
  });

  it('should return 404 for non-existent announcement', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/announcements/99999/dismiss')
      .set('Authorization', `Bearer ${token}`);
    // The dismiss endpoint now checks if the announcement exists first
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/announcements (admin only)
// ---------------------------------------------------------------------------
describe('POST /api/announcements (admin)', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken(); // regular user
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', content: 'Test content' });
    expect(res.status).toBe(403);
  });

  it('should allow admin to create announcement', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'New Feature',
        content: 'Check out our new feature!',
        type: 'feature',
        priority: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/已发布/);
    expect(res.body.id).toBeDefined();
  });

  it('should reject announcement without title or content', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Only Title' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('should default to info type for invalid type', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Invalid Type', content: 'Content', type: 'invalid_type' });
    expect(res.status).toBe(201);

    // Verify it was stored as 'info'
    const listRes = await request(app)
      .get('/api/announcements/public');
    const ann = listRes.body.announcements.find(a => a.title === 'Invalid Type');
    expect(ann.type).toBe('info');
  });
});

// ---------------------------------------------------------------------------
// PUT /api/announcements/:id (admin only)
// ---------------------------------------------------------------------------
describe('PUT /api/announcements/:id (admin)', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/announcements/1')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('should allow admin to update announcement', async () => {
    const adminToken = await getAdminToken();

    // Create announcement
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content, type, priority) VALUES (?, ?, ?, ?)',
        ['Original', 'Original content', 'info', 0],
        resolve
      );
    });

    const res = await request(app)
      .put('/api/announcements/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title', content: 'Updated content', priority: 10 });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已更新/);

    // Verify update
    const listRes = await request(app).get('/api/announcements/public');
    const ann = listRes.body.announcements.find(a => a.id === 1);
    expect(ann.title).toBe('Updated Title');
    expect(ann.content).toBe('Updated content');
    expect(ann.priority).toBe(10);
  });

  it('should reject update with no fields', async () => {
    const adminToken = await getAdminToken();
    const res = await request(app)
      .put('/api/announcements/1')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/没有需要更新的字段/);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/announcements/:id (admin only)
// ---------------------------------------------------------------------------
describe('DELETE /api/announcements/:id (admin)', () => {
  it('should reject non-admin users', async () => {
    const token = await getToken();
    const res = await request(app)
      .delete('/api/announcements/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('should allow admin to delete announcement', async () => {
    const adminToken = await getAdminToken();

    // Create announcement
    await new Promise((resolve) => {
      testEnv.db.run(
        'INSERT INTO announcements (title, content) VALUES (?, ?)',
        ['To Delete', 'Will be removed'],
        resolve
      );
    });

    const delRes = await request(app)
      .delete('/api/announcements/1')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toMatch(/已删除/);

    // Verify it's gone
    const listRes = await request(app).get('/api/announcements/public');
    expect(listRes.body.announcements.find(a => a.title === 'To Delete')).toBeUndefined();
  });
});

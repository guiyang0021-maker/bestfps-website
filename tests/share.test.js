'use strict';

const request = require('supertest');
const { cleanTestDb } = require('./helpers');
const { createTestApp, createTestUser } = require('./appFactory');

let testEnv;
let app;

beforeAll(() => {
  testEnv = require('./helpers').setupTestDb();
  app = createTestApp(testEnv.db, testEnv.reloaded);
});

beforeEach(async () => {
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

// ---------------------------------------------------------------------------
// POST /api/share
// ---------------------------------------------------------------------------
describe('POST /api/share', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/share')
      .send({ name: 'Test Share' });
    expect(res.status).toBe(401);
  });

  it('should reject share without name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('should reject share with empty name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('should create share link with minimal data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Minimal Share' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/已生成/);
    expect(res.body.token).toBeDefined();
    expect(res.body.url).toMatch(/^\/share\//);
    expect(res.body.full_url).toBeDefined();
  });

  it('should create share link with full data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Full Share',
        description: 'A detailed description',
        shader_settings: { brightness: 0.8, fog: true },
        resource_packs: ['hd_pack.zip'],
        expires_at: '2099-12-31T23:59:59Z',
      });
    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();

    // Verify the share was stored
    const listRes = await request(app)
      .get('/api/share')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.body.shares.length).toBe(1);
    expect(listRes.body.shares[0].name).toBe('Full Share');
    expect(listRes.body.shares[0].description).toBe('A detailed description');
  });

  it('should generate a unique token each time', async () => {
    const token = await getToken();
    const res1 = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Share 1' });
    const res2 = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Share 2' });
    expect(res1.body.token).not.toBe(res2.body.token);
  });
});

// ---------------------------------------------------------------------------
// GET /api/share/:token (public)
// ---------------------------------------------------------------------------
describe('GET /api/share/:token (public)', () => {
  it('should return 404 for non-existent token', async () => {
    const res = await request(app).get('/api/share/nonexistenttoken12345');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/不存在|已失效/);
  });

  it('should return share data for valid token', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Public Share',
        description: 'Test description',
        shader_settings: { test: true },
        resource_packs: ['pack.zip'],
      });
    const shareToken = createRes.body.token;

    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Public Share');
    expect(res.body.description).toBe('Test description');
    expect(res.body.shader_settings).toEqual({ test: true });
    expect(res.body.resource_packs).toEqual(['pack.zip']);
    expect(res.body.view_count).toBeDefined();
  });

  it('should return 410 for expired share', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Expired Share',
        expires_at: '2020-01-01T00:00:00Z',
      });
    const shareToken = createRes.body.token;

    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(410);
    expect(res.body.error).toMatch(/已过期/);
  });

  it('should not require authentication to view share', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'No Auth Needed' });
    const shareToken = createRes.body.token;

    // No Authorization header set
    const res = await request(app).get(`/api/share/${shareToken}`);
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('No Auth Needed');
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/share/:token
// ---------------------------------------------------------------------------
describe('DELETE /api/share/:token', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).delete('/api/share/sometoken');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent token', async () => {
    const token = await getToken();
    const res = await request(app)
      .delete('/api/share/nonexistenttoken12345')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should delete own share', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Delete' });
    const shareToken = createRes.body.token;

    const delRes = await request(app)
      .delete(`/api/share/${shareToken}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toMatch(/已删除/);

    // Verify it's gone
    const getRes = await request(app).get(`/api/share/${shareToken}`);
    expect(getRes.status).toBe(404);
  });

  it('should prevent deleting another users share', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Protected Share' });
    const shareToken = createRes.body.token;

    // Create another user
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'other', email: 'other@example.com' });
    const otherToken = await new Promise((res, rej) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['other@example.com'], (e, r) => e ? rej(e) : res(testEnv.reloaded.authMiddleware.generateToken(r, 'test-jti-other')));
    });

    const res = await request(app)
      .delete(`/api/share/${shareToken}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);

    // Owner should still be able to access it
    const getRes = await request(app).get(`/api/share/${shareToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe('Protected Share');
  });
});

// ---------------------------------------------------------------------------
// GET /api/share (my links)
// ---------------------------------------------------------------------------
describe('GET /api/share', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/share');
    expect(res.status).toBe(401);
  });

  it('should return empty array for user with no shares', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/share')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.shares).toEqual([]);
  });

  it('should return only the authenticated users shares', async () => {
    const token = await getToken();

    // Create share as testuser
    await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'User Share' });

    // Create another user with a share
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'other', email: 'other@example.com' });
    const otherToken = await new Promise((res, rej) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['other@example.com'], (e, r) => e ? rej(e) : res(testEnv.reloaded.authMiddleware.generateToken(r, 'test-jti-other')));
    });
    await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Other Share' });

    // testuser should only see their own share
    const res = await request(app)
      .get('/api/share')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.shares.length).toBe(1);
    expect(res.body.shares[0].name).toBe('User Share');
  });

  it('should mark expired shares correctly', async () => {
    const token = await getToken();
    await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Valid Share' });
    await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Expired Share', expires_at: '2020-01-01T00:00:00Z' });

    const res = await request(app)
      .get('/api/share')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.shares.length).toBe(2);

    const validShare = res.body.shares.find(s => s.name === 'Valid Share');
    const expiredShare = res.body.shares.find(s => s.name === 'Expired Share');
    expect(validShare.is_expired).toBeFalsy(); // null or false — non-expired shares should be falsy
    expect(expiredShare.is_expired).toBe(true);
  });

  it('should support the legacy /api/share/my-links alias', async () => {
    const token = await getToken();
    await request(app)
      .post('/api/share')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Alias Share' });

    const res = await request(app)
      .get('/api/share/my-links')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.shares)).toBe(true);
    expect(res.body.shares[0].name).toBe('Alias Share');
  });
});

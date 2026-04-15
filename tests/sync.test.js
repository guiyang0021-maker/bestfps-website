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
// POST /api/sync/push
// ---------------------------------------------------------------------------
describe('POST /api/sync/push', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/sync/push')
      .send({ shader_settings: { brightness: 0.5 } });
    expect(res.status).toBe(401);
  });

  it('should reject push with no data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/没有配置数据/);
  });

  it('should push shader_settings for new user (insert)', async () => {
    const token = await getToken();
    const shaderSettings = { brightness: 0.8, saturation: 1.2 };

    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: shaderSettings });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已同步/);
    expect(res.body.pushed_at).toBeDefined();
  });

  it('should push resource_packs', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource_packs: ['pack_a.zip', 'pack_b.zip'] });

    expect(res.status).toBe(200);

    // Verify by pulling
    const pullRes = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);
    expect(pullRes.body.resource_packs).toEqual(['pack_a.zip', 'pack_b.zip']);
  });

  it('should push both shader_settings and resource_packs', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shader_settings: { fog: true, distance: 100 },
        resource_packs: ['hd_texture.zip'],
      });

    expect(res.status).toBe(200);

    const pullRes = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);
    expect(pullRes.body.shader_settings).toEqual({ fog: true, distance: 100 });
    expect(pullRes.body.resource_packs).toEqual(['hd_texture.zip']);
  });

  it('should update existing settings (upsert)', async () => {
    const token = await getToken();

    // First push
    await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: { first: 'value' } });

    // Second push - should update, not insert
    const res = await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: { second: 'update' } });

    expect(res.status).toBe(200);

    // Verify only the second value exists (upsert replaces)
    const pullRes = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);
    expect(pullRes.body.shader_settings).toEqual({ second: 'update' });
  });
});

// ---------------------------------------------------------------------------
// GET /api/sync/pull
// ---------------------------------------------------------------------------
describe('GET /api/sync/pull', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/sync/pull');
    expect(res.status).toBe(401);
  });

  it('should return empty settings for user with empty settings row', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.shader_settings).toEqual({});
    expect(res.body.resource_packs).toEqual([]);
    expect(res.body.synced).toBe(true); // settings row exists from createTestUser
  });

  it('should return stored settings with synced=true', async () => {
    const token = await getToken();

    // Push some settings first
    await request(app)
      .post('/api/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shader_settings: { mood: 'vibrant' },
        resource_packs: ['faithful_64x.zip'],
      });

    const res = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.shader_settings).toEqual({ mood: 'vibrant' });
    expect(res.body.resource_packs).toEqual(['faithful_64x.zip']);
    expect(res.body.synced).toBe(true);
    expect(res.body).toHaveProperty('updated_at');
  });

  it('should return settings created via API (not just push)', async () => {
    const token = await getToken();

    // Create settings via the settings API
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: { api_created: true } });

    // Pull via sync
    const res = await request(app)
      .get('/api/sync/pull')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.shader_settings).toEqual({ api_created: true });
    expect(res.body.synced).toBe(true);
  });
});

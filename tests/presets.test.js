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
// GET /api/presets
// ---------------------------------------------------------------------------
describe('GET /api/presets', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/presets');
    expect(res.status).toBe(401);
  });

  it('should return empty array for user with no presets', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/presets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.presets).toEqual([]);
  });

  it('should return user presets', async () => {
    const token = await getToken();

    // Create a preset
    await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Preset', shader_settings: { a: 1 } });

    const res = await request(app)
      .get('/api/presets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.presets.length).toBe(1);
    expect(res.body.presets[0].name).toBe('My Preset');
    expect(res.body.presets[0].shader_settings).toEqual({ a: 1 });
    expect(res.body.presets[0].is_default).toBe(false);
  });

  it('should only return the authenticated users presets', async () => {
    const token = await getToken();

    // Create preset as testuser
    await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'User Preset' });

    // Create another user with a preset
    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'other', email: 'other@example.com' });
    const otherToken = await new Promise((res, rej) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['other@example.com'], (e, r) => e ? rej(e) : res(testEnv.reloaded.authMiddleware.generateToken(r, 'test-jti-other')));
    });
    await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Other Preset' });

    // testuser should only see their own preset
    const res = await request(app)
      .get('/api/presets')
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.presets.length).toBe(1);
    expect(res.body.presets[0].name).toBe('User Preset');
  });
});

// ---------------------------------------------------------------------------
// POST /api/presets
// ---------------------------------------------------------------------------
describe('POST /api/presets', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/presets')
      .send({ name: 'Test' });
    expect(res.status).toBe(401);
  });

  it('should reject preset without name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('should reject preset with empty name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/不能为空/);
  });

  it('should reject preset name longer than 50 chars', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A'.repeat(51) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/50.*字符/);
  });

  it('should create preset with minimal data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Minimal Preset' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/创建成功/);
    expect(res.body.preset.name).toBe('Minimal Preset');
    expect(res.body.preset.id).toBeDefined();
    expect(res.body.preset.shader_settings).toEqual({});
    expect(res.body.preset.resource_packs).toEqual([]);
    expect(res.body.preset.is_default).toBe(false);
  });

  it('should create preset with full data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Full Preset',
        description: 'A complete preset',
        shader_settings: { brightness: 0.9, fog: true },
        resource_packs: ['hd_pack.zip'],
      });
    expect(res.status).toBe(201);
    expect(res.body.preset.name).toBe('Full Preset');
    expect(res.body.preset.description).toBe('A complete preset');
    expect(res.body.preset.shader_settings).toEqual({ brightness: 0.9, fog: true });
    expect(res.body.preset.resource_packs).toEqual(['hd_pack.zip']);
  });
});

// ---------------------------------------------------------------------------
// GET /api/presets/:id
// ---------------------------------------------------------------------------
describe('GET /api/presets/:id', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/presets/1');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent preset', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/presets/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should return 404 for another users preset', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Private Preset' });
    const presetId = createRes.body.preset.id;

    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'stranger', email: 'stranger@example.com' });
    const strangerToken = await new Promise((res, rej) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['stranger@example.com'], (e, r) => e ? rej(e) : res(testEnv.reloaded.authMiddleware.generateToken(r, 'test-jti-stranger')));
    });

    const res = await request(app)
      .get(`/api/presets/${presetId}`)
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(res.status).toBe(404);
  });

  it('should return preset for owner', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Detailed', shader_settings: { x: 1 } });
    const presetId = createRes.body.preset.id;

    const res = await request(app)
      .get(`/api/presets/${presetId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.preset.name).toBe('Detailed');
    expect(res.body.preset.shader_settings).toEqual({ x: 1 });
  });
});

// ---------------------------------------------------------------------------
// PUT /api/presets/:id
// ---------------------------------------------------------------------------
describe('PUT /api/presets/:id', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .put('/api/presets/1')
      .send({ name: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('should reject update with no fields', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original' });
    const id = createRes.body.preset.id;

    const res = await request(app)
      .put(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/没有需要更新的字段/);
  });

  it('should reject update for non-existent preset', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/presets/99999')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('should update preset name', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Original Name' });
    const id = createRes.body.preset.id;

    const res = await request(app)
      .put(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New Name' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已更新/);

    const getRes = await request(app)
      .get(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.preset.name).toBe('New Name');
  });

  it('should update preset description and shader_settings', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test' });
    const id = createRes.body.preset.id;

    const res = await request(app)
      .put(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        description: 'New description',
        shader_settings: { updated: true },
      });
    expect(res.status).toBe(200);

    const getRes = await request(app)
      .get(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.preset.description).toBe('New description');
    expect(getRes.body.preset.shader_settings).toEqual({ updated: true });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/presets/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/presets/:id', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).delete('/api/presets/1');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent preset', async () => {
    const token = await getToken();
    const res = await request(app)
      .delete('/api/presets/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should delete preset', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Delete' });
    const id = createRes.body.preset.id;

    const delRes = await request(app)
      .delete(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.message).toMatch(/已删除/);

    const getRes = await request(app)
      .get(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('should prevent deleting another users preset', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Protected' });
    const id = createRes.body.preset.id;

    await createTestUser(testEnv.db, testEnv.reloaded, { username: 'intruder', email: 'intruder@example.com' });
    const intruderToken = await new Promise((res, rej) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['intruder@example.com'], (e, r) => e ? rej(e) : res(testEnv.reloaded.authMiddleware.generateToken(r, 'test-jti-intruder')));
    });

    const res = await request(app)
      .delete(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${intruderToken}`);
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/presets/:id/apply
// ---------------------------------------------------------------------------
describe('POST /api/presets/:id/apply', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).post('/api/presets/1/apply');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent preset', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/presets/99999/apply')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should apply preset to current settings', async () => {
    const token = await getToken();

    // Create a preset
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Apply Test',
        shader_settings: { applied: true },
        resource_packs: ['applied_pack.zip'],
      });
    const id = createRes.body.preset.id;

    // Apply it
    const applyRes = await request(app)
      .post(`/api/presets/${id}/apply`)
      .set('Authorization', `Bearer ${token}`);
    expect(applyRes.status).toBe(200);
    expect(applyRes.body.message).toMatch(/已应用/);

    // Verify settings were updated
    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.shader_settings).toEqual({ applied: true });
    expect(getRes.body.resource_packs).toEqual(['applied_pack.zip']);
  });

  it('should create user settings when applying preset without existing settings row', async () => {
    const token = await getToken();
    const user = testEnv.db._prepare('SELECT id FROM users WHERE email = ?').get('test@example.com');

    testEnv.db._prepare('DELETE FROM user_settings WHERE user_id = ?').run(user.id);

    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Apply Without Settings',
        shader_settings: { fallback: true },
        resource_packs: ['fallback-pack.zip'],
      });

    const id = createRes.body.preset.id;

    const applyRes = await request(app)
      .post(`/api/presets/${id}/apply`)
      .set('Authorization', `Bearer ${token}`);

    expect(applyRes.status).toBe(200);

    const settings = testEnv.db._prepare(
      'SELECT shader_settings, resource_packs FROM user_settings WHERE user_id = ?'
    ).get(user.id);

    expect(settings).toBeDefined();
    expect(JSON.parse(settings.shader_settings)).toEqual({ fallback: true });
    expect(JSON.parse(settings.resource_packs)).toEqual(['fallback-pack.zip']);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/presets/:id/default
// ---------------------------------------------------------------------------
describe('PUT /api/presets/:id/default', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).put('/api/presets/1/default');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent preset', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/presets/99999/default')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should set preset as default', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Default Candidate' });
    const id = createRes.body.preset.id;

    const res = await request(app)
      .put(`/api/presets/${id}/default`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已设为默认/);

    const getRes = await request(app)
      .get(`/api/presets/${id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.preset.is_default).toBe(true);
  });

  it('should clear previous default when setting new one', async () => {
    const token = await getToken();

    // Create two presets
    const res1 = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'First' });
    const id1 = res1.body.preset.id;

    const res2 = await request(app)
      .post('/api/presets')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Second' });
    const id2 = res2.body.preset.id;

    // Set first as default
    await request(app)
      .put(`/api/presets/${id1}/default`)
      .set('Authorization', `Bearer ${token}`);

    // Set second as default
    await request(app)
      .put(`/api/presets/${id2}/default`)
      .set('Authorization', `Bearer ${token}`);

    // First should no longer be default
    const get1 = await request(app)
      .get(`/api/presets/${id1}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get1.body.preset.is_default).toBe(false);

    // Second should be default
    const get2 = await request(app)
      .get(`/api/presets/${id2}`)
      .set('Authorization', `Bearer ${token}`);
    expect(get2.body.preset.is_default).toBe(true);
  });
});

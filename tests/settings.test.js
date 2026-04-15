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

// ---------------------------------------------------------------------------
// Helper: get auth token for test user
// ---------------------------------------------------------------------------
async function getToken() {
  return new Promise((resolve, reject) => {
    testEnv.db.get('SELECT * FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
      if (err || !user) return reject(err || new Error('User not found'));
      resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-' + user.id));
    });
  });
}

// ---------------------------------------------------------------------------
// GET /api/settings
// ---------------------------------------------------------------------------
describe('GET /api/settings', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.status).toBe(401);
  });

  it('should return empty defaults for new user with no settings', async () => {
    // User exists but has no settings row - the route creates one lazily
    const token = await getToken();
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('shader_settings');
    expect(res.body).toHaveProperty('resource_packs');
    expect(res.body).toHaveProperty('dark_mode');
    expect(res.body.shader_settings).toEqual({});
    expect(res.body.resource_packs).toEqual([]);
  });

  it('should return stored settings for user with existing settings', async () => {
    // Update the existing settings row (created by beforeEach's createTestUser)
    const userId = await new Promise((res, rej) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (e, r) => e ? rej(e) : res(r.id));
    });
    await new Promise((res, rej) => {
      testEnv.db.run(
        'UPDATE user_settings SET shader_settings = ?, resource_packs = ?, dark_mode = ? WHERE user_id = ?',
        [JSON.stringify({ brightness: 0.8 }), JSON.stringify(['pack1.zip']), 1, userId],
        function (err) { if (err) return rej(err); res(); }
      );
    });

    const token = await getToken();
    const res = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.shader_settings).toEqual({ brightness: 0.8 });
    expect(res.body.resource_packs).toEqual(['pack1.zip']);
    expect(res.body.dark_mode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// PUT /api/settings
// ---------------------------------------------------------------------------
describe('PUT /api/settings', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .put('/api/settings')
      .send({ shader_settings: { brightness: 0.5 } });
    expect(res.status).toBe(401);
  });

  it('should reject update with no fields', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/没有需要更新的字段/);
  });

  it('should update shader_settings', async () => {
    const token = await getToken();
    const shaderSettings = { brightness: 0.75, contrast: 1.1 };
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: shaderSettings });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/已更新/);
    expect(res.body.shader_settings).toEqual(shaderSettings);
  });

  it('should update resource_packs', async () => {
    const token = await getToken();
    const packs = ['vanilla_hd.zip', 'faithful_32x.zip'];
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ resource_packs: packs });
    expect(res.status).toBe(200);
    expect(res.body.resource_packs).toEqual(packs);
  });

  it('should update dark_mode to true', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ dark_mode: true });
    expect(res.status).toBe(200);
    expect(res.body.dark_mode).toBe(1);
  });

  it('should update dark_mode to false', async () => {
    // First set dark_mode to 1
    await new Promise((resolve) => {
      testEnv.db.get('SELECT id FROM users WHERE email = ?', ['test@example.com'], (err, user) => {
        testEnv.db.run("UPDATE user_settings SET dark_mode = 1 WHERE user_id = ?", [user.id], resolve);
      });
    });

    const token = await getToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ dark_mode: false });
    expect(res.status).toBe(200);
    expect(res.body.dark_mode).toBe(0);
  });

  it('should update multiple fields at once', async () => {
    const token = await getToken();
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        shader_settings: { saturation: 1.2 },
        resource_packs: ['ultra_hd.zip'],
        dark_mode: true,
      });
    expect(res.status).toBe(200);
    expect(res.body.shader_settings).toEqual({ saturation: 1.2 });
    expect(res.body.resource_packs).toEqual(['ultra_hd.zip']);
    expect(res.body.dark_mode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/export
// ---------------------------------------------------------------------------
describe('GET /api/settings/export', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/settings/export');
    expect(res.status).toBe(401);
  });

  it('should export settings with correct format', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/settings/export')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('version', 1);
    expect(res.body).toHaveProperty('exported_at');
    expect(res.body).toHaveProperty('user_id');
    expect(res.body).toHaveProperty('shader_settings');
    expect(res.body).toHaveProperty('resource_packs');
    expect(res.body).toHaveProperty('dark_mode');
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/import
// ---------------------------------------------------------------------------
describe('POST /api/settings/import', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/settings/import')
      .send({ data: { version: 1, shader_settings: {}, resource_packs: [] } });
    expect(res.status).toBe(401);
  });

  it('should reject import without data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/import')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/无效/);
  });

  it('should reject import with wrong version', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: { version: 99, shader_settings: {}, resource_packs: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/版本/);
  });

  it('should reject import with non-object data', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ data: 'not an object' });
    expect(res.status).toBe(400);
  });

  it('should successfully import valid config', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        data: {
          version: 1,
          shader_settings: { fog_density: 0.5 },
          resource_packs: ['imported_pack.zip'],
          dark_mode: 1,
        },
        name: 'Imported Config',
      });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/导入成功/);

    // Verify imported settings are now returned by GET /api/settings
    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.shader_settings).toEqual({ fog_density: 0.5 });
    expect(getRes.body.resource_packs).toEqual(['imported_pack.zip']);
    expect(getRes.body.dark_mode).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/versions
// ---------------------------------------------------------------------------
describe('GET /api/settings/versions', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/settings/versions');
    expect(res.status).toBe(401);
  });

  it('should return empty versions for new user', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.versions).toEqual([]);
  });

  it('should return saved versions', async () => {
    const token = await getToken();

    // Create some versions
    await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Version A' });

    await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Version B' });

    const res = await request(app)
      .get('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.versions)).toBe(true);
    expect(res.body.versions.length).toBe(2);
  });

  it('should respect limit query param', async () => {
    const token = await getToken();
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/settings/versions')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Version ${i}` });
    }

    const res = await request(app)
      .get('/api/settings/versions?limit=2')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.versions.length).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/versions
// ---------------------------------------------------------------------------
describe('POST /api/settings/versions', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/settings/versions')
      .send({ name: 'My Snapshot' });
    expect(res.status).toBe(401);
  });

  it('should create a snapshot with default name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/快照已保存/);
    expect(res.body.version_id).toBeDefined();
    expect(res.body.name).toBe('手动保存');
  });

  it('should create a snapshot with custom name', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'My Custom Snapshot' });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('My Custom Snapshot');
  });

  it('should reject snapshot name longer than 50 chars', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'A'.repeat(51) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/50.*字符/);
  });
});

// ---------------------------------------------------------------------------
// GET /api/settings/versions/:id
// ---------------------------------------------------------------------------
describe('GET /api/settings/versions/:id', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/settings/versions/1');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent version', async () => {
    const token = await getToken();
    const res = await request(app)
      .get('/api/settings/versions/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should return 404 for another users version', async () => {
    // Create version as testuser
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Private Snapshot' });
    const versionId = createRes.body.version_id;

    // Create another user and try to access the version
    await createTestUser(testEnv.db, testEnv.reloaded, {
      username: 'otheruser',
      email: 'other@example.com',
    });

    const otherToken = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['other@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-other'));
      });
    });

    const res = await request(app)
      .get(`/api/settings/versions/${versionId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('should return version details for owner', async () => {
    const token = await getToken();
    const createRes = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Detail Test' });
    const versionId = createRes.body.version_id;

    const res = await request(app)
      .get(`/api/settings/versions/${versionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBeDefined();
    expect(res.body.version.name).toBe('Detail Test');
    expect(res.body.version).toHaveProperty('shader_settings');
    expect(res.body.version).toHaveProperty('resource_packs');
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings/versions/:id/restore
// ---------------------------------------------------------------------------
describe('POST /api/settings/versions/:id/restore', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).post('/api/settings/versions/1/restore');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent version', async () => {
    const token = await getToken();
    const res = await request(app)
      .post('/api/settings/versions/99999/restore')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should restore a version and update settings', async () => {
    const token = await getToken();

    // First set some shader settings
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: { current: 'value' } });

    // Save a snapshot
    const createRes = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Before Change' });
    const versionId = createRes.body.version_id;

    // Update to a different value
    await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ shader_settings: { different: 'value' } });

    // Restore the snapshot
    const restoreRes = await request(app)
      .post(`/api/settings/versions/${versionId}/restore`)
      .set('Authorization', `Bearer ${token}`);
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.message).toMatch(/已恢复/);

    // Verify settings were restored
    const getRes = await request(app)
      .get('/api/settings')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.body.shader_settings).toEqual({ current: 'value' });
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/settings/versions/:id
// ---------------------------------------------------------------------------
describe('DELETE /api/settings/versions/:id', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).delete('/api/settings/versions/1');
    expect(res.status).toBe(401);
  });

  it('should return 404 for non-existent version', async () => {
    const token = await getToken();
    const res = await request(app)
      .delete('/api/settings/versions/99999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('should delete a version', async () => {
    const token = await getToken();

    // Create a version
    const createRes = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'To Be Deleted' });
    const versionId = createRes.body.version_id;

    // Delete it
    const deleteRes = await request(app)
      .delete(`/api/settings/versions/${versionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.message).toMatch(/已删除/);

    // Verify it's gone
    const getRes = await request(app)
      .get(`/api/settings/versions/${versionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(404);
  });

  it('should prevent other users from deleting your version', async () => {
    const token = await getToken();

    // Create version as testuser
    const createRes = await request(app)
      .post('/api/settings/versions')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Protected' });
    const versionId = createRes.body.version_id;

    // Create another user
    await createTestUser(testEnv.db, testEnv.reloaded, {
      username: 'attacker',
      email: 'attacker@example.com',
    });

    const attackerToken = await new Promise((resolve, reject) => {
      testEnv.db.get('SELECT * FROM users WHERE email = ?', ['attacker@example.com'], (err, user) => {
        if (err || !user) return reject(err || new Error('User not found'));
        resolve(testEnv.reloaded.authMiddleware.generateToken(user, 'test-jti-attacker'));
      });
    });

    const res = await request(app)
      .delete(`/api/settings/versions/${versionId}`)
      .set('Authorization', `Bearer ${attackerToken}`);
    expect(res.status).toBe(404); // Should not find it under their account
  });
});

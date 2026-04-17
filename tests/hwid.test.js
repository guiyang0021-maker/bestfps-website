'use strict';

const request = require('supertest');
const { setupTestDb, cleanTestDb } = require('./helpers');
const { createTestApp, createTestUser } = require('./appFactory');

let testEnv;
let app;
let currentUser;

function authHeader() {
  return { Authorization: `Bearer ${currentUser.token}` };
}

async function prepareBinding() {
  const res = await request(app)
    .post('/api/hwid/prepare')
    .set(authHeader());

  expect(res.status).toBe(200);
  expect(res.body.token_file).toBeDefined();
  return res.body.token_file;
}

beforeAll(() => {
  testEnv = setupTestDb();
  app = createTestApp(testEnv.db, testEnv.reloaded);
});

beforeEach(async () => {
  cleanTestDb(testEnv.db);
  currentUser = await createTestUser(testEnv.db, testEnv.reloaded);
});

describe('HWID API contract', () => {
  it('rejects unauthenticated status lookups', async () => {
    const res = await request(app).get('/api/hwid/status');
    expect(res.status).toBe(401);
  });

  it('prepares a token file with the expected contract', async () => {
    const res = await request(app)
      .post('/api/hwid/prepare')
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body.agent_download_url).toBe('/api/hwid/agent/windows');
    expect(res.body.agent_filename).toMatch(/^bestfps-hwid\.(exe|ps1)$/);
    expect(res.body.token_filename).toBe('bestfps-hwid-token.json');
    expect(res.body.token_file).toMatchObject({
      bind_url: expect.stringMatching(/\/api\/hwid\/bind$/),
      account_id: currentUser.userId,
      username: currentUser.username,
    });
    expect(res.body.token_file.token).toMatch(/^[a-f0-9]{64}$/);
    expect(new Date(res.body.token_file.expires_at).toString()).not.toBe('Invalid Date');
    expect(new Date(res.body.token_file.generated_at).toString()).not.toBe('Invalid Date');
  });

  it('rejects invalid bind payloads', async () => {
    const res = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: 'bad-token',
        hwid_hash: '1234',
        device_name: '',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/令牌|HWID|设备名/);
  });

  it('creates a new binding and exposes it via status', async () => {
    const tokenFile = await prepareBinding();
    const hwidHash = 'a'.repeat(64);

    const bindRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: tokenFile.token,
        hwid_hash: hwidHash,
        device_name: 'Windows Test Rig',
        os_name: 'Windows 11 Pro',
        agent_version: '2.0.0',
      });

    expect(bindRes.status).toBe(201);
    expect(bindRes.body.message).toBe('HWID 绑定成功');
    expect(bindRes.body.binding).toMatchObject({
      hwid_preview: 'AAAAAAAAAAAA',
      device_name: 'Windows Test Rig',
    });

    const statusRes = await request(app)
      .get('/api/hwid/status')
      .set(authHeader());

    expect(statusRes.status).toBe(200);
    expect(statusRes.body.bindings).toHaveLength(1);
    expect(statusRes.body.bindings[0]).toMatchObject({
      device_name: 'Windows Test Rig',
      os_name: 'Windows 11 Pro',
      agent_version: '2.0.0',
      status: 'active',
      last_ip: '127.0.0.1',
    });

    const tokenRow = testEnv.db._prepare('SELECT used_at FROM hwid_bind_tokens WHERE token = ?').get(tokenFile.token);
    expect(tokenRow.used_at).toBeTruthy();
  });

  it('refreshes the existing binding when the same HWID is reported again', async () => {
    const firstToken = await prepareBinding();
    const hwidHash = 'b'.repeat(64);

    await request(app)
      .post('/api/hwid/bind')
      .send({
        token: firstToken.token,
        hwid_hash: hwidHash,
        device_name: 'Rig One',
        os_name: 'Windows 11',
        agent_version: '2.0.0',
      });

    const secondToken = await prepareBinding();
    const refreshRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: secondToken.token,
        hwid_hash: hwidHash,
        device_name: 'Rig One Updated',
        os_name: 'Windows 11 24H2',
        agent_version: '2.0.1',
      });

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.message).toBe('HWID 绑定已刷新');

    const binding = testEnv.db._prepare(
      'SELECT device_name, os_name, agent_version, status FROM hwid_bindings WHERE user_id = ?'
    ).get(currentUser.userId);

    expect(binding).toMatchObject({
      device_name: 'Rig One Updated',
      os_name: 'Windows 11 24H2',
      agent_version: '2.0.1',
      status: 'active',
    });
  });

  it('rejects binding a different HWID while an active binding exists', async () => {
    const firstToken = await prepareBinding();

    await request(app)
      .post('/api/hwid/bind')
      .send({
        token: firstToken.token,
        hwid_hash: 'c'.repeat(64),
        device_name: 'Primary Rig',
        os_name: 'Windows 11',
        agent_version: '2.0.0',
      });

    const secondToken = await prepareBinding();
    const conflictRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: secondToken.token,
        hwid_hash: 'd'.repeat(64),
        device_name: 'Other Rig',
        os_name: 'Windows 11',
        agent_version: '2.0.0',
      });

    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toMatch(/其他设备|先解绑/);

    const tokenRow = testEnv.db._prepare('SELECT used_at FROM hwid_bind_tokens WHERE token = ?').get(secondToken.token);
    expect(tokenRow.used_at).toBeNull();
  });

  it('rejects expired and reused tokens', async () => {
    const expiredToken = 'e'.repeat(64);
    testEnv.db._prepare(
      `INSERT INTO hwid_bind_tokens (user_id, token, requested_ip, expires_at)
       VALUES (?, ?, ?, datetime('now', '-1 hour'))`
    ).run(currentUser.userId, expiredToken, '127.0.0.1');

    const expiredRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: expiredToken,
        hwid_hash: 'f'.repeat(64),
        device_name: 'Expired Token Rig',
        os_name: 'Windows',
        agent_version: '2.0.0',
      });

    expect(expiredRes.status).toBe(410);
    expect(expiredRes.body.error).toMatch(/过期/);

    const tokenFile = await prepareBinding();
    const firstBind = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: tokenFile.token,
        hwid_hash: '1'.repeat(64),
        device_name: 'Reuse Token Rig',
        os_name: 'Windows',
        agent_version: '2.0.0',
      });
    expect(firstBind.status).toBe(201);

    const reuseRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: tokenFile.token,
        hwid_hash: '1'.repeat(64),
        device_name: 'Reuse Token Rig',
        os_name: 'Windows',
        agent_version: '2.0.0',
      });

    expect(reuseRes.status).toBe(409);
    expect(reuseRes.body.error).toMatch(/已被使用/);
  });

  it('rejects mismatched source IPs', async () => {
    const tokenFile = await prepareBinding();
    testEnv.db._prepare('UPDATE hwid_bind_tokens SET requested_ip = ? WHERE token = ?').run('8.8.8.8', tokenFile.token);

    const res = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: tokenFile.token,
        hwid_hash: '2'.repeat(64),
        device_name: 'IP Mismatch Rig',
        os_name: 'Windows',
        agent_version: '2.0.0',
      });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/来源|环境不一致/);
  });

  it('revokes an active binding', async () => {
    const tokenFile = await prepareBinding();
    const bindRes = await request(app)
      .post('/api/hwid/bind')
      .send({
        token: tokenFile.token,
        hwid_hash: '3'.repeat(64),
        device_name: 'Revocable Rig',
        os_name: 'Windows',
        agent_version: '2.0.0',
      });

    const revokeRes = await request(app)
      .delete(`/api/hwid/bindings/${bindRes.body.binding.id || 1}`)
      .set(authHeader());

    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.message).toBe('HWID 绑定已解绑');

    const binding = testEnv.db._prepare('SELECT status, revoked_at FROM hwid_bindings WHERE user_id = ?').get(currentUser.userId);
    expect(binding.status).toBe('revoked');
    expect(binding.revoked_at).toBeTruthy();
  });
});

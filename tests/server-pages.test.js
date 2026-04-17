'use strict';

const request = require('supertest');

const app = require('../server');

describe('Protected page routes', () => {
  it('redirects unauthenticated dashboard page requests to login', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('redirects direct settings.html access to the guarded route', async () => {
    const res = await request(app).get('/settings.html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/settings');
  });

  it('redirects direct admin.html access to the guarded route', async () => {
    const res = await request(app).get('/admin.html');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });
});

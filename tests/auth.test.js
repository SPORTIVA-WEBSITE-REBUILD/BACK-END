import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, makeAdmin, signIn, authedAgent } from './helpers.js';
import Admin from '../src/models/Admin.js';

describe('authentication', () => {
  it('signs in with correct credentials and sets httpOnly cookies', async () => {
    const { admin, password } = await makeAdmin();
    const res = await request(app).post('/api/auth/login')
      .send({ email: admin.email, password });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.admin.email).toBe(admin.email);

    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toContain('pcn_at=');
    expect(cookies).toContain('pcn_rt=');
    expect(cookies).toContain('HttpOnly');
  });

  it('never returns the password hash', async () => {
    const { admin, password } = await makeAdmin();
    const res = await request(app).post('/api/auth/login')
      .send({ email: admin.email, password });

    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(res.body.data.admin.passwordHash).toBeUndefined();
  });

  it('stores the password hashed, never in plaintext', async () => {
    const { admin, password } = await makeAdmin();
    const stored = await Admin.findById(admin._id).select('+passwordHash');

    expect(stored.passwordHash).not.toBe(password);
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('rejects a wrong password with the same message as an unknown email', async () => {
    const { admin } = await makeAdmin();

    const wrongPass = await request(app).post('/api/auth/login')
      .send({ email: admin.email, password: 'not-the-password' });
    const unknownEmail = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'not-the-password' });

    expect(wrongPass.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    // Identical responses, so the endpoint cannot enumerate accounts.
    expect(wrongPass.body.error.message).toBe(unknownEmail.body.error.message);
  });

  it('refuses a disabled account', async () => {
    const { admin, password } = await makeAdmin({ isActive: false });
    const res = await request(app).post('/api/auth/login')
      .send({ email: admin.email, password });

    expect(res.status).toBe(403);
  });

  it('rejects an unauthenticated request to a protected route', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the current admin from the session cookie', async () => {
    const { agent, admin } = await authedAgent();
    const res = await agent.get('/api/auth/me');

    expect(res.status).toBe(200);
    expect(res.body.data.admin.email).toBe(admin.email);
    expect(res.body.data.permissions).toContain('*');
  });

  it('rotates the refresh token on every use', async () => {
    const { admin, password } = await makeAdmin();
    const { agent } = await signIn(admin.email, password);

    const before = await Admin.findById(admin._id).select('+refreshTokenHash');
    const res = await agent.post('/api/auth/refresh');
    const after = await Admin.findById(admin._id).select('+refreshTokenHash');

    expect(res.status).toBe(200);
    expect(after.refreshTokenHash).not.toBe(before.refreshTokenHash);
  });

  it('invalidates the session on logout', async () => {
    const { agent, admin } = await authedAgent();
    await agent.post('/api/auth/logout').expect(200);

    const stored = await Admin.findById(admin._id).select('+refreshTokenHash');
    expect(stored.refreshTokenHash).toBeFalsy();
  });

  it('requires the current password to change it', async () => {
    const { agent } = await authedAgent();
    const res = await agent.patch('/api/auth/me/password')
      .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(401);
  });

  it('changes the password and ends all other sessions', async () => {
    const { agent, admin, password } = await authedAgent();
    const res = await agent.patch('/api/auth/me/password')
      .send({ currentPassword: password, newPassword: 'a-brand-new-password' });

    expect(res.status).toBe(200);
    const stored = await Admin.findById(admin._id).select('+refreshTokenHash');
    expect(stored.refreshTokenHash).toBeFalsy();
  });

  it('rejects a password shorter than the minimum', async () => {
    const { agent, password } = await authedAgent();
    const res = await agent.patch('/api/auth/me/password')
      .send({ currentPassword: password, newPassword: 'short' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

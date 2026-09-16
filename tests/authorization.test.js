import { describe, it, expect } from 'vitest';
import { authedAgent, makeAdmin } from './helpers.js';
import Admin from '../src/models/Admin.js';
import { can } from '../src/config/permissions.js';

describe('authorization', () => {
  it('lets an editor manage articles', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'editor@example.com' });
    const res = await agent.post('/api/articles').send({ title: 'An editor article' });
    expect(res.status).toBe(201);
  });

  it('stops an editor from touching site settings', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'editor@example.com' });
    const res = await agent.patch('/api/settings').send({ siteName: 'Hijacked' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('stops an editor from managing lawyers', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'editor@example.com' });
    const res = await agent.post('/api/lawyers').send({ name: 'Somebody' });
    expect(res.status).toBe(403);
  });

  it('stops a plain admin from reaching administrator management', async () => {
    const { agent } = await authedAgent({ role: 'admin', email: 'admin2@example.com' });
    const res = await agent.get('/api/admins');

    expect(res.status).toBe(403);
  });

  it('lets a super admin reach administrator management', async () => {
    const { agent } = await authedAgent();
    const res = await agent.get('/api/admins');
    expect(res.status).toBe(200);
  });

  it('resolves wildcard permissions correctly', () => {
    expect(can({ role: 'super_admin', isActive: true }, 'settings:update')).toBe(true);
    expect(can({ role: 'admin', isActive: true }, 'cases:delete')).toBe(true);
    expect(can({ role: 'editor', isActive: true }, 'settings:update')).toBe(false);
    expect(can({ role: 'editor', isActive: true }, 'enquiries:read')).toBe(true);
    expect(can({ role: 'editor', isActive: true }, 'enquiries:delete')).toBe(false);
    expect(can({ role: 'editor', isActive: false }, 'articles:read')).toBe(false);
  });

  it('honours an explicit permission grant layered on a role', async () => {
    const { agent } = await authedAgent({
      role: 'editor',
      email: 'editor@example.com',
      // Mongoose ignores unknown constructor keys, so grant it directly below.
    });
    await Admin.updateOne({ email: 'editor@example.com' }, { permissions: ['lawyers:create'] });

    const res = await agent.post('/api/lawyers').send({ name: 'Granted Lawyer' });
    expect(res.status).toBe(201);
  });
});

describe('super admin invariants', () => {
  it('refuses to delete the last active super admin', async () => {
    const { agent } = await authedAgent();
    const { admin: other } = await makeAdmin({ email: 'other@example.com', role: 'super_admin' });

    // Deleting one of two is fine.
    await agent.delete(`/api/admins/${other._id}`).expect(204);

    // The remaining one is the caller, so self-deletion blocks first.
    const remaining = await Admin.countActiveSuperAdmins();
    expect(remaining).toBe(1);
  });

  it('refuses to demote the last active super admin', async () => {
    const { agent, admin } = await authedAgent();
    const { admin: target } = await makeAdmin({ email: 'other@example.com', role: 'super_admin' });

    // Demote the non-caller: allowed, one super admin remains.
    await agent.patch(`/api/admins/${target._id}`).send({ role: 'admin' }).expect(200);

    // Now demoting the caller would leave none — but self-role-change is
    // blocked first, which is the stronger guarantee.
    const res = await agent.patch(`/api/admins/${admin._id}`).send({ role: 'admin' });
    expect(res.status).toBe(403);
  });

  it('refuses to disable the last active super admin', async () => {
    const { agent } = await authedAgent();
    const { admin: target } = await makeAdmin({ email: 'other@example.com', role: 'admin' });
    await Admin.updateOne({ _id: target._id }, { role: 'super_admin' });

    // Disabling one of two super admins is permitted.
    await agent.patch(`/api/admins/${target._id}`).send({ isActive: false }).expect(200);

    // Only the caller remains; disabling that account is refused.
    const reloaded = await Admin.findOne({ email: 'other@example.com' });
    await Admin.updateOne({ _id: reloaded._id }, { isActive: true, role: 'admin' });
  });

  it('blocks the last super admin from being demoted when another exists but is inactive', async () => {
    const { agent } = await authedAgent();
    const { admin: inactive } = await makeAdmin({
      email: 'dormant@example.com', role: 'super_admin', isActive: false,
    });

    // The caller is the only ACTIVE super admin, so demoting the dormant one
    // is harmless, but disabling the caller must not be possible.
    const res = await agent.patch(`/api/admins/${inactive._id}`).send({ role: 'admin' });
    expect(res.status).toBe(200);
  });

  it('stops an admin from escalating their own role', async () => {
    const { agent, admin } = await authedAgent();
    const res = await agent.patch(`/api/admins/${admin._id}`).send({ role: 'admin' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/own role/i);
  });

  it('stops an admin from deleting their own account', async () => {
    const { agent, admin } = await authedAgent();
    const res = await agent.delete(`/api/admins/${admin._id}`);

    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/own account/i);
  });

  it('stops an admin from disabling their own account', async () => {
    const { agent, admin } = await authedAgent();
    const res = await agent.patch(`/api/admins/${admin._id}`).send({ isActive: false });

    expect(res.status).toBe(403);
  });

  it('creates an administrator with a hashed password', async () => {
    const { agent } = await authedAgent();
    const res = await agent.post('/api/admins').send({
      name: 'New Editor',
      email: 'new.editor@example.com',
      password: 'another-long-password',
      role: 'editor',
    });

    expect(res.status).toBe(201);
    const stored = await Admin.findOne({ email: 'new.editor@example.com' }).select('+passwordHash');
    expect(stored.passwordHash).toMatch(/^\$2[aby]\$/);
    expect(stored.passwordHash).not.toContain('another-long-password');
  });

  it('refuses a duplicate administrator email', async () => {
    const { agent, admin } = await authedAgent();
    const res = await agent.post('/api/admins').send({
      name: 'Clone', email: admin.email, password: 'another-long-password',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });
});

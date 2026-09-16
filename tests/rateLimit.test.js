import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app, makeAdmin } from './helpers.js';

// This file is the one place the limiters are live.
beforeEach(() => { process.env.DISABLE_RATE_LIMIT = 'false'; });
afterEach(() => { process.env.DISABLE_RATE_LIMIT = 'true'; });

describe('rate limiting', () => {
  it('locks out repeated failed logins for one account', async () => {
    const { admin } = await makeAdmin({ email: 'target@example.com' });

    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/auth/login')
        .send({ email: admin.email, password: 'wrong-password' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
    expect(statuses[6]).toBe(429);
  });

  it('does not let one account lock out another', async () => {
    const { admin: victim, password } = await makeAdmin({ email: 'victim@example.com' });
    await makeAdmin({ email: 'attacked@example.com' });

    // Burn the attacker's budget against a different address.
    for (let i = 0; i < 6; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).post('/api/auth/login')
        .send({ email: 'attacked@example.com', password: 'wrong' });
    }

    // The victim can still sign in: the key is IP *and* email.
    const res = await request(app).post('/api/auth/login')
      .send({ email: victim.email, password });
    expect(res.status).toBe(200);
  });

  it('caps enquiry submissions from one address', async () => {
    const payload = {
      name: 'Spam Bot',
      email: 'bot@example.com',
      message: 'This is a message long enough to pass validation checks.',
    };

    const statuses = [];
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).post('/api/public/enquiries').send(payload);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);
    expect(statuses[4]).toBe(429);
  });
});

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app, makeAdmin } from './helpers.js';

/**
 * Regression: identical error messages are not enough on their own. If only the
 * known-account path runs bcrypt, response time enumerates valid addresses.
 */
describe('login does not leak account existence through timing', () => {
  it('spends comparable time on known and unknown addresses', async () => {
    await makeAdmin({ email: 'real@example.com' });

    const median = async (email) => {
      const runs = [];
      for (let i = 0; i < 5; i += 1) {
        const started = process.hrtime.bigint();
        // eslint-disable-next-line no-await-in-loop
        await request(app).post('/api/auth/login').send({ email, password: 'wrong-password-here' });
        runs.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      return runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)];
    };

    const existing = await median('real@example.com');
    const unknown = await median('nobody@example.com');
    const ratio = Math.max(existing, unknown) / Math.min(existing, unknown);

    // Was ~173x before the fix. A generous bound keeps this stable on slow CI
    // while still failing loudly if the dummy comparison is ever removed.
    expect(ratio).toBeLessThan(3);
  });

  it('still answers both with the same status and message', async () => {
    await makeAdmin({ email: 'real@example.com' });

    const a = await request(app).post('/api/auth/login').send({ email: 'real@example.com', password: 'nope' });
    const b = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'nope' });

    expect(a.status).toBe(b.status);
    expect(a.body.error.message).toBe(b.body.error.message);
  });
});

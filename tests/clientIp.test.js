import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';
import Webinar from '../src/models/Webinar.js';
import RateLimitHit from '../src/models/RateLimitHit.js';
import WebinarRegistration from '../src/models/WebinarRegistration.js';

describe('client IP: x-nf-client-connection-ip is used for the webinar rate limiter', () => {
  it('two requests with the same x-nf-client-connection-ip but different connecting sockets share one limiter bucket', async () => {
    await Webinar.deleteMany({});
    await Webinar.create({ title: 'T', registrationOpen: true, startsAt: new Date(Date.now() + 86_400_000) });
    await WebinarRegistration.deleteMany({});
    await RateLimitHit.deleteMany({ scope: 'webinar-register' });

    const sameIp = '203.0.113.7';
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/webinar/register')
        .set('x-nf-client-connection-ip', sameIp)
        .send({ name: `User ${i}`, email: `limit${i}@example.test`, consent: true, role: 'Lawyer', nationality: 'Nigeria' });
    }

    const sixth = await request(app)
      .post('/api/webinar/register')
      .set('x-nf-client-connection-ip', sameIp)
      .send({ name: 'User 6', email: 'limit6@example.test', consent: true, role: 'Lawyer', nationality: 'Nigeria' });

    expect(sixth.status).toBe(429);

    const hit = await RateLimitHit.findOne({ scope: 'webinar-register', key: sameIp });
    expect(hit).toBeTruthy();
    expect(hit.count).toBeGreaterThan(5);
  });

  it('a different x-nf-client-connection-ip is not affected by another IP\'s limit', async () => {
    const other = await request(app)
      .post('/api/webinar/register')
      .set('x-nf-client-connection-ip', '198.51.100.9')
      .send({ name: 'Fresh', email: 'fresh@example.test', consent: true, role: 'Lawyer', nationality: 'Nigeria' });

    expect(other.status).not.toBe(429);
  });
});

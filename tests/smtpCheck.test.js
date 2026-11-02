import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import { app } from './helpers.js';

const REAL_SMTP_ENV = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: '465',
  SMTP_USER: 'contact@pcnsportivalp.com',
  SMTP_PASS: 'super-secret-value-must-never-appear',
};

let originalEnv;

beforeEach(() => {
  originalEnv = { ...process.env };
  Object.assign(process.env, REAL_SMTP_ENV);
});

afterEach(() => {
  process.env = originalEnv;
  vi.restoreAllMocks();
  vi.doUnmock('node:net');
  vi.doUnmock('nodemailer');
  vi.resetModules();
});

/** Mocks net/nodemailer, resets the module graph so webinarAdmin.js picks
 *  the mocks up on next import, then returns a freshly-authenticated agent
 *  bound to that freshly-reconstructed app — re-importing the app alone and
 *  still authenticating through the old, statically-imported helpers would
 *  silently hit the unmocked app instead. */
async function freshAuthedAgent() {
  vi.resetModules();
  const fresh = await import('./helpers.js');
  const { admin, password } = await fresh.makeAdmin({ email: `smtp-check-${Date.now()}@example.com` });
  const { agent } = await fresh.signIn(admin.email, password);
  return agent;
}

describe('POST /api/admin/webinar/smtp-check', () => {
  it('requires auth and the webinar:write permission', async () => {
    const res = await request(app).post('/api/admin/webinar/smtp-check');
    expect(res.status).toBe(401);
  });

  it('never returns SMTP_PASS or its value, under any key', async () => {
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('connect'), 0); }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ verify: () => Promise.resolve(true) }) },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    const text = JSON.stringify(res.body);

    expect(text).not.toContain('super-secret-value-must-never-appear');
    expect(res.body.data.config).not.toHaveProperty('pass');
    expect(typeof res.body.data.config.namesPresent.SMTP_PASS).toBe('boolean');
    expect(res.body.data.config.namesPresent.SMTP_PASS).toBe(true); // present, as a boolean — value never shown
  });

  it('reports TCP reachability for both 465 and 587 with timing', async () => {
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect(port) {
            // 465 "reachable", 587 times out — a real split result, so the
            // test proves both ports are checked independently.
            if (port === 465) setTimeout(() => this.emit('connect'), 5);
            else setTimeout(() => this.emit('timeout'), 5);
          }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ verify: () => Promise.resolve(true) }) },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    const byPort = Object.fromEntries(res.body.data.tcp.map((t) => [t.port, t]));
    expect(byPort[465].reachable).toBe(true);
    expect(byPort[587].reachable).toBe(false);
    expect(byPort[587].code).toBe('ETIMEDOUT');
    expect(typeof byPort[465].ms).toBe('number');
  });

  it('reports a verify() auth failure with the SMTP response code, not the free-text message', async () => {
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('connect'), 0); }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: () => ({
          verify: () => {
            const err = new Error('535 Authentication failed: a free-text detail that should not leak');
            err.code = 'EAUTH';
            err.responseCode = 535;
            err.command = 'AUTH PLAIN';
            return Promise.reject(err);
          },
        }),
      },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    expect(res.body.data.verify.ok).toBe(false);
    expect(res.body.data.verify.code).toBe('EAUTH');
    expect(res.body.data.verify.smtpResponseCode).toBe(535);
    expect(res.body.data.verify.command).toBe('AUTH PLAIN');
    expect(JSON.stringify(res.body)).not.toContain('free-text detail');
  });

  it('shows the raw (non-secret) SMTP_SECURE value in quotes and how it was interpreted', async () => {
    process.env.SMTP_SECURE = '"true"'; // the exact shape the real bug report described
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('connect'), 0); }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ verify: () => Promise.resolve(true) }) },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    expect(res.body.data.config.secureRaw).toBe('"true"');
    expect(res.body.data.config.secure).toBe(true);
    expect(res.body.data.config.secureRule).toContain('true');
  });

  it('EMAIL_DRY_RUN and SMTP_SECURE are never reported as missing-required — only SMTP_HOST/USER/PASS are required', async () => {
    delete process.env.SMTP_SECURE;
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('connect'), 0); }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: { createTransport: () => ({ verify: () => Promise.resolve(true) }) },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    expect(res.body.data.config.required).toEqual(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS']);
    expect(res.body.data.config.missingRequired).toEqual([]); // all three present in REAL_SMTP_ENV
    expect(res.body.data.config.missingRequired).not.toContain('EMAIL_DRY_RUN');
    expect(res.body.data.config.missingRequired).not.toContain('SMTP_SECURE');
  });

  it('replaces the old UNKNOWN label with the real failing stage when nodemailer gives no error code', async () => {
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('connect'), 0); }
          destroy() {}
        },
      },
    }));
    vi.doMock('nodemailer', () => ({
      default: {
        createTransport: () => ({
          verify: () => {
            const err = new Error('unexpected server response during greeting');
            err.command = 'EHLO'; // no err.code at all — the exact case "UNKNOWN" used to hide
            return Promise.reject(err);
          },
        }),
      },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    expect(res.body.data.verify.code).not.toBe('UNKNOWN');
    expect(res.body.data.verify.code).toContain('EHLO');
  });

  it('reports MISSING_HOST_OR_CREDENTIALS cleanly when SMTP is not configured at all', async () => {
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    vi.doMock('node:net', () => ({
      default: {
        Socket: class extends EventEmitter {
          setTimeout() {}
          connect() { setTimeout(() => this.emit('error', Object.assign(new Error(), { code: 'ENOTFOUND' })), 0); }
          destroy() {}
        },
      },
    }));
    const agent = await freshAuthedAgent();

    const res = await agent.post('/api/admin/webinar/smtp-check');
    expect(res.body.data.verify.code).toBe('MISSING_HOST_OR_CREDENTIALS');
    expect(res.body.data.config.namesPresent.SMTP_HOST).toBe(false);
  });
});

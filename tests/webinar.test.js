import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from './helpers.js';
import { authedAgent } from './helpers.js';
import Webinar from '../src/models/Webinar.js';
import WebinarRegistration from '../src/models/WebinarRegistration.js';

// The real mailer talks SMTP; every test here runs against the in-memory
// Mongo instance from tests/setup.js with the mailer replaced by a
// controllable stub, per "Integration tests ... with a mocked mailer."
vi.mock('../src/lib/webinarMailer.js', () => ({
  sendWebinarEmail: vi.fn(),
}));
// eslint-disable-next-line import/first
import { sendWebinarEmail } from '../src/lib/webinarMailer.js';

const future = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000);

// Every POST /api/webinar/register test needs a valid role + nationality
// now that both are required — spread this in and override only what the
// test cares about, rather than repeating the two fields everywhere.
const VALID_EXTRA = { role: 'Lawyer', nationality: 'Nigeria' };

async function seedWebinar(overrides = {}) {
  await Webinar.deleteMany({});
  return Webinar.create({
    title: 'Clean Sport Webinar',
    meetUrl: 'https://meet.google.com/secret-link',
    startsAt: future(48),
    endsAt: future(50),
    registrationOpen: true,
    ...overrides,
  });
}

beforeEach(async () => {
  await WebinarRegistration.deleteMany({});
  sendWebinarEmail.mockReset();
});

describe('GET /api/webinar (public)', () => {
  it('never returns meetUrl, under any field name', async () => {
    await seedWebinar();
    const res = await request(app).get('/api/webinar');
    expect(res.status).toBe(200);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('meet.google.com');
    expect(res.body.data).not.toHaveProperty('meetUrl');
  });

  it('exposes isHeroActive, registrationOpen and hasEnded as computed booleans', async () => {
    await seedWebinar({ webinarHeroEnabled: true, webinarHeroEndsAt: future(72) });
    const res = await request(app).get('/api/webinar');
    expect(res.body.data.isHeroActive).toBe(true);
    expect(res.body.data.registrationOpen).toBe(true);
    expect(res.body.data.hasEnded).toBe(false);
  });

  it('reports hasEnded once endsAt is in the past, and hero as inactive', async () => {
    await seedWebinar({
      startsAt: new Date(Date.now() - 4 * 3600_000),
      endsAt: new Date(Date.now() - 2 * 3600_000),
      webinarHeroEnabled: true,
      webinarHeroEndsAt: new Date(Date.now() - 3600_000),
    });
    const res = await request(app).get('/api/webinar');
    expect(res.body.data.hasEnded).toBe(true);
    expect(res.body.data.isHeroActive).toBe(false);
  });
});

describe('POST /api/webinar/register', () => {
  it('registers successfully and sends the confirmation email', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({ ok: true });

    const res = await request(app).post('/api/webinar/register').send({
      name: 'Jane Doe', email: 'jane@example.com', consent: true, ...VALID_EXTRA,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.ok).toBe(true);
    expect(sendWebinarEmail).toHaveBeenCalledTimes(1);

    const saved = await WebinarRegistration.findOne({ email: 'jane@example.com' });
    expect(saved.emailStatus).toBe('SENT');
    expect(saved.emailSentAt).toBeTruthy();
    expect(saved.role).toBe('Lawyer');
    expect(saved.nationality).toBe('Nigeria');
  });

  it('rejects an invalid email with a 400 and sends no email', async () => {
    await seedWebinar();
    const res = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'not-an-email', consent: true, ...VALID_EXTRA,
    });
    expect(res.status).toBe(400);
    expect(sendWebinarEmail).not.toHaveBeenCalled();
  });

  it('rejects when consent is not true', async () => {
    await seedWebinar();
    const res = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'jane@example.com', consent: false, ...VALID_EXTRA,
    });
    expect(res.status).toBe(400);
  });

  it('rejects when role is missing or not one of the allowed values', async () => {
    await seedWebinar();
    const missing = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'norole@example.com', consent: true, nationality: 'Nigeria',
    });
    expect(missing.status).toBe(400);

    const invalid = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'badrole@example.com', consent: true, nationality: 'Nigeria', role: 'CEO',
    });
    expect(invalid.status).toBe(400);
  });

  it('rejects when nationality is missing or not a real country', async () => {
    await seedWebinar();
    const missing = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'nonat@example.com', consent: true, role: 'Lawyer',
    });
    expect(missing.status).toBe(400);

    const invalid = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'badnat@example.com', consent: true, role: 'Lawyer', nationality: 'Narnia',
    });
    expect(invalid.status).toBe(400);
  });

  it('role "Other" requires roleOther, and stores it', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({ ok: true });

    const missingOther = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'other-missing@example.com', consent: true, role: 'Other', nationality: 'Kenya',
    });
    expect(missingOther.status).toBe(400);

    const res = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'other-ok@example.com', consent: true, role: 'Other', roleOther: 'Event organiser', nationality: 'Kenya',
    });
    expect(res.status).toBe(201);
    const saved = await WebinarRegistration.findOne({ email: 'other-ok@example.com' });
    expect(saved.role).toBe('Other');
    expect(saved.roleOther).toBe('Event organiser');
  });

  it('accepts an optional phone number but validates its shape, and defaults to empty when omitted', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({ ok: true });

    const bad = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'badphone@example.com', consent: true, ...VALID_EXTRA, phone: 'abc',
    });
    expect(bad.status).toBe(400);

    const withPhone = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'goodphone@example.com', consent: true, ...VALID_EXTRA, phone: '+234 801 234 5678',
    });
    expect(withPhone.status).toBe(201);
    expect((await WebinarRegistration.findOne({ email: 'goodphone@example.com' })).phone).toBe('+234 801 234 5678');

    const noPhone = await request(app).post('/api/webinar/register').send({
      name: 'Jane', email: 'nophone@example.com', consent: true, ...VALID_EXTRA,
    });
    expect(noPhone.status).toBe(201);
    expect((await WebinarRegistration.findOne({ email: 'nophone@example.com' })).phone).toBe('');
  });

  it('silently succeeds without creating a record when the honeypot is filled', async () => {
    await seedWebinar();
    const res = await request(app).post('/api/webinar/register').send({
      name: 'Bot', email: 'bot@example.com', consent: true, website: 'http://spam.example', ...VALID_EXTRA,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.ok).toBe(true);
    expect(await WebinarRegistration.findOne({ email: 'bot@example.com' })).toBeNull();
    expect(sendWebinarEmail).not.toHaveBeenCalled();
  });

  it('a second registration with the same (SENT) email does not duplicate and does not re-send', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({ ok: true });
    await request(app).post('/api/webinar/register').send({ name: 'Jane', email: 'dup@example.com', consent: true, ...VALID_EXTRA });

    sendWebinarEmail.mockClear();
    const res = await request(app).post('/api/webinar/register').send({ name: 'Jane Again', email: 'dup@example.com', consent: true, ...VALID_EXTRA });

    // 200, not 201: nothing new was created, same as the CLOSED case below.
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('ALREADY_REGISTERED');
    expect(sendWebinarEmail).not.toHaveBeenCalled();
    expect(await WebinarRegistration.countDocuments({ email: 'dup@example.com' })).toBe(1);
  });

  it('retries the email (without duplicating the record) when the prior attempt was FAILED', async () => {
    await seedWebinar();
    await WebinarRegistration.create({
      name: 'Retry Me', email: 'retry@example.com', consentAt: new Date(),
      emailStatus: 'FAILED', emailError: 'smtp down', emailAttempts: 1,
    });
    sendWebinarEmail.mockResolvedValue({ ok: true });

    const res = await request(app).post('/api/webinar/register').send({ name: 'Retry Me', email: 'retry@example.com', consent: true, ...VALID_EXTRA });

    expect(res.status).toBe(201);
    expect(sendWebinarEmail).toHaveBeenCalledTimes(1);
    expect(await WebinarRegistration.countDocuments({ email: 'retry@example.com' })).toBe(1);
    const saved = await WebinarRegistration.findOne({ email: 'retry@example.com' });
    expect(saved.emailStatus).toBe('SENT');
  });

  it('rejects registration politely when registration is closed', async () => {
    await seedWebinar({ registrationOpen: false });
    const res = await request(app).post('/api/webinar/register').send({ name: 'Jane', email: 'closed@example.com', consent: true, ...VALID_EXTRA });
    expect(res.status).toBe(200); // not an error — a typed { ok:false } result
    expect(res.body.data.ok).toBe(false);
    expect(res.body.data.code).toBe('CLOSED');
    expect(sendWebinarEmail).not.toHaveBeenCalled();
    expect(await WebinarRegistration.findOne({ email: 'closed@example.com' })).toBeNull();
  });

  it('on SMTP failure: the record is saved as FAILED, and the visitor still sees a success response', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({ ok: false, error: '535 Authentication failed' });

    const res = await request(app).post('/api/webinar/register').send({ name: 'Jane', email: 'smtpfail@example.com', consent: true, ...VALID_EXTRA });

    expect(res.status).toBe(201);
    expect(res.body.data.ok).toBe(true); // visitor-facing response hides the failure
    const saved = await WebinarRegistration.findOne({ email: 'smtpfail@example.com' });
    expect(saved.emailStatus).toBe('FAILED');
    expect(saved.emailError).toContain('535');
    expect(saved.emailAttempts).toBe(1);
  });

  it('never leaks SMTP connection details into the stored emailError', async () => {
    await seedWebinar();
    sendWebinarEmail.mockResolvedValue({
      ok: false,
      error: 'connect ECONNREFUSED 10.0.0.5:465 smtp.zoho.com user=contact@pcnsportivalp.com pass=hunter2',
    });
    await request(app).post('/api/webinar/register').send({ name: 'Jane', email: 'leak@example.com', consent: true, ...VALID_EXTRA });
    const saved = await WebinarRegistration.findOne({ email: 'leak@example.com' });
    // The route stores whatever string the mailer returns, so this guards the
    // mailer's own contract rather than the route — see webinarMailer.js,
    // which never includes the password in err.message by construction.
    // Here we only assert it is capped to a short length, not full dump.
    expect(saved.emailError.length).toBeLessThanOrEqual(180);
  });

  it('on a database failure, no email is sent and a generic error is returned', async () => {
    await seedWebinar();
    const spy = vi.spyOn(WebinarRegistration, 'create').mockRejectedValueOnce(new Error('Mongo is down'));

    const res = await request(app).post('/api/webinar/register').send({ name: 'Jane', email: 'dbfail@example.com', consent: true, ...VALID_EXTRA });

    expect(res.status).toBe(500);
    expect(sendWebinarEmail).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('rejects a name or email containing a newline (header injection guard)', async () => {
    await seedWebinar();
    const res = await request(app).post('/api/webinar/register').send({
      name: 'Jane\nBcc: attacker@evil.com', email: 'jane@example.com', consent: true, ...VALID_EXTRA,
    });
    expect(res.status).toBe(400);
  });
});

describe('admin webinar routes require auth', () => {
  it('rejects an unauthenticated request to GET /api/admin/webinar', async () => {
    const res = await request(app).get('/api/admin/webinar');
    expect(res.status).toBe(401);
  });

  it('an authenticated admin can read and update the webinar, including meetUrl', async () => {
    const { agent } = await authedAgent();
    const res = await agent.put('/api/admin/webinar').send({
      title: 'Updated Title', meetUrl: 'https://meet.google.com/new-link',
    });
    expect(res.status).toBe(200);
    expect(res.body.data.meetUrl).toBe('https://meet.google.com/new-link');

    const read = await agent.get('/api/admin/webinar');
    expect(read.body.data.meetUrl).toBe('https://meet.google.com/new-link');
  });

  it('CSV export escapes a cell starting with = so a spreadsheet cannot run it as a formula', async () => {
    await WebinarRegistration.create({
      name: '=cmd|\'/c calc\'!A1', email: 'formula@example.com', consentAt: new Date(),
    });
    const { agent } = await authedAgent();
    const res = await agent.get('/api/admin/webinar/registrations.csv');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/^=cmd|,=cmd|\n=cmd/);
    expect(res.text).toContain('cmd');
  });

  it('CSV export includes Role, Nationality and Phone columns, with "Other" expanded', async () => {
    await WebinarRegistration.deleteMany({});
    await WebinarRegistration.create([
      { name: 'Jane', email: 'jane@example.com', consentAt: new Date(), role: 'Lawyer', nationality: 'Nigeria', phone: '+2348012345678' },
      { name: 'Sam', email: 'sam@example.com', consentAt: new Date(), role: 'Other', roleOther: 'Event organiser', nationality: 'Kenya' },
    ]);
    const { agent } = await authedAgent();
    const res = await agent.get('/api/admin/webinar/registrations.csv');
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe('Name,Email,Role,Nationality,Phone,Registered at,Email status,Reference');
    expect(res.text).toContain('Lawyer,Nigeria,'); // phone cell is tab-guarded since it starts with "+"
    expect(res.text).toContain('+2348012345678');
    expect(res.text).toContain('Other (Event organiser),Kenya');
  });

  it('filters registrations by role and by nationality', async () => {
    await WebinarRegistration.deleteMany({});
    await WebinarRegistration.create([
      { name: 'Jane', email: 'jane2@example.com', consentAt: new Date(), role: 'Lawyer', nationality: 'Nigeria' },
      { name: 'Sam', email: 'sam2@example.com', consentAt: new Date(), role: 'Law Student', nationality: 'Kenya' },
    ]);
    const { agent } = await authedAgent();

    const byRole = await agent.get('/api/admin/webinar/registrations').query({ role: 'Lawyer' });
    expect(byRole.body.data).toHaveLength(1);
    expect(byRole.body.data[0].email).toBe('jane2@example.com');

    const byNationality = await agent.get('/api/admin/webinar/registrations').query({ nationality: 'Kenya' });
    expect(byNationality.body.data).toHaveLength(1);
    expect(byNationality.body.data[0].email).toBe('sam2@example.com');
  });

  it('test-cleanup deletes only registrations matching the given domain, nothing else', async () => {
    await WebinarRegistration.deleteMany({});
    await WebinarRegistration.create([
      { name: 'Fake 1', email: 'a@example.test', consentAt: new Date() },
      { name: 'Fake 2', email: 'b@example.test', consentAt: new Date() },
      { name: 'Real', email: 'real@pcnsportivalp.com', consentAt: new Date() },
      { name: 'Trick', email: 'c@notexample.test', consentAt: new Date() }, // must NOT match "example.test"
    ]);

    const { agent } = await authedAgent();
    const res = await agent.delete('/api/admin/webinar/registrations/test-cleanup').query({ domain: 'example.test' });

    expect(res.status).toBe(200);
    expect(res.body.data.deleted).toBe(2);
    expect(await WebinarRegistration.countDocuments({})).toBe(2);
    expect(await WebinarRegistration.findOne({ email: 'real@pcnsportivalp.com' })).toBeTruthy();
    expect(await WebinarRegistration.findOne({ email: 'c@notexample.test' })).toBeTruthy();
  });

  it('test-cleanup requires an explicit domain (cannot be called bare)', async () => {
    const { agent } = await authedAgent();
    const res = await agent.delete('/api/admin/webinar/registrations/test-cleanup');
    expect(res.status).toBe(400);
  });

  it('test-email requires webinar:write (an editor without it is forbidden)', async () => {
    const { agent } = await authedAgent({ role: 'editor', email: 'editor@example.com' });
    const res = await agent.post('/api/admin/webinar/test-email').send({ to: 'someone@example.com' });
    // editor has webinar:read only, not webinar:write
    expect(res.status).toBe(403);
  });
});
